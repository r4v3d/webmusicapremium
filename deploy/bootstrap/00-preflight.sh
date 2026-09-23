#!/usr/bin/env bash
# Fase 0 · paso 00: base del sistema (paquetes, zona horaria, swap, journald).
# Idempotente: se puede volver a correr sin efectos secundarios.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

log "Comprobando el sistema operativo"
[[ -r /etc/os-release ]] || die "No encuentro /etc/os-release: distribución no soportada."
# shellcheck disable=SC1091
source /etc/os-release
case "${ID}" in
  debian|ubuntu) ok "${PRETTY_NAME}" ;;
  *) die "Este kit asume Debian o Ubuntu. Detectado: ${PRETTY_NAME}" ;;
esac

log "Recursos disponibles"
printf '     CPU: %s núcleos\n' "$(nproc)"
printf '     RAM: %s\n'         "$(free -h | awk '/^Mem:/{print $2}')"
printf '   Disco: %s libres de %s en /\n' \
  "$(df -h / | awk 'NR==2{print $4}')" "$(df -h / | awk 'NR==2{print $2}')"
mem_gb=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo)
(( mem_gb >= 7 )) || warn "Menos RAM de la esperada (${mem_gb} GB). Revisa el tuning de PostgreSQL en §4.4."

log "Actualizando índices de paquetes"
apt-get update -qq

log "Instalando utilidades base"
apt_install ca-certificates curl wget gnupg lsb-release apt-transport-https \
  ufw fail2ban unattended-upgrades dnsutils rsync git jq age \
  logrotate openssl acl sudo htop ncdu

log "Zona horaria y reloj"
# La base guarda UTC; el sistema en hora de Lima para que los logs se lean sin conversión.
timedatectl set-timezone "$APP_TZ"
timedatectl set-ntp true || warn "No pude activar NTP; revisa systemd-timesyncd."
ok "Zona horaria: $(timedatectl show -p Timezone --value)"

log "Actualizaciones automáticas de seguridad"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# Reinicios automáticos NO: un reinicio a medianoche puede cortar una entrega.
# El aviso queda en el journal y se reinicia en una ventana elegida.
cat >/etc/apt/apt.conf.d/51musicapremium-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "unattended-upgrades activo (sin reinicio automático)"

log "Swap de ${SWAP_SIZE} (red de seguridad para el build de Next)"
if swapon --show=NAME --noheadings | grep -q .; then
  ok "Ya hay swap activo: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
else
  if [[ ! -f /swapfile ]]; then
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  ok "Swap creado y montado"
fi
# Con 8 GB de RAM el swap es un colchón, no un destino: swappiness bajo.
cat >/etc/sysctl.d/60-musicapremium.conf <<'EOF'
vm.swappiness = 10
vm.overcommit_memory = 0
net.core.somaxconn = 1024
net.ipv4.tcp_syncookies = 1
EOF
sysctl --system >/dev/null
ok "Parámetros de kernel aplicados"

log "Límite de tamaño del journal (el disco se llena de logs, no de datos)"
install -d -m 0755 /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/00-musicapremium.conf <<'EOF'
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=1month
Compress=yes
EOF
systemctl restart systemd-journald
ok "journald limitado a 1 GB / 1 mes"

install -d -m 0755 "$LOG_DIR"
ok "Paso 00 completo."
