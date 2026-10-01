# QR interoperable con Flow (Yape, Plin y bancos)

El cliente paga escaneando un QR desde **Yape, Plin o la app de su banco**, y el pago se confirma solo:

1. En el checkout elige **QR · Yape, Plin y bancos** y pulsa **Pagar con QR**.
2. Se abre la página segura de Flow con el QR. El cliente lo escanea y confirma el pago.
3. Flow avisa a tu tienda. La tienda **consulta a Flow** si el pago está hecho y, si lo está, el pedido queda pagado.
4. El cliente vuelve a su pedido y ve sus credenciales.

Si el cliente cierra la página antes de volver, el pago se confirma igual: Flow avisa a la tienda y, además, el servidor revisa cada pocos minutos los pagos pendientes.

**Mercado Pago no se borra.** Cada método se enciende y apaga con su propia variable:
- `FLOW_ENABLED=true/false`
- `MERCADOPAGO_ENABLED=true/false`

Puedes tener los dos, uno o ninguno, y cambiarlo cuando quieras con solo reiniciar.

---

## Parte A · En Flow (5 minutos)

**A1.** En tu panel de Flow, en **Medios de pago**, revisa que **QR Interoperable** esté **Activo**. En tu cuenta ya lo está.

**A2.** Busca tus claves de la API. Suelen estar en **Integraciones** o en **Mis datos → API**. Copia:
- **API Key**: un texto largo con guiones.
- **Secret Key**: **es secreta, no la pegues en chats ni correos.**

No hace falta configurar ninguna URL de notificación en Flow: la tienda la manda sola en cada pago.

> **Pruebas sin dinero real (opcional).** Flow tiene un ambiente de pruebas aparte en <https://sandbox.flow.cl>, con otra cuenta y otras claves. Para usarlo, pon esas claves y además `FLOW_BASE_URL=https://sandbox.flow.cl/api`.
>
> También puedes probar directo en producción con una compra real chica (S/ 6) y luego devolverla desde **Reembolsos** en Flow.

---

## Parte B · En el servidor (3 minutos)

**B1.** Entra al servidor y abre el archivo de configuración:

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103
```

```bash
sudo nano /etc/musicapremium/env
```

**B2.** Agrega al final, con tus claves:

```
FLOW_ENABLED=true
FLOW_API_KEY=pega-aqui-la-api-key
FLOW_SECRET_KEY=pega-aqui-la-secret-key
SITE_URL=https://cheapmusic.best
```

Si quieres **apagar Mercado Pago**, cambia su línea a `MERCADOPAGO_ENABLED=false` (no borres sus claves: así lo vuelves a encender cambiando solo `false` por `true`).

Guarda con **Ctrl + O**, **Enter**, y sal con **Ctrl + X**.

**B3.** Reinicia:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

---

## Parte C · Probar

1. Haz un pedido en la tienda. En el checkout debe aparecer **QR · Yape, Plin y bancos**, ya elegido.
2. Pulsa **Pagar con QR**. Se abre Flow con el QR.
3. Paga desde tu Yape o tu banco.
4. Vuelves a la tienda y el pedido aparece **pagado**, con las credenciales. Si no aparecen enseguida, espera unos segundos: la página se actualiza sola.

---

## Si algo no funciona

- **No aparece el método QR en el checkout.** Falta `FLOW_ENABLED=true`, `FLOW_API_KEY` o `FLOW_SECRET_KEY`. Revisa B2 y reinicia (B3).
- **Sale «El proveedor de pago no respondió».** Flow rechazó la creación del pago: la API Key o la Secret Key no son correctas, o son de otro ambiente (sandbox y producción no se mezclan). El motivo exacto queda en el registro:

  ```bash
  sudo journalctl -u musicapremium-web -n 200 --no-pager | grep -i flow
  ```

- **El cliente pagó y el pedido no se marca pagado.** Espera 1–2 minutos: la revisión automática lo confirma. También puede pulsar **«Ya pagué y no aparece»**. Para revisar el worker:

  ```bash
  sudo journalctl -u musicapremium-worker -n 200 --no-pager | grep -i flow
  ```

- **Cambiar qué medios ofrece Flow.** Por defecto la tienda manda directo al **QR interoperable** (medio 169). Para que Flow muestre todos los medios que tengas activos, pon `FLOW_PAYMENT_METHOD=9`.
