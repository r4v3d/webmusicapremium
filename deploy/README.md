> Escrito para: quien opere el VPS de cheapmusic.best (tú), no para un equipo.

# Fase 0 · VPS, dominio y PostgreSQL

Kit de aprovisionamiento de la infraestructura descrita en §4 de `plan-automatizacion-pagos-entrega.md`. Deja el servidor listo para la fase 1 (migración de Supabase a PostgreSQL propio).

Todo es idempotente: cualquier paso se puede repetir sin romper lo hecho.

## Uso

```bash
# 1. Crea el DNS primero (MANUAL-STEPS.md paso 1). Bloquea el TLS.
dig +short A cheapmusic.best      # debe devolver 169.58.139.103

# 2. Desde tu máquina (Git Bash en Windows sirve):
cd webmusicapremium
./deploy/provision.sh
```

`provision.sh` genera la clave SSH si no existe, la escribe en `bootstrap/vars.sh`, sube el kit al servidor y ejecuta los siete pasos en orden. La primera conexión pide la contraseña de root; a partir del paso 10 solo se entra con clave.

```bash
./deploy/provision.sh --only 20    # repetir un paso
./deploy/provision.sh --verify     # comprobar sin cambiar nada
./deploy/provision.sh --upload     # solo subir el kit
```

## Los siete pasos

| Paso | Qué hace |
|---|---|
| `00-preflight` | Paquetes base, zona horaria `America/Lima`, swap de 2 GB, `unattended-upgrades`, tope de 1 GB al journal |
| `10-hardening` | Usuario `deploy` con sudo, clave SSH, `PermitRootLogin no`, `PasswordAuthentication no`, UFW (22/80/443), fail2ban |
| `20-postgres` | PostgreSQL 18 desde PGDG, ajuste de §4.4, `pg_hba` solo localhost con scram, roles `mpb_app` y `mpb_migrator`, base `musicapremium` |
| `30-app` | Node 22, `/srv/musicapremium`, `/etc/musicapremium/env` en 0640, unidades systemd de web y worker, `musicapremium-deploy` |
| `40-caddy` | Caddy con TLS automático, `/api/webhooks/*` sin compresión ni caché, rangos de Cloudflare como `trusted_proxies` |
| `50-backups` | Claves `age`, `pg_dump` diario cifrado, retención 14/30 días, prueba de restauración mensual, healthcheck cada 15 min, logrotate |
| `90-verify` | Comprueba los ~60 puntos de la fase. No modifica nada |

## Decisión de diseño que conviene conocer

**Dos roles de base de datos, no uno.** `mpb_migrator` es dueño del esquema y es el único que puede crear o alterar tablas. `mpb_app` —el que usa la web— solo tiene `SELECT`, `INSERT`, `UPDATE` y `DELETE`. Una inyección SQL en la aplicación no puede tocar la estructura ni borrar tablas. `90-verify.sh` lo comprueba intentando crear una tabla con el rol de la app: si lo consigue, la verificación falla.

Las migraciones usan `DATABASE_MIGRATION_URL`, que `deploy.sh` pasa solo durante `npm run db:migrate`. El servicio web nunca ve esa cadena.

## Operación diaria

```bash
sudo musicapremium-deploy                 # desplegar (migra antes de reiniciar)
sudo musicapremium-healthcheck            # estado ahora mismo
sudo musicapremium-backup                 # respaldo manual
sudo journalctl -u musicapremium-web -f   # logs en vivo
systemctl list-timers 'musicapremium-*'   # próximas tareas
```

Restaurar (§22):

```bash
age -d -i ~/musicapremium-backup.key -o /tmp/r.dump \
    /var/backups/musicapremium/musicapremium-AAAAMMDD...dump.age
sudo -u postgres pg_restore -c -d musicapremium /tmp/r.dump
```

Antes de restaurar en producción, toma un dump del estado actual.

## Archivos

```
deploy/
├── provision.sh              se ejecuta en tu máquina; orquesta todo por SSH
├── MANUAL-STEPS.md           DNS, Cloudflare, firewall de Contabo, VNC, rclone
├── bootstrap/
│   ├── vars.example.sh       cópialo a vars.sh y ajusta
│   ├── lib.sh                helpers y valores por defecto
│   ├── 00-preflight.sh … 90-verify.sh
│   └── run-all.sh            los siete pasos en orden
├── config/                   postgresql.conf, pg_hba.conf, Caddyfile, logrotate
├── systemd/                  web, worker, backup, restore-test, healthcheck
└── scripts/                  deploy.sh, backup.sh, restore-test.sh, healthcheck.sh
```

`bootstrap/vars.sh` no se versiona: lleva tu clave pública SSH.

## Lo que esta fase deja pendiente a propósito

- El servicio web queda **habilitado pero sin arrancar**: no hay build todavía. Es lo esperado hasta la fase 1.
- El worker queda instalado pero **sin habilitar**: `deploy.sh` lo habilita en cuanto el build trae `.worker/worker.cjs` (lo genera `npm run build`).
- `next.config.mjs` ya trae `output: "standalone"` y `serverExternalPackages: ["pg"]` (§4.5 y §4.6). El corte de datos desde Supabase está en `db/README.md`.
- `ADMIN_PASSWORD` queda vacío en `/etc/musicapremium/env`: ponlo antes del primer despliegue o no podrás entrar al panel.

## Antes de dar la fase por cerrada

- [ ] `./deploy/provision.sh --verify` en verde
- [ ] La clave privada de los respaldos guardada fuera del VPS y borrada del servidor
- [ ] `RCLONE_REMOTE` configurado: sin él no hay copia fuera del VPS
- [ ] Reglas 22/80/443 replicadas en el firewall de Contabo
- [ ] VNC deshabilitado en el panel
- [ ] Segunda terminal comprobada: `ssh -i ~/.ssh/musicapremium_deploy deploy@cheapmusic.best`
