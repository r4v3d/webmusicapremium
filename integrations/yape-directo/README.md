# Yape directo (sin comisiones) validado con las notificaciones del celular

El cliente yapea a tu número **923 282 640** (o escanea tu QR de Yape) y el pedido se confirma solo, sin pasarela ni comisiones:

1. En el checkout elige **Yape (QR o número)**. Ve el número, tu QR y el **monto exacto** a yapear.
2. Yapea el precio exacto y escribe el **código de seguridad** de su constancia. A tu celular llega la notificación «Clemer Per* te envió un pago por S/ 6. El cód. de seguridad es: 805».
3. Una app de tu celular (MacroDroid) reenvía esa notificación a tu servidor.
4. El servidor reconoce el pedido por el monto y el código, lo marca pagado y el cliente ve sus credenciales.

Si algo no cuadra, el servidor **no adivina**: te manda un mensaje al bot de Telegram con botones para aprobar o rechazar.

---

## Cómo sabe qué pedido pagó cada yapeo

Un pago se confirma solo cuando coinciden **las tres** cosas:

1. **Monto exacto.** El precio de la tabla, sin descuentos: S/ 6, S/ 9, S/ 25, S/ 45.
2. **Código de seguridad (obligatorio).** Yape pone 3 dígitos en tu notificación y en la constancia del cliente. El cliente los escribe en el checkout y deben ser iguales. Es lo que distingue a varios clientes que pagan el mismo monto al mismo tiempo: cada yapeo trae su propio código.
3. **Horario.** El yapeo tiene que llegar **después** de que el cliente pidió pagar y antes de que venza la reserva (más 60 minutos de margen para pagos tardíos).

Si el aviso llega antes que el cliente escriba su código, espera. Si el código no coincide, se le pide revisar los 3 dígitos. Si en 10 minutos (`YAPE_NOTIFY_CODE_WAIT_MINUTES`) nadie reclama un yapeo mientras hay pedidos esperando, te llega a Telegram.

Quien paga desde **Plin u otro banco** no tiene código de Yape: pulsa «Pagué desde Plin u otro banco» y el pago te llega a Telegram para aprobarlo a mano.

Si dos pedidos del mismo monto escriben el mismo código (casualidad de 1 en 1000), no se adivina: te llega a Telegram.

Opcional: con `YAPE_NOTIFY_MAX_CENTS=30` cada pedido pendiente recibe un monto único (S/ 6.00, 5.99, 5.98…), una señal extra además del código. Por defecto está en 0: el cliente paga el precio exacto.

## Protecciones contra duplicados y fraude

| Riesgo | Qué pasa |
|---|---|
| Alguien envía una notificación falsa a tu servidor | Se rechaza: sin tu clave secreta (`YAPE_NOTIFY_SECRET`) el servidor no acepta nada. |
| El celular manda dos veces el mismo aviso | El segundo no se guarda. Si llega otro con el mismo nombre, monto y código, nunca paga solo: te llega a Telegram para que revises en tu Yape si hubo uno o dos pagos. |
| El cliente reutiliza un código ya usado | No sirve: cada yapeo (y su código) paga un solo pedido, y además tiene que ser el monto exacto del pedido nuevo y haber llegado después de pedirlo. |
| Dos pedidos del mismo monto con el mismo código (casualidad) | No se adivina: va a revisión en Telegram. |
| Usar un yapeo para pagar dos pedidos | Imposible: cada notificación paga como máximo un pedido. |
| El cliente manda una captura falsa | No sirve: solo cuentan los avisos que llegan a **tu** celular. |
| El cliente escribe un código inventado | No paga si no existe un yapeo real con ese código y el monto exacto de su pedido. Máximo 3 intentos por hora. |
| El cliente escribe un código que ya pagó otro pedido | No paga y te llega una alerta «Código de Yape ya usado» (posible fraude). |
| Un yapeo viejo (de antes del pedido) | No paga pedidos creados después. |
| Paga de menos o un monto distinto | No se asigna solo: te llega a Telegram para decidir. |
| Tu celular se apaga o pierde internet | Si un cliente dice «Ya pagué» y el celular no reporta, te llega una alerta. Con el «ping» del paso B4 te avisa aunque no haya ventas. |

---

## Parte A · En el servidor

**A1.** Genera una clave secreta larga en el servidor:

```bash
openssl rand -hex 32
```

Cópiala: la usarás en el servidor y en MacroDroid. **No la compartas.**

**A2.** Abre la configuración:

```bash
sudo nano /etc/musicapremium/env
```

Agrega:

```
YAPE_NOTIFY_ENABLED=true
YAPE_NOTIFY_SECRET=pega-aqui-la-clave-del-paso-A1
YAPE_NUMBER=923282640
YAPE_NOTIFY_HEARTBEAT_MINUTES=30
```

Para la revisión manual por Telegram debe estar configurado el bot (`TELEGRAM_BOT_TOKEN`) y `TELEGRAM_ADMIN_CHAT_ID`: el chat donde quieres recibir los botones. Si ese chat es un grupo, pon también `TELEGRAM_ADMIN_USER_IDS=tu_id_de_telegram` para que solo tú puedas aprobar.

Guarda (**Ctrl + O**, **Enter**, **Ctrl + X**) y reinicia:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

Con `YAPE_NOTIFY_ENABLED=true`, Yape directo pasa a ser el método **por defecto** del checkout. Flow y Mercado Pago siguen como alternativa si los tienes encendidos.

---

## Parte B · En tu celular Android (MacroDroid)

El celular que tiene **tu Yape del 923 282 640** debe quedar encendido y con internet.

**B1.** Instala **MacroDroid** desde Play Store. Al abrirlo, dale el permiso **Acceso a notificaciones**.

**B2.** Quita la optimización de batería a MacroDroid: **Ajustes → Aplicaciones → MacroDroid → Batería → Sin restricciones**. Así Android no lo cierra.

**B3.** Crea la macro **«Yape → tienda»**:

- **Disparador:** *Notificación → Notificación recibida*. App: **Yape**. Contenido: *Cualquiera*.
- **Acción:** *Web → Petición HTTP*:
  - Método: **POST**
  - URL: `https://cheapmusic.best/api/webhooks/yape-notify`
  - Cabeceras: `Authorization` = `Bearer pega-aqui-la-clave-del-paso-A1`
  - Cuerpo, tipo `application/json`:

    ```json
    {"title":"{not_title}","text":"{notification}","app":"{not_app_package}","id":"{not_id}","postedAt":"{not_timestamp}"}
    ```

**B4.** Crea otra macro **«Yape ping»**, para que el servidor sepa que el celular sigue vivo:

- **Disparador:** *Fecha/Hora → Intervalo regular*, cada **10 minutos**.
- **Acción:** la misma petición HTTP con el cuerpo `{"ping":true}`.

**B5.** En la app de Yape, deja activadas las **notificaciones de pagos recibidos**.

---

## Parte C · Probar

1. Haz un pedido en la tienda. El checkout muestra **Yape (QR o número)** y el monto exacto.
2. Desde otro Yape (el de un familiar, por ejemplo), yapea ese monto exacto al 923 282 640.
3. En segundos el checkout pasa a **¡Pago Confirmado!** con las credenciales.
4. Para probar la revisión manual, pulsa **«Ya pagué»** en otro pedido sin pagar: a los 2 minutos llega a tu Telegram el mensaje con los botones **Aprobar sin aviso** y **No llegó**.

Revisa lo que recibe el servidor:

```bash
sudo journalctl -u musicapremium-web -n 200 --no-pager | grep -i yape
```

---

## Botones de Telegram

**Te llega «🟡 Yape por revisar»** cuando un cliente dijo «Ya pagué» y su aviso no apareció:

- **✅ Es el 1 / 2 / 3…**: asigna ese yapeo recibido al pedido. Cada yapeo solo se puede asignar una vez.
- **✅ Aprobar sin aviso**: úsalo solo si ves el pago en tu app de Yape. Pide confirmación y funciona una sola vez por pedido.
- **❌ No llegó**: cancela el pago y libera el cupo.

**Te llega «🔔 Yape recibido sin pedido claro»** cuando entró un yapeo con un monto distinto, un código que no coincide o un posible duplicado:

- **✅ Asignar al pedido…**: lo aplica a ese pedido. Si el monto es menor, el pedido queda «parcial» y no se entrega.
- **🗑 No es de la tienda**: por ejemplo, un yapeo personal.

Sin Telegram configurado, estos avisos llegan por correo, y los pagos se confirman en el panel desde **Cobros → Por verificar**.

---

## Si algo no funciona

- **El pedido no se confirma solo.**
  - Revisa en MacroDroid el registro de la macro (debe responder 200).
  - Revisa que la clave de la cabecera sea idéntica a `YAPE_NOTIFY_SECRET`.
  - Un **403** significa clave incorrecta.
- **Llega «Aviso de Yape que no se pudo leer».** Yape cambió el texto de su notificación. Mándame el texto que aparece en la alerta y ajusto el lector.
- **Apagar Yape directo.** Pon `YAPE_NOTIFY_ENABLED=false` y reinicia. Los avisos del celular se siguen guardando mientras exista `YAPE_NOTIFY_SECRET`.
