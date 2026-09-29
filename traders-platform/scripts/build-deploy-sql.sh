#!/usr/bin/env bash
# Junta todas las migraciones en supabase/deploy/todo-en-uno.sql para poder
# pegarlas en el SQL Editor de Supabase sin usar la terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/deploy/todo-en-uno.sql
mkdir -p "$(dirname "$out")"
{
  echo "-- ============================================================================="
  echo "-- FOCO · TODAS las migraciones en un solo fichero, para pegar en"
  echo "-- Supabase → SQL Editor → New query → Run. Ejecutar UNA sola vez en un"
  echo "-- proyecto vacío. Generado desde supabase/migrations (no editar a mano)."
  echo "-- ============================================================================="
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- >>> $f"
    cat "$f"
  done
} > "$out"
echo "Generado $out"
