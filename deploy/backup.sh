#!/bin/sh
# backup.sh - nightly pg_dump of the Sinta database, shipped offsite.
#
# Runs in two modes:
#   backup.sh            one-shot dump + offsite upload (use from host cron)
#   backup.sh --loop     sleep until BACKUP_HOUR each day, then dump (sidecar)
#
# It always writes a compressed custom-format dump to /backups (a persistent
# volume), then uploads it offsite. Offsite upload is pluggable so the base
# postgres image needs no extra tooling in the common case:
#
#   BACKUP_S3_TARGET   e.g. s3://sinta-backups/pg   (uploaded via `aws`/rclone
#                      if installed in the image; see deploy/README.md)
#   BACKUP_UPLOAD_CMD  override: a command that receives the dump path as $1.
#                      Takes precedence over BACKUP_S3_TARGET.
#
# Connection uses libpq env: PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
# Retention: local dumps older than BACKUP_RETENTION_DAYS are pruned.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_HOUR="${BACKUP_HOUR:-02}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PGDATABASE="${PGDATABASE:-sinta}"

log() { printf '%s backup: %s\n' "$(date -u +%FT%TZ)" "$*"; }

dump_once() {
	mkdir -p "$BACKUP_DIR"
	stamp="$(date -u +%Y%m%dT%H%M%SZ)"
	out="$BACKUP_DIR/${PGDATABASE}-${stamp}.dump"

	log "dumping $PGDATABASE -> $out"
	# Custom format (-Fc): compressed and restorable selectively with pg_restore.
	pg_dump -Fc --no-owner --no-privileges -f "$out"
	log "dump complete ($(wc -c <"$out") bytes)"

	ship_offsite "$out"
	prune
}

ship_offsite() {
	dump="$1"
	if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
		log "uploading via BACKUP_UPLOAD_CMD"
		sh -c "$BACKUP_UPLOAD_CMD" _ "$dump"
		log "offsite upload complete"
		return
	fi
	if [ -n "${BACKUP_S3_TARGET:-}" ]; then
		if command -v aws >/dev/null 2>&1; then
			log "uploading to $BACKUP_S3_TARGET via aws"
			aws s3 cp "$dump" "$BACKUP_S3_TARGET/$(basename "$dump")"
		elif command -v rclone >/dev/null 2>&1; then
			log "uploading to $BACKUP_S3_TARGET via rclone"
			rclone copyto "$dump" "$BACKUP_S3_TARGET/$(basename "$dump")"
		else
			log "WARNING: BACKUP_S3_TARGET set but no aws/rclone in image; kept local only. See deploy/README.md"
		fi
		return
	fi
	log "WARNING: no offsite target configured (BACKUP_S3_TARGET/BACKUP_UPLOAD_CMD); dump kept local only"
}

prune() {
	log "pruning local dumps older than ${BACKUP_RETENTION_DAYS}d"
	find "$BACKUP_DIR" -name "${PGDATABASE}-*.dump" -type f \
		-mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true
}

seconds_until_hour() {
	# Seconds from now until the next occurrence of BACKUP_HOUR:00 local time.
	now="$(date +%s)"
	target="$(date -d "today ${BACKUP_HOUR}:00" +%s 2>/dev/null || true)"
	if [ -z "$target" ]; then
		# BusyBox/alpine date has no -d "today ..."; fall back to a fixed 24h.
		echo 86400
		return
	fi
	if [ "$target" -le "$now" ]; then
		target="$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)"
	fi
	echo $((target - now))
}

case "${1:-}" in
	--loop)
		log "sidecar mode: nightly at ${BACKUP_HOUR}:00 local"
		while true; do
			sleep "$(seconds_until_hour)"
			dump_once || log "ERROR: dump failed, will retry next cycle"
		done
		;;
	*)
		dump_once
		;;
esac
