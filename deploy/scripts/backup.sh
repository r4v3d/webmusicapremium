#!/usr/bin/env bash
# Respaldo cifrado de PostgreSQL (§4.7).
#
# Contexto importante (§4.8 punto 3): el VPS NO tiene Auto Backup contratado.
# Esto es la única copia que existe. Si RCLONE_REMOTE está vacío, la copia vive
# en el mismo disco que la base, y un fallo de disco se lleva las dos.
#
# El cifrado usa age con una clave pública. La clave privada NO está en el
# servidor: si alguien entra, no puede leer los respaldos viejos.
set -euo pipefail

APP_NAME="@@APP_NAME@@"
PG_DB="@@PG_DB@@"
BACKUP_DIR="@@BACKUP_DIR@@"
KEEP_DAYS="@@BACKUP_KEEP_DAYS@@"
AGE_PUB_FILE="/etc/${APP_NAME}/backup-age.pub"
STATE_FILE="${BACKUP_DIR}/.last-success"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

install -d -m 0700 "$BACKUP_DIR"
[[ -s "$AGE_PUB_FILE" ]] || fail "Falta la clave pública en ${AGE_PUB_FILE}."
RECIPIENT="$(tr -d '\r\n' <"$AGE_PUB_FILE")"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/${PG_DB}-${STAMP}.dump.age"
TMP="${OUT}.partial"

log "Volcando ${PG_DB} → $(basename "$OUT")"
# -Fc: formato comprimido de Postgres, restaurable con pg_restore de forma
# selectiva. Pipe directo a age: el dump en claro nunca toca el disco.
#
# PGOPTIONS desactiva los timeouts de §4.4 solo para esta sesión: los 15 s de
# statement_timeout y los 5 s de lock_timeout protegen al checkout, pero harían
# fracasar un volcado que tarde más o que espere un lock.
export PGOPTIONS='-c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0'
if ! su - postgres -c "PGOPTIONS='${PGOPTIONS}' pg_dump -Fc --no-owner --no-privileges '${PG_DB}'" \
     | age -r "$RECIPIENT" -o "$TMP"; then
  rm -f "$TMP"
  fail "Falló pg_dump o el cifrado."
fi

SIZE=$(stat -c%s "$TMP")
# Un dump válido de esta base nunca baja de unos pocos KB. Si sale minúsculo,
# algo se cortó y no queremos que reemplace a un respaldo bueno.
(( SIZE > 2048 )) || { rm -f "$TMP"; fail "El respaldo salió de ${SIZE} bytes: sospechoso."; }
mv "$TMP" "$OUT"
chmod 0600 "$OUT"
log "Respaldo local listo: $(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")"

log "Verificando que el cifrado es legible (cabecera age)"
head -c 100 "$OUT" | grep -q 'age-encryption.org' || fail "El archivo no parece cifrado con age."

# --- Copia fuera del VPS ---
if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
  log "Subiendo a ${RCLONE_REMOTE}"
  if rclone copy "$OUT" "${RCLONE_REMOTE}/" --no-traverse --quiet; then
    log "Copia remota subida"
    # 30 días fuera, 14 dentro (§4.7).
    rclone delete "${RCLONE_REMOTE}/" --min-age 30d --quiet 2>/dev/null || true
  else
    log "AVISO: falló la subida remota. El respaldo local sí existe."
  fi
elif [[ -n "$RCLONE_REMOTE" ]]; then
  log "AVISO: RCLONE_REMOTE está definido pero rclone no está instalado."
else
  log "AVISO: sin destino remoto. Esta copia está en el MISMO disco que la base."
fi

log "Limpiando respaldos locales de más de ${KEEP_DAYS} días"
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
log "Borrados: ${DELETED}"

date -Is >"$STATE_FILE"
TOTAL=$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" | wc -l)
log "Correcto. ${TOTAL} respaldo(s) en ${BACKUP_DIR}, $(df -h "$BACKUP_DIR" | awk 'NR==2{print $5}') de disco usado."
