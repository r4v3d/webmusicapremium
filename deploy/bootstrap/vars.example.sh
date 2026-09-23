# Copia este archivo a deploy/bootstrap/vars.sh y ajusta lo que haga falta.
# vars.sh NO se versiona: puede contener tu clave pública y el nombre del repo.
#
#   cp deploy/bootstrap/vars.example.sh deploy/bootstrap/vars.sh

# --- Identidad del proyecto ---
APP_NAME=musicapremium
APP_DOMAIN=cheapmusic.best
APP_USER=deploy
APP_DIR=/srv/musicapremium
APP_PORT=3000
APP_TZ=America/Lima

# Correo para los avisos de expiración de Let's Encrypt.
ACME_EMAIL=admin@cheapmusic.best

# --- Clave pública SSH que podrá entrar como $APP_USER ---
# Obligatoria: sin ella el script 10-hardening.sh se niega a cerrar el acceso
# por contraseña, para no dejarte fuera del servidor.
# Pega aquí el contenido de ~/.ssh/musicapremium_deploy.pub
SSH_PUBKEY=""

# --- PostgreSQL ---
PG_VERSION=18
PG_DB=musicapremium
PG_APP_ROLE=mpb_app
PG_MIGRATOR_ROLE=mpb_migrator

# --- Node ---
NODE_MAJOR=22

# --- Respaldos ---
BACKUP_DIR=/var/backups/musicapremium
BACKUP_KEEP_DAYS=14
# Destino remoto de rclone, por ejemplo "contabo:musicapremium-backups".
# Vacío = solo respaldo local (recuerda que entonces NO hay copia fuera del VPS).
RCLONE_REMOTE=""

# --- Repositorio de la app (opcional en fase 0) ---
# Si lo defines, 30-app.sh clona el repo en $APP_DIR/repo.
APP_REPO_URL=""
APP_REPO_BRANCH=main

# --- Swap ---
SWAP_SIZE=2G
