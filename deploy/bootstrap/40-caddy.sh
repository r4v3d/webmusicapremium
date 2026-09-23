#!/usr/bin/env bash
# Fase 0 · paso 40: Caddy como reverse proxy con TLS automático (§4.6).
#
# Requisito previo: el DNS de @@DOMAIN@@ ya debe resolver a este servidor.
# Let's Encrypt valida por HTTP-01 contra el dominio; si el DNS no apunta aquí,
# la emisión falla. Ver deploy/MANUAL-STEPS.md paso 1.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

log "Comprobando el DNS de ${APP_DOMAIN}"
MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
DNS_IP="$(getent ahostsv4 "$APP_DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
printf '     IP de este servidor: %s\n' "${MY_IP:-desconocida}"
printf '     %s resuelve a:  %s\n' "$APP_DOMAIN" "${DNS_IP:-nada}"

if [[ -z "$DNS_IP" ]]; then
  die "${APP_DOMAIN} no resuelve. Crea el registro A antes de este paso
       (deploy/MANUAL-STEPS.md paso 1) y espera la propagación."
fi
if [[ -n "$MY_IP" && "$DNS_IP" != "$MY_IP" ]]; then
  warn "El DNS apunta a ${DNS_IP}, no a ${MY_IP}."
  warn "Si es una IP de Cloudflare, está bien: pero el proxy debe estar en GRIS"
  warn "(DNS only) hasta que Caddy emita el certificado. Ver MANUAL-STEPS.md paso 2."
else
  ok "El DNS apunta a este servidor"
fi

log "Instalando Caddy desde el repositorio oficial"
if command -v caddy >/dev/null 2>&1; then
  ok "Ya está $(caddy version | head -1)"
else
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt_install caddy
  ok "Instalado $(caddy version | head -1)"
fi

log "Instalando el Caddyfile"
# Tres procesos escriben en LOG_DIR: la app (APP_USER), Caddy (grupo caddy) y el
# healthcheck (root). Dueño APP_USER, grupo caddy, modo 1775: el bit sticky evita
# que uno borre los archivos de otro.
install -d -m 1775 -o "$APP_USER" -g caddy "$LOG_DIR"
[[ -f /etc/caddy/Caddyfile.orig ]] || cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.orig 2>/dev/null || true
render "${KIT_DIR}/config/Caddyfile" /etc/caddy/Caddyfile 0644 root:caddy

caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
# Repara logs que una corrida anterior dejó con dueño root (antes se validaba como root).
find "$LOG_DIR" -maxdepth 1 -name 'caddy-*.log' ! -user caddy -exec chown caddy:caddy {} + 2>/dev/null || true
find "$LOG_DIR" -maxdepth 1 -name 'caddy-*.log' -exec chmod 0640 {} + 2>/dev/null || true
# Se valida como el usuario caddy: `caddy validate` abre los archivos de log, y
# como root los crearía con dueño root y el servicio luego no podría escribirlos.
runuser -u caddy -- env HOME=/var/lib/caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null \
  || die "El Caddyfile no valida. No se recargó el servicio."
ok "Caddyfile válido"

log "Arrancando Caddy"
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
sleep 5
systemctl is-active --quiet caddy || die "Caddy no arrancó: journalctl -u caddy -n 50"
ok "Caddy activo"

log "Esperando el certificado TLS (hasta 90 s)"
got_cert=0
for i in $(seq 1 18); do
  if curl -fsS --max-time 8 -o /dev/null "https://${APP_DOMAIN}" 2>/dev/null; then
    got_cert=1; break
  fi
  # Un 502/503 significa que el TLS ya funciona y lo que falta es la app.
  code="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "https://${APP_DOMAIN}" 2>/dev/null || echo 000)"
  if [[ "$code" =~ ^(502|503|504)$ ]]; then got_cert=1; break; fi
  sleep 5
done

if [[ "$got_cert" -eq 1 ]]; then
  ok "HTTPS responde en https://${APP_DOMAIN}"
  EXPIRY="$(echo | openssl s_client -connect "${APP_DOMAIN}:443" -servername "$APP_DOMAIN" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  [[ -n "$EXPIRY" ]] && ok "Certificado válido hasta: ${EXPIRY}"
  [[ -f "${APP_DIR}/current/server.js" ]] \
    || warn "Verás 503 hasta el primer despliegue: el TLS está bien, la app aún no existe."
else
  warn "Todavía no hay HTTPS. Causas habituales, en orden:"
  warn "  1. El proxy de Cloudflare está en NARANJA: ponlo en gris hasta emitir el cert."
  warn "  2. El DNS aún no propagó."
  warn "  3. El puerto 80 está cerrado en el firewall de Contabo (hace falta para HTTP-01)."
  warn "Diagnóstico: journalctl -u caddy -n 80 --no-pager"
fi

ok "Paso 40 completo."
