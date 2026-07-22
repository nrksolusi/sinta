# Sinta deploy (M1)

Production stack for the single Indonesian VPS (PLAN.md D13): Docker Compose
running Postgres, the Go server, and Caddy (TLS + SPA host), plus a nightly
`pg_dump` shipped offsite.

## Layout

- `Dockerfile.server` - multi-stage Go 1.26 build -> distroless static image.
  Produces both `sinta` (API) and `migrate` binaries.
- `Dockerfile.client` - pnpm `vite build` -> Caddy image serving the SPA and
  reverse-proxying `/v1` to the server.
- `docker-compose.yml` - the full stack + one-shot `migrate`/`setapppw` init
  steps + a nightly `backup` sidecar.
- `Caddyfile` - automatic HTTPS (domain from `$SINTA_DOMAIN`), `/v1` proxy,
  SPA fallback.
- `backup.sh` - `pg_dump` + offsite upload + local retention.
- `.env.example` - required environment; copy to `.env` (gitignored).

## RLS wiring (do not "simplify")

The app must NOT connect as a superuser or the table owner, or RLS is silently
bypassed (ADR-0004). The stack enforces this:

1. `migrate` runs `migrate up` as the **owner** (`POSTGRES_USER`). Migration
   `0001` creates the `sinta_app` role with no password.
2. `setapppw` sets `sinta_app`'s login password (as owner, via `psql`).
3. `server` connects as `sinta_app` using `SINTA_APP_PASSWORD`, so policies
   apply on every request.

## First deploy

```sh
cp deploy/.env.example deploy/.env
# edit deploy/.env: passwords, SINTA_DOMAIN, backup target
$EDITOR deploy/.env

# point DNS for SINTA_DOMAIN at the VPS first, then:
docker compose -f deploy/docker-compose.yml --env-file deploy/.env config   # validate
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

`migrate` and `setapppw` run to completion once, then `server` and `caddy`
start. Caddy obtains a Let's Encrypt certificate for `SINTA_DOMAIN`.

## Local smoke test (no TLS)

Set `SINTA_DOMAIN=:80` in `.env`, then `up -d --build`. The app is reachable
at http://localhost/ and the API at http://localhost/v1/...

## Backups

The `backup` sidecar dumps nightly at `BACKUP_HOUR` (local) to the `backups`
volume and ships offsite. Custom format (`pg_dump -Fc`) so `pg_restore` can
restore selectively.

Offsite upload options:
- `BACKUP_S3_TARGET=s3://bucket/prefix` - used if `aws` or `rclone` is present
  in the image. The stock `postgres:18` image has neither; either bake a
  derived image with the tool, or:
- `BACKUP_UPLOAD_CMD='rclone copyto "$1" remote:...'` - full override; `$1` is
  the dump path.

Prefer host cron over the sidecar? Disable the `backup` service and add:

```cron
0 2 * * * cd /opt/sinta && PGHOST=127.0.0.1 PGUSER=sinta PGPASSWORD=... \
  PGDATABASE=sinta BACKUP_DIR=/opt/sinta/backups BACKUP_S3_TARGET=s3://... \
  sh deploy/backup.sh >> /var/log/sinta-backup.log 2>&1
```

## Restore drill

Verify a dump actually restores. Against a scratch database (never straight
over production):

```sh
# 1. Take (or pick) a dump.
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  run --rm backup sh /usr/local/bin/backup.sh
DUMP=$(docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  run --rm backup sh -c 'ls -t /backups/*.dump | head -1')

# 2. Restore into a scratch DB owned by the owner role.
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec postgres createdb -U sinta sinta_restore_test
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  run --rm -e PGDATABASE=sinta_restore_test backup \
  pg_restore --no-owner --no-privileges -d \
  "postgres://sinta:$POSTGRES_PASSWORD@postgres:5432/sinta_restore_test" \
  "$DUMP"

# 3. Sanity-check row counts, then drop the scratch DB.
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec postgres psql -U sinta -d sinta_restore_test -c '\dt'
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec postgres dropdb -U sinta sinta_restore_test
```

A real recovery restores into a fresh `sinta` database, then reruns
`setapppw` so `sinta_app` can log in again.
