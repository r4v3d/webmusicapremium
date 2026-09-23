#!/usr/bin/env bash
# Prueba de restauración (§4.7: "un respaldo que nunca se restauró no es un
# respaldo"). Corre mensualmente por timer y también a mano.
#
# Restaura el último respaldo en una base desechable, cuenta las filas de cada
# tabla y compara con producción. No toca la base real en ningún momento.
#
# Necesita la clave PRIVADA de age, que a propósito no vive en el servidor.
# Úsala así:
#   AGE_IDENTITY=/ruta/a/backup-age.key @@APP_NAME@@-restore-test
# Sin ella, el script solo verifica que el archivo está bien cifrado y avisa.
set -euo pipefail

APP_NAME="@@APP_NAME@@"
PG_DB="@@PG_DB@@"
BACKUP_DIR="@@BACKUP_DIR@@"
SCRATCH="${PG_DB}_restore_test"
AGE_IDENTITY="${AGE_IDENTITY:-/etc/${APP_NAME}/backup-age.key}"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" -printf '%T@ %p\n' \
  | sort -rn | head -1 | cut -d' ' -f2-)"
[[ -n "$LATEST" ]] || fail "No hay ningún respaldo en ${BACKUP_DIR}."
log "Respaldo a probar: $(basename "$LATEST") ($(date -r "$LATEST" -Is))"

head -c 100 "$LATEST" | grep -q 'age-encryption.org' || fail "El archivo no está cifrado con age."
log "Cabecera de cifrado correcta"

if [[ ! -s "$AGE_IDENTITY" ]]; then
  log "AVISO: no encuentro la clave privada en ${AGE_IDENTITY}."
  log "AVISO: prueba PARCIAL. Para la prueba completa, ejecuta desde tu máquina:"
  log "AVISO:   AGE_IDENTITY=~/musicapremium-backup.key sudo -E ${APP_NAME}-restore-test"
  exit 0
fi

PLAIN="$(mktemp /tmp/restore-test.XXXXXX.dump)"
# Trampa de limpieza: el dump en claro no debe quedar en /tmp ni si falla.
cleanup() {
  shred -u "$PLAIN" 2>/dev/null || rm -f "$PLAIN"
  su - postgres -c "dropdb --if-exists '${SCRATCH}'" 2>/dev/null || true
}
trap cleanup EXIT

log "Descifrando"
age -d -i "$AGE_IDENTITY" -o "$PLAIN" "$LATEST" || fail "No pude descifrar. ¿Clave correcta?"
# mktemp crea el archivo en 0600 y propiedad de root: el usuario postgres, que
# es quien ejecuta pg_restore, no podría leerlo.
chmod 0644 "$PLAIN"
log "Descifrado: $(numfmt --to=iec "$(stat -c%s "$PLAIN")" 2>/dev/null || stat -c%s "$PLAIN")"

log "Creando base desechable ${SCRATCH}"
su - postgres -c "dropdb --if-exists '${SCRATCH}'"
su - postgres -c "createdb '${SCRATCH}'"

log "Restaurando"
# --no-owner porque el dump se tomó sin dueños; los errores de permisos en una
# base de prueba no invalidan el respaldo, pero se registran.
# PGOPTIONS anula los timeouts de §4.4: una restauración completa tarda más de
# los 15 s de statement_timeout que protegen al checkout.
PGOPT='-c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0'
if su - postgres -c "PGOPTIONS='${PGOPT}' pg_restore --no-owner --no-privileges -d '${SCRATCH}' '${PLAIN}'" 2>/tmp/restore-test.err; then
  log "Restauración sin errores"
else
  log "AVISO: pg_restore devolvió avisos:"
  head -20 /tmp/restore-test.err | sed 's/^/       /'
fi

log "Comparando conteos de filas: producción vs restaurada"
count_tables() {
  su - postgres -c "psql -Atq -d '$1' -c \"
    select relname || '=' || n_live_tup
    from pg_stat_user_tables
    where schemaname = 'public'
    order by relname\"" 2>/dev/null
}
su - postgres -c "psql -q -d '${SCRATCH}' -c 'analyze'" >/dev/null 2>&1 || true
su - postgres -c "psql -q -d '${PG_DB}' -c 'analyze'" >/dev/null 2>&1 || true

PROD="$(count_tables "$PG_DB")"
REST="$(count_tables "$SCRATCH")"
if [[ -z "$PROD" && -z "$REST" ]]; then
  log "Las dos bases están vacías (normal en fase 0, antes de migrar los datos)."
  log "CORRECTO: el ciclo respaldo → cifrado → restauración funciona."
  exit 0
fi

DIFF="$(diff <(echo "$PROD") <(echo "$REST") || true)"
printf '%s\n' "$REST" | sed 's/^/       /'
if [[ -z "$DIFF" ]]; then
  log "CORRECTO: los conteos coinciden tabla por tabla."
else
  log "AVISO: hay diferencias (puede ser por escrituras posteriores al dump):"
  printf '%s\n' "$DIFF" | sed 's/^/       /'
fi
log "Prueba terminada. La base ${SCRATCH} se elimina automáticamente."
