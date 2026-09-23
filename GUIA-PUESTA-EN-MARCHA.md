> Escrito para: ti, que vas a poner en marcha cheapmusic.best sin experiencia previa en servidores. Sigue las etapas en orden; cada una dice cómo saber que salió bien.

# Guía paso a paso: de Vercel + Supabase al VPS

## Dónde estás hoy (revisado el 23-09-2026)

| Qué | Estado |
|---|---|
| Clave SSH para entrar al VPS | ✅ Creada y funcionando (`~/.ssh/musicapremium_deploy`) |
| Servidor: usuario `deploy`, firewall, fail2ban, swap, hora de Lima | ✅ Hecho (pasos 00 y 10 del kit) |
| PostgreSQL, Node, Caddy, respaldos | ❌ Falta (pasos 20 a 50) |
| DNS de `cheapmusic.best` | ⚠️ Pasa por Cloudflare con la nube **naranja** y hoy no muestra ninguna página |
| Código nuevo en GitHub | ❌ Solo está en tu PC. El repositorio es **público** |

Tu tienda actual sigue funcionando en Vercel mientras haces todo esto. No se apaga nada hasta la etapa 9.

## Antes de empezar: dos herramientas

**Git Bash.** Es la terminal donde se escriben los comandos en tu PC. Búscala en el menú Inicio como "Git Bash". Pega los comandos con clic derecho → *Paste* o con `Shift+Insert`; `Ctrl+V` no funciona ahí. Cada comando se ejecuta con Enter.

**Entrar al servidor.** Muchas etapas piden "entra al VPS". Eso es abrir Git Bash y escribir:

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103
```

Sabrás que entraste porque el texto de la izquierda cambia a `deploy@...:~$`. Desde ese momento, lo que escribas se ejecuta **en el servidor**, no en tu PC. Para salir escribe `exit`.

Si un comando pide contraseña con `sudo`, no hace falta: el usuario `deploy` ya tiene permiso sin contraseña.

---

## Etapa 1 · Subir el código nuevo a GitHub

El servidor descarga el código desde GitHub, así que primero hay que subirlo. Como el repositorio es público, **nunca subas contraseñas ni claves**. El `.gitignore` ya excluye `contabo.txt`, `members_data.txt`, los `.env` y `vars.sh`.

Abre Git Bash en la carpeta del proyecto:

```bash
cd ~/OneDrive/Documentos/webmusicapremium
```

Comprueba que ningún archivo secreto aparezca en la lista. Si ves `contabo.txt`, `members_data.txt`, algún `.env` o `vars.sh`, **para y avísame**:

```bash
git status --short | grep -iE "contabo|members_data|\.env|vars\.sh|\.key"
```

Si ese comando no muestra nada, sube todo:

```bash
git add -A
```

```bash
git commit -m "Automatización de pagos, entrega y contabilidad sobre PostgreSQL propio"
```

```bash
git push origin main
```

**Salió bien si** en `https://github.com/r4v3d/webmusicapremium` ves la carpeta `db/` y el archivo `worker.js`.

> Vercel puede intentar desplegar este commit automáticamente y fallar, porque ya no usa Supabase. No pasa nada: la versión anterior sigue en línea. Si quieres evitarlo, en Vercel entra a *Settings → Git* y desactiva los despliegues automáticos antes del push.

---

## Etapa 2 · Apuntar el dominio al VPS (Cloudflare)

Caddy necesita que el dominio llegue directo al servidor para sacar el certificado HTTPS. Por eso, durante esta etapa, la nube debe estar **gris**.

1. Entra a **dash.cloudflare.com**, haz clic en `cheapmusic.best` y en el menú de la izquierda elige **DNS → Records**.
2. Deja exactamente estos tres registros. Edita los que existan y borra cualquier otro de tipo A, AAAA o CNAME para `@` o `www`:

   | Tipo | Nombre | Contenido | Proxy |
   |---|---|---|---|
   | A | `@` | `169.58.139.103` | **Gris** ("Solo DNS") |
   | AAAA | `@` | `2a02:c207:2349:2331::1` | **Gris** |
   | CNAME | `www` | `cheapmusic.best` | **Gris** |

   La nube se cambia haciendo clic sobre ella en cada registro hasta que diga "Solo DNS".
3. Hoy el dominio redirige a `www`. Eso lo hace una regla de Cloudflare: en **Rules → Redirect Rules** (y en **Page Rules**, si existe) desactiva cualquier regla sobre `cheapmusic.best`.

Espera 5 minutos y comprueba desde Git Bash, en tu PC:

```bash
nslookup cheapmusic.best 1.1.1.1
```

**Salió bien si** la respuesta muestra `169.58.139.103`. Si siguen apareciendo direcciones que empiezan con `104.` o `172.`, la nube sigue naranja.

---

## Etapa 3 · Terminar de instalar el servidor (fase 0)

Esto lo hace el kit solo. Tarda entre 10 y 20 minutos y se puede repetir sin miedo si algo se corta.

En Git Bash, en tu PC y dentro de la carpeta del proyecto:

```bash
./deploy/provision.sh
```

Verás muchas líneas en verde (`ok`) y quizá algunas en amarillo (`!!`, avisos). Solo es grave el rojo (`ERR`): si aparece, copia las últimas 30 líneas y pásamelas.

Qué va haciendo el kit:
- **Paso 20:** instala PostgreSQL 18 y crea la base y sus dos usuarios.
- **Paso 30:** instala Node, descarga tu código de GitHub y crea el archivo de configuración.
- **Paso 40:** instala Caddy y saca el certificado HTTPS.
- **Paso 50:** configura los respaldos diarios. **Imprime una clave privada una sola vez**: ver la etapa 4.

Al terminar, verifica:

```bash
./deploy/provision.sh --verify
```

**Salió bien si** todo está en verde, salvo lo marcado con `~~`: la web sin desplegar y el worker son cosa de la etapa 6.

---

## Etapa 4 · Guardar los secretos y cerrar puertas

### 4.1 Contraseñas generadas por el kit

El kit generó las contraseñas de la base de datos y las guardó en el servidor. Cópialas a tu gestor de contraseñas (Bitwarden, 1Password, o al menos un archivo cifrado). Desde tu PC:

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103 'sudo cat /root/fase0-secretos.txt'
```

### 4.2 Clave de los respaldos

Sin esta clave los respaldos no se pueden abrir. Cópiala a tu PC:

```bash
scp -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103:/root/musicapremium-backup-age.key ~/musicapremium-backup.key
```

Si ese comando da "Permission denied", entra al VPS y ejecuta esto primero; después repite el `scp`:

```bash
sudo cp /root/musicapremium-backup-age.key /tmp/ && sudo chown deploy /tmp/musicapremium-backup-age.key
```

En ese caso el `scp` es con la ruta `/tmp/musicapremium-backup-age.key` en lugar de `/root/...`.

Guarda el archivo en tu gestor de contraseñas y bórralo del servidor. Entra al VPS y ejecuta:

```bash
sudo shred -u /root/musicapremium-backup-age.key /tmp/musicapremium-backup-age.key 2>/dev/null; echo listo
```

### 4.3 Panel de Contabo

Entra a **my.contabo.com**:

1. **Firewall:** busca tu VPS, entra a la sección *Firewall* y crea una regla que permita solo la entrada TCP a los puertos **22, 80 y 443**, y bloquee todo lo demás. Asígnala a tu VPS.
2. **VNC:** en la ficha del VPS, deshabilita VNC. Solo se usa si algún día no puedes entrar por SSH.

La copia de respaldos fuera del VPS (rclone) no bloquea nada. Déjala para cuando el sitio ya funcione y la vemos juntos.

---

## Etapa 5 · Pasar los datos desde Supabase

**Hazlo en un momento tranquilo.** Los pedidos que entren a la tienda de Vercel *después* de este volcado no pasarán al servidor nuevo.

### 5.1 Conseguir la cadena de conexión de Supabase

1. Entra a **supabase.com/dashboard** y abre tu proyecto. Si dice "Paused", pulsa **Restore**.
2. Pulsa el botón **Connect**, arriba en la página del proyecto.
3. Elige **Session pooler** y copia la URI. Se ve así:
   `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
4. Reemplaza `[YOUR-PASSWORD]` por la contraseña de la base de datos. Si no la recuerdas, ve a *Project Settings → Database → Reset database password*. Resetearla no afecta a la tienda de Vercel, que usa otra clave.

Si la contraseña tiene símbolos como `@`, `#`, `/` o `%`, es más fácil resetearla por una solo con letras y números.

### 5.2 Volcar y restaurar (en el VPS)

Entra al VPS y ve a la carpeta del código:

```bash
cd /srv/musicapremium/repo
```

Volcado desde Supabase. Pega tu URI entre las comillas simples:

```bash
SUPABASE_DB_URL='postgresql://...PEGA-AQUÍ...' bash scripts/supabase-export.sh /tmp/supabase-public.dump
```

**Salió bien si** termina con "Listo: /tmp/supabase-public.dump" y lista tus tablas (`customers`, `orders`, `account_slots`…).

Restauración en el PostgreSQL del VPS:

```bash
export DATABASE_MIGRATION_URL="$(sudo sed -n 's/^DATABASE_MIGRATION_URL=//p' /etc/musicapremium/env)"
```

```bash
bash scripts/supabase-restore.sh /tmp/supabase-public.dump
```

**Salió bien si** al final muestra el conteo de filas de cada tabla y dice "Siguiente: npm run db:migrate".

---

## Etapa 6 · Configurar y desplegar

### 6.1 Editar la configuración

En el VPS:

```bash
sudo nano /etc/musicapremium/env
```

Se abre un editor de texto dentro de la terminal. Muévete con las flechas y rellena, después del `=` y sin espacios ni comillas:

| Variable | Qué poner |
|---|---|
| `ADMIN_PASSWORD` | La contraseña para entrar a `/admin`. Que sea larga |
| `EMAIL_USER` | Tu Gmail de envío, por ejemplo `tutienda@gmail.com` |
| `EMAIL_PASS` | Una **contraseña de aplicación** de Gmail (ver abajo), no tu contraseña normal |
| `ADMIN_ALERT_EMAIL` | El correo donde quieres recibir los avisos de "Yape por verificar" |
| `BINANCE_PAY_ID` | Tu Pay ID de Binance (hoy es `99190804`) |
| `BINANCE_PAY_NICKNAME` | El nombre que Binance muestra al pagador, por ejemplo `Jorge P.` |

Para guardar pulsa `Ctrl+O` y luego Enter. Para salir, `Ctrl+X`.

**Contraseña de aplicación de Gmail.** Tu cuenta de Google necesita la verificación en dos pasos activada. Entra a **myaccount.google.com/apppasswords**, crea una con el nombre "musicapremium" y copia los 16 caracteres, sin espacios.

### 6.2 Desplegar

```bash
sudo musicapremium-deploy
```

Esto descarga el código, aplica las migraciones de la base, construye la web y arranca la web y el worker. Tarda 2 o 3 minutos.

**Salió bien si** termina con "Despliegue de … terminado" y "Worker activo".

### 6.3 Verificar que los datos pasaron completos

Usa la misma URI de Supabase de la etapa 5:

```bash
cd /srv/musicapremium/repo && SOURCE_DATABASE_URL='postgresql://...LA-MISMA-DE-SUPABASE...' TARGET_DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/musicapremium/env)" node scripts/verify-cutover.mjs
```

**Salió bien si** todas las líneas tienen ✓ y al final dice "Todo cuadra". Pueden aparecer ✗ en `payments` o `events_log` si entraron pedidos en Vercel después del volcado; en ese caso avísame.

### 6.4 Probar el sitio

1. Abre `https://cheapmusic.best`. Debe cargar tu tienda con candado HTTPS.
2. Entra a `https://cheapmusic.best/admin` con tu `ADMIN_PASSWORD` y revisa que estén tus clientes y cuentas.

---

## Etapa 7 · Binance: cobros USDT automáticos

1. En **binance.com** entra a tu perfil → **Gestión de API** (API Management) → **Crear API** → *Generada por el sistema*. Ponle de nombre `cheapmusic`.
2. Al editar los permisos deja marcado **solo "Habilitar lectura"** (Enable Reading). Nada de retiros, trading ni transferencias.
3. En *Restricciones de acceso por IP* elige **"Restringir solo a IP de confianza"** y agrega `169.58.139.103`.
4. Copia la **API Key** y la **Secret Key**. La secreta solo se muestra una vez.
5. En el VPS, agrégalas a la configuración:

   ```bash
   sudo nano /etc/musicapremium/env
   ```

   Rellena `BINANCE_API_KEY=` y `BINANCE_API_SECRET=`, guarda y reinicia los servicios:

   ```bash
   sudo systemctl restart musicapremium-web musicapremium-worker
   ```

**Salió bien si** haces un pedido USDT de prueba, pagas con la nota `MPB-…` y a los pocos segundos el checkout muestra las credenciales.

---

## Etapa 8 · Telegram (opcional)

Puedes saltarla y hacerla otro día: la web funciona igual sin el bot.

1. En Telegram habla con **@BotFather**, envía `/newbot` y sigue las instrucciones. Te dará un **token** (`123456:ABC…`) y el **usuario** del bot.
2. Para recibir alertas en tu Telegram, habla con **@userinfobot**: te dice tu **ID** numérico.
3. Si tienes un canal para anuncios de stock, agrega el bot como **administrador** del canal. El ID del canal es `@nombredelcanal`.
4. Genera un secreto para el webhook. En el VPS:

   ```bash
   openssl rand -hex 24
   ```

5. Rellena en `/etc/musicapremium/env`:

   | Variable | Qué poner |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | El token del bot |
   | `TELEGRAM_BOT_USERNAME` | El usuario del bot, sin `@` |
   | `TELEGRAM_WEBHOOK_SECRET` | El secreto que acabas de generar |
   | `TELEGRAM_ADMIN_CHAT_ID` | Tu ID numérico |
   | `TELEGRAM_CHANNEL_ID` | `@nombredelcanal` |

   Después reinicia los servicios como en la etapa 7.
6. Registra el webhook. Reemplaza `TOKEN` y `SECRETO` por los tuyos:

   ```bash
   curl -s "https://api.telegram.org/botTOKEN/setWebhook" -d url=https://cheapmusic.best/api/telegram/webhook -d secret_token=SECRETO
   ```

**Salió bien si** responde `"ok":true` y, al escribirle `/start` a tu bot, contesta con el menú y tu saldo.

---

## Etapa 9 · Cloudflare de vuelta y salida a producción

1. En Cloudflare, en **DNS → Records**, pon la nube **naranja** en `@` y `www`.
2. En **SSL/TLS → Overview**, elige **Full (strict)**. Nunca "Flexible".
3. En **Caching → Cache Rules**, crea una regla: *Si "URI Path" empieza con `/api/`* → **Bypass cache**.
4. Haz las pruebas reales con montos mínimos:
   - Un pedido de S/ 6 por Yape: lo confirmas en *Cobros → Por verificar* con el número de operación de tu app.
   - Un pago USDT con la nota del pedido.
5. Cambia en tus redes y en tu WhatsApp el enlace de la tienda a `https://cheapmusic.best`.
6. Deja la tienda de Vercel como está una o dos semanas y después pausa el proyecto. Deja Supabase en pausa, sin borrarlo, como red de seguridad.

---

## Si algo sale mal

- **No me deja entrar por SSH:** mira si tu IP quedó bloqueada por demasiados intentos. Se desbloquea sola en una hora. También puedes entrar por el VNC del panel de Contabo y seguir `deploy/MANUAL-STEPS.md`.
- **Un paso del kit falló:** se puede repetir solo ese paso, por ejemplo el 40:

  ```bash
  ./deploy/provision.sh --only 40
  ```

- **La web no carga después de desplegar:** en el VPS, mira el error:

  ```bash
  sudo journalctl -u musicapremium-web -n 80 --no-pager
  ```

- **El certificado HTTPS no sale:** casi siempre es la nube naranja o el puerto 80 cerrado en el firewall de Contabo.

En cualquier caso, copia el mensaje de error y pásamelo tal cual.
