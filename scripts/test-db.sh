#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway Postgres and runs tests/db/*.test.sql.
# Uses $DATABASE_URL if set (CI service container); otherwise starts a temporary local cluster.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  TMP=$(mktemp -d)
  AS=()
  if [ "$(id -u)" = 0 ]; then chown postgres "$TMP"; AS=(runuser -u postgres --); fi # initdb refuses to run as root
  "${AS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -p 54329 -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null
  trap '"${AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null; rm -rf "$TMP"' EXIT
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi

run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 "$@"; }

for t in tests/db/*.test.sql; do
  echo "▶ $t"
  run -c "drop schema if exists public cascade; create schema public;" >/dev/null
  run -f tests/db/supabase-stub.sql >/dev/null
  for m in supabase/migrations/*.sql; do run -f "$m" >/dev/null; done
  run -f "$t"
done
