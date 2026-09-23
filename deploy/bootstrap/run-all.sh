#!/usr/bin/env bash
# Fase 0 completa, en orden. Idempotente: se puede repetir sin romper nada.
#
#   sudo ./run-all.sh                 todos los pasos
#   sudo ./run-all.sh 20 30           solo esos pasos
#   sudo ./run-all.sh --skip 40       todos menos el 40 (útil si el DNS no propagó)
#
# Pasos:  00 base · 10 hardening · 20 postgres · 30 app · 40 caddy · 50 respaldos · 90 verificación
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL=(00-preflight 10-hardening 20-postgres 30-app 40-caddy 50-backups 90-verify)
SKIP=()
WANT=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip) shift; SKIP+=("$1") ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) WANT+=("$1") ;;
  esac
  shift
done

steps=()
if [[ ${#WANT[@]} -gt 0 ]]; then
  for w in "${WANT[@]}"; do
    for s in "${ALL[@]}"; do [[ "$s" == ${w}-* ]] && steps+=("$s"); done
  done
  [[ ${#steps[@]} -gt 0 ]] || die "Ningún paso coincide con: ${WANT[*]}"
else
  steps=("${ALL[@]}")
fi

if [[ ${#SKIP[@]} -gt 0 ]]; then
  filtered=()
  for s in "${steps[@]}"; do
    omit=0
    for k in "${SKIP[@]}"; do [[ "$s" == ${k}-* ]] && omit=1; done
    (( omit )) || filtered+=("$s")
  done
  # ${x[@]:+...} evita el error de "variable sin definir" en bash 4.x cuando el
  # array queda vacío porque se omitió todo.
  steps=(${filtered[@]:+"${filtered[@]}"})
  [[ ${#steps[@]} -gt 0 ]] || die "No queda ningún paso por ejecutar."
fi

cat <<EOF

${C_INFO}Fase 0 · ${APP_DOMAIN}${C_OFF}
  Dominio      ${APP_DOMAIN}
  Usuario      ${APP_USER}
  Directorio   ${APP_DIR}
  PostgreSQL   ${PG_VERSION} · base ${PG_DB}
  Entorno      ${ENV_FILE}
  Respaldos    ${BACKUP_DIR}
  Pasos        ${steps[*]}

EOF

# El paso 10 puede dejarte fuera del servidor si no hay clave: avisa antes.
for s in "${steps[@]}"; do
  if [[ "$s" == 10-* && -z "${SSH_PUBKEY:-}" && ! -s /root/.ssh/authorized_keys ]]; then
    die "El paso 10 cierra el acceso por contraseña y no hay ninguna clave pública.
       Define SSH_PUBKEY en deploy/bootstrap/vars.sh antes de continuar."
  fi
done

START=$(date +%s)
for s in "${steps[@]}"; do
  printf '\n%s╔══════════════════════════════════════════════╗%s\n' "$C_INFO" "$C_OFF"
  printf '%s║  %-42s  ║%s\n' "$C_INFO" "$s" "$C_OFF"
  printf '%s╚══════════════════════════════════════════════╝%s\n' "$C_INFO" "$C_OFF"
  # 90-verify devuelve 1 cuando algo falta: eso no debe abortar el resumen.
  if bash "${HERE}/${s}.sh"; then
    :
  else
    rc=$?
    [[ "$s" == 90-* ]] || die "El paso ${s} falló (código ${rc}). Corrige y repite:
       sudo ./run-all.sh ${s%%-*}"
    VERIFY_FAILED=1
  fi
done
ELAPSED=$(( $(date +%s) - START ))

printf '\n%s═══════════════════════════════════════════════%s\n' "$C_OK" "$C_OFF"
printf '  Terminado en %dm %ds\n' $((ELAPSED/60)) $((ELAPSED%60))
printf '%s═══════════════════════════════════════════════%s\n\n' "$C_OK" "$C_OFF"

cat <<EOF
Siguientes pasos manuales (deploy/MANUAL-STEPS.md):
  · Descargar la clave privada de los respaldos y borrarla del servidor
  · Replicar las reglas 22/80/443 en el firewall del panel de Contabo
  · Deshabilitar el VNC en el panel
  · Activar el proxy de Cloudflare y excluir /api/* de la caché
  · Configurar rclone para la copia fuera del VPS

Comprobar en cualquier momento:  sudo ${HERE}/90-verify.sh
EOF
[[ -n "${VERIFY_FAILED:-}" ]] && exit 1 || exit 0
