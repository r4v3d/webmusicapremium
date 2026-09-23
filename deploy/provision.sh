#!/usr/bin/env bash
# Se ejecuta DESDE TU MÁQUINA (Git Bash en Windows sirve), no en el VPS.
# Genera la clave SSH si falta, sube el kit y lanza la fase 0 en el servidor.
#
#   ./deploy/provision.sh                     todo
#   ./deploy/provision.sh --host 1.2.3.4      otra IP
#   ./deploy/provision.sh --only 20           un solo paso
#   ./deploy/provision.sh --verify            solo la verificación
#   ./deploy/provision.sh --upload            solo subir el kit
set -euo pipefail

HOST="${HOST:-169.58.139.103}"
SSH_USER="${SSH_USER:-root}"
KEY="${KEY:-$HOME/.ssh/musicapremium_deploy}"
REMOTE_DIR="/root/musicapremium-deploy"
MODE=all
ONLY=""

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_INFO=$'\033[36m'; C_OFF=$'\033[0m'
log()  { printf '%s==>%s %s\n' "$C_INFO" "$C_OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%s  !!%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
die()  { printf '%s ERR%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)   HOST="$2"; shift 2 ;;
    --user)   SSH_USER="$2"; shift 2 ;;
    --key)    KEY="$2"; shift 2 ;;
    --only)   MODE=only; ONLY="$2"; shift 2 ;;
    --verify) MODE=verify; shift ;;
    --upload) MODE=upload; shift ;;
    --keygen) MODE=keygen; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

KIT="$(cd "$(dirname "$0")" && pwd)"

# --- 1. Clave SSH ---
log "Clave SSH"
if [[ -f "$KEY" ]]; then
  ok "Ya existe ${KEY}"
else
  mkdir -p "$(dirname "$KEY")"; chmod 700 "$(dirname "$KEY")"
  ssh-keygen -t ed25519 -a 100 -N '' -C "musicapremium-deploy@$(hostname)" -f "$KEY"
  ok "Clave ed25519 generada"
fi
chmod 600 "$KEY" 2>/dev/null || true
PUB="$(cat "${KEY}.pub")"
printf '     %s\n' "$PUB"

# --- 2. vars.sh con la clave pública dentro ---
VARS="${KIT}/bootstrap/vars.sh"
if [[ ! -f "$VARS" ]]; then
  cp "${KIT}/bootstrap/vars.example.sh" "$VARS"
  ok "Creado deploy/bootstrap/vars.sh"
fi
# Reescribe SSH_PUBKEY siempre: es la que acabamos de comprobar que existe.
if grep -q '^SSH_PUBKEY=' "$VARS"; then
  tmp="$(mktemp)"
  sed "s|^SSH_PUBKEY=.*|SSH_PUBKEY=\"${PUB}\"|" "$VARS" >"$tmp" && mv "$tmp" "$VARS"
else
  printf 'SSH_PUBKEY="%s"\n' "$PUB" >>"$VARS"
fi
ok "SSH_PUBKEY escrito en vars.sh"
[[ "$MODE" == keygen ]] && { ok "Solo se pedía la clave. Listo."; exit 0; }

# --- 3. Conexión ---
log "Conectando a ${SSH_USER}@${HOST}"
SSH_OPTS=(-o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
# Prueba la clave primero; si aún no está instalada, cae a contraseña.
if ssh "${SSH_OPTS[@]}" -o BatchMode=yes -i "$KEY" "${SSH_USER}@${HOST}" 'echo ok' >/dev/null 2>&1; then
  SSH_OPTS+=(-i "$KEY")
  ok "Entrando con clave"
elif ssh "${SSH_OPTS[@]}" -o BatchMode=yes "${SSH_USER}@${HOST}" 'echo ok' >/dev/null 2>&1; then
  ok "Entrando con el agente SSH"
else
  warn "La clave todavía no está en el servidor: se pedirá la contraseña de ${SSH_USER}."
  warn "Es normal la primera vez. A partir del paso 10 solo se entra con clave."
fi
REMOTE_OS="$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" '. /etc/os-release && echo "$PRETTY_NAME"' 2>/dev/null)" \
  || die "No pude conectar a ${HOST}. Revisa la IP, el usuario y el firewall de Contabo."
ok "Servidor: ${REMOTE_OS}"

# --- 4. Subir el kit ---
log "Subiendo el kit a ${REMOTE_DIR}"
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" "mkdir -p '${REMOTE_DIR}' && rm -rf '${REMOTE_DIR}'/{bootstrap,config,systemd,scripts}"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete-excluded \
    -e "ssh ${SSH_OPTS[*]}" \
    "${KIT}/bootstrap" "${KIT}/config" "${KIT}/systemd" "${KIT}/scripts" \
    "${SSH_USER}@${HOST}:${REMOTE_DIR}/"
else
  scp "${SSH_OPTS[@]}" -q -r \
    "${KIT}/bootstrap" "${KIT}/config" "${KIT}/systemd" "${KIT}/scripts" \
    "${SSH_USER}@${HOST}:${REMOTE_DIR}/"
fi
# Git Bash no preserva el bit de ejecución ni los finales de línea Unix.
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" \
  "cd '${REMOTE_DIR}' && (command -v dos2unix >/dev/null 2>&1 && find . -name '*.sh' -exec dos2unix -q {} + || find . -name '*.sh' -exec sed -i 's/\r\$//' {} +) && chmod +x bootstrap/*.sh scripts/*.sh"
ok "Kit subido y normalizado"
[[ "$MODE" == upload ]] && { ok "Solo se pedía subir. Listo."; exit 0; }

# --- 5. Ejecutar ---
case "$MODE" in
  verify) CMD="bash ${REMOTE_DIR}/bootstrap/90-verify.sh" ;;
  only)   CMD="bash ${REMOTE_DIR}/bootstrap/run-all.sh ${ONLY}" ;;
  all)    CMD="bash ${REMOTE_DIR}/bootstrap/run-all.sh" ;;
esac
[[ "$SSH_USER" != root ]] && CMD="sudo -E ${CMD}"

log "Ejecutando en el servidor"
printf '\n'
# -t para que se vean los colores y el progreso en vivo.
# El || RC=$? es necesario: con set -e, un código 1 de 90-verify (quedan puntos
# pendientes, que es información útil) abortaría el script antes del resumen.
RC=0
ssh "${SSH_OPTS[@]}" -t "${SSH_USER}@${HOST}" "$CMD" || RC=$?
printf '\n'

if [[ $RC -eq 0 ]]; then
  ok "Terminado sin errores"
else
  warn "Terminó con código ${RC}: revisa los puntos marcados arriba"
fi

cat <<EOF

Acceso a partir de ahora (root queda cerrado tras el paso 10):
    ssh -i ${KEY} deploy@${HOST}

Añade esto a ~/.ssh/config para no repetir la ruta de la clave:

    Host cheapmusic
        HostName ${HOST}
        User deploy
        IdentityFile ${KEY}
        IdentitiesOnly yes

EOF
exit $RC
