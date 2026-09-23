#!/usr/bin/env bash
# Fase 1 · paso 1 (§5): volcado del esquema `public` de Supabase.
#
# Se ejecuta en TU máquina o en el VPS, con pg_dump 17+ instalado. La cadena
# de conexión sale de Supabase → Project Settings → Database → Connection
# string (URI, modo "Session", puerto 5432). Nunca la guardes en el repo.
#
#   SUPABASE_DB_URL='postgresql://postgres.xxxx:CLAVE@aws-0-...pooler.supabase.com:5432/postgres' \
#     ./scripts/supabase-export.sh
#
# Deja supabase-public.dump (formato custom). Súbelo al VPS y sigue con
# scripts/supabase-restore.sh.
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL (cadena de conexión de Supabase)}"
OUT="${1:-supabase-public.dump}"

command -v pg_dump >/dev/null || { echo "Instala el cliente de PostgreSQL (pg_dump)."; exit 1; }

echo "==> Volcando el esquema public (sin dueños ni permisos de Supabase)"
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-subscriptions \
  --no-publications \
  --file="$OUT"

echo "==> Contenido:"
pg_restore --list "$OUT" | grep -E ' TABLE DATA | TABLE ' | awk '{print "   ", $0}' | head -40
echo
echo "Listo: ${OUT} ($(du -h "$OUT" | cut -f1)). Guárdalo cifrado: trae las credenciales de las cuentas."
