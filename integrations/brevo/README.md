# Correos con Brevo (y Gmail de respaldo)

La tienda envía los correos (credenciales de cada pedido, códigos de acceso y alertas) por **Brevo**. Si Brevo falla, por ejemplo al pasar el límite diario del plan gratis, el mismo correo sale por **Gmail** automáticamente.

- **Plan gratis de Brevo:** 300 correos al día.
- Los envíos se hacen de a pocos (hasta 10 por segundo), así una ráfaga de pedidos pagados no satura al proveedor.
- Los correos salen desde una dirección de **tu dominio**, por ejemplo `pedidos@cheapmusic.best`. Las respuestas de los clientes pueden llegar a tu Gmail.

> **Por qué tu dominio y no tu Gmail:** Brevo no deja autenticar direcciones @gmail.com. Si las usas como remitente, las reemplaza por una de @brevosend.com y los correos suelen caer en spam. Con `cheapmusic.best` autenticado llegan a la bandeja de entrada.

---

## Parte A · Autenticar tu dominio en Brevo (10 minutos)

**A1.** En Brevo, entra al engranaje ⚙️ (arriba a la derecha) → **Senders, Domains & Dedicated IPs** → pestaña **Domains** → **Add a domain**. Escribe `cheapmusic.best`.

**A2.** Brevo te muestra unos registros DNS: **Brevo code** (TXT), **DKIM** y **DMARC** (TXT).
- Si te ofrece **configurarlo automáticamente con Cloudflare**, acepta e inicia sesión en Cloudflare.
- Si no, cópialos a mano: en **Cloudflare** → tu dominio → **DNS** → **Add record**, uno por uno, con el **tipo, nombre y valor** exactos que muestra Brevo.
  - Si alguno es **CNAME**, pon el proxy en **DNS only** (nube gris), no en naranja.
  - Si ya tienes un registro **DMARC** (`_dmarc`), no crees otro: déjalo como está.

**A3.** Vuelve a Brevo y pulsa **Authenticate this email domain** o **Verify**. Puede tardar unos minutos. Debe quedar en verde: **Authenticated**.

**A4.** En la pestaña **Senders** → **Add a sender**:
- **From name:** `Música Premium Barato`
- **From email:** `pedidos@cheapmusic.best`

Si Brevo pide un código de verificación enviado a esa dirección y todavía no recibes correos en tu dominio, activa **Cloudflare → Email → Email Routing** y reenvía `pedidos@cheapmusic.best` a tu Gmail.

## Parte B · Clave SMTP de Brevo

**B1.** En el engranaje ⚙️ → **SMTP & API** → pestaña **SMTP**. Anota el **Login**: es algo como `xxxx@smtp-brevo.com`.

**B2.** Pulsa **Generate a new SMTP key**, ponle de nombre «tienda» y **cópiala**: Brevo la muestra una sola vez. Es secreta.

## Parte C · En el servidor

```bash
sudo nano /etc/musicapremium/env
```

Agrega:

```
BREVO_SMTP_LOGIN=el-login-del-paso-B1
BREVO_SMTP_KEY=la-clave-del-paso-B2
EMAIL_FROM=pedidos@cheapmusic.best
EMAIL_REPLY_TO=tu-gmail@gmail.com
```

Deja `EMAIL_USER` y `EMAIL_PASS` (tu Gmail con su **nueva** contraseña de aplicación): son el respaldo.

Guarda (**Ctrl + O**, **Enter**, **Ctrl + X**) y reinicia:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

## Parte D · Probar

1. En la tienda, entra a **Mi cuenta** y pide un código de acceso con tu correo. Debe llegarte desde `pedidos@cheapmusic.best`.
2. Revisa qué proveedor lo envió:

```bash
sudo journalctl -u musicapremium-web -n 100 --no-pager | grep -i correo
```

---

## Si algo no funciona

- **`535 Authentication failed`.**
  - El login o la clave están mal.
  - El login es el que aparece en la página SMTP, no tu correo de Brevo.
  - La clave es la **SMTP key**, no una API key.
  - Revisa que no quede un espacio al final.
- **No conecta (timeout).** Tu VPS puede estar bloqueando el puerto 587. Agrega `BREVO_SMTP_PORT=2525` y reinicia.
- **Los correos llegan con «vía brevosend.com» o a spam.** El dominio aún no está autenticado (A3) o el remitente no es de `cheapmusic.best`.
- **Se acabaron los 300 del día.** No pasa nada: el resto sale por Gmail hasta el día siguiente.
