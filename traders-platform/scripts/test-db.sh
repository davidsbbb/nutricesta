#!/usr/bin/env bash
# Aplica las migraciones sobre un Postgres vacío (con un stub del esquema auth
# de Supabase) y ejecuta las pruebas SQL de supabase/tests.
#
# Uso: PGURL=postgres://postgres@127.0.0.1:5432 ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${PGURL:-postgres://postgres@127.0.0.1:5432}"
DB="traders_test_$$"

psql "$PGURL/postgres" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }

run supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migración: $f"
  run "$f"
done
for f in supabase/tests/*.test.sql; do
  echo "prueba: $f"
  # -t sin cabeceras; solo mostramos los \echo de resultado y los errores.
  out=$(psql "$PGURL/$DB" -qtA -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "$out"; exit 1; }
  echo "$out" | grep -E ": OK$"
done
