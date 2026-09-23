> Escrito para: quien opere el VPS de cheapmusic.best (tú), no para un equipo.

# Fase 0 · pasos que hay que hacer a mano

Los scripts de `deploy/bootstrap/` automatizan todo lo que vive dentro del servidor. Esto es lo que solo se puede hacer desde un panel web o desde tu propia máquina, en el orden en que toca hacerlo.

## El servidor no estaba vacío

El plan asumía una máquina limpia. No lo es, y conviene tenerlo presente:

| Qué hay | Detalle |
|---|---|
| `tidal-telegram.service` | Bot de Telegram, corre como **root** desde systemd |
| `clientes-bot.service` | Bot de Telegram → Google Sheets, corre como **root** desde `/opt/clientes-bot` |
| Contenedor `tidal-sync-bot` | Docker, imagen `deploy-tidal-bot` |
| Usuario `ubuntu` | Tiene sudo, **ninguna clave SSH** y ningún acceso registrado |

Ninguno escucha en un puerto: son clientes que salen hacia Telegram, así que UFW con 22/80/443 no los afecta. Tampoco los toca el endurecimiento de SSH, porque systemd los arranca sin pasar por sshd.

Dos consecuencias para esta fase:

- **`PermitRootLogin` se queda en `prohibit-password`**, no en `no`. El único acceso previo al servidor era root por contraseña, y los bots corren como root. Dejar root con clave evita quedarse fuera. Cuando la cuenta `deploy` esté rodada, cámbialo ejecutando el paso 10 con `ALLOW_ROOT_KEY=0`.
- **Los 8 GB de RAM y el ajuste de PostgreSQL de §4.4 no son para un servidor dedicado.** `shared_buffers = 2GB` deja margen, pero si añades más servicios hay que revisarlo.

| # | Paso | Cuándo | Bloquea |
|---|---|---|---|
| 1 | DNS de `cheapmusic.best` | Antes de todo | El paso 40 (TLS) |
| 2 | Cloudflare | Después de que salga el certificado | Nada |
| 3 | Firewall del panel de Contabo | Después del paso 10 | Nada |
| 4 | Deshabilitar el VNC | Después del paso 10 | Nada |
| 5 | Guardar la clave de respaldos | Justo después del paso 50 | Poder restaurar |
| 6 | rclone para la copia remota | Antes de producción | La verificación |

---

## 1. DNS de `cheapmusic.best`

Primer paso de la fase, y bloquea el resto: Caddy solo obtiene el certificado cuando el dominio ya resuelve a este servidor (§4.8 punto 5).

En el registrador del dominio (o en Cloudflare si ya lo migraste):

| Tipo | Nombre | Valor | TTL | Proxy |
|---|---|---|---|---|
| A | `@` | `169.58.139.103` | Auto | **Gris (DNS only)** |
| AAAA | `@` | `2a02:c207:2349:2331::1` | Auto | **Gris** |
| CNAME | `www` | `cheapmusic.best` | Auto | Gris |

El proxy **debe** estar en gris durante la emisión del certificado. En naranja, Cloudflare intercepta el desafío HTTP-01 y Let's Encrypt no valida.

Comprueba antes de seguir:

```bash
dig +short A cheapmusic.best      # → 169.58.139.103
dig +short AAAA cheapmusic.best   # → 2a02:c207:2349:2331::1
```

Si no devuelve nada, espera a que propague. Suelen ser minutos; puede llegar a una hora.

## 2. Cloudflare delante del dominio

Lima–Europa son 180–220 ms de ida y vuelta (§4.8 punto 1). Cloudflare sirve el TLS y los estáticos desde el nodo más cercano al cliente, y de paso oculta la IP del VPS.

Actívalo **después** de que `90-verify.sh` confirme que el certificado existe.

1. Añade el sitio en Cloudflare (plan Free) y cambia los nameservers en el registrador.
2. Pon el proxy en **naranja** para `@` y `www`.
3. SSL/TLS → modo **Full (strict)**. Nunca *Flexible*: deja el tramo Cloudflare→VPS sin cifrar.
4. Crea una regla de caché que **excluya `/api/*`**:
   - Rules → Cache Rules → *If* `URI Path starts with /api/` → *Then* Bypass cache.
5. Comprueba que no hay ninguna transformación activa sobre `/api/webhooks/*`. El cuerpo del webhook tiene que llegar byte a byte o la firma HMAC de TAYPI no valida (§11).

El `Caddyfile` ya trae los rangos de IP de Cloudflare como `trusted_proxies`, así que la IP real del cliente sigue llegando a la app. Eso es lo que hace que el rate limit por IP y la auditoría de §18 sigan funcionando.

## 3. Firewall en el panel de Contabo

UFW ya está configurado dentro del servidor, pero el panel de Contabo tiene su propio firewall por delante. Con las dos capas, un error en una no deja el servidor expuesto (§4.8 punto 4).

Mismas reglas: entrada permitida solo en **22/tcp**, **80/tcp** y **443/tcp**. Todo lo demás, denegado.

El **80 es obligatorio**: sin él, Let's Encrypt no puede renovar por HTTP-01 y el certificado caduca en 90 días.

## 4. Deshabilitar el VNC

El panel deja el VNC abierto en `13.140.170.185:63059`. Es una consola de administración expuesta a internet en un puerto fijo. Deshabilítalo en el panel y actívalo solo cuando necesites rescatar el servidor porque SSH no responde.

## 5. Guardar la clave privada de los respaldos

El paso 50 genera un par de claves `age` e imprime la privada **una sola vez**. Los respaldos se cifran con la pública; sin la privada son ilegibles y no hay forma de recuperarlos.

```bash
# Desde tu máquina, justo después del paso 50:
scp -i ~/.ssh/musicapremium_deploy \
    deploy@cheapmusic.best:/root/musicapremium-backup-age.key \
    ~/musicapremium-backup.key

# Guárdala en tu gestor de contraseñas y bórrala del servidor:
ssh -i ~/.ssh/musicapremium_deploy deploy@cheapmusic.best \
    'sudo shred -u /root/musicapremium-backup-age.key'
```

Que la clave **no** esté en el servidor es deliberado: si alguien entra, no puede leer los respaldos anteriores. `90-verify.sh` marca como pendiente que la clave siga ahí.

## 6. rclone para la copia fuera del VPS

El VPS no tiene Auto Backup contratado (§4.8 punto 3). Sin destino remoto, el respaldo vive en el mismo disco que la base y un fallo de disco se lleva las dos copias.

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@cheapmusic.best
sudo rclone config
#   n) new remote  →  nombre: contabo
#   Storage: s3  →  Provider: Other
#   endpoint y credenciales de Contabo Object Storage
#   (o cualquier otro destino: Backblaze B2, S3, un segundo VPS…)

sudo sed -i 's|^RCLONE_REMOTE=.*|RCLONE_REMOTE=contabo:musicapremium-backups|' \
    /etc/musicapremium/backup.env
sudo musicapremium-backup      # comprueba que la subida funciona
```

Retención: 14 días en local, 30 en remoto (§4.7).

---

## Comprobación final

```bash
./deploy/provision.sh --verify
```

Todo tiene que salir en verde salvo lo marcado con `~~`, que corresponde a fases posteriores (la web sin desplegar, el worker sin código).

## Qué hacer si algo sale mal

**fail2ban me baneó mi propia IP.** El síntoma es que el puerto 22 deja de responder (ni siquiera pide contraseña). Pasa si fallas cinco autenticaciones en diez minutos. El baneo dura una hora y se va solo.

El paso 10 exime automáticamente la IP desde la que lo ejecutas, así que no debería repetirse. Para añadir otra IP a mano:

```bash
sudo fail2ban-client set sshd unbanip TU.IP.AQUI     # quitar un baneo activo
sudo nano /etc/fail2ban/jail.d/sshd.local            # añadirla a ignoreip
sudo systemctl restart fail2ban
```

Si necesitas entrar durante un baneo, el VNC del panel de Contabo no pasa por fail2ban.

**No entro por SSH después del paso 10.** Abre el VNC desde el panel de Contabo, entra como root y ejecuta:

```bash
rm /etc/ssh/sshd_config.d/99-musicapremium.conf && systemctl restart ssh
```

El paso 10 se niega a correr si no hay clave instalada, así que esto no debería pasar.

**No sale el certificado.** Por orden de probabilidad: el proxy de Cloudflare está en naranja, el DNS no propagó, o el 80 está cerrado en el panel de Contabo. Diagnóstico:

```bash
sudo journalctl -u caddy -n 80 --no-pager
```

**PostgreSQL no arranca tras el ajuste.** Casi siempre es `shared_buffers` mayor que la memoria disponible:

```bash
sudo journalctl -u postgresql -n 50 --no-pager
sudo nano /etc/postgresql/18/main/conf.d/99-musicapremium.conf
sudo systemctl restart postgresql
```

**Quiero rehacer un paso.** Todos son idempotentes:

```bash
sudo /root/musicapremium-deploy/bootstrap/run-all.sh 20
```
