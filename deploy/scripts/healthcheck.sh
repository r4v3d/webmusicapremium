#!/usr/bin/env bash
# Monitoreo mínimo de §4.7: avisa si el dump falla, si el disco pasa del 80%,
# si el worker está caído o si hay pedidos pagados sin entregar.
#
# Corre cada 15 min por timer. Escribe los problemas en LOG_DIR/alerts.log y en
# el journal con prioridad err. En la fase 4 se le engancha el correo de alerta.
# Salida 0 = todo bien, 1 = hay al menos un problema.
set -uo pipefail

APP_NAME="@@APP_NAME@@"
PG_DB="@@PG_DB@@"
APP_DIR="@@APP_DIR@@"
APP_PORT="@@APP_PORT@@"
BACKUP_DIR="@@BACKUP_DIR@@"
LOG_DIR="@@LOG_DIR@@"
DOMAIN="@@DOMAIN@@"
ALERTS="${LOG_DIR}/alerts.log"
DISK_THRESHOLD=80

problems=0
alert() {
  printf '[%s] %s\n' "$(date -Is)" "$*" >>"$ALERTS"
  logger -t "${APP_NAME}-alert" -p daemon.err "$*"
  printf 'ALERTA: %s\n' "$*"
  problems=$((problems + 1))
}
ok() { printf '  ok  %s\n' "$*"; }

install -d -m 0755 "$LOG_DIR"

# --- Disco ---
USED=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if (( USED >= DISK_THRESHOLD )); then
  alert "Disco al ${USED}% (umbral ${DISK_THRESHOLD}%). Revisa ${BACKUP_DIR} y los logs."
else
  ok "Disco al ${USED}%"
fi

# --- PostgreSQL ---
if systemctl is-active --quiet postgresql; then
  if su - postgres -c "psql -Atqc 'select 1' -d '${PG_DB}'" >/dev/null 2>&1; then
    ok "PostgreSQL responde"
  else
    alert "PostgreSQL está activo pero la base ${PG_DB} no responde a una consulta."
  fi
else
  alert "PostgreSQL NO está activo. systemctl status postgresql"
fi

# --- Servicio web ---
# Solo se exige si ya hubo un despliegue: en fase 0 todavía no hay build.
if [[ -f "${APP_DIR}/current/server.js" ]]; then
  if systemctl is-active --quiet "${APP_NAME}-web"; then
    code=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" 2>/dev/null || echo 000)
    [[ "$code" =~ ^(200|301|302|307|308|404)$ ]] \
      && ok "Web responde en :${APP_PORT} (HTTP ${code})" \
      || alert "La web está activa pero devuelve HTTP ${code} en :${APP_PORT}."
  else
    alert "${APP_NAME}-web NO está activo. journalctl -u ${APP_NAME}-web -n 80"
  fi
else
  ok "Web sin desplegar todavía (esperado en fase 0)"
fi

# --- Worker: se exige solo cuando existe worker.cjs (fase 5) ---
if [[ -f "${APP_DIR}/current/worker.cjs" ]]; then
  systemctl is-active --quiet "${APP_NAME}-worker" \
    && ok "Worker activo" \
    || alert "${APP_NAME}-worker NO está activo. systemctl restart ${APP_NAME}-worker"
else
  ok "Worker sin desplegar todavía (llega en la fase 5)"
fi

# --- Caddy y certificado ---
if systemctl is-active --quiet caddy; then
  ok "Caddy activo"
  EXP=$(echo | timeout 10 openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -n "$EXP" ]]; then
    LEFT=$(( ( $(date -d "$EXP" +%s) - $(date +%s) ) / 86400 ))
    (( LEFT < 15 )) \
      && alert "El certificado TLS caduca en ${LEFT} días y Caddy no lo ha renovado." \
      || ok "Certificado TLS: ${LEFT} días restantes"
  fi
else
  alert "Caddy NO está activo: el sitio está fuera de línea."
fi

# --- Respaldos ---
LAST=$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}-*.dump.age" -printf '%T@\n' 2>/dev/null | sort -rn | head -1)
if [[ -z "$LAST" ]]; then
  # Antes del primer disparo del timer no hay ninguno: no es una alerta.
  systemctl is-enabled --quiet "${APP_NAME}-backup.timer" 2>/dev/null \
    && ok "Timer de respaldo activo; aún sin ejecutar" \
    || alert "No hay respaldos y el timer de respaldo no está habilitado."
else
  AGE_H=$(( ( $(date +%s) - ${LAST%.*} ) / 3600 ))
  (( AGE_H > 30 )) \
    && alert "El último respaldo tiene ${AGE_H} horas (debería ser diario). journalctl -u ${APP_NAME}-backup -n 50" \
    || ok "Último respaldo hace ${AGE_H} h"
fi

# --- Pedidos pagados sin entregar (§4.7) ---
# La tabla deliveries llega en la fase 4; hasta entonces se omite sin ruido.
# Hacen falta la tabla deliveries y la columna orders.paid_at, que llegan en
# fases distintas (4 y 2). Se comprueban las dos para no fallar a medias.
READY=$(su - postgres -c "psql -Atqc \"
  select to_regclass('public.deliveries') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='orders'
                   and column_name='paid_at')\" -d '${PG_DB}'" 2>/dev/null | tr -d ' ')
if [[ "$READY" == "t" ]]; then
  STUCK=$(su - postgres -c "psql -Atqc \"
    select count(*) from orders o
    where o.status = 'paid'
      and o.paid_at < now() - interval '15 minutes'
      and not exists (select 1 from deliveries d where d.order_id = o.order_id)\" -d '${PG_DB}'" 2>/dev/null || echo 0)
  (( ${STUCK:-0} > 0 )) \
    && alert "${STUCK} pedido(s) pagados sin entrega hace más de 15 min. Revisa la cola." \
    || ok "Sin pedidos pagados pendientes de entrega"
else
  ok "Esquema de entregas aún incompleto (llega en las fases 2 y 4)"
fi

if (( problems > 0 )); then
  printf '\n%d problema(s). Detalle en %s\n' "$problems" "$ALERTS"
  exit 1
fi
printf '\nTodo correcto.\n'
exit 0
