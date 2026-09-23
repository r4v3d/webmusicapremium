#!/usr/bin/env bash
# Despliegue de @@APP_NAME@@ (§4.6).
#
# Orden que importa: migrar ANTES de reiniciar. Si una migración falla, el
# script se detiene y el sitio sigue sirviendo la versión anterior.
#
#   sudo @@APP_NAME@@-deploy            despliegue normal
#   sudo @@APP_NAME@@-deploy --no-pull  usa el código que ya está en repo/
set -euo pipefail

APP_NAME="@@APP_NAME@@"
APP_USER="@@APP_USER@@"
APP_DIR="@@APP_DIR@@"
ENV_FILE="@@ENV_FILE@@"
REPO="${APP_DIR}/repo"
CURRENT="${APP_DIR}/current"

PULL=1
[[ "${1:-}" == "--no-pull" ]] && PULL=0

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m  ok\033[0m %s\n' "$*"; }
die() { printf '\033[31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || die "Corre con sudo."
[[ -d "$REPO/.git" || -f "$REPO/package.json" ]] || die "No hay código en ${REPO}."

as_app() { su - "$APP_USER" -c "cd '$REPO' && $1"; }

if (( PULL )); then
  log "Trayendo los cambios"
  as_app "git pull --ff-only"
fi
REV="$(as_app 'git rev-parse --short HEAD' 2>/dev/null || echo 'sin-git')"
log "Revisión: ${REV}"

# El lockfile se genera con npm 11; con npm 10, `npm ci` lo rechaza.
if [[ "$(npm -v | cut -d. -f1)" -lt 11 ]]; then
  log "Actualizando npm a la versión 11"
  npm install -g npm@11 --no-audit --no-fund >/dev/null || die "No se pudo actualizar npm."
  ok "npm $(npm -v)"
fi

log "Instalando dependencias (npm ci)"
# Con devDependencies: el build de Next necesita tailwind y eslint-config-next.
# El output standalone solo copia las dependencias de producción que el código
# importa de verdad, así que el peso extra se queda en repo/, no en current/.
as_app "npm ci --no-audit --no-fund" || die "npm ci falló."

# Las migraciones corren con mpb_migrator, no con el usuario de la app.
if grep -q '"db:migrate"' "${REPO}/package.json" 2>/dev/null; then
  log "Aplicando migraciones con mpb_migrator"
  MIG_URL="$(sed -nE 's/^DATABASE_MIGRATION_URL=(.*)$/\1/p' "$ENV_FILE" | tail -1)"
  [[ -n "$MIG_URL" ]] || die "Falta DATABASE_MIGRATION_URL en ${ENV_FILE}."
  su - "$APP_USER" -c "cd '$REPO' && DATABASE_URL='${MIG_URL}' npm run db:migrate" \
    || die "Una migración falló. NO se reinició nada: el sitio sigue con la versión anterior."
  ok "Migraciones al día"
else
  log "Sin script db:migrate todavía (llega en la fase 1)"
fi

log "Construyendo"
as_app "npm run build" || die "El build falló. No se reinició nada."

STANDALONE="${REPO}/.next/standalone"
[[ -d "$STANDALONE" ]] || die "No hay .next/standalone.
     Añade  output: 'standalone'  a next.config.mjs (§4.6)."

log "Publicando en ${CURRENT}"
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$CURRENT"
rsync -a --delete \
  --exclude 'node_modules/.cache' \
  "${STANDALONE}/" "${CURRENT}/"
# Next no copia .next/static ni public/ dentro de standalone: van a mano.
install -d -o "$APP_USER" -g "$APP_USER" "${CURRENT}/.next"
rsync -a "${REPO}/.next/static/" "${CURRENT}/.next/static/"
if [[ -d "${REPO}/public" ]]; then
  rsync -a "${REPO}/public/" "${CURRENT}/public/"
fi

# El worker vive fuera del build de Next: `npm run build` lo empaqueta con
# esbuild en .worker/worker.cjs (un solo archivo, con sus dependencias dentro).
if [[ -f "${REPO}/.worker/worker.cjs" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 0644 "${REPO}/.worker/worker.cjs" "${CURRENT}/worker.cjs"
  ok "worker.cjs publicado"
fi
chown -R "$APP_USER:$APP_USER" "$CURRENT"
ok "Publicado"

log "Reiniciando la web"
systemctl restart "${APP_NAME}-web"
sleep 4
systemctl is-active --quiet "${APP_NAME}-web" \
  || die "La web no arrancó: journalctl -u ${APP_NAME}-web -n 80"
PORT="$(sed -nE 's/^PORT=(.*)$/\1/p' "$ENV_FILE" | tail -1)"; PORT="${PORT:-3000}"
code=000
for i in $(seq 1 10); do
  code=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" 2>/dev/null || echo 000)
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] && break
  sleep 2
done
# Un 404 en / también significa que Node está sirviendo: no es motivo de fallo.
[[ "$code" == 000 ]] && die "La web no responde en :${PORT} tras 20 s. journalctl -u ${APP_NAME}-web -n 80"
ok "Web respondiendo (HTTP ${code})"

if [[ -f "${CURRENT}/worker.cjs" ]]; then
  log "Reiniciando el worker"
  systemctl enable "${APP_NAME}-worker" >/dev/null 2>&1 || true
  systemctl restart "${APP_NAME}-worker"
  sleep 3
  systemctl is-active --quiet "${APP_NAME}-worker" \
    && ok "Worker activo" \
    || printf '\033[33m  !!\033[0m El worker no arrancó: journalctl -u %s-worker -n 50\n' "$APP_NAME"
fi

ok "Despliegue de ${REV} terminado."
