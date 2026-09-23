#!/usr/bin/env bash
# Fase 0 · paso 30: Node LTS, árbol de directorios, EnvironmentFile y los dos
# servicios systemd (§4.6). No arranca la web si todavía no hay build: eso pasa
# en la fase 1, cuando el código ya lee de PostgreSQL.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

log "Instalando Node ${NODE_MAJOR} LTS desde NodeSource"
if command -v node >/dev/null 2>&1 && [[ "$(node -v)" == v${NODE_MAJOR}.* ]]; then
  ok "Ya está Node $(node -v)"
else
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  cat >/etc/apt/sources.list.d/nodesource.list <<EOF
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] \
https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main
EOF
  apt-get update -qq
  apt_install nodejs
  ok "Node $(node -v) · npm $(npm -v)"
fi

log "Árbol de directorios en ${APP_DIR}"
#   repo/     clon del git, donde se hace npm ci y npm run build
#   current/  salida standalone que ejecutan los servicios
#   shared/   lo que sobrevive a los despliegues
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" \
  "$APP_DIR" "$APP_DIR/repo" "$APP_DIR/current" "$APP_DIR/shared"
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$LOG_DIR"
ok "Directorios listos"

if [[ -n "${APP_REPO_URL:-}" ]]; then
  log "Clonando el repositorio"
  if [[ -d "${APP_DIR}/repo/.git" ]]; then
    ok "Ya estaba clonado"
  else
    su - "$APP_USER" -c "git clone --branch '${APP_REPO_BRANCH:-main}' '${APP_REPO_URL}' '${APP_DIR}/repo'" \
      || warn "No pude clonar. Si el repo es privado, sube la clave de despliegue y repite este paso."
  fi
else
  warn "APP_REPO_URL vacío: sube el código a ${APP_DIR}/repo cuando empieces la fase 1."
fi

log "EnvironmentFile ${ENV_FILE} (root:${APP_USER}, 0640 — §18)"
install -d -m 0750 -o root -g "$APP_USER" "$ENV_DIR"
[[ -f "$ENV_FILE" ]] || install -o root -g "$APP_USER" -m 0640 /dev/null "$ENV_FILE"
# Valores base de §19. Las claves de proveedores se rellenan en sus fases.
env_set APP_BASE_URL "https://${APP_DOMAIN}"
env_set NODE_ENV     "production"
env_set TZ           "$APP_TZ"
env_set PORT         "$APP_PORT"
if [[ -z "$(env_get SESSION_SECRET || true)" ]]; then
  SS="$(gen_secret)"
  env_set SESSION_SECRET "$SS"
  record_secret "SESSION_SECRET=${SS}"
  ok "SESSION_SECRET generado"
fi
# Banderas de §19. env_default: si ya las cambiaste, repetir este paso no las pisa.
env_default MANUAL_YAPE_ENABLED "true"
env_default TAYPI_ENABLED       "false"
env_default BINANCE_ENABLED     "true"
env_default WALLET_ENABLED      "true"
env_default WORKER_INTERVAL_MS  "20000"
env_default WORKER_BINANCE_MIN_INTERVAL_MS  "15000"
env_default WORKER_BINANCE_IDLE_INTERVAL_MS "300000"
env_default PGPOOL_MAX          "10"
# Claves que se rellenan a mano en sus fases (vacías = desactivado).
for key in ADMIN_PASSWORD ADMIN_ALERT_EMAIL EMAIL_USER EMAIL_PASS \
           BINANCE_API_KEY BINANCE_API_SECRET BINANCE_PAY_ID BINANCE_PAY_NICKNAME \
           TAYPI_BASE_URL TAYPI_PUBLIC_KEY TAYPI_SECRET_KEY TAYPI_AUTH_KEY TAYPI_WEBHOOK_SECRET \
           TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET TELEGRAM_CHANNEL_ID TELEGRAM_ADMIN_CHAT_ID; do
  env_default "$key" ""
done
chown root:"$APP_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
ok "$(grep -cE '^[A-Z]' "$ENV_FILE") variables definidas"

log "Instalando las unidades systemd"
render "${KIT_DIR}/systemd/musicapremium-web.service" \
  "/etc/systemd/system/${APP_NAME}-web.service"
render "${KIT_DIR}/systemd/musicapremium-worker.service" \
  "/etc/systemd/system/${APP_NAME}-worker.service"
systemctl daemon-reload
ok "${APP_NAME}-web.service y ${APP_NAME}-worker.service instalados"

log "Script de despliegue"
render "${KIT_DIR}/scripts/deploy.sh" "/usr/local/bin/${APP_NAME}-deploy" 0755 "root:${APP_USER}"
ok "Disponible como: ${APP_NAME}-deploy"

# Se habilitan (arrancan al bootear) pero no se arrancan ahora: sin build no hay
# server.js y systemd entraría en bucle de reinicios.
systemctl enable "${APP_NAME}-web.service" >/dev/null 2>&1 || true
if [[ -f "${APP_DIR}/current/server.js" ]]; then
  systemctl restart "${APP_NAME}-web.service"
  sleep 3
  systemctl is-active --quiet "${APP_NAME}-web.service" \
    && ok "La web está corriendo en :${APP_PORT}" \
    || warn "La web no arrancó: journalctl -u ${APP_NAME}-web -n 50"
else
  warn "Todavía no hay ${APP_DIR}/current/server.js."
  warn "Es lo esperado en fase 0: el servicio arrancará tras el primer despliegue."
fi
# El worker se habilita en la fase 5, cuando exista worker.cjs (npm run build).
ok "Paso 30 completo."
