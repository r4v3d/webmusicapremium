#!/usr/bin/env bash
# Fase 0 · paso 90: comprobación de cada entregable de la fase (§21).
# No modifica nada. Salida 0 si todo pasa, 1 si algo falta.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
set +e   # queremos ver todos los fallos, no parar en el primero
require_root

pass=0; fail=0; skip=0
check()  { printf '%s  ok%s %s\n' "$C_OK" "$C_OFF" "$1"; pass=$((pass+1)); }
bad()    { printf '%s FALTA%s %s\n' "$C_ERR" "$C_OFF" "$1"; fail=$((fail+1)); }
later()  { printf '%s  ~~%s %s\n' "$C_WARN" "$C_OFF" "$1"; skip=$((skip+1)); }
section(){ printf '\n%s── %s %s\n' "$C_INFO" "$1" "$C_OFF"; }

printf '\nVerificación de la fase 0 · %s · %s\n' "$APP_DOMAIN" "$(date -Is)"

section "DNS y dominio"
MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null)"
A_REC="$(dig +short A "$APP_DOMAIN" 2>/dev/null | tail -1)"
[[ -n "$A_REC" ]] && check "A de ${APP_DOMAIN} → ${A_REC}" || bad "El registro A de ${APP_DOMAIN} no resuelve"
[[ -n "$(dig +short AAAA "$APP_DOMAIN" 2>/dev/null)" ]] \
  && check "AAAA presente" || later "Sin registro AAAA (opcional)"
[[ -n "$(dig +short "www.${APP_DOMAIN}" 2>/dev/null)" ]] \
  && check "www resuelve" || bad "www.${APP_DOMAIN} no resuelve"

section "Usuario y SSH"
id -u "$APP_USER" >/dev/null 2>&1 && check "Usuario ${APP_USER} existe" || bad "No existe ${APP_USER}"
id -nG "$APP_USER" 2>/dev/null | grep -qw sudo && check "${APP_USER} tiene sudo" || bad "${APP_USER} sin sudo"
KEYS=$(grep -cE '^(ssh|ecdsa)-' "/home/${APP_USER}/.ssh/authorized_keys" 2>/dev/null || echo 0)
(( KEYS > 0 )) && check "${KEYS} clave(s) SSH autorizada(s)" || bad "Sin claves SSH para ${APP_USER}"
EFF="$(sshd -T 2>/dev/null)"
grep -qi '^permitrootlogin no'        <<<"$EFF" && check "Root no puede entrar por SSH" || bad "PermitRootLogin sigue permitido"
grep -qi '^passwordauthentication no' <<<"$EFF" && check "Contraseñas SSH deshabilitadas" || bad "PasswordAuthentication sigue activo"

section "Firewall y fail2ban"
if ufw status 2>/dev/null | grep -q '^Status: active'; then
  check "UFW activo"
  for p in 22 80 443; do
    ufw status | grep -qE "^${p}/tcp" && check "Puerto ${p} abierto" || bad "Puerto ${p} cerrado"
  done
  OPEN=$(ufw status numbered | grep -cE '^\[' || echo 0)
  (( OPEN <= 6 )) && check "Sin puertos extra abiertos (${OPEN} reglas)" || later "${OPEN} reglas en UFW: revisa que no haya de más"
else
  bad "UFW no está activo"
fi
systemctl is-active --quiet fail2ban && check "fail2ban activo" || bad "fail2ban inactivo"
# La base jamás debe verse desde fuera.
ss -lntp 2>/dev/null | awk '$4 ~ /:5432$/ {print $4}' | grep -qvE '^(127\.0\.0\.1|\[::1\])' \
  && bad "PostgreSQL escucha en una interfaz pública" \
  || check "PostgreSQL solo en localhost"

section "PostgreSQL"
if systemctl is-active --quiet postgresql; then
  check "Servicio activo"
  V="$(su - postgres -c 'psql -Atqc "show server_version"' 2>/dev/null | awk '{print $1}')"
  [[ "$V" == "${PG_VERSION}" || "$V" == ${PG_VERSION}.* ]] \
    && check "Versión ${V}" || bad "Versión inesperada: ${V:-desconocida} (esperada ${PG_VERSION}.x)"
  su - postgres -c "psql -Atqc \"select 1 from pg_database where datname='${PG_DB}'\"" 2>/dev/null | grep -q 1 \
    && check "Base ${PG_DB} existe" || bad "No existe la base ${PG_DB}"
  for r in "$PG_APP_ROLE" "$PG_MIGRATOR_ROLE"; do
    su - postgres -c "psql -Atqc \"select 1 from pg_roles where rolname='${r}'\"" 2>/dev/null | grep -q 1 \
      && check "Rol ${r} existe" || bad "Falta el rol ${r}"
  done
  # scram, no md5 ni trust.
  su - postgres -c "psql -Atqc \"show password_encryption\"" 2>/dev/null | grep -q scram \
    && check "Autenticación scram-sha-256" || bad "password_encryption no es scram-sha-256"
  grep -qE '^\s*(local|host).*\strust\s*$' "/etc/postgresql/${PG_VERSION}/main/pg_hba.conf" 2>/dev/null \
    && bad "pg_hba.conf tiene una línea 'trust'" || check "pg_hba.conf sin 'trust'"
  # Tuning de §4.4.
  for kv in "shared_buffers=2GB" "effective_cache_size=6GB" "work_mem=16MB" \
            "max_connections=50" "timezone=UTC" "statement_timeout=15s"; do
    k="${kv%%=*}"; want="${kv##*=}"
    got="$(su - postgres -c "psql -Atqc \"show ${k}\"" 2>/dev/null | tr -d ' ')"
    [[ "$got" == "$want" ]] && check "${k} = ${got}" || bad "${k} = ${got:-?} (esperado ${want})"
  done
  # El reparto de privilegios de §4.3: la app NO debe poder crear tablas.
  APP_PW="$(env_get DATABASE_URL | sed -nE 's|^postgres://[^:]+:([^@]+)@.*$|\1|p')"
  if [[ -n "$APP_PW" ]]; then
    PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -Atqc 'select 1' >/dev/null 2>&1 \
      && check "${PG_APP_ROLE} conecta con su contraseña" || bad "${PG_APP_ROLE} no puede conectar"
    if PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -Atqc \
         'create table _v(x int)' >/dev/null 2>&1; then
      PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -qc 'drop table _v' >/dev/null 2>&1
      bad "${PG_APP_ROLE} PUEDE crear tablas: los privilegios están mal"
    else
      check "${PG_APP_ROLE} no puede crear tablas (correcto)"
    fi
  else
    bad "No hay DATABASE_URL en ${ENV_FILE}"
  fi
else
  bad "PostgreSQL no está activo"
fi

section "Entorno y secretos"
if [[ -f "$ENV_FILE" ]]; then
  check "${ENV_FILE} existe"
  PERM="$(stat -c '%a %U:%G' "$ENV_FILE")"
  [[ "$PERM" == "640 root:${APP_USER}" ]] && check "Permisos ${PERM} (§18)" || bad "Permisos ${PERM}, se esperaba 640 root:${APP_USER}"
  for k in APP_BASE_URL DATABASE_URL DATABASE_MIGRATION_URL SESSION_SECRET TZ; do
    [[ -n "$(env_get "$k")" ]] && check "${k} definido" || bad "Falta ${k}"
  done
else
  bad "No existe ${ENV_FILE}"
fi

section "Node y servicios"
command -v node >/dev/null && check "Node $(node -v)" || bad "Node no instalado"
for u in "${APP_NAME}-web.service" "${APP_NAME}-worker.service"; do
  unit_exists "$u" && check "Unidad ${u} instalada" || bad "Falta la unidad ${u}"
done
[[ -x "/usr/local/bin/${APP_NAME}-deploy" ]] && check "Script de despliegue instalado" || bad "Falta ${APP_NAME}-deploy"
if [[ -f "${APP_DIR}/current/server.js" ]]; then
  systemctl is-active --quiet "${APP_NAME}-web" && check "Web activa" || bad "Web con build pero inactiva"
else
  later "Web sin desplegar (esperado hasta la fase 1)"
fi

section "Caddy y TLS"
systemctl is-active --quiet caddy && check "Caddy activo" || bad "Caddy inactivo"
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && check "Caddyfile válido" || bad "Caddyfile inválido"
CODE=$(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' "https://${APP_DOMAIN}/" 2>/dev/null || echo 000)
case "$CODE" in
  200|301|302|307|308) check "HTTPS responde (${CODE})" ;;
  502|503|504)         check "TLS correcto; la app aún no está desplegada (${CODE})" ;;
  000)                 bad "https://${APP_DOMAIN} no responde: revisa el certificado" ;;
  *)                   later "HTTPS devuelve ${CODE}" ;;
esac
REDIR=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://${APP_DOMAIN}/" 2>/dev/null || echo 000)
[[ "$REDIR" =~ ^(301|302|308)$ ]] && check "HTTP redirige a HTTPS (${REDIR})" || later "HTTP devuelve ${REDIR}"
curl -sSI --max-time 10 "https://${APP_DOMAIN}/" 2>/dev/null | grep -qi 'strict-transport-security' \
  && check "Cabecera HSTS presente" || later "Sin HSTS (requiere que la app responda)"
grep -q 'api/webhooks' /etc/caddy/Caddyfile \
  && check "Ruta de webhooks sin compresión ni caché (§4.8)" || bad "El Caddyfile no aísla /api/webhooks/*"

section "Respaldos"
[[ -s "${ENV_DIR}/backup-age.pub" ]] && check "Clave pública de cifrado presente" || bad "Falta la clave age"
[[ -f "/root/${APP_NAME}-backup-age.key" ]] \
  && bad "La clave PRIVADA sigue en el servidor: descárgala y bórrala" \
  || check "La clave privada no está en el servidor"
for s in backup restore-test healthcheck; do
  [[ -x "/usr/local/bin/${APP_NAME}-${s}" ]] && check "${APP_NAME}-${s} instalado" || bad "Falta ${APP_NAME}-${s}"
done
for t in backup restore-test healthcheck; do
  systemctl is-enabled --quiet "${APP_NAME}-${t}.timer" 2>/dev/null \
    && check "Timer ${t} habilitado" || bad "Timer ${t} deshabilitado"
done
N=$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" 2>/dev/null | wc -l)
(( N > 0 )) && check "${N} respaldo(s) en ${BACKUP_DIR}" || bad "No hay ningún respaldo"
LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
if [[ -n "$LATEST" ]]; then
  head -c 100 "$LATEST" | grep -q 'age-encryption.org' \
    && check "El respaldo está cifrado" || bad "El respaldo NO está cifrado"
fi
RR="$(sed -nE 's/^RCLONE_REMOTE=(.+)$/\1/p' "${ENV_DIR}/backup.env" 2>/dev/null)"
[[ -n "$RR" ]] && check "Destino remoto: ${RR}" || bad "Sin copia fuera del VPS (§4.8 punto 3)"
[[ -f "/etc/logrotate.d/${APP_NAME}" ]] && check "logrotate configurado" || bad "Falta logrotate"

section "Cloudflare (§4.8 punto 1)"
if [[ -n "$A_REC" && -n "$MY_IP" && "$A_REC" != "$MY_IP" ]]; then
  curl -sSI --max-time 10 "https://${APP_DOMAIN}/" 2>/dev/null | grep -qi '^server: cloudflare' \
    && check "Cloudflare está delante en modo proxy" \
    || later "El A no apunta al VPS pero no veo cabeceras de Cloudflare"
else
  later "Cloudflare sin activar: el A apunta directo al VPS (ver MANUAL-STEPS.md paso 2)"
fi

section "Higiene del sistema"
swapon --show=NAME --noheadings | grep -q . && check "Swap activo" || later "Sin swap"
systemctl is-enabled --quiet unattended-upgrades 2>/dev/null && check "Actualizaciones automáticas" || bad "unattended-upgrades deshabilitado"
[[ "$(timedatectl show -p Timezone --value)" == "$APP_TZ" ]] && check "Zona horaria ${APP_TZ}" || bad "Zona horaria incorrecta"
U=$(df --output=pcent / | tail -1 | tr -dc '0-9')
(( U < 80 )) && check "Disco al ${U}%" || bad "Disco al ${U}%"

printf '\n%s─────────────────────────────────────────%s\n' "$C_INFO" "$C_OFF"
printf '  %s%d correctos%s · %s%d pendientes%s · %s%d por fases posteriores%s\n' \
  "$C_OK" "$pass" "$C_OFF" "$C_ERR" "$fail" "$C_OFF" "$C_WARN" "$skip" "$C_OFF"
if (( fail == 0 )); then
  printf '\n%sFASE 0 COMPLETA.%s La infraestructura está lista para la fase 1 (migración de datos).\n\n' "$C_OK" "$C_OFF"
  exit 0
fi
printf '\n%sQuedan %d puntos por resolver.%s Revisa los marcados como FALTA.\n\n' "$C_ERR" "$fail" "$C_OFF"
exit 1
