# Google Sheets conectado al panel

Una hoja de Google que siempre está igual que el panel de administrador:

- **Hoja «Cargar»**: pegas muchas cuentas de golpe, eliges el menú *Subir* y aparecen en el panel.
- **Hoja «Inventario»**: un cupo por fila, ordenado por plataforma, titular y número de cupo. Lo que edites ahí se guarda en el panel en 1–3 segundos. Lo que cambie en el panel (una venta, una renovación, una edición tuya) aparece en la hoja en unos 5 segundos.

Además, cada 15 minutos la hoja compara todo con el panel y corrige cualquier diferencia.

> **Privacidad.** La hoja tiene las claves de tus cuentas. **No la compartas** con nadie. Quien pueda editarla también puede ver la clave secreta de la conexión.

---

## Parte A · En el servidor (5 minutos)

**1.** Entra al servidor desde tu PC:

```bash
ssh -i ~/.ssh/musicapremium_deploy deploy@169.58.139.103
```

**2.** Instala la versión nueva de la tienda:

```bash
sudo musicapremium-deploy
```

**Salió bien si** termina con `Despliegue de … terminado.` y, más arriba, dice `aplicando 005_sheets_sync.sql`.

**3.** Crea la clave secreta de la conexión. Si ya existe, este comando no la cambia:

```bash
sudo bash -c 'grep -q "^GOOGLE_SHEETS_SECRET=." /etc/musicapremium/env || echo "GOOGLE_SHEETS_SECRET=$(openssl rand -hex 32)" >> /etc/musicapremium/env'
```

**4.** Muéstrala en pantalla:

```bash
sudo grep GOOGLE_SHEETS_SECRET /etc/musicapremium/env
```

Verás algo como `GOOGLE_SHEETS_SECRET=3f9a…` (64 letras y números). La necesitarás en la parte B: es **todo lo que va después del `=`**. No la pegues en chats ni en correos.

Deja esta ventana abierta; vuelves a ella en el paso B5.

---

## Parte B · En Google Sheets (10 minutos)

**B1. Crea la hoja.** Entra a <https://sheets.new> con tu cuenta de Google. Ponle un nombre, por ejemplo *MusicaPremium Inventario*.

**B2. Pega el código.**

1. Menú **Extensiones → Apps Script**. Se abre una pestaña nueva con un archivo `Código.gs`.
2. Borra todo lo que tiene ese archivo.
3. Abre [Codigo.gs en GitHub](https://github.com/r4v3d/webmusicapremium/blob/main/integrations/google-sheets/Codigo.gs), pulsa el botón **Copy raw file** (el ícono de dos cuadraditos, arriba a la derecha del código) y pégalo en `Código.gs`.
4. Arriba a la izquierda, cambia el nombre *Proyecto sin título* por `MusicaPremium`.
5. Guarda con **Ctrl + S**.

**B3. Publícalo como aplicación web.** Así el servidor puede avisarle a la hoja cuando algo cambia en el panel.

1. Botón azul **Implementar → Nueva implementación**.
2. En *Seleccionar tipo* (el engranaje ⚙) elige **Aplicación web**.
3. Llena así:
   - *Descripción*: `sync`
   - *Ejecutar como*: **Yo (tu correo)**
   - *Quién tiene acceso*: **Cualquier persona**

   «Cualquier persona» no le da acceso a nadie a tu hoja: el script rechaza todo mensaje que no venga firmado con tu clave secreta.
4. Pulsa **Implementar**, luego **Autorizar acceso** y elige tu cuenta.
5. Google mostrará *«Google no ha verificado esta app»*. Es normal: la app es tuya. Pulsa **Configuración avanzada → Ir a MusicaPremium (no seguro) → Permitir**.
6. Copia la **URL de la aplicación web**. Empieza con `https://script.google.com/macros/s/` y termina en `/exec`.

**B4. Dale la URL al servidor.** Vuelve a la ventana del servidor y ejecuta este comando, reemplazando `PEGA_AQUI_LA_URL` por la URL que copiaste (deja las comillas):

```bash
sudo bash -c 'echo "GOOGLE_SHEETS_WEBAPP_URL=PEGA_AQUI_LA_URL" >> /etc/musicapremium/env'
```

**B5. Reinicia la tienda** para que lea los dos valores nuevos:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

**B6. Conecta la hoja.**

1. Vuelve a la pestaña de la hoja y recárgala (**F5**). A los pocos segundos aparece el menú **MusicaPremium**, a la derecha de *Ayuda*.
2. **MusicaPremium → Configurar conexión…**
   - Primera pregunta (dirección de la tienda): déjala vacía y pulsa **Aceptar**.
   - Segunda pregunta: pega la clave secreta del paso A4 y pulsa **Aceptar**.
3. Si Google vuelve a pedir permisos, acéptalos como en B3.

**Salió bien si** aparece *«¡Conectado!»* con la frase *«Los cambios del panel llegan a la hoja en segundos»*, y la hoja **Inventario** muestra todos tus cupos.

**Prueba de ida y vuelta:**
- En el panel, cambia la clave de un miembro. En unos segundos cambia en la hoja y la columna *Sync* dice `↻ Panel`.
- En la hoja, cambia esa clave otra vez. La columna *Sync* dice `✓ Guardado` y el panel ya la muestra (recarga el panel para verla).

---

## Cómo se usa

### Hoja «Cargar»: alta masiva

| Columna | ¿Obligatoria? | Qué hace |
|---|---|---|
| Plataforma | Sí | Tidal, Deezer o Qobuz (lista desplegable). |
| Correo titular | Sí | Si no existe, se crea la cuenta con 5 cupos vacíos. |
| Clave titular | Solo si la cuenta es nueva | Si la cuenta ya existe y pones otra clave, se actualiza. |
| Renueva titular | No | Fecha día/mes/año. Si la cuenta es nueva y la dejas vacía: hoy + 30 días. |
| Costo titular | No | Lo que pagas por renovar la cuenta. |
| Correo miembro | No | Ocupa el **primer cupo vacío** de esa cuenta y queda **listo para vender**. |
| Clave miembro | Si pones correo miembro | |
| Resultado | La llena el sistema | `✓` se subió · `✗` no se subió, con el motivo. |

**Ejemplo:** una cuenta nueva con 3 miembros son 3 filas con el mismo titular. La clave del titular basta ponerla en la primera:

| Plataforma | Correo titular | Clave titular | Renueva titular | Costo titular | Correo miembro | Clave miembro |
|---|---|---|---|---|---|---|
| Tidal | titular1@gmail.com | ClaveT1 | 15/11/2026 | 25 | miembro1@gmail.com | Clave1 |
| Tidal | titular1@gmail.com | | | | miembro2@gmail.com | Clave2 |
| Tidal | titular1@gmail.com | | | | miembro3@gmail.com | Clave3 |

Cuando termines de pegar: **MusicaPremium → Subir filas de «Cargar»**.

- Las filas con `✓` no se vuelven a subir. Puedes borrarlas cuando quieras.
- Si una fila sale con `✗`, corrígela: el `✗` se borra solo y la vuelves a subir con el mismo menú.
- Si el miembro ya existía en esa cuenta, solo se actualiza su clave. No se duplica.
- Igual que con la importación del panel, se anuncia el stock nuevo en tu canal de Telegram.

### Hoja «Inventario»: ver y editar

- **Columnas blancas**: se pueden editar y se guardan solas al salir de la celda. Puedes pegar varias celdas a la vez.
- **Columnas grises** (ID, Plataforma, Cupo, Actualizado, Sync): las pone el sistema. Si intentas editarlas, Google te avisa.
- Los datos del **titular** (correo, clave, renovación, costo, moneda, notas) se repiten en los 5 cupos de su cuenta. Cambiarlos en cualquier fila cambia la cuenta y actualiza sus 5 filas.
- **Estado**:
  - *Libre* significa en stock. Al pasar un cupo a Libre, se borran su cliente, precio y vencimiento.
  - *Activo*, *Falta pago* y *Vencido* necesitan el **WhatsApp** del cliente.
  - *Reservado* lo pone el sistema mientras alguien está pagando. Ese cupo no se puede editar hasta que termine la compra.
- **Columna Sync**:
  - `✓ Guardado` significa que el cambio ya está en el panel.
  - `↻ Panel` significa que la fila cambió desde el panel.
  - `✗` significa que no se guardó, con el motivo. La celda vuelve sola al valor del panel.
- **Agregar** cuentas se hace en «Cargar», no en Inventario.
- **Borrar** cuentas o cupos se hace en el panel. Si borras una fila en la hoja, el panel no cambia y la fila vuelve en la siguiente revisión, o al usar *Recargar inventario completo*.
- Puedes ordenar y filtrar la hoja como quieras. No agregues columnas en medio; si necesitas más, agrégalas **a la derecha** de *Sync*.

---

## Si algo no funciona

- **Primero:** usa **MusicaPremium → Probar conexión**. Te dice si hay conexión y si los cambios del panel llegan solos.
- **«Firma inválida»:** la clave que pegaste no es igual a la del servidor. Repite **Configurar conexión…** con el valor exacto del paso A4.
- **«cada 15 min (falta GOOGLE_SHEETS_WEBAPP_URL…)»:** el servidor no tiene la URL. Repite B4 y B5.
- **Los cambios del panel no llegan:** mira el registro del worker en el servidor:

  ```bash
  sudo journalctl -u musicapremium-worker -n 50 --no-pager | grep -i sheets
  ```

  Si dice *«Cualquier persona»*, revisa en B3 que el acceso sea **Cualquier persona**. Si la falla dura más de 15 minutos, también te llega una alerta. Los cambios quedan en cola y se envían cuando vuelve la conexión.
- **No aparece el menú MusicaPremium:** recarga la hoja y espera unos segundos. Si sigue sin aparecer, revisa en Apps Script que el código esté guardado.
- **Si cambias el código del script más adelante:** entra a **Implementar → Gestionar implementaciones**, pulsa el lápiz ✏, elige *Versión: Nueva versión* y pulsa **Implementar**. Así la URL no cambia.
