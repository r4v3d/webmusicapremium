#!/usr/bin/env bash
# Fase 0 · paso 50: respaldos cifrados, timers, logrotate, healthcheck y la
# prueba de restauración (§4.7 y §4.8 punto 3).
#
# Genera un par de claves age. La PÚBLICA se queda en el servidor para cifrar;
# la PRIVADA se imprime una sola vez y hay que guardarla FUERA del VPS. Si el
# servidor se pierde con la clave dentro, los respaldos son ilegibles.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

command -v age >/dev/null 2>&1 || apt_install age
command -v age-keygen >/dev/null 2>&1 || die "Falta age-keygen. Instala el paquete 'age'."

AGE_PUB="${ENV_DIR}/backup-age.pub"
AGE_KEY_TMP="/root/${APP_NAME}-backup-age.key"

log "Clave de cifrado de respaldos"
if [[ -s "$AGE_PUB" ]]; then
  ok "Ya existe la clave pública: $(cat "$AGE_PUB")"
  [[ -f "$AGE_KEY_TMP" ]] && warn "La clave PRIVADA sigue en ${AGE_KEY_TMP}: descárgala y bórrala del servidor."
else
  install -d -m 0750 -o root -g "$APP_USER" "$ENV_DIR"
  age-keygen -o "$AGE_KEY_TMP" 2>/dev/null
  chmod 0600 "$AGE_KEY_TMP"
  age-keygen -y "$AGE_KEY_TMP" >"$AGE_PUB"
  chmod 0644 "$AGE_PUB"
  ok "Par de claves generado"
  cat <<EOF

${C_WARN}=========================================================================
  CLAVE PRIVADA DE LOS RESPALDOS — cópiala AHORA fuera del servidor
=========================================================================${C_OFF}
$(cat "$AGE_KEY_TMP")
${C_WARN}=========================================================================${C_OFF}
Guárdala en tu gestor de contraseñas. Desde tu máquina:

    scp ${APP_USER}@${APP_DOMAIN}:${AGE_KEY_TMP} ~/musicapremium-backup.key
    ssh ${APP_USER}@${APP_DOMAIN} 'sudo shred -u ${AGE_KEY_TMP}'

Sin esta clave los respaldos no se pueden descifrar. Nadie puede recuperarla.

EOF
fi

log "Instalando los scripts"
install -d -m 0700 "$BACKUP_DIR"
render "${KIT_DIR}/scripts/backup.sh"       "/usr/local/bin/${APP_NAME}-backup"       0750 root:root
render "${KIT_DIR}/scripts/restore-test.sh" "/usr/local/bin/${APP_NAME}-restore-test" 0750 root:root
render "${KIT_DIR}/scripts/healthcheck.sh"  "/usr/local/bin/${APP_NAME}-healthcheck"  0750 root:root
ok "${APP_NAME}-backup · ${APP_NAME}-restore-test · ${APP_NAME}-healthcheck"

log "Configuración del destino remoto"
BACKUP_ENV="${ENV_DIR}/backup.env"
if [[ ! -f "$BACKUP_ENV" ]]; then
  install -o root -g root -m 0600 /dev/stdin "$BACKUP_ENV" <<EOF
# Destino remoto de los respaldos (§4.7). Vacío = solo copia local.
# Configura rclone primero:  rclone config
# Ejemplo:  RCLONE_REMOTE=contabo:musicapremium-backups
RCLONE_REMOTE=${RCLONE_REMOTE:-}
EOF
  ok "Creado ${BACKUP_ENV}"
else
  ok "Ya existe ${BACKUP_ENV}"
fi
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null 2>&1 || { log "Instalando rclone"; apt_install rclone; }
  sed -i -E "s|^RCLONE_REMOTE=.*|RCLONE_REMOTE=${RCLONE_REMOTE}|" "$BACKUP_ENV"
  ok "Destino remoto: ${RCLONE_REMOTE}"
else
  warn "Sin destino remoto: la copia queda en el mismo disco que la base (§4.8 punto 3)."
  warn "Configúralo con 'rclone config' y luego edita ${BACKUP_ENV}."
fi

log "Instalando unidades y timers"
for u in backup.service backup.timer backup-failed.service \
         restore-test.service restore-test.timer \
         healthcheck.service healthcheck.timer; do
  render "${KIT_DIR}/systemd/musicapremium-${u}" "/etc/systemd/system/${APP_NAME}-${u}"
done
systemctl daemon-reload
systemctl enable --now "${APP_NAME}-backup.timer" >/dev/null
systemctl enable --now "${APP_NAME}-restore-test.timer" >/dev/null
systemctl enable --now "${APP_NAME}-healthcheck.timer" >/dev/null
ok "Timers habilitados"
systemctl list-timers "${APP_NAME}-*" --no-pager --no-legend | sed 's/^/     /'

log "Rotación de logs"
render "${KIT_DIR}/config/logrotate-musicapremium" "/etc/logrotate.d/${APP_NAME}" 0644 root:root
logrotate --debug "/etc/logrotate.d/${APP_NAME}" >/dev/null 2>&1 \
  && ok "Configuración de logrotate válida" \
  || warn "logrotate se queja de la configuración; revísala."

log "Primer respaldo de prueba"
if "/usr/local/bin/${APP_NAME}-backup"; then
  ok "Respaldo correcto"
else
  die "El primer respaldo falló. Revísalo antes de seguir: sin respaldo no hay red."
fi

log "Prueba de restauración (§4.7)"
# La clave privada aún está en el servidor, así que aquí sí puede ser completa.
if [[ -f "$AGE_KEY_TMP" ]]; then
  AGE_IDENTITY="$AGE_KEY_TMP" "/usr/local/bin/${APP_NAME}-restore-test" \
    && ok "Ciclo respaldo → cifrado → restauración verificado" \
    || warn "La restauración dio problemas: revísala antes de producción."
else
  warn "La clave privada ya no está en el servidor (bien). Prueba la restauración desde tu máquina:"
  warn "  AGE_IDENTITY=~/musicapremium-backup.key sudo -E ${APP_NAME}-restore-test"
fi

ok "Paso 50 completo."
