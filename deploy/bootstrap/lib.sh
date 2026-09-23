#!/usr/bin/env bash
# Helpers compartidos por los scripts de la fase 0.
# Se carga con:  source "$(dirname "$0")/lib.sh"

set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_INFO=$'\033[36m'; C_OFF=$'\033[0m'

log()  { printf '%s==>%s %s\n' "$C_INFO" "$C_OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n'  "$C_OK"   "$C_OFF" "$*"; }
warn() { printf '%s  !!%s %s\n'  "$C_WARN" "$C_OFF" "$*" >&2; }
die()  { printf '%s ERR%s %s\n'  "$C_ERR"  "$C_OFF" "$*" >&2; exit 1; }

require_root() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] || die "Este script debe correr como root (usa sudo)."
}

# Raíz del kit (deploy/) sin importar desde dónde se invoque.
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Valores por defecto. Se sobreescriben con bootstrap/vars.sh ---
APP_NAME="${APP_NAME:-musicapremium}"
APP_DOMAIN="${APP_DOMAIN:-cheapmusic.best}"
APP_USER="${APP_USER:-deploy}"
APP_DIR="${APP_DIR:-/srv/musicapremium}"
APP_PORT="${APP_PORT:-3000}"
APP_TZ="${APP_TZ:-America/Lima}"
ACME_EMAIL="${ACME_EMAIL:-admin@${APP_DOMAIN}}"
PG_VERSION="${PG_VERSION:-18}"
PG_DB="${PG_DB:-musicapremium}"
PG_APP_ROLE="${PG_APP_ROLE:-mpb_app}"
PG_MIGRATOR_ROLE="${PG_MIGRATOR_ROLE:-mpb_migrator}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/musicapremium}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
SECRETS_OUT="${SECRETS_OUT:-/root/fase0-secretos.txt}"

# vars.sh es opcional y no se versiona (puede llevar la clave pública SSH).
if [[ -f "${KIT_DIR}/bootstrap/vars.sh" ]]; then
  # shellcheck disable=SC1091
  source "${KIT_DIR}/bootstrap/vars.sh"
fi

# Derivados de APP_NAME: se calculan DESPUÉS de vars.sh para que un APP_NAME
# distinto arrastre consigo las rutas de configuración y de logs.
ENV_DIR="${ENV_DIR:-/etc/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-${ENV_DIR}/env}"
LOG_DIR="${LOG_DIR:-/var/log/${APP_NAME}}"

# --- Utilidades ---

# Contraseña apta para una URL de conexión (sin caracteres que haya que escapar).
gen_pw() { openssl rand -hex 24; }
# Secreto genérico para firmar sesiones.
gen_secret() { openssl rand -base64 32 | tr -d '\n'; }

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
}

# Sustituye los marcadores @@...@@ de una plantilla y la instala con permisos.
render() {
  local src="$1" dst="$2" mode="${3:-0644}" owner="${4:-root:root}"
  [[ -f "$src" ]] || die "Plantilla ausente: $src"
  local tmp; tmp="$(mktemp)"
  sed \
    -e "s|@@APP_NAME@@|${APP_NAME}|g" \
    -e "s|@@APP_DIR@@|${APP_DIR}|g" \
    -e "s|@@APP_USER@@|${APP_USER}|g" \
    -e "s|@@APP_PORT@@|${APP_PORT}|g" \
    -e "s|@@APP_TZ@@|${APP_TZ}|g" \
    -e "s|@@ENV_FILE@@|${ENV_FILE}|g" \
    -e "s|@@DOMAIN@@|${APP_DOMAIN}|g" \
    -e "s|@@EMAIL@@|${ACME_EMAIL}|g" \
    -e "s|@@BACKUP_DIR@@|${BACKUP_DIR}|g" \
    -e "s|@@BACKUP_KEEP_DAYS@@|${BACKUP_KEEP_DAYS}|g" \
    -e "s|@@LOG_DIR@@|${LOG_DIR}|g" \
    -e "s|@@PG_DB@@|${PG_DB}|g" \
    -e "s|@@PG_VERSION@@|${PG_VERSION}|g" \
    "$src" >"$tmp"
  install -o "${owner%%:*}" -g "${owner##*:}" -m "$mode" "$tmp" "$dst"
  rm -f "$tmp"
}

# Escribe/actualiza una clave en el EnvironmentFile sin duplicarla.
env_set() {
  local key="$1" value="$2"
  install -d -m 0750 -o root -g "${APP_USER}" "$ENV_DIR"
  [[ -f "$ENV_FILE" ]] || install -o root -g "${APP_USER}" -m 0640 /dev/null "$ENV_FILE"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    grep -vE "^${key}=" "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
    install -o root -g "${APP_USER}" -m 0640 "$tmp" "$ENV_FILE"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

env_get() {
  [[ -f "$ENV_FILE" ]] || return 1
  sed -nE "s/^$1=(.*)$/\1/p" "$ENV_FILE" | tail -n1
}

# Como env_set, pero solo si la clave no existe: no pisa lo que ya configuraste
# (repetir el paso 30 no debe devolver TAYPI_ENABLED a false, por ejemplo).
env_default() {
  local key="$1" value="$2"
  if [[ -f "$ENV_FILE" ]] && grep -qE "^${key}=" "$ENV_FILE"; then
    return 0
  fi
  env_set "$key" "$value"
}

# Apunta un secreto generado al archivo de entrega (solo root lo lee).
# Añade sin truncar: varios pasos escriben en el mismo archivo.
record_secret() {
  [[ -f "$SECRETS_OUT" ]] || install -m 0600 /dev/null "$SECRETS_OUT"
  printf '%s\n' "$*" >>"$SECRETS_OUT"
  chmod 0600 "$SECRETS_OUT"
}

psql_su() { su - postgres -c "psql -v ON_ERROR_STOP=1 -Atqc \"$1\""; }

unit_exists() { systemctl list-unit-files "$1" --no-legend 2>/dev/null | grep -q .; }
