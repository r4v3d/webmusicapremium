# Google Sheets conectado al panel

Una sola hoja de Google, pestaña **«Clientes»**, con el mismo formato que *Clientes → Tabla* del panel:

| CORREO TITULAR | NOMBRE | CORREO CLIENTE | CONTRASEÑA | PAGÓ | RENOVACIÓN |
|---|---|---|---|---|---|

- Un cupo por fila, agrupados por titular (5 filas por cuenta).
- Lo que edites en la hoja se guarda en el panel en 1–3 segundos.
- Lo que cambie en el panel (una venta, una renovación, una edición tuya) aparece en la hoja en unos 5 segundos, y en la tabla del panel en unos 4.
- Cada 15 minutos la hoja compara todo con el panel y corrige cualquier diferencia.

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

**5.** Guarda la clave de siempre de los titulares. Con ella se crean los titulares nuevos (botón **+ Titular** del panel o menú *Agregar titular* de la hoja) sin escribirla cada vez. Reemplaza `TU_CLAVE` por la clave (deja las comillas simples):

```bash
sudo bash -c 'sed -i "/^DEFAULT_TITULAR_PASSWORD=/d" /etc/musicapremium/env && echo "DEFAULT_TITULAR_PASSWORD=TU_CLAVE" >> /etc/musicapremium/env'
```

Va en el servidor y no en el código, porque el código está en GitHub.

---

## Parte B · En Google Sheets (10 minutos)

**B1. Crea la hoja.** Entra a <https://sheets.new> con tu cuenta de Google. Ponle un nombre, por ejemplo *TIDAL PREMIUM 2026*. También puedes usar una hoja que ya tengas: el script crea su propia pestaña «Clientes» y no toca las demás.

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

**B5. Reinicia la tienda** para que lea los valores nuevos:

```bash
sudo systemctl restart musicapremium-web musicapremium-worker
```

**B6. Conecta la hoja.**

1. Vuelve a la pestaña de la hoja y recárgala (**F5**). A los pocos segundos aparece el menú **MusicaPremium**, a la derecha de *Ayuda*.
2. **MusicaPremium → Configurar conexión…**
   - Primera pregunta (dirección de la tienda): déjala vacía y pulsa **Aceptar**.
   - Segunda pregunta: pega la clave secreta del paso A4 y pulsa **Aceptar**.
3. Si Google vuelve a pedir permisos, acéptalos como en B3.

**Salió bien si** aparece *«¡Conectado!»* con la frase *«Los cambios del panel llegan a la hoja en segundos»*, y la pestaña **Clientes** muestra todos tus cupos.

**Prueba de ida y vuelta:**
- En el panel, cambia la clave de un miembro. En unos segundos cambia en la hoja y la columna *Sync* dice `↻ Panel`.
- En la hoja, cambia esa clave otra vez. La columna *Sync* dice `✓ Guardado` y el panel ya la muestra (recarga el panel para verla).

---

## Cómo se usa

| Columna | Qué es |
|---|---|
| CORREO TITULAR | Cambiarlo en cualquier fila cambia el titular de sus 5 cupos. La clave del titular no se muestra: es la de `DEFAULT_TITULAR_PASSWORD`. |
| NOMBRE | WhatsApp (número) o usuario (`@…`) del cliente. **Escribirlo ocupa el cupo** (queda Activo). **Borrarlo lo libera**: se borran PAGÓ y RENOVACIÓN; el correo y la contraseña se quedan para volver a venderlo. En verde = cupo libre. |
| CORREO CLIENTE / CONTRASEÑA | El acceso del cupo. |
| PAGÓ | Lo que paga el cliente, en soles. Necesita NOMBRE. |
| RENOVACIÓN | Día/mes/año (`08/11/26`). En rojo si ya venció, en naranja si vence en 3 días o menos. Necesita NOMBRE. |
| Sync | La pone el sistema: `✓ Guardado` ya está en el panel · `↻ Panel` cambió desde el panel · `✗` no se guardó, con el motivo (la celda vuelve sola al valor del panel). |

- **Agregar un titular:** menú **MusicaPremium → Agregar titular…** (o **+ Titular** en el panel). Aparecen sus 5 filas libres.
- **Borrar** titulares o cupos se hace en el panel (*Clientes → Familias*). Si borras una fila en la hoja, vuelve en la siguiente revisión.
- Puedes pegar varias celdas a la vez, ordenar y filtrar. No agregues columnas en medio; si necesitas más, agrégalas **a la derecha** de *Sync*.
- Las columnas ocultas (ID, plataforma, cupo, versión) las usa el sistema: no las muestres ni las edites.

### En el panel: Clientes → Tabla

La misma tabla, editable como una hoja de cálculo:

- **PC:** clic en una celda y escribe encima; doble clic, Enter o F2 para corregir; flechas y Tab para moverte; Supr para borrar; Ctrl+C / Ctrl+V (también varias celdas copiadas de Excel o Sheets).
- **Celular:** toca una celda y escribe.
- En RENOVACIÓN, `+1` suma un mes a la fecha que tenga (o a hoy si está vacía).
- El número de cupo (columna de la izquierda) selecciona la fila para las acciones en lote.
- Arriba dice **En vivo**, **Guardando…** o **Sin conexión**.

### Si usabas la versión anterior (pestañas «Cargar» e «Inventario»)

Pega el código nuevo, guarda y vuelve a publicar (**Implementar → Gestionar implementaciones → ✏ → Nueva versión**). Luego usa **MusicaPremium → Configurar conexión…** otra vez. Se crea la pestaña «Clientes». Las pestañas viejas ya no se sincronizan: bórralas cuando quieras.

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
