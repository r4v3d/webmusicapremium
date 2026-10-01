# Yape directo (sin comisiones) validado con las notificaciones del celular

El cliente yapea a tu número **923 282 640** (o escanea tu QR de Yape) y el pedido se confirma solo, sin pasarela ni comisiones:

1. En el checkout elige **Yape (QR o número)**. Ve el número, tu QR y el **monto exacto** a yapear.
2. Yapea ese monto. A tu celular llega la notificación «JUAN PEREZ te envió un pago por S/ 5.99…».
3. Una app de tu celular (MacroDroid) reenvía esa notificación a tu servidor.
4. El servidor reconoce el pedido por el monto, lo marca pagado y el cliente ve sus credenciales.

Si algo no cuadra, el servidor **no adivina**: te manda un mensaje al bot de Telegram con botones para aprobar o rechazar.

---

## Cómo sabe qué pedido pagó cada yapeo

- **Monto único.** Si dos clientes compran lo mismo a la vez, el primero paga S/ 6.00, el segundo S/ 5.99, el tercero S/ 5.98… Cada monto pendiente apunta a un solo pedido. El descuento máximo es de 30 céntimos (`YAPE_NOTIFY_MAX_CENTS`).
- **Código de seguridad.** Yape pone 3 dígitos en tu notificación y en la constancia del cliente. Si el cliente lo escribe en el checkout, tiene que coincidir.
- **Horario.** El yapeo tiene que llegar **después** de que el cliente pidió pagar y antes de que venza la reserva (más 60 minutos de margen para pagos tardíos).

## Protecciones contra duplicados y fraude

| Riesgo | Qué pasa |
|---|---|
| Alguien envía una notificación falsa a tu servidor | Se rechaza: sin tu clave secreta (`YAPE_NOTIFY_SECRET`) el servidor no acepta nada. |
| El celular manda dos veces el mismo aviso | El segundo no se guarda. Si llega más tarde con el mismo nombre, monto y código, se marca **duplicado** y no paga nada. |
| Usar un yapeo para pagar dos pedidos | Imposible: cada notificación paga como máximo un pedido. |
| El cliente manda una captura falsa | No sirve: solo cuentan los avisos que llegan a **tu** celular. |
| El cliente escribe un código inventado | El código solo ayuda a encontrar el aviso, nunca confirma un pago. Si no coincide, va a revisión. Máximo 6 intentos por hora. |
| Un yapeo viejo (de antes del pedido) | No paga pedidos creados después. |
| Paga de menos o un monto distinto | No se asigna solo: te llega a Telegram para decidir. |
| Dos pedidos podrían ser el mismo pago | Va a revisión en Telegram. |
| El monto de un pedido recién pagado | No se da a otro pedido durante 60 minutos, por si el cliente yapeó dos veces. |
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
- **«Hay muchos pagos con Yape en curso».** Hay más de 30 pedidos del mismo precio esperando pago a la vez. Sube `YAPE_NOTIFY_MAX_CENTS` (por ejemplo, a 50).
- **Apagar Yape directo.** Pon `YAPE_NOTIFY_ENABLED=false` y reinicia. Los avisos del celular se siguen guardando mientras exista `YAPE_NOTIFY_SECRET`.
