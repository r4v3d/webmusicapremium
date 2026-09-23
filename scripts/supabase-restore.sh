#!/usr/bin/env bash
# Fase 1 · paso 2 (§5): restaurar el volcado de Supabase en el PostgreSQL del VPS.
#
# Se ejecuta en el VPS, con la base `musicapremium` recién creada por el paso 20
# del kit y VACÍA. Restaura como mpb_migrator (dueño del esquema) y deja fuera
# lo que solo tiene sentido en Supabase: políticas RLS, RLS activado,
# extensiones y comentarios de extensiones.
#
#   export DATABASE_MIGRATION_URL="$(sudo sed -n 's/^DATABASE_MIGRATION_URL=//p' /etc/musicapremium/env)"
#   bash scripts/supabase-restore.sh /tmp/supabase-public.dump
#
# Después: npm run db:migrate (001 no hace nada sobre tablas existentes; 002-004
# añaden lo nuevo) y node scripts/verify-cutover.mjs.
set -euo pipefail

DUMP="${1:?Uso: supabase-restore.sh supabase-public.dump}"
: "${DATABASE_MIGRATION_URL:?Falta DATABASE_MIGRATION_URL (rol mpb_migrator)}"

existing="$(psql "$DATABASE_MIGRATION_URL" -Atc "select count(*) from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'")"
if [[ "$existing" != "0" ]]; then
  echo "La base ya tiene ${existing} tabla(s) en public. Restaura solo sobre una base vacía."
  exit 1
fi

LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
pg_restore --list "$DUMP" \
  | grep -vE ' POLICY | ROW SECURITY | EXTENSION | COMMENT - EXTENSION ' >"$LIST"

echo "==> Restaurando $(grep -c ' TABLE DATA ' "$LIST") tablas con datos"
pg_restore \
  --dbname="$DATABASE_MIGRATION_URL" \
  --use-list="$LIST" \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error \
  "$DUMP"

echo "==> Conteo por tabla"
psql "$DATABASE_MIGRATION_URL" -Atc "
  select relname || ': ' || n_live_tup from pg_stat_user_tables order by relname" | sed 's/^/    /'
echo
echo "Siguiente: npm run db:migrate  y  node scripts/verify-cutover.mjs"
