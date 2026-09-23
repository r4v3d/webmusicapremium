#!/usr/bin/env bash
# Fase 0 · paso 10: usuario deploy, SSH endurecido, UFW y fail2ban (§4.8 punto 4).
#
# Seguridad de este script: NO desactiva la contraseña de SSH hasta comprobar
# que la clave pública quedó instalada. Si no hay clave, se detiene.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

log "Usuario de despliegue: ${APP_USER}"
if id -u "$APP_USER" >/dev/null 2>&1; then
  ok "El usuario ya existe"
else
  adduser --disabled-password --gecos "" "$APP_USER"
  ok "Usuario creado sin contraseña (solo entra con clave)"
fi
usermod -aG sudo "$APP_USER"
# sudo sin contraseña: el usuario no tiene contraseña que teclear y los
# despliegues no interactivos necesitan reiniciar servicios.
install -m 0440 /dev/stdin "/etc/sudoers.d/90-${APP_USER}" <<EOF
${APP_USER} ALL=(ALL) NOPASSWD:ALL
EOF
visudo -cf "/etc/sudoers.d/90-${APP_USER}" >/dev/null || die "sudoers inválido."
ok "sudo configurado"

log "Instalando la clave pública SSH"
SSH_HOME="/home/${APP_USER}/.ssh"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$SSH_HOME"
touch "${SSH_HOME}/authorized_keys"
if [[ -n "${SSH_PUBKEY:-}" ]]; then
  if grep -qF "$SSH_PUBKEY" "${SSH_HOME}/authorized_keys" 2>/dev/null; then
    ok "La clave ya estaba autorizada"
  else
    printf '%s\n' "$SSH_PUBKEY" >>"${SSH_HOME}/authorized_keys"
    ok "Clave añadida"
  fi
elif [[ -s /root/.ssh/authorized_keys ]]; then
  # Reutiliza las claves con las que ya entras como root.
  cat /root/.ssh/authorized_keys >>"${SSH_HOME}/authorized_keys"
  ok "Copiadas las claves de root"
fi
sort -u "${SSH_HOME}/authorized_keys" -o "${SSH_HOME}/authorized_keys"
chown "$APP_USER:$APP_USER" "${SSH_HOME}/authorized_keys"
chmod 0600 "${SSH_HOME}/authorized_keys"

KEY_COUNT=$(grep -cE '^(ssh|ecdsa)-' "${SSH_HOME}/authorized_keys" || true)
[[ "${KEY_COUNT:-0}" -gt 0 ]] || die "No hay ninguna clave pública para ${APP_USER}.
       Define SSH_PUBKEY en deploy/bootstrap/vars.sh y vuelve a correr este paso.
       Sin clave, cerrar la contraseña de SSH te dejaría fuera del servidor."
ok "${KEY_COUNT} clave(s) autorizada(s) para ${APP_USER}"

log "Endureciendo sshd (sin contraseñas; root solo con clave)"
# ALLOW_ROOT_KEY=1 conserva el acceso de root mediante clave.
# Este servidor no estaba vacío: aloja dos bots de Telegram que corren como root
# y el único acceso previo era root por contraseña. Dejar root con clave evita
# quedarse fuera si la cuenta deploy falla, y es reversible. El plan (§4.8
# punto 4) pedía PermitRootLogin no; ponlo a 0 cuando deploy esté rodado.
ALLOW_ROOT_KEY="${ALLOW_ROOT_KEY:-1}"
if [[ "$ALLOW_ROOT_KEY" == "1" ]]; then
  ROOT_POLICY="prohibit-password"
  ALLOWED_USERS="${APP_USER} root"
  warn "root conserva acceso por clave (ALLOW_ROOT_KEY=1). La contraseña queda cerrada igual."
else
  ROOT_POLICY="no"
  ALLOWED_USERS="${APP_USER}"
fi
install -d -m 0755 /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-musicapremium.conf <<EOF
# Gestionado por deploy/bootstrap/10-hardening.sh — no editar a mano.
PermitRootLogin ${ROOT_POLICY}
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers ${ALLOWED_USERS}
EOF
# Algunas imágenes traen la contraseña habilitada en el archivo principal y
# el include de sshd_config.d va primero: la primera directiva gana, así que
# hay que neutralizar las líneas del archivo base.
sed -i -E 's/^[[:space:]]*(PasswordAuthentication|PermitRootLogin)[[:space:]]+.*/# &/' /etc/ssh/sshd_config
sshd -t || die "La configuración de sshd no valida. NO se reinició el servicio."
ok "Configuración validada"

log "Firewall UFW: solo 22, 80 y 443"
ufw --force default deny incoming >/dev/null
ufw --force default allow outgoing >/dev/null
ufw allow 22/tcp  comment 'SSH'   >/dev/null
ufw allow 80/tcp  comment 'HTTP'  >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1) · puertos: 22, 80, 443"
warn "Replica estas tres reglas en el firewall del panel de Contabo (§4.8) y deja el VNC deshabilitado."

log "fail2ban contra fuerza bruta en SSH"
# ADMIN_IP se libra del baneo. Sin esto, una prueba fallida desde tu propia IP
# (o un cliente SSH mal configurado) te deja una hora fuera del servidor.
# Se rellena con la IP desde la que llega esta sesión SSH.
ADMIN_IP="${ADMIN_IP:-$(echo "${SSH_CLIENT:-}" | awk '{print $1}')}"
IGNORE="127.0.0.1/8 ::1"
if [[ "$ADMIN_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IGNORE="${IGNORE} ${ADMIN_IP}"
  ok "Tu IP (${ADMIN_IP}) queda exenta del baneo"
else
  warn "No pude detectar tu IP: si fallas 5 intentos, te bloqueas 1 hora."
  warn "Puedes fijarla con: ADMIN_IP=1.2.3.4 bash 10-hardening.sh"
fi
cat >/etc/fail2ban/jail.d/sshd.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
ignoreip = ${IGNORE}

[sshd]
enabled = true
port    = ssh
mode    = aggressive
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
ok "fail2ban activo"

log "Reiniciando sshd"
systemctl restart ssh 2>/dev/null || systemctl restart sshd
ok "sshd reiniciado"

cat <<EOF

${C_WARN}COMPROBACIÓN OBLIGATORIA ANTES DE CERRAR ESTA SESIÓN${C_OFF}
Usuarios permitidos: ${ALLOWED_USERS}
Abre otra terminal y verifica que entras con la clave:

    ssh -i ~/.ssh/musicapremium_deploy ${APP_USER}@169.58.139.103

Si falla, NO cierres esta sesión: revierte con
    rm /etc/ssh/sshd_config.d/99-musicapremium.conf && systemctl restart ssh

EOF
ok "Paso 10 completo."
