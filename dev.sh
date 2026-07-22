#!/usr/bin/env bash
#
# dev.sh - run the Sinta stack locally, one module at a time.
#
# Modules:
#   db       Postgres via docker compose
#   server   Go API (cmd/sinta) on :8080
#   client   Vite dev server on :3000
#
# Usage:
#   ./dev.sh up [module ...]        start everything (or just the named modules)
#   ./dev.sh down [module ...]      stop everything (or just the named modules)
#   ./dev.sh restart <module ...>   stop then start the named modules
#   ./dev.sh status                 show what is running
#   ./dev.sh logs <module> [-f]     print a module's log (-f to follow)
#   ./dev.sh migrate                apply database migrations
#
# Server/client run in the background; logs and PIDs live in .run/.
# "up" with no args brings up db -> migrate -> server -> client in order.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

# Load the root .env (single source of truth for the stack) so the script's own
# references ($PORT below) and docker compose pick it up. The Go server/migrate
# commands also load it themselves via godotenv; values already exported here win.
set -a
[[ -f "$ROOT/.env" ]] && . "$ROOT/.env"
set +a
export DATABASE_URL="${DATABASE_URL:-postgres://sinta:sinta_dev@localhost:5432/sinta?sslmode=disable}"
export PORT="${PORT:-8080}"

MODULES=(db server client)

# --- helpers ---------------------------------------------------------------

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!  \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mx  \033[0m %s\n' "$*" >&2; exit 1; }

is_valid_module() {
  local m
  for m in "${MODULES[@]}"; do [[ "$m" == "$1" ]] && return 0; done
  return 1
}

pidfile() { echo "$RUN_DIR/$1.pid"; }
logfile() { echo "$RUN_DIR/$1.log"; }

# Is a background (server/client) module alive?
proc_running() {
  local pf; pf="$(pidfile "$1")"
  [[ -f "$pf" ]] || return 1
  local pid; pid="$(cat "$pf")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# Start a background module: start_proc <name> <workdir> <command...>
start_proc() {
  local name="$1" dir="$2"; shift 2
  if proc_running "$name"; then
    warn "$name already running (pid $(cat "$(pidfile "$name")"))"
    return 0
  fi
  local lf; lf="$(logfile "$name")"
  log "starting $name (logs: ${lf#"$ROOT"/})"
  # Job control (set -m) puts the job in its own process group (pgid == pid) so
  # stop_proc can kill the whole tree - e.g. `go run` and its compiled child.
  set -m
  ( cd "$dir" && exec "$@" ) >"$lf" 2>&1 &
  local pid=$!
  set +m
  echo "$pid" >"$(pidfile "$name")"
}

stop_proc() {
  local name="$1"
  if ! proc_running "$name"; then
    warn "$name not running"
    rm -f "$(pidfile "$name")"
    return 0
  fi
  local pid; pid="$(cat "$(pidfile "$name")")"
  log "stopping $name (pid $pid)"
  # Kill the whole process group so child processes (vite, go) die too.
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  rm -f "$(pidfile "$name")"
}

# --- db (docker compose) ---------------------------------------------------

compose() { docker compose -f "$ROOT/docker-compose.yml" "$@"; }

db_up() {
  log "starting postgres"
  compose up -d postgres
  log "waiting for postgres to be healthy"
  for _ in $(seq 1 30); do
    if compose ps postgres --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
      log "postgres healthy"
      return 0
    fi
    sleep 1
  done
  die "postgres did not become healthy in time (see: ./dev.sh logs db)"
}

db_down() {
  log "stopping postgres"
  compose stop postgres
}

# --- migrate ---------------------------------------------------------------

migrate() {
  log "applying migrations"
  ( cd "$ROOT/server" && go run ./cmd/migrate up )
}

# --- module dispatch -------------------------------------------------------

start_module() {
  case "$1" in
    db)     db_up ;;
    server) start_proc server "$ROOT/server" go run ./cmd/sinta ;;
    client) start_proc client "$ROOT/client" pnpm dev ;;
  esac
}

stop_module() {
  case "$1" in
    db)     db_down ;;
    server) stop_proc server ;;
    client) stop_proc client ;;
  esac
}

# --- commands --------------------------------------------------------------

cmd_up() {
  if [[ $# -gt 0 ]]; then
    for m in "$@"; do is_valid_module "$m" || die "unknown module: $m"; start_module "$m"; done
    return
  fi
  # Full stack, in dependency order.
  db_up
  migrate
  start_module server
  start_module client
  echo
  status
  echo
  log "server: http://localhost:$PORT   client: http://localhost:3000"
  log "follow logs with: ./dev.sh logs server -f"
}

cmd_down() {
  local targets=("$@")
  [[ ${#targets[@]} -eq 0 ]] && targets=(client server db)  # reverse order
  for m in "${targets[@]}"; do is_valid_module "$m" || die "unknown module: $m"; stop_module "$m"; done
}

cmd_restart() {
  [[ $# -gt 0 ]] || die "restart needs at least one module: ${MODULES[*]}"
  for m in "$@"; do is_valid_module "$m" || die "unknown module: $m"; done
  for m in "$@"; do stop_module "$m"; done
  for m in "$@"; do start_module "$m"; done
}

status() {
  log "status"
  # db
  if compose ps postgres 2>/dev/null | grep -q postgres; then
    local health; health="$(compose ps postgres --format '{{.Health}}' 2>/dev/null || true)"
    printf '  %-8s running (%s)\n' "db" "${health:-up}"
  else
    printf '  %-8s stopped\n' "db"
  fi
  # background procs
  local m
  for m in server client; do
    if proc_running "$m"; then
      printf '  %-8s running (pid %s)\n' "$m" "$(cat "$(pidfile "$m")")"
    else
      printf '  %-8s stopped\n' "$m"
    fi
  done
}

cmd_logs() {
  local m="${1:-}"; shift || true
  [[ -n "$m" ]] || die "logs needs a module: ${MODULES[*]}"
  is_valid_module "$m" || die "unknown module: $m"
  local follow=""
  [[ "${1:-}" == "-f" || "${1:-}" == "--follow" ]] && follow=1
  if [[ "$m" == "db" ]]; then
    [[ -n "$follow" ]] && compose logs -f postgres || compose logs postgres
    return
  fi
  local lf; lf="$(logfile "$m")"
  [[ -f "$lf" ]] || die "no log for $m yet (is it running?)"
  [[ -n "$follow" ]] && tail -f "$lf" || cat "$lf"
}

usage() {
  cat <<'EOF'
dev.sh - run the Sinta stack locally, one module at a time.

Modules:
  db       Postgres via docker compose
  server   Go API (cmd/sinta) on :8080
  client   Vite dev server on :3000

Usage:
  ./dev.sh up [module ...]        start everything (or just the named modules)
  ./dev.sh down [module ...]      stop everything (or just the named modules)
  ./dev.sh restart <module ...>   stop then start the named modules
  ./dev.sh status                 show what is running
  ./dev.sh logs <module> [-f]     print a module's log (-f to follow)
  ./dev.sh migrate                apply database migrations

Server/client run in the background; logs and PIDs live in .run/.
"up" with no args brings up db -> migrate -> server -> client in order.
EOF
}

# --- main ------------------------------------------------------------------

case "${1:-}" in
  up)      shift; cmd_up "$@" ;;
  down)    shift; cmd_down "$@" ;;
  restart) shift; cmd_restart "$@" ;;
  status)  status ;;
  logs)    shift; cmd_logs "$@" ;;
  migrate) migrate ;;
  ""|-h|--help|help) usage ;;
  *)       die "unknown command: $1 (try: ./dev.sh help)" ;;
esac
