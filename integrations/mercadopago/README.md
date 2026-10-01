# Yape automático con Mercado Pago

El cliente paga con Yape sin salir del checkout y el pago se confirma solo:

1. En el checkout elige **Yape (confirmación automática)**.
2. Abre su app de Yape, entra al menú y toca **«Código de aprobación»**.
3. Escribe en la página su celular de Yape y ese código de 6 dígitos.
4. Mercado Pago aprueba o rechaza **en el momento**. Si aprueba, el pedido queda pagado y sus credenciales aparecen al instante.

Si algo se corta a la mitad (el cliente cierra la página, se cae la conexión), el pago se confirma igual. Mercado Pago avisa por webhook y, además, el servidor revisa cada pocos minutos los pagos que quedaron pendientes.

El Yape manual (con verificación desde el panel) sigue disponible como segunda opción, porque sirve para **Plin**. Si quieres ofrecer solo el automático, pon `MANUAL_YAPE_ENABLED=false`.

---

## Parte A · En Mercado Pago (15 minutos)

**A1. Crea la aplicación.**
1. Entra a <https://www.mercadopago.com.pe/developers/panel/app> con tu cuenta de Mercado Pago.
2. Pulsa **Crear aplicación**.
3. Ponle un nombre, por ejemplo *MusicaPremium*.
4. Elige que vas a recibir **pagos online** con **Checkout API** (o «integración con API»).
5. Acepta y créala.

**A2. Credenciales de prueba.** En la aplicación, abre **Credenciales de prueba** y copia:
- **Public Key**: empieza con `TEST-…` o `APP_USR-…`.
- **Access Token**: empieza igual. **Es secreto: no lo pegues en chats ni correos.**

**A3. Webhooks.**
1. En la aplicación ve a **Webhooks → Configurar notificaciones**.
2. En *URL de producción* (y en la de prueba) pon: `https://cheapmusic.best/api/webhooks/mercadopago`
3. Marca el evento **Pagos**.
4. Guarda y copia la **clave secreta** que aparece. Con ella el servidor comprueba que el aviso viene de Mercado Pago.

**A4. Credenciales de producción** (cuando termines de probar). En **Credenciales de producción**, Mercado Pago te pide completar unos datos del negocio para activarlas; como persona natural también se puede. Copia la **Public Key** y el **Access Token** de producción.

> **Tope por pago:** Yape tiene un límite por operación que el cliente define en su app (S/ 500 por defecto, hasta S/ 2000). Tus planes están muy por debajo.
>
> **Comisión:** Mercado Pago cobra una comisión por cada pago aprobado. Puedes calcularla en su **Simulador de comisiones**.

---

## Parte B · En el servidor (5 minutos)

**B1.** Entra al servidor:

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103
```

**B2.** Guarda las claves. Reemplaza cada valor y deja las comillas simples:

```bash
sudo nano /etc/musicapremium/env
```

Agrega (o completa) estas líneas al final del archivo:

```
MERCADOPAGO_ENABLED=true
MP_PUBLIC_KEY=pega-aqui-la-public-key
MP_ACCESS_TOKEN=pega-aqui-el-access-token
MP_WEBHOOK_SECRET=pega-aqui-la-clave-secreta-de-webhooks
SITE_URL=https://cheapmusic.best
```

Guarda con **Ctrl + O**, **Enter**, y sal con **Ctrl + X**.

**B3.** Reinicia:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

---

## Parte C · Probar

**Con credenciales de prueba** (las de A2):

Mercado Pago **no acepta correos reales** (ni el tuyo) como pagador cuando usas credenciales de prueba: responde *«Invalid users involved»* (2034) o *«Invalid test user email»* (2198). Necesitas un **comprador de prueba**:

1. En tu aplicación ve a **Cuentas de prueba → Crear cuenta de prueba**, elige **Perú** y el tipo **Comprador**.
2. Copia su correo. Termina en `@testuser.com`.
3. En el servidor agrega `MP_TEST_PAYER_EMAIL=ese-correo@testuser.com` en `/etc/musicapremium/env` y reinicia (B3).

Luego:
1. Haz un pedido en la tienda y elige **Yape (confirmación automática)**.
2. Usa estos datos de prueba:

| Celular | Código | Resultado |
|---|---|---|
| `111111111` | `123456` | Aprobado |
| `111111113` | `123456` | Rechazado: saldo insuficiente |
| `111111112` | `123456` | Rechazado: no autorizado |

Con el aprobado, el pedido pasa a **pagado** y aparecen las credenciales. Con los rechazados, el checkout explica el motivo y deja reintentar.

**En producción:** cambia en el servidor `MP_PUBLIC_KEY` y `MP_ACCESS_TOKEN` por las de producción (A4), **borra la línea `MP_TEST_PAYER_EMAIL`**, reinicia (B3) y haz una compra real pequeña. Usa un pedido con un correo que **no** sea el de tu cuenta de Mercado Pago: el vendedor no puede pagarse a sí mismo.

**Si un pago de prueba no pasa:** abre el checkout con la sesión del panel iniciada en el mismo navegador. Debajo del mensaje verás *«Solo para ti (admin)»* con el código y el motivo exacto que dio Mercado Pago, y qué revisar. El cliente solo ve el mensaje amable.

---

## Si algo no funciona

- **No aparece «Yape (confirmación automática)» en el checkout.** Faltan `MERCADOPAGO_ENABLED=true`, `MP_PUBLIC_KEY` o `MP_ACCESS_TOKEN`: sin las dos claves no se ofrece. Revisa B2 y reinicia (B3).
- **«No pudimos validar el código con Yape».** El código venció o el número no es el de Yape. El cliente debe generar un código nuevo.
- **El cliente dice que Yape le descontó y el pedido no se pagó.** Espera 1–2 minutos: la revisión automática lo confirma. También puede pulsar **«Ya pagué y no aparece»**. Para revisarlo tú, en el servidor:

  ```bash
  sudo journalctl -u musicapremium-web -u musicapremium-worker -n 200 --no-pager | grep -i mercadopago
  ```

- **Los webhooks llegan con «invalid_signature».** La clave de `MP_WEBHOOK_SECRET` no es la de la aplicación correcta, o es la de prueba cuando usas producción. Cópiala otra vez desde A3. Aunque la firma falle, los pagos se confirman igual por la revisión automática.
- **Devoluciones y contracargos.** Si devuelves un pago desde Mercado Pago, o el cliente lo desconoce, te llega una alerta para que decidas si quitarle el acceso.
