# Plan de implementación: confirmación de pago, entrega y contabilidad 100% automáticas

Alcance: automatizar de punta a punta la confirmación del pago (USDT por Binance desde el inicio, Yape/Plin por TAYPI cuando su API esté disponible), la entrega de credenciales (correo y contraseña) y la contabilidad en el inventario, con reglas antifraude y antiduplicado, sirviendo a dos canales de venta simultáneos: la web Next.js y un bot de Telegram.

**Stack actual**: Next.js 16.2.9 (App Router, JS), React 19.2.4, Supabase (Postgres vía `@supabase/supabase-js` con service role), nodemailer (Gmail SMTP), Vitest, despliegue en Vercel.

**Stack objetivo**: el mismo Next.js, pero autoalojado en el VPS de Contabo (`169.58.139.103`, dominio `cheapmusic.best`) con **PostgreSQL 18.6** propio y acceso directo por `pg` (sin Supabase), más un proceso worker independiente para conciliación.

**Sobre el Yape automático**: la API de TAYPI todavía no está disponible, así que el plan se ordena para que **todo lo demás sea automático desde el día 1** y TAYPI entre después sin rediseñar nada. Concretamente: la asignación de cupo, la entrega de credenciales y el asiento contable se automatizan ya; para Yape, lo único humano y temporal es el paso de *verificar que el dinero llegó*, que se hace con un clic contra tu propia app de Yape. Cuando llegue la API, ese clic lo reemplaza un webhook firmado y no cambia nada más (§11).

> **Estado de implementación (23-09-2026).** El código de las fases 1 a 9 está en el repo, sin desplegar. 58 pruebas pasan contra PostgreSQL real (PGlite). Ya no queda ninguna dependencia de Supabase.
>
> **Pendiente, en orden:**
> 1. Correr el kit de la fase 0 en el VPS (`deploy/`).
> 2. Hacer el corte de datos (`db/README.md`), que requiere tu `pg_dump` de Supabase.
> 3. Cargar las claves de Binance y de Telegram en `/etc/musicapremium/env`.
> 4. Confirmar los precios en USDT (§23).
>
> **Queda para después:** TAYPI (código listo, apagado con `TAYPI_ENABLED=false`) y la fase 10, que es el cifrado de contraseñas en reposo.
>
> **Decisiones tomadas al implementar que no estaban en el plan:**
> - La confirmación manual exige el Nº de operación, que pasa a ser el `provider_txn_id`.
> - Cada movimiento de dinero es una fila en `payments`. Un parcial y su complemento son dos filas, y el excedente va en una fila sin pedido.
> - La renovación desde el panel del cliente es un pedido con `renew_subscription_id`.
> - Las ediciones del panel ya no crean pagos. Solo «Extender» registra un asiento `admin_manual`.
> - **Corrección a §2.3 (defecto 4) y §14.1 (24-09-2026):** se entregan siempre el correo y la clave **del miembro**, nunca los del titular. `email_type = "admin"` significa que el correo del miembro es propio del negocio ("PROPIO"), no que se entregue el correo maestro. Un cupo sin credenciales de miembro no es stock y no se vende.
> - **Cambio a §12 (24-09-2026): USDT por Order ID.** La nota ya no es obligatoria, ni en pedidos ni en recargas: el cliente paga al Pay ID y pega el Order ID de Binance. Sustituyen a la nota el uso único del Order ID, un pago posterior al pedido (en recargas se aceptan las últimas 24 h), la validación del monto y el rechazo si la nota trae el código de otro pedido. Si alguien pone la nota igual, el worker sigue acreditando solo.

---

## 1. Resumen ejecutivo y decisiones cerradas

| Tema | Decisión | Por qué |
|---|---|---|
| Fuente de verdad del pago | Solo el proveedor: webhook firmado (TAYPI) o consulta server-to-server (Binance). Nunca el cliente, nunca una captura | Elimina de raíz el fraude por comprobante editado |
| USDT | **Automático desde el día 1. Vía B**: cuenta personal de Binance + `Note to Payee` con el código, conciliado contra `GET /sapi/v1/pay/transactions` | Funciona sin KYB de comercio. La vía Merchant queda como opción futura (§12.5) |
| Yape / Plin — ahora | QR estático + **cola de confirmación con un clic** en el panel, verificando contra tu app de Yape. Sin capturas | La API de TAYPI aún no está disponible. Verificar contra tu propia cuenta es más confiable que cualquier comprobante que envíe el cliente |
| Yape / Plin — después | TAYPI, un QR por pedido con `reference = orderId`, activado con `TAYPI_ENABLED=true` | El webhook llega con el `reference`: el pago queda atado al pedido. La infraestructura (intentos, proveedores, webhook, conciliación) se construye desde ahora |
| Comprobantes manuales | **Se eliminan por completo**: fuera `/api/client/renew` con imagen y fuera el bucket `receipts` | Si existe una vía basada en capturas, el fraude vuelve por ahí |
| Precios | Tidal y Deezer: **S/6 · S/9 · S/25 · S/45** (1, 2, 6 y 12 meses). Qobuz mantiene su tabla aparte (S/9 por 1 mes) | Sube el ticket mínimo a S/6, lo que baja la comisión efectiva de TAYPI de 8.9% a 6.9% cuando se active |
| Monedas | **Soles y USDT como monedas independientes, sin tipo de cambio en ninguna parte** | Cada plan tiene dos precios fijados a mano; no hay conversión, ni en precios, ni en saldos, ni en la contabilidad |
| Saldo (wallet) | **Dos saldos separados por moneda**, en web y en Telegram, con **recarga de monto libre** | Cada saldo se recarga y se gasta en su moneda; sin conversión no hay arbitraje posible |
| Infraestructura | Contabo Cloud VPS 4: 4 vCPU, 8 GB RAM, 100 GB, región EU, IP fija `169.58.139.103`, dominio `cheapmusic.best` | IP fija permite restringir la API key de Binance; procesos de larga vida para el worker |
| Base de datos | **PostgreSQL 18.6** en el mismo VPS, accedido con `pg` | Ver §4.3: el esquema actual ya es Postgres, así que migra 1:1 y ganamos transacciones reales |
| Atomicidad | Una transacción `BEGIN…COMMIT` en la app con `SELECT … FOR UPDATE SKIP LOCKED` | Con Postgres directo ya no hacen falta funciones `plpgsql` para tener atomicidad |
| Idempotencia | `payment_events` con `unique(provider, event_id)` + claim condicional del pedido + `consumed_provider_txns` | Los proveedores reintentan: hay que poder recibir el mismo evento 5 veces y entregar una sola |
| Stock | Reserva del cupo al crear el checkout (TTL 15 min), confirmación al pagar, liberación automática al expirar | Evita vender stock inexistente y que dos compradores reciban el mismo cupo |
| Núcleo compartido | Toda la lógica en `src/lib/`, sin dependencias de Next; web y Telegram son adaptadores | Requisito para que los dos canales convivan sin duplicar reglas |

Regla de oro: **el cliente nunca puede provocar una transición a `paid`**. Hoy sí puede pedirla (`POST /api/orders/[orderId]` acepta `status` desde el navegador y solo lo frena `checkAdminAuth`); ese es el primer hueco a cerrar.

---

## 2. Diagnóstico del código actual

### 2.1 Cómo funciona hoy el cobro

1. `POST /api/orders` (`src/app/api/orders/route.js`) crea la fila en `orders` con `status = "pending"` y un `order_id` tipo `MPB-123456`.
2. `src/app/checkout/[orderId]/page.js` muestra QR estáticos (`/images/yape-qr.png`, `/images/plin-qr.jpg`) o el Pay ID de Binance leídos de `src/data/config.js`, con un contador local de 15 minutos y un botón "Enviar Comprobante por WhatsApp".
3. El admin confirma a mano: `POST /api/orders/[orderId]` con `status: "paid"` dispara `assignStockAccount()` y `sendOrderEmail()`.
4. En paralelo, el panel de cliente permite reportar un pago con imagen (`POST /api/client/renew`), que crea `payments` en `pending`, y el admin aprueba en `POST /api/admin/payments`.

El 100% de la confirmación es manual y basada en una captura. Eso es exactamente lo que se elimina.

### 2.2 Modelo de datos existente

No hay migraciones en el repo: el esquema vive solo en el panel de Supabase, lo que hoy hace imposible reproducir el entorno. Tablas en uso, inferidas del código:

- `orders`: `order_id`, `full_name`, `email`, `whatsapp`, `service`, `duration`, `price_pen`, `price_usd`, `payment_method`, `status`, `assigned_account`, `created_at`, `updated_at`. No tiene `customer_id` ni canal de venta.
- `customers` + `customer_contacts` (`contact_type` admite `whatsapp`, `email`, `telegram`; con `normalized_value` e `is_primary`).
- `platform_accounts`: `platform_code`, `account_email`, `account_password`, `owner_renewal_date`, `renewal_cost`, `renewal_currency`.
- `account_slots`: `platform_account_id`, `customer_id`, `slot_number`, `slot_label`, `member_email`, `email_type` (`admin` | `customer`), `member_password`, `status`.
- `subscriptions`: `customer_id`, `platform_code`, `platform_account_id`, `account_slot_id`, `activation_email`, `activation_email_owner`, `plan_price`, `currency`, `start_date`, `renewal_date`, `subscription_status`.
- `payments`: `customer_id`, `subscription_id`, `amount`, `currency`, `payment_method`, `payment_status`, `coverage_from`, `coverage_to`, `proof_url`, `notes`, `verified_at`, `created_at`.
- `events_log`: auditoría genérica. Ojo: `/api/admin/settings` la usa además como almacén de configuración de tasas, lo cual conviene separar en una tabla `settings` propia.
- `stock`: tabla heredada (`service`, `account_data`, `is_used`, `assigned_to_order`) que ya no es el inventario real; el inventario vivo son los `account_slots`.

### 2.3 Defectos que hay que corregir antes de automatizar

Si se automatiza encima de estos siete puntos, los errores se multiplican en vez de desaparecer.

1. **Doble registro contable.** `updateMemberProfile()` en `src/lib/db.js` inserta una fila en `payments` con `payment_method: "Manual / Panel Admin"` y `payment_status: "confirmed"` cada vez que recibe `pricePen > 0`. Como `assignStockWithDeps()` la llama, al automatizar el cobro se registrarían **dos pagos por venta**: el real y este fantasma. Hay que sacar la escritura de `payments` de esa función y dejar que solo el libro contable la escriba.
2. **Credencial entregada posiblemente incorrecta.** `assignStockWithDeps()` arma la credencial con `formatAssignedAccount(slot.member_email, slot.member_password)` ignorando `email_type`. Cuando `email_type = "admin"` el cliente debe entrar con el correo maestro de `platform_accounts.account_email`, que es lo que sí hace `/api/client/dashboard`. Resultado: checkout y correo pueden mostrar datos distintos al panel. Centralizar en `resolveSlotCredentials()`.
3. **Sin reserva de stock.** El cupo se toma recién al confirmar el pago, así que dos personas pueden pagar el último y solo una recibirá cuenta.
4. **`claimFreeSlot()` exige `member_email <> ''`.** Los cupos cuyo login es el correo maestro quedan invisibles como stock, y `getFreeSlotsStock()` solo cuenta `tidal`, `deezer` y `qobuz` con una lista fija.
5. **Rate limit inservible.** `src/lib/rateLimit.js` usa un `Map` en memoria. En el VPS con un solo proceso funcionaría, pero se rompe en cuanto se use PM2 en modo cluster o se reinicie el servicio. Los endpoints de pago necesitan un límite persistido en Postgres.
6. **Contraseñas en claro.** `account_slots.member_password` y `platform_accounts.account_password` se guardan y se devuelven en claro.
7. **Idempotencia inexistente.** No hay restricción única que impida procesar dos veces el mismo pago, ni `paid_at`, ni `delivered_at`.

---

## 3. Lo que hace el bot de referencia (análisis del video)

Del video `EJEMPLO BOT DE TELEGRAM.mp4` (27 s, bot "Bun AI Store"):

1. `/start` muestra un menú con **saldo del usuario** ("Tu saldo: 0.7 USDT") y botones Tienda / Recargar Saldo / Mi Perfil / Soporte / Más / Earn / Channel.
2. "Recargar Saldo" ofrece **Binance Pay, Bybit, CryptoBot, USDT (BEP-20), TON, Tron y Otros**.
3. Binance Pay muestra `Pay ID: 588466752` y el nombre del titular, con instrucciones: *"Envía cualquier monto USDT al Pay ID de arriba"*, *"Pega tu Order ID abajo"* y el aviso *"Solo se acreditarán hasta 3 decimales en tu billetera"*.
4. El usuario paga en la app de Binance (Pay → Payee will Receive → 0.7 USDT → Continue) y la pantalla de éxito le da el **Order ID** (`453229155575029760`), que copia. En esa misma pantalla existe el campo **"Note to Payee"**, que el bot no usa y que nosotros sí vamos a usar.
5. El usuario pega el Order ID en el chat y el bot responde *"¡Recarga exitosa! Se añadieron 0.7 USDT a tu saldo"*.
6. El canal publica el stock automáticamente: *"¡102 stock añadido a Gemini pro 18 month family plan!"* con botón de compra y precio en USDT.

Qué tomamos y qué mejoramos:

- **Tomamos** el modelo de saldo, el truncado a 3 decimales al acreditar y los anuncios automáticos de stock al canal.
- **Mejoramos** la verificación. Depender de que el usuario pegue un Order ID permite que alguien reclame el pago de otro. En su lugar pedimos el código del pedido en *Note to Payee* y conciliamos automáticamente contra el historial de la cuenta; pegar el Order ID queda como atajo para acreditar al instante, no como único mecanismo.
- **Mejoramos** el alcance del saldo: lo ofrecemos también en la web, y con dos monedas separadas (soles y USDT) en lugar de solo USDT.

---

## 4. Infraestructura objetivo: Contabo + PostgreSQL

### 4.1 El servidor contratado

| Dato | Valor |
|---|---|
| Plan | Contabo Cloud VPS 4 (2026), 5.50 €/mes |
| CPU / RAM | 4 núcleos / 8 GB |
| Disco | 100 GB |
| Región | EU |
| IPv4 | `169.58.139.103` |
| IPv6 | `2a02:c207:2349:2331::1/64` |
| Dominio | `cheapmusic.best` |
| Sistema | Linux, imagen con Docker preinstalado |
| Usuario por defecto | `root` |
| Auto Backup | **No contratado** (es un complemento aparte) |
| VNC | Habilitado en `13.140.170.185:63059` |

Cuatro cosas de esta configuración exigen decisiones concretas, y están en §4.8. La más importante: al no tener Auto Backup contratado, **los respaldos de §4.7 no son opcionales**, son la única copia que existirá.

### 4.2 Topología

```
                    Internet
                       │  443/80
              ┌────────▼─────────┐
              │  Caddy (TLS)     │  certificados automáticos
              └───┬──────────┬───┘
                  │          │
       ┌──────────▼───┐  ┌───▼─────────────┐
       │ next-app     │  │ (mismo host)    │
       │ systemd      │  │ worker systemd  │
       │ :3000        │  │ conciliación    │
       └──────┬───────┘  └───────┬─────────┘
              │                  │
              └────────┬─────────┘
                       │ 127.0.0.1:5432
              ┌────────▼─────────┐
              │ PostgreSQL 18.6  │
              └────────┬─────────┘
                       │ pg_dump diario cifrado
              ┌────────▼─────────┐
              │ Backup remoto    │  (Object Storage / otro host)
              └──────────────────┘
```

Puertos abiertos en UFW: `22` (SSH con clave, sin contraseña), `80` y `443`. PostgreSQL escucha solo en `localhost`, nunca expuesto a internet.

### 4.3 Por qué PostgreSQL y no otra base SQL

| Requisito del plan | PostgreSQL 18 | MySQL / MariaDB | SQLite |
|---|---|---|---|
| Migrar el esquema actual sin reescribirlo | Sí: Supabase **ya es Postgres**, el DDL pasa casi tal cual | No: habría que traducir `jsonb`, `bigserial`, tipos y funciones | No |
| `events_log.old_value/new_value` y payloads de webhook en JSON indexable | `jsonb` con índices GIN | `JSON` sin índices directos | Limitado |
| Índices únicos parciales (`where provider_txn_id is not null`) | Sí | **No los soporta** | Parcial |
| Tomar un cupo libre sin bloquear a los demás | `FOR UPDATE SKIP LOCKED` | Existe en MySQL 8, menos maduro | No hay concurrencia real |
| Escrituras concurrentes de webhooks + worker + web | MVCC sólido | Aceptable | Un solo escritor: descartado |
| Precisión monetaria | `numeric` exacto | `decimal` | Sin tipo nativo |

**Elección: PostgreSQL 18.6**, la última versión estable (liberada el 13 de agosto de 2026). La rama 19 sigue en beta, así que no va a producción. PostgreSQL 18 tiene soporte hasta noviembre de 2030.

Instalación desde el repositorio oficial PGDG (no el de Ubuntu, que va atrasado), autenticación `scram-sha-256`, y un usuario de aplicación sin privilegios de superusuario:

```sql
create role mpb_app login password '...';
create database musicapremium owner mpb_app encoding 'UTF8' locale_provider icu icu_locale 'es-PE';
-- El usuario de la app no necesita crear ni borrar tablas en producción:
revoke create on schema public from mpb_app;
grant usage on schema public to mpb_app;
grant select, insert, update, delete on all tables in schema public to mpb_app;
grant usage, select on all sequences in schema public to mpb_app;
```

Las migraciones corren con un rol aparte (`mpb_migrator`, dueño del esquema). Así una inyección SQL en la app no puede alterar la estructura.

### 4.4 Ajuste de PostgreSQL para el VPS

Valores calculados para los 4 vCPU y 8 GB del plan contratado:

```ini
# postgresql.conf
listen_addresses = 'localhost'
max_connections = 50
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
wal_compression = on
checkpoint_timeout = 15min
max_wal_size = 4GB
random_page_cost = 1.1            # el VPS usa SSD/NVMe
timezone = 'UTC'                  # la base siempre en UTC
log_min_duration_statement = 500  # registra consultas lentas
idle_in_transaction_session_timeout = '30s'
statement_timeout = '15s'
```

Toda fecha se guarda como `timestamptz` y se convierte a `America/Lima` solo al mostrarla. El servicio de la app se ejecuta con `TZ=America/Lima` para que los correos y el panel muestren la hora local correcta.

### 4.5 Acceso desde Next.js

Reemplazar `@supabase/supabase-js` por `pg`. Un único pool por proceso:

```js
// src/lib/pg.js
import { Pool } from "pg";

const globalForPg = globalThis;

export const pool =
  globalForPg.__mpbPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "musicapremium-web",
  });

if (process.env.NODE_ENV !== "production") globalForPg.__mpbPool = pool;

export async function query(text, params) {
  const started = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - started;
  if (ms > 500) console.warn(`[pg] consulta lenta ${ms}ms: ${text.slice(0, 120)}`);
  return res;
}

/** Ejecuta un callback dentro de una transacción real. Hace rollback ante cualquier error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
```

En `next.config.mjs` hay que declarar `serverExternalPackages: ["pg"]` para que el bundler no intente empaquetar el driver nativo.

### 4.6 Despliegue y procesos

- `next.config.mjs` con `output: "standalone"`; `npm run build` y se copia `.next/standalone` + `.next/static` + `public`.
- **Dos servicios systemd**:
  - `musicapremium-web.service` → `node server.js` en `:3000`, `Restart=always`, `EnvironmentFile=/etc/musicapremium/env`.
  - `musicapremium-worker.service` → `node worker.js`, el conciliador. Separado a propósito: sobrevive a los despliegues de la web, se reinicia solo y sus fallos no tumban el sitio.
- **Un solo proceso web** (sin PM2 cluster) mientras el rate limit y las cachés vivan en memoria. Si algún día se escala a varios, mover el rate limit a Postgres primero.
- **Caddy** como reverse proxy: obtiene y renueva TLS automáticamente. HTTPS es obligatorio para el webhook de TAYPI.
- Despliegue reproducible con un script `deploy.sh`: `git pull` → `npm ci` → `npm run db:migrate` → `npm run build` → `systemctl restart`. Migrar **antes** de reiniciar, y que cada migración sea compatible con la versión anterior del código para no tener ventanas de error.
- `after()` de Next.js funciona en servidor Node autoalojado, así que el patrón de "responder al webhook y entregar después" sigue siendo válido.

### 4.7 Respaldos y recuperación

- `pg_dump -Fc` diario, cifrado con `age` o `gpg`, retención de 14 días locales y 30 días en almacenamiento remoto.
- Archivado de WAL (o `pg_basebackup` semanal) si se quiere recuperación a un punto en el tiempo; con el volumen de este negocio, el dump diario más el `events_log` suele ser suficiente.
- **Probar la restauración una vez al mes** en una base de pruebas. Un respaldo que nunca se restauró no es un respaldo.
- Monitoreo mínimo: alerta si el dump falla, si el disco pasa del 80%, si `musicapremium-worker` está caído o si hay pedidos pagados sin entregar.

### 4.8 Particularidades del VPS contratado

**1. La región es EU y tus clientes están en Perú.** El ida y vuelta Lima–Europa son unos 180–220 ms, y cada recurso que el navegador pida paga ese peaje. No afecta a los pagos (las llamadas a Binance o TAYPI salen del servidor, no del cliente), pero sí a la sensación de lentitud del sitio. Dos medidas, en este orden:

- Poner **Cloudflare gratis** delante de `cheapmusic.best` en modo proxy. El handshake TLS y los archivos estáticos se sirven desde el nodo más cercano al usuario, y solo el HTML dinámico viaja a Europa. Es la mejora más grande por el menor esfuerzo, y además oculta la IP del origen.
- Excluir de la caché y de cualquier reescritura las rutas `/api/*`, en particular `/api/webhooks/*`: el cuerpo del webhook debe llegar byte a byte o la firma HMAC no valida.
- Si más adelante la latencia molesta de verdad, Contabo tiene ubicaciones en Estados Unidos, bastante más cerca de Perú. Cambiar de región implica reinstalar el servidor, así que conviene decidirlo antes de montar todo, no después.

**2. La imagen viene con Docker, pero el plan no lo usa para la base.** PostgreSQL va **nativo** desde el repositorio PGDG: el ajuste de `postgresql.conf`, los `pg_dump` y las actualizaciones de versión son más simples y más seguros fuera de un contenedor, y este servidor solo hospeda este proyecto. La app y el worker también van nativos con systemd. Docker queda disponible si algún día hace falta aislar algo puntual.

**3. No tienes Auto Backup contratado, así que hoy no existe ninguna copia.** El disco es único: un fallo o un `DROP` accidental se lleva todo, incluidas las credenciales de las cuentas premium que son tu inventario. Mínimo indispensable antes de poner el sitio en producción:

- Los `pg_dump` cifrados de §4.7, con copia **fuera del VPS** (Contabo Object Storage, otro proveedor, o incluso tu propia máquina con `rclone`).
- Evaluar contratar Auto Backup o tomar snapshots manuales antes de cada despliegue grande. Un snapshot del disco y un dump de la base resuelven problemas distintos: conviene tener los dos.

**4. El usuario por defecto es `root` y el VNC está abierto.** Antes de instalar nada:

- Crear un usuario `deploy` con `sudo`, subir tu clave pública y poner `PermitRootLogin no` y `PasswordAuthentication no` en `sshd_config`.
- Instalar `fail2ban` y activar actualizaciones automáticas de seguridad (`unattended-upgrades`).
- Dejar el VNC deshabilitado salvo cuando lo necesites para rescate: es una consola expuesta a internet en un puerto fijo.
- Usar el firewall del panel de Contabo **además** de UFW, con la misma regla: solo 22, 80 y 443.

**5. DNS de `cheapmusic.best`.** Registro `A` → `169.58.139.103`, `AAAA` → `2a02:c207:2349:2331::1`, y `www` como `CNAME`. Si entra Cloudflare, los registros se gestionan allí y no en la pestaña de DNS de Contabo. Caddy obtiene el certificado solo cuando el DNS ya resuelve, así que ese es el primer paso de la fase 0.

**6. 100 GB sobran para la base, pero no para descuidarse.** Los datos de este negocio pesan megabytes; lo que crece son los logs y los dumps. Configurar `logrotate`, limitar la retención local de respaldos a 14 días y alertar al 80% de uso.

### 4.9 Ventaja concreta del VPS para este proyecto

1. **IP fija**: se puede restringir la API key de Binance a la IP del VPS. En Vercel, con IPs rotativas, eso era imposible. Es la mitigación más fuerte para la clave de lectura de Binance.
2. **Procesos de larga vida**: el conciliador corre cada 20 segundos sin depender de cron de plataforma ni de planes de pago.
3. **Transacciones reales**: se cae la limitación de PostgREST que obligaba a meter el cierre contable en una función `plpgsql`.
4. **Sin límites de tiempo de ejecución** en los webhooks.

---

## 5. Migración de Supabase a PostgreSQL propio

Es un trabajo acotado porque el destino es el mismo motor. Orden sugerido:

1. **Volcar el esquema y los datos**: `pg_dump` desde la cadena de conexión de Supabase (`Settings → Database → Connection string`), con `--no-owner --no-privileges --exclude-schema=auth --exclude-schema=storage --exclude-schema=graphql*`. Solo interesa `public`.
2. **Restaurar** en el VPS y convertir ese volcado en la migración `001_baseline.sql` del repo. A partir de ahí, todo cambio de esquema es un archivo nuevo versionado.
3. **Reescribir `src/lib/db.js`**. Es el archivo con más trabajo: hoy son ~1180 líneas de llamadas al query builder de Supabase. Ventajas al pasar a SQL directo:
   - Desaparecen los bucles de paginación de 1000 filas (`getStock`, `getClients`, `getFamilyAccounts`, `getMemberProfiles`) que existen solo por el límite de PostgREST.
   - Los `select` anidados con relaciones (`"*, platform_accounts(...), customers(...)"`) se vuelven `JOIN` normales, que es lo que los commits recientes intentaban optimizar a mano.
   - `updateMemberProfile()` pasa a ser una transacción, y se le quita la escritura en `payments` (defecto 1).
4. **Sustituir Supabase Storage**: al eliminarse los comprobantes (decisión 5), el bucket `receipts` deja de existir. Ninguna otra parte del código usa Storage.
5. **Funciones y helpers a retirar**: `assertConfig()`, `formatDatabaseError()` (mensajes sobre proyecto pausado de Supabase), `makeSupabaseClient()`, `fetchWithTimeout()` y el cliente global `supabase`.
6. **Runner de migraciones** propio, para no añadir dependencias grandes:

```js
// scripts/migrate.js  →  npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/lib/pg.js";

const DIR = path.resolve("db/migrations");

const client = await pool.connect();
try {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(DIR, file), "utf8");
    console.log(`→ aplicando ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Falló ${file}: ${error.message}`);
    }
  }
  console.log("Migraciones al día.");
} finally {
  client.release();
  await pool.end();
}
```

7. **Verificación de corte**: comparar el conteo de filas de cada tabla entre Supabase y el VPS, y un puñado de consultas de negocio (ingresos del mes, cupos libres por servicio, suscripciones activas) antes de apagar Supabase. Mantener el proyecto de Supabase en solo lectura una o dos semanas como red de seguridad.

---

## 6. Arquitectura de la aplicación

```
        WEB (Next.js)                      TELEGRAM (bot)
  /order → /checkout/[id]             /start → Tienda → Comprar
  Mi saldo: S/ · USDT                 Mi saldo: S/ · USDT
             │                                   │
             └──────────────┬────────────────────┘
                            ▼
          NÚCLEO COMPARTIDO  (src/lib/*, sin dependencias de Next)
  orders · intents · reservas · settle · wallet · delivery · ledger
                            ▲
   ┌────────────┬──────────┴───────┬──────────────────┐
   │            │                  │                  │
 Cola      Reclamo asistido     WORKER (20 s)   TAYPI webhook
"Por       (pega el Order ID)   pull Binance    payment.completed
verificar"                      + expira        ── apagado hasta
1 clic                          + reintentos       tener la API
   │            │                  │                  │
   └────────────┴──────────────────┴──────────────────┘
                            ▼
        withTransaction()  →  PostgreSQL 18 (una sola transacción)
   claim pedido → claim cupo → suscripción → asiento → entrega
                            ▼
              Entrega: checkout · correo · panel · Telegram
```

Módulos nuevos o reescritos en `src/lib/`:

| Archivo | Responsabilidad |
|---|---|
| `pg.js` | Pool, `query()`, `withTransaction()` |
| `db.js` | Reescrito sobre SQL directo; sin paginación artificial ni escritura de `payments` |
| `paymentIntents.js` | Crear/leer intentos, monto esperado, código de nota, expiración |
| `providers.js` | Registro de proveedores con bandera de activación: `manual_yape`, `taypi` (apagado hasta tener la API), `binance_account`, `wallet_pen`, `wallet_usdt` |
| `taypi.js` | Firma HMAC, `createPayment`, `getPayment`, `verifyWebhookSignature` |
| `binanceAccount.js` | `getPayTransactions()` firmada HMAC-SHA256, emparejamiento por nota |
| `settle.js` | `settlePayment()` idempotente: valida, abre la transacción, dispara entrega |
| `reserve.js` | `reserveSlot()`, `releaseExpiredReservations()` |
| `wallet.js` | `getBalances()`, `credit()`, `debit()` por moneda |
| `delivery.js` | `resolveSlotCredentials()`, `deliverOrder()`, reenvío |
| `ledger.js` | Comisiones y neto, por proveedor y por moneda (sin conversión) |
| `notify.js` | Correo, Telegram, alertas al admin |
| `idempotency.js` | Registro y deduplicación de eventos de proveedor |
| `rateLimitDb.js` | Límite de tasa persistido en Postgres |

Endpoints nuevos en `src/app/api/`:

| Ruta | Método | Función |
|---|---|---|
| `payments/intents` | POST | Crea el intento y devuelve QR, instrucciones o cobro contra saldo |
| `payments/intents/[id]` | GET | Estado del intento para el polling del checkout |
| `payments/intents/[id]/refresh` | POST | "Ya pagué": consulta al proveedor y liquida si corresponde |
| `webhooks/taypi` | POST | Verifica firma, deduplica y liquida |
| `payments/binance/claim` | POST | Atajo: el cliente pega el Order ID y se verifica al instante |
| `wallet` | GET | Saldos del cliente en soles y USDT + movimientos |
| `wallet/topup` | POST | Crea un intento con `purpose = wallet_topup` |
| `telegram/webhook` | POST | Adaptador del bot |
| `admin/reconciliation` | GET | Tablero de conciliación |
| `admin/payments/pending-manual` | GET | Cola "Por verificar" de pagos Yape/Plin |
| `admin/payments/confirm-manual` | POST | Confirma o descarta un pago Yape/Plin verificado en tu app |
| `admin/payments/resend` | POST | Reenvío manual de credenciales |
| `admin/orders/[id]/refund` | POST | Reembolso: libera cupo, cancela suscripción, revierte asiento |

Endpoints que se retiran: `POST /api/client/renew` (subida de comprobante) y la capacidad de `POST /api/orders/[orderId]` de recibir `status`.

El **worker** (`worker.js` en la raíz) es un proceso Node independiente que importa el mismo núcleo:

```js
// worker.js
import { runReconciliation } from "./src/lib/reconcile.js";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 20_000);
let running = false;

async function tick() {
  if (running) return;                  // nunca dos ciclos solapados
  running = true;
  try {
    const summary = await runReconciliation();
    if (summary.changed) console.log("[worker]", JSON.stringify(summary));
  } catch (error) {
    console.error("[worker] error:", error);
  } finally {
    running = false;
  }
}

setInterval(tick, INTERVAL_MS);
tick();

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => { console.log("[worker] apagando"); process.exit(0); });
}
```

---

## 7. Modelo de datos

Migraciones en `db/migrations/`, numeradas y versionadas en git. `001_baseline.sql` es el volcado del esquema actual; lo que sigue son los cambios del plan.

### 7.1 Ajustes a tablas existentes

```sql
-- 002_orders_payments.sql

-- orders: identidad, canal y trazabilidad de pago/entrega
alter table orders
  add column if not exists customer_id     bigint references customers(id),
  add column if not exists sales_channel   text    not null default 'web',   -- web | telegram | manual
  add column if not exists plan_id         text,
  add column if not exists amount_pen      numeric(10,2),
  add column if not exists amount_usdt     numeric(18,8),
  add column if not exists pay_currency    text,      -- PEN | USDT: la moneda en que se cobra este pedido
  add column if not exists account_slot_id bigint  references account_slots(id),
  add column if not exists subscription_id bigint  references subscriptions(id),
  add column if not exists paid_at         timestamptz,
  add column if not exists delivered_at    timestamptz,
  add column if not exists expires_at      timestamptz;

alter table orders
  add constraint orders_status_chk check (status in (
    'pending','awaiting_payment','paid','delivered','underpaid',
    'expired','failed','refunded','cancelled'
  ));

create unique index if not exists orders_order_id_uidx on orders(order_id);
create index if not exists orders_status_created_idx on orders(status, created_at desc);
create index if not exists orders_customer_idx on orders(customer_id, created_at desc);

-- account_slots: reserva temporal para no vender stock inexistente
alter table account_slots
  add column if not exists reserved_until     timestamptz,
  add column if not exists reserved_for_order text;

create index if not exists account_slots_available_idx
  on account_slots(platform_account_id, status, reserved_until);

-- payments: contabilidad real (bruto, comisión, neto, proveedor). Cada fila vive en su moneda.
alter table payments
  add column if not exists order_id         text,
  add column if not exists provider         text,   -- manual_yape | taypi | binance_account | wallet_pen | wallet_usdt
  add column if not exists provider_txn_id  text,
  add column if not exists gross_amount     numeric(18,8),
  add column if not exists fee_amount       numeric(18,8) default 0,
  add column if not exists net_amount       numeric(18,8),
  add column if not exists sales_channel    text,
  add column if not exists confirmed_by     text;   -- 'system' o el admin que confirmó a mano

-- Un pago por transacción de proveedor: la defensa central contra el doble cobro
create unique index if not exists payments_provider_txn_uidx
  on payments(provider, provider_txn_id)
  where provider_txn_id is not null;

-- El comprobante deja de existir como mecanismo de confirmación
alter table payments rename column proof_url to legacy_proof_url;

-- Código permanente del cliente para recargas de monto libre en USDT
alter table customers
  add column if not exists wallet_note_code text;

create unique index if not exists customers_wallet_note_uidx
  on customers(wallet_note_code) where wallet_note_code is not null;

-- Configuración fuera de events_log
create table if not exists settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
```

### 7.2 Tablas nuevas

```sql
-- 003_intents_wallet.sql

-- Intento de pago: un pedido puede tener varios (cambió de método, expiró el QR)
create table if not exists payment_intents (
  id               bigserial primary key,
  order_id         text,                                 -- null en recargas de saldo
  customer_id      bigint      references customers(id),
  purpose          text        not null default 'order', -- order | wallet_topup | renewal
  provider         text        not null,                 -- manual_yape | taypi | binance_account | wallet_pen | wallet_usdt
  sales_channel    text        not null default 'web',
  amount_expected  numeric(18,8),                        -- null = recarga de monto libre
  currency         text        not null check (currency in ('PEN','USDT')),
  status           text        not null default 'created',
  provider_ref     text,                                 -- payment_id de TAYPI
  checkout_url     text,
  qr_payload       text,
  note_code        text,                                 -- lo que el cliente escribe en "Note to Payee"
  account_slot_id  bigint      references account_slots(id),
  idempotency_key  text        not null,
  expires_at       timestamptz not null,
  paid_at          timestamptz,
  raw_request      jsonb,
  raw_response     jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint payment_intents_status_chk check (status in (
    'created','awaiting','paid','underpaid','overpaid','expired','failed','cancelled'))
);

create unique index if not exists payment_intents_idem_uidx on payment_intents(idempotency_key);
create unique index if not exists payment_intents_provider_ref_uidx
  on payment_intents(provider, provider_ref) where provider_ref is not null;
create unique index if not exists payment_intents_note_uidx
  on payment_intents(note_code) where note_code is not null;
create index if not exists payment_intents_open_idx
  on payment_intents(status, expires_at) where status in ('created','awaiting');

-- Bitácora cruda de webhooks y consultas: deduplicación + auditoría forense
create table if not exists payment_events (
  id               bigserial primary key,
  provider         text        not null,
  event_id         text        not null,   -- payment_id+status | transactionId
  event_type       text,
  signature_valid  boolean     not null default false,
  payload          jsonb       not null,
  headers          jsonb,
  intent_id        bigint      references payment_intents(id),
  processed_at     timestamptz,
  process_result   text,                   -- settled | duplicate | mismatch | ignored | error
  error_detail     text,
  received_at      timestamptz not null default now()
);

create unique index if not exists payment_events_uidx on payment_events(provider, event_id);
create index if not exists payment_events_payload_gin on payment_events using gin (payload);

-- Transacciones de proveedor ya consumidas: impide reutilizar un Order ID de Binance
create table if not exists consumed_provider_txns (
  provider     text        not null,
  txn_id       text        not null,
  intent_id    bigint      references payment_intents(id),
  customer_id  bigint      references customers(id),
  amount       numeric(18,8),
  currency     text,
  consumed_at  timestamptz not null default now(),
  primary key (provider, txn_id)
);

-- Entregas: qué credencial se entregó, a quién, por dónde y cuándo
create table if not exists deliveries (
  id              bigserial primary key,
  order_id        text        not null,
  customer_id     bigint      references customers(id),
  account_slot_id bigint      references account_slots(id),
  subscription_id bigint      references subscriptions(id),
  channel         text        not null,   -- web | email | telegram
  status          text        not null default 'sent',   -- sent | failed | resent
  credential_hash text,                   -- sha256(email:password), para auditar sin duplicar el secreto
  attempt         int         not null default 1,
  error_detail    text,
  created_at      timestamptz not null default now()
);

create index if not exists deliveries_order_idx on deliveries(order_id, created_at desc);

-- Saldo: una fila por cliente y moneda. Sin conversión entre monedas.
create table if not exists wallet_accounts (
  customer_id bigint      not null references customers(id),
  currency    text        not null check (currency in ('PEN','USDT')),
  balance     numeric(18,8) not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now(),
  primary key (customer_id, currency)
);

create table if not exists wallet_ledger (
  id            bigserial primary key,
  customer_id   bigint      not null references customers(id),
  currency      text        not null check (currency in ('PEN','USDT')),
  direction     text        not null check (direction in ('credit','debit')),
  amount        numeric(18,8) not null check (amount > 0),
  balance_after numeric(18,8) not null,
  reason        text        not null,   -- topup | purchase | refund | adjustment | overpay
  ref_type      text,                   -- order | intent | admin
  ref_id        text,
  created_by    text        not null default 'system',
  created_at    timestamptz not null default now()
);

create index if not exists wallet_ledger_customer_idx
  on wallet_ledger(customer_id, currency, created_at desc);

-- Límite de tasa persistido (reemplaza el Map en memoria)
create table if not exists rate_limits (
  bucket      text        not null,
  window_start timestamptz not null,
  hits        int         not null default 1,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_gc_idx on rate_limits(window_start);
```

Integridad del saldo: `wallet_accounts.balance` es una caché de rendimiento, y `wallet_ledger` es la verdad. Una consulta de verificación (que el worker corre una vez al día) debe cuadrar ambas:

```sql
select w.customer_id, w.currency, w.balance,
       coalesce(sum(case when l.direction = 'credit' then l.amount else -l.amount end), 0) as ledger_balance
  from wallet_accounts w
  left join wallet_ledger l using (customer_id, currency)
 group by w.customer_id, w.currency, w.balance
having w.balance <> coalesce(sum(case when l.direction = 'credit' then l.amount else -l.amount end), 0);
```

Cualquier fila devuelta es una alerta grave: significa que hubo una escritura fuera de transacción.

---

## 8. La transacción de liquidación

Es la pieza crítica de fiabilidad. Con Postgres propio ya no hace falta encapsularla en `plpgsql`: se escribe en JavaScript dentro de `withTransaction()`, queda cubierta por Vitest y la comparten los dos canales. Todo ocurre o nada ocurre.

```js
// src/lib/settle.js
import { withTransaction } from "./pg";
import { computeFee } from "./ledger";
import { resolveSlotCredentials } from "./delivery";
import { addMonths } from "./renewal";

/**
 * Liquida un pago ya verificado contra el proveedor.
 * Idempotente: si el pedido ya estaba pagado, devuelve { duplicate: true } sin efectos.
 */
export async function settlePayment({
  orderId, intentId, provider, providerTxnId,
  grossAmount, currency, months,
}) {
  return withTransaction(async (tx) => {
    // 1. Claim del pedido. Solo un proceso puede ganar esta carrera.
    const claimed = await tx.query(
      `update orders
          set status = 'paid', paid_at = now(), updated_at = now()
        where order_id = $1
          and status in ('pending','awaiting_payment','underpaid')
        returning *`,
      [orderId]
    );

    if (claimed.rowCount === 0) {
      const existing = await tx.query("select * from orders where order_id = $1", [orderId]);
      if (existing.rowCount === 0) return { ok: false, reason: "order_not_found" };
      return { ok: true, duplicate: true, order: existing.rows[0] };
    }

    const order = claimed.rows[0];

    // 2. Tomar el cupo: primero el reservado, si no cualquiera libre o con reserva vencida.
    //    SKIP LOCKED evita que dos liquidaciones simultáneas peleen por la misma fila.
    const slotRes = await tx.query(
      `with candidato as (
         select s.id
           from account_slots s
           join platform_accounts pa on pa.id = s.platform_account_id
          where pa.platform_code = $2
            and (
              s.id = $3
              or s.status = 'free'
              or (s.status = 'reserved' and s.reserved_until < now())
            )
          order by (s.id = $3) desc, s.updated_at asc
          limit 1
          for update of s skip locked
       )
       update account_slots s
          set status = 'active',
              customer_id = $1,
              reserved_until = null,
              reserved_for_order = null,
              updated_at = now()
         from candidato
        where s.id = candidato.id
        returning s.*`,
      [order.customer_id, order.service, order.account_slot_id]
    );

    if (slotRes.rowCount === 0) {
      // Pago válido sin stock: se conserva el cobro y se marca para intervención humana.
      await tx.query(
        `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
         values ('order', $1, 'out_of_stock', $2, 'system', 'Pago confirmado sin stock disponible')`,
        [orderId, JSON.stringify({ service: order.service, provider, providerTxnId })]
      );
      await recordPayment(tx, { order, provider, providerTxnId, grossAmount, currency, subscriptionId: null });
      return { ok: true, needsManual: true, reason: "no_stock", order };
    }

    const slot = slotRes.rows[0];
    const account = (
      await tx.query("select * from platform_accounts where id = $1", [slot.platform_account_id])
    ).rows[0];

    const { email: loginEmail, password: loginPassword } = resolveSlotCredentials(slot, account);

    // 3. Suscripción
    const renewalDate = addMonths(new Date(), months);
    const sub = await tx.query(
      `insert into subscriptions(
         customer_id, platform_code, platform_account_id, account_slot_id,
         activation_email, activation_email_owner, plan_price, currency,
         start_date, renewal_date, subscription_status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,current_date,$9,'active',now(),now())
       returning id`,
      [order.customer_id, order.service, slot.platform_account_id, slot.id,
       loginEmail, slot.email_type || "admin", grossAmount, currency, renewalDate]
    );
    const subscriptionId = sub.rows[0].id;

    // 4. Asiento contable: la única escritura en payments para esta venta
    const paymentId = await recordPayment(tx, {
      order, provider, providerTxnId, grossAmount, currency, subscriptionId, months, renewalDate,
    });

    // 5. Cerrar el círculo
    await tx.query(
      `update orders
          set account_slot_id = $2, subscription_id = $3,
              assigned_account = $4, updated_at = now()
        where id = $1`,
      [order.id, slot.id, subscriptionId, `${loginEmail}:${loginPassword}`]
    );

    if (intentId) {
      await tx.query(
        "update payment_intents set status = 'paid', paid_at = now(), updated_at = now() where id = $1",
        [intentId]
      );
    }

    if (providerTxnId) {
      await tx.query(
        `insert into consumed_provider_txns(provider, txn_id, intent_id, customer_id, amount, currency)
         values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
        [provider, providerTxnId, intentId, order.customer_id, grossAmount, currency]
      );
    }

    await tx.query(
      `insert into events_log(entity_type, entity_id, event_type, new_value, performed_by, reason)
       values ('order', $1, 'settled', $2, 'system', 'Pago confirmado automáticamente')`,
      [orderId, JSON.stringify({ provider, providerTxnId, slotId: slot.id, subscriptionId, paymentId })]
    );

    return {
      ok: true, duplicate: false, order, slotId: slot.id,
      subscriptionId, paymentId, renewalDate,
      credentials: { email: loginEmail, password: loginPassword },
    };
  });
}

async function recordPayment(tx, {
  order, provider, providerTxnId, grossAmount, currency,
  subscriptionId, renewalDate, confirmedBy = "system",
}) {
  const fee = computeFee(provider, grossAmount, currency);

  const res = await tx.query(
    `insert into payments(
       customer_id, subscription_id, order_id, provider, provider_txn_id,
       amount, currency, gross_amount, fee_amount, net_amount,
       payment_method, payment_status, sales_channel, confirmed_by,
       coverage_from, coverage_to, verified_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$6,$8,$9,$4,'confirmed',$10,$11,current_date,$12,now(),now())
     returning id`,
    [order.customer_id, subscriptionId, order.order_id, provider, providerTxnId,
     grossAmount, currency, fee, grossAmount - fee,
     order.sales_channel, confirmedBy, renewalDate ?? null]
  );
  return res.rows[0].id;
}
```

Reserva de cupo, con la misma técnica:

```js
// src/lib/reserve.js
export async function reserveSlot(tx, service, orderId, ttlSeconds = 900) {
  const res = await tx.query(
    `with candidato as (
       select s.id
         from account_slots s
         join platform_accounts pa on pa.id = s.platform_account_id
        where pa.platform_code = $1
          and (s.status = 'free' or (s.status = 'reserved' and s.reserved_until < now()))
        order by s.updated_at asc
        limit 1
        for update of s skip locked
     )
     update account_slots s
        set status = 'reserved',
            reserved_until = now() + ($3 || ' seconds')::interval,
            reserved_for_order = $2,
            updated_at = now()
       from candidato
      where s.id = candidato.id
      returning s.id`,
    [service, orderId, String(ttlSeconds)]
  );
  return res.rows[0]?.id ?? null;   // null = sin stock
}

export async function releaseExpiredReservations() {
  const res = await query(
    `update account_slots
        set status = 'free', reserved_until = null, reserved_for_order = null, updated_at = now()
      where status = 'reserved' and reserved_until < now()
      returning id, reserved_for_order`
  );
  return res.rows;
}
```

---

## 9. Máquina de estados e idempotencia

### 9.1 Estados del pedido

```
pending ──(intento creado, cupo reservado)──> awaiting_payment
awaiting_payment ──(pago verificado)────────> paid ──(entrega OK)──> delivered
awaiting_payment ──(monto menor)────────────> underpaid ──(completa)──> paid
awaiting_payment ──(TTL vencido)────────────> expired    (libera la reserva)
paid | delivered ──(reembolso)──────────────> refunded   (libera cupo, cancela suscripción)
```

Reglas duras:

- `paid` solo lo escribe `settlePayment()`. Ningún endpoint público acepta `status` desde el cliente.
- `delivered` solo se escribe cuando existe una fila en `deliveries` con `status = 'sent'`.
- Toda transición inserta en `events_log`.

### 9.2 Los cuatro cerrojos

1. **Evento**: `insert into payment_events` con `unique(provider, event_id)`. Si hay conflicto, responder `200` y salir.
2. **Pedido**: el `update … where status in (…) returning *` es un compare-and-swap; solo un proceso gana.
3. **Transacción del proveedor**: `payments_provider_txn_uidx` + `consumed_provider_txns` impiden acreditar dos veces el mismo pago.
4. **Cupo**: `for update … skip locked` garantiza que dos liquidaciones simultáneas nunca tomen el mismo.

### 9.3 Validación de monto

```js
// src/lib/settle.js
const TOLERANCIA = { PEN: 0.05, USDT: 0.01 };

export function classifyAmount(expected, paid, currency) {
  const tol = TOLERANCIA[currency] ?? 0;
  if (paid + tol < expected) return "underpaid";
  if (paid > expected * 1.10 + tol) return "overpaid";
  return "exact";
}
```

- `exact` → liquidar y entregar.
- `underpaid` → registrar el pago como parcial, dejar el pedido en `underpaid`, avisar al cliente cuánto falta y alertar al admin. **Nunca entregar.**
- `overpaid` → liquidar, entregar y acreditar la diferencia **al saldo de la misma moneda** del cliente (`reason = 'overpay'`). Esto cierra la discusión típica de "pagué de más" sin devoluciones manuales.

---

## 10. Precios y comisiones en dos monedas

### 10.1 Soles y USDT como monedas separadas

**No hay tipo de cambio en ninguna parte del sistema.** Soles y USDT son dos monedas independientes, cada una con sus precios, sus saldos y su contabilidad. Consecuencias concretas, todas deliberadas:

1. Cada plan lleva **dos precios fijados a mano** en `src/data/config.js`: `pricePen` y `priceUsdt`. Ninguno se deriva del otro.
2. No existen la tabla `fx_rates`, ni las columnas `fx_rate_pen` y `amount_pen_equiv`, ni variables de entorno de tasas ni de margen.
3. `orders`, `payments` y `wallet_ledger` llevan siempre su moneda, y **las cifras de distinta moneda nunca se suman**.
4. El panel muestra **dos totales en paralelo** (por ejemplo "S/ 1 240 · 86.40 USDT"). No existe un número único de "ingresos totales", y cualquier intento de fabricarlo requeriría una tasa que decidimos no tener.
5. Un cliente que paga en soles ve precios en soles; uno que paga en USDT ve precios en USDT. No hay opción de pagar un precio en soles con USDT ni al revés.

Una aclaración para no confundir dos cosas distintas: los campos `usdArs` y `usdPen` que hoy usa la pestaña de Rentabilidad sirven para valorizar el **costo** de renovar las cuentas maestras (`platform_accounts.renewal_cost`, que puede estar en ARS o USD). Eso es un parámetro de costos que puedes mantener como está; no tiene relación con los precios de venta ni con los pagos, y no se usa en ningún flujo de este plan.

### 10.2 Tablas de precios

Precios en soles, ya decididos. Tidal y Deezer comparten tabla; Qobuz va aparte.

| Servicio | 1 mes | 2 meses | 6 meses | 12 meses |
|---|---|---|---|---|
| Tidal | S/ 6 | S/ 9 | S/ 25 | S/ 45 |
| Deezer | S/ 6 | S/ 9 | S/ 25 | S/ 45 |
| Qobuz | S/ 9 | — | — | — |

Precios en USDT, a confirmar. La propuesta toma los valores que ya tiene `config.js` para Deezer y los aplica también a Tidal, que hasta ahora estaba más bajo:

| Servicio | 1 mes | 2 meses | 6 meses | 12 meses |
|---|---|---|---|---|
| Tidal | 1.79 | 2.69 | 7.29 | 13.29 |
| Deezer | 1.79 | 2.69 | 7.29 | 13.29 |
| Qobuz | 2.69 | — | — | — |

Al ser precios independientes, conviene revisarlos un par de veces al año: si el sol se mueve mucho frente al dólar, una de las dos tablas queda desalineada y no hay nada automático que lo corrija. Ese es el costo de no tener tipo de cambio, y a cambio se gana que nunca aparezca un cobro inesperado por una tasa mal configurada.

### 10.3 Comisiones por proveedor

```js
// src/lib/ledger.js
export function computeFee(provider, gross, currency) {
  // TAYPI: 2.50% + S/ 0.20, más IGV sobre la comisión. Solo aplica en soles.
  if (provider === "taypi" && currency === "PEN") return round2((gross * 0.025 + 0.20) * 1.18);
  if (provider === "manual_yape") return 0;      // el dinero llega íntegro a tu cuenta
  if (provider === "binance_account") return 0;  // transferencia interna de Binance
  if (provider === "wallet_pen" || provider === "wallet_usdt") return 0;  // ya se cobró al recargar
  return 0;
}
```

Mientras Yape sea manual, **no hay comisión de pasarela**: el dinero llega completo. Cuando se active TAYPI, la comisión será:

| Precio | Comisión | Neto | % del precio |
|---|---|---|---|
| S/ 6 | S/ 0.41 | S/ 5.59 | 6.9% |
| S/ 9 | S/ 0.50 | S/ 8.50 | 5.6% |
| S/ 25 | S/ 0.97 | S/ 24.03 | 3.9% |
| S/ 45 | S/ 1.56 | S/ 43.44 | 3.5% |

Subir el ticket mínimo a S/6 ya bajó el peor caso de 8.9% a 6.9%.

**El saldo te conviene por razones distintas en cada etapa.** Hoy, con Yape manual, cada compra en soles te cuesta una verificación; si el cliente recarga una vez y luego compra cinco veces, verificas una sola vez en lugar de cinco. Cuando entre TAYPI, el argumento pasa a ser económico: el cargo fijo de S/0.20 se paga una vez por recarga en lugar de una vez por pedido.

Para no contar doble: cuando el pedido se paga con saldo, la comisión es cero porque ya se registró en el asiento de la recarga. El asiento lleva `provider = wallet_pen | wallet_usdt`, `fee_amount = 0` y la referencia al movimiento de `wallet_ledger`.

---

## 11. Yape y Plin: hoy verificación con un clic, mañana TAYPI

### 11.1 Cómo funciona mientras no haya API

La idea clave: **automatizar todo menos la verificación**. El único paso humano es mirar tu app de Yape y confirmar que el dinero llegó; el resto (asignar cupo, crear la suscripción, registrar el asiento, entregar las credenciales) ya corre solo.

1. El cliente elige su plan y "Pagar con Yape / Plin". El backend **reserva el cupo** y crea un intento con `provider = 'manual_yape'`, `amount_expected = pricePen` y `expires_at = +30 min` (más holgado que los 15 de un QR automático, porque depende de que tú revises).
2. El checkout muestra el QR estático y el número, el **monto exacto** a transferir, y pide un dato corto para localizar el pago: los últimos 3 dígitos del número de operación o el nombre con el que yapeó. **No se pide ninguna imagen.** Ese dato es solo una ayuda de búsqueda para ti, nunca una prueba de pago.
3. El pedido queda en `awaiting_payment` y entra en la cola **"Por verificar"** del panel, ordenada por antigüedad, con monto, hora, servicio, plan y el dato declarado. Además se te envía una alerta (correo o Telegram) para no tener que mirar el panel.
4. Abres tu app de Yape, ves el ingreso y pulsas **Confirmar**. Eso llama a `POST /api/admin/payments/confirm-manual` con `{ intentId, amountReceived, reference }`, que ejecuta **el mismo `settlePayment()`** con `provider = 'manual_yape'` y `confirmed_by = <tu usuario>`.
5. El cliente está en la pantalla de espera, que ya hace polling cada 5 segundos: en menos de 5 segundos después de tu clic tiene sus credenciales en pantalla y el correo enviado, sin que le escribas nada.
6. Si el monto recibido no es el esperado, escribes el monto real y el sistema aplica las mismas reglas de §9.3: `underpaid` no entrega y avisa el faltante; `overpaid` entrega y abona la diferencia al saldo en soles.
7. Si a los 30 minutos no llegó nada, el worker marca `expired` y libera el cupo. Si aparece después, lo confirmas desde la cola y se crea un intento nuevo sobre el mismo pedido.

Dos cosas que esta etapa ya resuelve, y vale la pena notar:

- **El fraude por comprobante editado desaparece desde ahora**, no cuando llegue TAYPI. Verificas contra tu propia cuenta, así que da igual lo que el cliente diga o envíe.
- **El error al anotar desaparece desde ahora.** Tú no transcribes nada: pulsas un botón y el sistema escribe el asiento, la fecha de renovación y la credencial entregada.

Lo mismo aplica a las recargas de saldo en soles: entran a la cola, escribes el monto recibido y se acredita.

### 11.2 El registro de proveedores y la bandera de activación

Para que activar TAYPI sea un cambio de configuración y no una reescritura, el checkout no conoce proveedores concretos: los lee de un registro.

```js
// src/lib/providers.js
export const PROVIDERS = {
  manual_yape: {
    currency: "PEN",
    enabled: process.env.MANUAL_YAPE_ENABLED !== "false",
    autoConfirm: false,                              // requiere verificación humana
    label: "Yape / Plin",
    ui: "static_qr",
    intentTtlMinutes: 30,
  },
  taypi: {
    currency: "PEN",
    enabled: process.env.TAYPI_ENABLED === "true",   // apagado hasta tener la API
    autoConfirm: true,
    label: "Yape / Plin",
    ui: "dynamic_qr",
    intentTtlMinutes: 15,
  },
  binance_account: {
    currency: "USDT",
    enabled: true,
    autoConfirm: true,
    label: "USDT · Binance Pay",
    ui: "pay_id_note",
    intentTtlMinutes: 60,
  },
  wallet_pen:  { currency: "PEN",  enabled: true, autoConfirm: true, label: "Mi saldo en soles", ui: "wallet" },
  wallet_usdt: { currency: "USDT", enabled: true, autoConfirm: true, label: "Mi saldo en USDT",  ui: "wallet" },
};

export function availableProviders(currency) {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => p.enabled && (!currency || p.currency === currency))
    .map(([id, p]) => ({ id, ...p }));
}
```

El día que llegue la API basta poner `TAYPI_ENABLED=true` y `MANUAL_YAPE_ENABLED=false`. Todo lo que ya estará construido y no habrá que tocar: el modelo de intentos, la reserva de cupo, `settlePayment()`, la entrega, el asiento contable, el worker de conciliación, la máquina de estados y las pantallas del cliente. Lo único nuevo es de dónde viene la confirmación.

Conviene dejar `manual_yape` disponible como **respaldo** incluso después: si TAYPI se cae, se enciende la cola manual y sigues vendiendo (§22).

### 11.3 Datos de la API de TAYPI

| Concepto | Valor |
|---|---|
| Base sandbox | `https://sandbox.taypi.pe` |
| Base producción | `https://app.taypi.pe` |
| Claves | `taypi_pk_test_` + 32 hex (pública) · `taypi_sk_test_` + 64 hex (secreta, solo backend) |
| Crear cobro | `POST /api/v1/payments` con `{ "amount": "6.00", "reference": "MPB-123456" }` |
| Respuesta | `{ data: { payment_id, status, qr_image, checkout_url, expires_at } }` |
| Headers | `Authorization: Bearer <key>`, `Taypi-Timestamp`, `Taypi-Signature`, `Idempotency-Key` |
| Firma | `HMAC-SHA256(secret, timestamp + method + path + body)` |
| Webhook | `{ event, payment_id, amount, currency, status, reference, paid_at }`, firma en header `Taypi-Signature` sobre el **cuerpo crudo** |
| Eventos | `payment.completed`, `payment.expired`, `cancelled`, `failed`, `rejected` |
| Vigencia del QR | 15 minutos |
| Rate limit | 60 req/min |
| Comisión | 2.50% + S/ 0.20 + IGV |

Por confirmar con soporte de TAYPI antes de codificar: la guía de integración dice que `Authorization` lleva la **public key**, mientras que los ejemplos de la página de developers muestran la **secret key**. Dejarlo configurable (`TAYPI_AUTH_KEY`) y validar en sandbox.

### 11.4 Cliente

```js
// src/lib/taypi.js
import crypto from "node:crypto";

const BASE = process.env.TAYPI_BASE_URL;
const SECRET_KEY = process.env.TAYPI_SECRET_KEY;
const WEBHOOK_SECRET = process.env.TAYPI_WEBHOOK_SECRET;

function sign(timestamp, method, path, body) {
  return crypto.createHmac("sha256", SECRET_KEY)
    .update(`${timestamp}${method}${path}${body}`)
    .digest("hex");
}

export async function createPayment({ amountPen, reference, description, idempotencyKey }) {
  const path = "/api/v1/payments";
  const body = JSON.stringify({
    amount: amountPen.toFixed(2),
    reference,
    ...(description ? { description } : {}),
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAYPI_AUTH_KEY}`,
      "Taypi-Timestamp": timestamp,
      "Taypi-Signature": sign(timestamp, "POST", path, body),
      "Idempotency-Key": idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.message || `TAYPI ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

export async function getPayment(paymentId) { /* GET /api/v1/payments/{id}, firmado igual */ }

export function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader) {
  if (!signatureHeader) return false;

  // Anti-replay: rechazar entregas con más de 5 minutos de desfase
  if (timestampHeader) {
    const skew = Math.abs(Date.now() / 1000 - Number(timestampHeader));
    if (!Number.isFinite(skew) || skew > 300) return false;
  }

  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

La verificación usa el cuerpo **crudo**: en el route handler hay que hacer `const raw = await req.text()` y recién después `JSON.parse(raw)`. Si se usa `await req.json()` directamente, la firma nunca cuadra.

### 11.5 Webhook

```js
// src/app/api/webhooks/taypi/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { after } from "next/server";
import { verifyWebhookSignature } from "../../../../lib/taypi";
import { recordEvent } from "../../../../lib/idempotency";
import { handleTaypiCompleted, expireIntentByProviderRef } from "../../../../lib/settle";
import { deliverOrder } from "../../../../lib/delivery";

export async function POST(req) {
  const raw = await req.text();
  const signature = req.headers.get("taypi-signature");
  const timestamp = req.headers.get("taypi-timestamp");

  if (!verifyWebhookSignature(raw, signature, timestamp)) {
    return Response.json({ error: "invalid_signature" }, { status: 403 });
  }

  const event = JSON.parse(raw);

  // Cerrojo 1: deduplicación por evento
  const { duplicate, eventRowId } = await recordEvent({
    provider: "taypi",
    eventId: `${event.payment_id}:${event.status}`,
    eventType: event.event,
    payload: event,
    signatureValid: true,
  });
  if (duplicate) return Response.json({ received: true, duplicate: true });

  if (event.status === "completed") {
    const result = await handleTaypiCompleted(event, eventRowId);
    if (result.ok && !result.duplicate) after(() => deliverOrder(result));
  } else if (["expired", "cancelled", "failed", "rejected"].includes(event.status)) {
    await expireIntentByProviderRef("taypi", event.payment_id, event.status);
  }

  return Response.json({ received: true });
}
```

`handleTaypiCompleted()` busca el intento por `provider_ref = payment_id`, compara el monto contra `amount_expected` (nunca toma el monto del evento como precio válido), clasifica con `classifyAmount()` y, si es `exact` u `overpaid`, llama a `settlePayment()`. Si el intento es de recarga (`purpose = wallet_topup`), en lugar de liquidar un pedido acredita el saldo en soles.

Responder `200` siempre que la firma sea válida: cualquier otro código hace que TAYPI reintente, y el reintento ya está cubierto por la deduplicación.

### 11.6 Cambios en el checkout web

`src/app/checkout/[orderId]/page.js` se reescribe una sola vez, y sirve para las dos etapas porque dibuja según el campo `ui` del proveedor:

1. Al montar, `POST /api/payments/intents` con `{ orderId, provider }`. El backend reserva el cupo y crea el intento.
2. Renderiza según `ui`:
   - `static_qr` (Yape manual): QR fijo de `config.js`, monto exacto, campo corto para el dato de búsqueda, y el mensaje "Tu pedido está en verificación, normalmente tarda pocos minutos".
   - `dynamic_qr` (TAYPI): el `qr_image` que devuelve la API.
   - `pay_id_note` (USDT): Pay ID, QR de Binance y el código de la nota, todos copiables.
   - `wallet`: resumen del cargo y botón de confirmación inmediata.
3. El contador sale del `expires_at` real del intento, no de un `CHECKOUT_SECONDS` local.
4. El polling de 5 segundos se mantiene, pero contra `GET /api/payments/intents/[id]`.
5. Con `status = "paid"`, muestra las credenciales (ya implementado).
6. Botón "Ya pagué y no aparece": con TAYPI o USDT consulta al proveedor (`POST …/refresh`); con Yape manual manda un recordatorio a tu cola y le dice al cliente que está en revisión.
7. **Quitar** el botón "Enviar Comprobante por WhatsApp". WhatsApp queda como soporte, nunca como vía de confirmación.

### 11.7 Checklist para el día que llegue la API

- [ ] Cargar `TAYPI_PUBLIC_KEY`, `TAYPI_SECRET_KEY` y `TAYPI_WEBHOOK_SECRET` de sandbox, con `TAYPI_ENABLED=false`.
- [ ] Confirmar con soporte si `Authorization` lleva la public key o la secret key, y si el webhook envía `Taypi-Timestamp`.
- [ ] Registrar el webhook en `https://cheapmusic.best/api/webhooks/taypi` y verificar que Cloudflare no altera ni cachea esa ruta.
- [ ] Probar en sandbox: pago exitoso, QR expirado, webhook duplicado, firma inválida y pago de menos.
- [ ] Cambiar a claves live y hacer un pago real de S/6 de prueba de punta a punta.
- [ ] `TAYPI_ENABLED=true` y `MANUAL_YAPE_ENABLED=false`.
- [ ] Vigilar la cola manual una semana: debe quedar vacía. Si entran pedidos, algo no está liquidando.

---

## 12. USDT con Binance (Vía B)

El cliente paga por Binance Pay al Pay ID del negocio y escribe el **código del pedido en "Note to Payee"**. El backend consulta el historial de Pay de la cuenta y empareja por nota. No hace falta cuenta de comercio ni KYB.

| Concepto | Valor |
|---|---|
| Endpoint | `GET https://api.binance.com/sapi/v1/pay/transactions` |
| Auth | Header `X-MBX-APIKEY` + `signature = HMAC-SHA256(secret, queryString)` |
| Parámetros | `timestamp`, opcionales `startTime`, `endTime`, `limit` (máx 100), `recvWindow` |
| Peso | 3000 (UID): no conviene llamarlo más de una vez cada 15–20 s |
| Ventana | Últimos 90 días; consulta de órdenes hasta 18 meses |
| Datos | `transactionId`, `transactionTime`, `amount`, `currency`, `note`, `payerInfo` |
| Permisos de la API key | **Solo lectura.** Sin retiros, sin trading, y **restringida a la IP del VPS** |

```js
// src/lib/binanceAccount.js
import crypto from "node:crypto";

export async function getPayTransactions({ startTime, limit = 100 } = {}) {
  const params = new URLSearchParams({
    timestamp: Date.now().toString(),
    recvWindow: "10000",
    limit: String(limit),
    ...(startTime ? { startTime: String(startTime) } : {}),
  });
  const signature = crypto
    .createHmac("sha256", process.env.BINANCE_API_SECRET)
    .update(params.toString())
    .digest("hex");

  const res = await fetch(
    `https://api.binance.com/sapi/v1/pay/transactions?${params}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY }, signal: AbortSignal.timeout(12_000) }
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.msg || "binance_history_error");
  return json.data;
}

/** Normaliza la nota para comparar: el cliente escribe con espacios, minúsculas o guiones raros. */
export function normalizeNote(note) {
  return String(note || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Trunca a 3 decimales, igual que el bot de referencia: nunca redondea a favor del cliente. */
export function truncate3(value) {
  return Math.floor(Number(value) * 1000) / 1000;
}
```

### 12.1 Reglas antifraude (obligatorias)

Cada validación tapa un abuso concreto:

| Validación | Abuso que evita |
|---|---|
| `normalizeNote(tx.note) === intent.note_code` | Que alguien reclame el pago de otro |
| `transactionId` no existe en `consumed_provider_txns` | Reutilizar un mismo pago para dos pedidos |
| `currency === "USDT"` | Pagar en una moneda de menor valor |
| `truncate3(amount) >= amount_expected - 0.01` | Pagar de menos y exigir entrega |
| `transactionTime` dentro de la vigencia del intento + 2 h de gracia | Reciclar un pago viejo |
| El primer cobro fija `payerInfo.binanceId` en el cliente; los siguientes deben coincidir | Rotar cuentas para abusar de promociones |
| Máximo 5 reclamos por cliente cada 10 min (`rate_limits` en Postgres) | Fuerza bruta de Order IDs |
| El reclamo manual nunca liquida por sí mismo: solo dispara la consulta al historial | Inyección de datos por el cliente |

Hay **dos tipos de código de nota**, y la diferencia importa:

- **Por pedido**, para compras con monto exacto: el propio `order_id` (`MPB-123456`), guardado en `payment_intents.note_code`. Aquí sí aplica la validación de monto.
- **Permanente por cliente**, para recargas de monto libre: `customers.wallet_note_code`, del estilo `SALDO-C4821`, único e inmutable. Con este código el cliente puede enviar **cualquier monto en cualquier momento** sin crear un intento antes, tal como en el bot de referencia, y el worker lo acredita a su saldo. En este caso `amount_expected` es `null` y no hay validación de monto: se acredita lo que llegó, truncado a 3 decimales.

Ambos deben ser cortos y fáciles de teclear en el móvil, porque se escriben a mano en la app de Binance.

### 12.2 Dos disparadores, una sola lógica

- **Automático (el principal)**: el worker, mientras haya intentos USDT abiertos, llama a `getPayTransactions({ startTime: ahora - 2h })` y empareja por nota. El cliente no hace nada más que pagar con la nota correcta.
- **Asistido (atajo)**: el cliente pega el Order ID en el checkout o en el bot (`POST /api/payments/binance/claim`). El backend consulta el historial y valida ese `transactionId` **contra el intento del propio cliente**. Solo reduce la espera; no es una vía de confianza.

Si no hay intentos USDT abiertos, el worker no llama a Binance. Así el peso 3000 del endpoint no se consume en vano.

### 12.3 Texto para el cliente

> Envía **1.82 USDT** al Pay ID `99190804` (Jorge P.) y escribe en **"Note to Payee"** exactamente: `MPB-123456`
>
> Se acreditan hasta 3 decimales. Si el monto llega por debajo, el pedido queda pendiente y te avisamos cuánto falta. Si olvidaste la nota, escríbenos y lo resolvemos manualmente.

Mostrar el QR de Binance Pay y el Pay ID copiables, y el código de la nota en grande con botón de copiar: el olvido de la nota es el error de usuario más probable de todo el flujo.

### 12.4 Otras criptomonedas (después)

1. **CryptoBot (Crypto Pay API)** — el más rápido para Telegram: `createInvoice` con `payload = orderId` y webhook `invoice_paid`. Cubre USDT, TON, BTC. Encaja tal cual en el modelo de intentos.
2. **Dirección USDT propia (TRC20/BEP20) con vigilante on-chain** — generar una dirección derivada **por pedido** (HD wallet) para emparejar por dirección y no por monto, y exigir N confirmaciones vía TronGrid o BscScan. Con una dirección estática compartida el emparejamiento es frágil; no se recomienda.
3. **Agregador (NOWPayments, OxaPay, Coinbase Commerce)** — una sola integración para decenas de monedas, a cambio de 0.5–1% y KYC.

### 12.5 Anexo: Binance Pay Merchant (opción futura)

Si algún día se obtiene cuenta de comercio, la vía A elimina la nota y el polling: `POST /binancepay/openapi/v3/order` con `webhookUrl`, firma de request `HMAC-SHA512(secret, timestamp + "\n" + nonce + "\n" + body + "\n")` en hex mayúsculas, y webhook con firma **RSA** verificada contra `POST /binancepay/openapi/certificates`, aceptando solo `bizStatus = "PAY_SUCCESS"` y respondiendo `{"returnCode":"SUCCESS","returnMessage":null}`. La arquitectura de intentos no cambia: solo se añade un proveedor más.

---

## 13. Saldo dual: soles y USDT

### 13.1 Reglas del saldo

1. **Dos saldos independientes** por cliente: `PEN` y `USDT`. Cada uno se recarga y se gasta en su moneda.
2. **No hay conversión entre saldos** ni en un sentido ni en el otro, coherente con la decisión de no manejar tipo de cambio (§10.1). Permitirla convertiría el negocio en casa de cambio y obligaría a fijar una tasa que decidimos no tener.
3. **No hay retiros.** El saldo solo se gasta en la tienda. Debe decirlo los términos del servicio de forma explícita.
4. **Recargas de monto libre**, sin mínimo ni montos fijos. El saldo en soles se recarga por Yape/Plin (hoy con verificación de un clic, luego con TAYPI); el de USDT enviando cualquier cantidad al Pay ID con el código permanente en la nota. Se acredita exactamente lo que llegó: los soles con 2 decimales, el USDT truncado a 3.
5. **Compras**: un pedido se puede pagar con saldo PEN, con saldo USDT, con TAYPI directo o con USDT directo. Con saldo la confirmación es instantánea y sin comisión.
6. **Truncado a 3 decimales** al acreditar USDT.
7. **Excedentes** de un pago van al saldo de esa misma moneda.
8. **Reembolsos** vuelven al saldo de la moneda con la que se pagó.

### 13.2 Débito y crédito atómicos

El saldo se toca siempre dentro de la misma transacción que la compra, con bloqueo de fila:

```js
// src/lib/wallet.js
import { truncate3 } from "./binanceAccount";

export async function debit(tx, { customerId, currency, amount, reason, refType, refId }) {
  const locked = await tx.query(
    `select balance from wallet_accounts
      where customer_id = $1 and currency = $2
      for update`,
    [customerId, currency]
  );

  const balance = Number(locked.rows[0]?.balance ?? 0);
  if (balance + 1e-9 < amount) {
    const err = new Error("insufficient_funds");
    err.code = "INSUFFICIENT_FUNDS";
    err.balance = balance;
    err.missing = Number((amount - balance).toFixed(currency === "USDT" ? 3 : 2));
    throw err;                              // la transacción hace rollback completo
  }

  const after = Number((balance - amount).toFixed(8));

  await tx.query(
    `update wallet_accounts set balance = $3, updated_at = now()
      where customer_id = $1 and currency = $2`,
    [customerId, currency, after]
  );

  await tx.query(
    `insert into wallet_ledger(customer_id, currency, direction, amount, balance_after, reason, ref_type, ref_id)
     values ($1,$2,'debit',$3,$4,$5,$6,$7)`,
    [customerId, currency, amount, after, reason, refType, refId]
  );

  return after;
}

export async function credit(tx, { customerId, currency, amount, reason, refType, refId }) {
  const monto = currency === "USDT" ? truncate3(amount) : Number(Number(amount).toFixed(2));

  const res = await tx.query(
    `insert into wallet_accounts(customer_id, currency, balance)
     values ($1,$2,$3)
     on conflict (customer_id, currency)
     do update set balance = wallet_accounts.balance + excluded.balance, updated_at = now()
     returning balance`,
    [customerId, currency, monto]
  );
  const after = Number(res.rows[0].balance);

  await tx.query(
    `insert into wallet_ledger(customer_id, currency, direction, amount, balance_after, reason, ref_type, ref_id)
     values ($1,$2,'credit',$3,$4,$5,$6,$7)`,
    [customerId, currency, monto, after, reason, refType, refId]
  );

  return after;
}
```

El `check (balance >= 0)` de `wallet_accounts` es la última red: incluso con un error de lógica, la base rechaza un saldo negativo.

### 13.3 Compra con saldo

```
cliente elige plan → provider = wallet_pen | wallet_usdt
  withTransaction:
    reserveSlot()                        → si null: "sin stock", rollback, no se cobra
    debit(saldo)                         → si falta: "te faltan S/ 3.00", rollback
    settlePayment(provider = wallet_*)   → asiento con fee 0 y ref al movimiento
  después de la transacción: deliverOrder()
```

La entrega con saldo es la experiencia más rápida de todo el sistema: el cliente elige el plan y en el mismo clic ya tiene la credencial en pantalla. Ese es el argumento para promover las recargas.

### 13.4 Interfaz

- **Web**: bloque "Mi saldo" en `/client/dashboard` mostrando `S/ 12.50` y `3.400 USDT` por separado, con botones "Recargar soles" y "Recargar USDT" y el historial de `wallet_ledger`. En el checkout, si el saldo alcanza, aparece primero la opción "Pagar con mi saldo (inmediato)".
- **Telegram**: el menú muestra ambos saldos; "Recargar Saldo" pregunta primero la moneda.
- El saldo requiere cliente identificado, así que la web usa la sesión que ya existe (`customer_session` con OTP o PIN en `pinOtp.js`); no hay que construir autenticación nueva.

---

## 14. Entrega automática de credenciales

### 14.1 Resolución única de credenciales

La regla de qué correo entregar hoy está duplicada e inconsistente entre `assignStock.js` y `/api/client/dashboard`. Un solo lugar:

```js
// src/lib/delivery.js
export function resolveSlotCredentials(slot, account) {
  const useMaster = slot.email_type === "admin";
  const email = useMaster
    ? (account?.account_email || slot.member_email || "")
    : (slot.member_email || account?.account_email || "");
  const password = slot.member_password || account?.account_password || "";
  return { email: email.trim(), password };
}
```

Consumidores obligados: `settlePayment()`, `/api/client/dashboard`, `sendOrderEmail()`, el checkout y el bot.

### 14.2 Canales

`deliverOrder()` entrega por todos los canales disponibles y registra cada intento en `deliveries`:

1. **Checkout web**: ya funciona leyendo `order.assignedAccount`. Requisito nuevo: no mostrar nada si `status` no es `paid` o `delivered`.
2. **Correo** (`sendOrderEmail`): plantilla ya lista. Se invoca con `after()` para no bloquear la respuesta. Cambio: tomar la fecha de vencimiento de `subscriptions.renewal_date` en lugar de recalcularla desde `duration`, que es texto libre.
3. **Panel de cliente**: cubierto al crear la suscripción.
4. **Telegram**: mensaje con correo y contraseña, con botones de copiar.

### 14.3 Reintentos y garantía

- Si `deliverOrder()` falla, el pedido queda en `paid` (no `delivered`) y el worker reintenta con espera creciente (1, 5, 15, 60 min) hasta 5 veces.
- Tras el quinto fallo: alerta al admin y marca roja en el panel.
- `deliveries.credential_hash = sha256(email + ":" + password)` permite verificar después que lo entregado coincide con lo que hay en el cupo, sin duplicar la contraseña en otra tabla.
- `POST /api/admin/payments/resend` reenvía sin volver a cobrar ni reasignar.

### 14.4 Anti-abuso en la lectura del pedido

Hoy `GET /api/orders/[orderId]` devuelve el pedido a cualquiera que acierte un `MPB-######`: son 900 000 combinaciones, alcance de un script. Dos medidas:

1. El checkout recibe un token firmado (`HMAC(orderId + createdAt, SESSION_SECRET)`) en la URL, o exige sesión de cliente.
2. Límite de tasa persistido en ese endpoint.

Además, al entregar se registra IP y user agent en `events_log`, que es la prueba a mano si un cliente reclama que nunca recibió la cuenta.

---

## 15. Contabilidad e inventario automáticos

### 15.1 Qué queda registrado en cada venta

Una sola transacción escribe:

| Tabla | Registro |
|---|---|
| `orders` | `status`, `paid_at`, `delivered_at`, `account_slot_id`, `subscription_id`, `customer_id`, `pay_currency` |
| `account_slots` | `status = active`, `customer_id`, reserva limpiada |
| `subscriptions` | Suscripción activa con `start_date`, `renewal_date`, `plan_price`, `activation_email` |
| `payments` | Bruto, comisión, neto, moneda, proveedor, `provider_txn_id`, canal, `confirmed_by` |
| `wallet_ledger` | Movimiento, si se pagó con saldo o hubo excedente |
| `consumed_provider_txns` | La transacción del proveedor queda quemada |
| `deliveries` | Constancia de entrega por canal |
| `events_log` | Evento `settled` con todos los IDs implicados |

"Anotar" desaparece como tarea humana: con TAYPI o USDT el asiento nace del webhook o de la conciliación, y con Yape manual nace de tu clic de confirmación. En ningún caso alguien transcribe un monto a mano.

**Dos libros, nunca sumados.** Como no hay tipo de cambio, toda consulta contable se agrupa por moneda:

```sql
select currency,
       count(*)                as operaciones,
       sum(gross_amount)       as bruto,
       sum(fee_amount)         as comisiones,
       sum(net_amount)         as neto
  from payments
 where payment_status = 'confirmed'
   and created_at >= date_trunc('month', now())
 group by currency;
```

El panel muestra las dos filas en paralelo. Si alguna vista necesita un único número, hay que decidir en ese momento con qué tasa consolidarlo; el sistema no lo hace por su cuenta a propósito.

### 15.2 Reserva y liberación de stock

1. Al crear el intento: `reserveSlot(tx, service, orderId, 900)`. Si devuelve `null`, se responde "sin stock" y **no se crea el intento**; el pedido queda `cancelled` con motivo `no_stock`.
2. Cupo en `reserved` con `reserved_until`: no cuenta como disponible ni como vendido.
3. Al pagar: `reserved` → `active`.
4. Al expirar: el worker ejecuta `releaseExpiredReservations()` y vuelve a `free`.

Esto además obliga a arreglar el conteo de stock (defecto 4): `getFreeSlotsStock()` debe contar `status = 'free' or (status = 'reserved' and reserved_until < now())`, quitar el filtro `member_email <> ''` y derivar los servicios de `CONFIG.services` en lugar de la lista fija.

### 15.3 Panel de administración

- **PaymentsTab**: columnas Proveedor, ID de transacción, Comisión y Neto. Los pagos automáticos llegan `confirmed` y no necesitan botón de aprobar; el botón de aprobar/rechazar queda solo para casos `underpaid` y ajustes manuales.
- **OrdersTab**: badges `awaiting_payment`, `underpaid`, `paid` sin entregar, `expired`; botón "Reenviar credenciales".
- **StockTab**: mostrar cupos `reserved` con su cuenta atrás.
- **ProfitabilityTab**: usar `net_amount` agrupado por moneda en lugar de `plan_price`, con dos columnas (soles y USDT) que nunca se suman.
- **Cola "Por verificar"**: la pantalla más usada mientras Yape sea manual. Lista de intentos `manual_yape` en `awaiting_payment` con monto, hora, dato declarado y botones Confirmar / No llegó, más un campo para el monto real si difiere.
- **HoyTab**: pagos automáticos del día, fallos de firma, entregas pendientes, recargas de saldo.
- **Nueva pestaña Conciliación**: intentos abiertos, eventos con firma inválida, pagos sin pedido, pedidos pagados sin entregar, descuadres de saldo. Es el tablero que sustituye la revisión de comprobantes.
- **Nueva pestaña Saldos**: saldo por cliente en ambas monedas, con su historial y ajuste manual auditado.

---

## 16. Worker de conciliación

`runReconciliation()` corre cada 20 segundos en el proceso worker, es idempotente y tiene tope de trabajo por ciclo:

1. Liberar reservas vencidas.
2. Marcar `expired` los intentos y pedidos cuyo `expires_at` pasó.
3. Si TAYPI está activo: por cada intento `awaiting` de menos de 24 h, `GET /api/v1/payments/{id}`; si está `completed`, liquidar. Cubre webhooks perdidos.
4. Si hay intentos USDT abiertos: `getPayTransactions()` y emparejar por nota.
5. Reintentar entregas fallidas con espera creciente.
6. Una vez al día: cuadrar `wallet_accounts` contra `wallet_ledger`, y el total de `payments.net_amount` del día anterior.
7. Alertar al admin si hay pedidos `paid` sin entregar por más de 10 minutos, eventos con firma inválida, pagos sin pedido asociado, o un proveedor sin responder por más de 30 minutos.
8. Avisarte cuando entre un pedido nuevo a la cola "Por verificar", y recordártelo si sigue ahí a los 10 minutos. Mientras Yape sea manual, esta alerta es la que sostiene el tiempo de entrega.
8. Registrar el resumen del ciclo cuando haya cambios (no cada 20 s, para no inundar el log).

Como el worker es un servicio systemd propio, se supervisa con `systemctl status musicapremium-worker` y `journalctl -u musicapremium-worker -f`. Ejecutar `Restart=always` con `RestartSec=10`.

Un detalle de concurrencia: si algún día hay más de un worker, cada ciclo debe tomar un `pg_try_advisory_lock(clave)` para que solo uno trabaje. Con un solo worker no es necesario, pero dejarlo puesto cuesta tres líneas y evita un problema difícil de diagnosticar.

---

## 17. Canal de Telegram

El bot es un adaptador delgado sobre el mismo núcleo, sin reglas de negocio propias.

- **Webhook**: `POST /api/telegram/webhook`, validando el header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`. Registrar con `setWebhook`. Sin librerías pesadas: llamadas directas a `https://api.telegram.org/bot<token>/…`.
- **Identidad**: `customer_contacts` ya admite `contact_type = 'telegram'`. En el primer `/start` se busca o crea el cliente por `telegram_user_id`. Si ya compró por web, se vincula pidiendo su número y confirmando con el OTP existente (`pinOtp.js`), reutilizando la autenticación actual.
- **Menú**: Tienda · Recargar Saldo · Mis Cuentas · Soporte · Canal, mostrando ambos saldos arriba.
- **Compra**: `provider = wallet_pen | wallet_usdt` y `sales_channel = 'telegram'`; si el saldo no alcanza, ofrecer recargar con el faltante exacto ya calculado.
- **Recarga**: monto libre. En USDT se le muestra su código permanente (`customers.wallet_note_code`) y puede enviar lo que quiera cuando quiera; en soles se crea un intento `manual_yape` que entra a tu cola de verificación.
- **Entrega**: mensaje con las credenciales y fila en `deliveries` con `channel = 'telegram'`.
- **Anuncios de stock**: al terminar una importación (`/api/admin/import`), publicar en el canal "N cupos añadidos a {servicio}" con botón de compra, como el bot de referencia.
- **Convivencia de canales**: el stock es uno solo y está protegido por `for update skip locked`, así que web y Telegram pueden competir por el último cupo sin riesgo de doble venta. Los precios viven en `src/data/config.js` y el precio en USDT se calcula (§10.2), así que no hay dos tablas que mantener sincronizadas.

---

## 18. Seguridad y antifraude

| Riesgo | Mitigación |
|---|---|
| Comprobante de Yape editado | Desaparece desde la fase 4: hoy porque verificas contra tu propia app y el cliente no envía nada; luego porque la confirmación la da TAYPI con firma HMAC |
| Confirmación manual mal usada o suplantada | `confirm-manual` exige sesión de admin, registra `confirmed_by` y el monto real, y queda auditado en `events_log`. Un doble clic no liquida dos veces: el claim del pedido lo impide |
| Webhook falso desde internet | Verificación HMAC-SHA256 sobre el cuerpo crudo con `timingSafeEqual` |
| Reenvío de un webhook legítimo | `unique(provider, event_id)` + ventana de timestamp de 5 min |
| Doble entrega del mismo pago | Claim condicional del pedido + `unique(provider, provider_txn_id)` |
| Dos compradores, un solo cupo | Reserva con TTL + `for update skip locked` |
| Reclamar el pago USDT de otro | Emparejamiento por nota + binding de `payerInfo.binanceId` + `consumed_provider_txns` |
| Pagar de menos | `underpaid`: se registra, no se entrega, se avisa el faltante |
| Pagar de más | El excedente va al saldo de la misma moneda, con asiento |
| Saldo manipulado | `wallet_accounts` con `check (balance >= 0)`, `FOR UPDATE` en cada débito, y cuadre diario contra `wallet_ledger` |
| Adivinar `MPB-######` y leer credenciales de otro | Token firmado o sesión obligatoria + rate limit persistido |
| Robo de la API key de Binance | Clave de **solo lectura**, sin retiros, **restringida a la IP del VPS** |
| Fuga de `DATABASE_URL` | Postgres solo en `localhost`, usuario de app sin DDL, `/etc/musicapremium/env` con permisos `600` y dueño `root` |
| Inyección SQL | Consultas siempre parametrizadas (`$1`, `$2`); nunca interpolar entradas en el SQL |
| Contraseñas en claro en base | Fase final: AES-256-GCM con clave en variable de entorno, descifrado solo al entregar |
| Cliente que pide `status: paid` | Se elimina esa capacidad del endpoint público |
| Abuso de creación de pedidos | Rate limit persistido en `rate_limits`, no el `Map` en memoria |
| Disputa "nunca recibí la cuenta" | `deliveries` + `events_log` con IP, canal, hora y hash de la credencial |
| VPS comprometido | SSH solo con clave, `fail2ban`, UFW con 3 puertos, actualizaciones automáticas de seguridad, sin paneles de administración expuestos |

Todas las claves viven en `/etc/musicapremium/env`, nunca en `src/data/config.js` (que se sirve al navegador) ni en el repositorio.

---

## 19. Variables de entorno

```bash
# --- Base ---
APP_BASE_URL=https://cheapmusic.best
NODE_ENV=production
TZ=America/Lima
SESSION_SECRET=              # obligatorio en producción
ADMIN_PASSWORD=

# --- PostgreSQL ---
DATABASE_URL=postgres://mpb_app:...@127.0.0.1:5432/musicapremium
DATABASE_MIGRATION_URL=postgres://mpb_migrator:...@127.0.0.1:5432/musicapremium
PGPOOL_MAX=10

# --- Yape / Plin: verificación manual (activo ahora) ---
MANUAL_YAPE_ENABLED=true

# --- Yape / Plin: TAYPI (apagado hasta tener la API) ---
TAYPI_ENABLED=false
TAYPI_BASE_URL=https://sandbox.taypi.pe
TAYPI_PUBLIC_KEY=
TAYPI_SECRET_KEY=
TAYPI_AUTH_KEY=              # la clave que va en el header Authorization (pk o sk, por confirmar)
TAYPI_WEBHOOK_SECRET=

# --- Binance (cuenta personal, solo lectura, IP restringida) ---
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_PAY_ID=99190804
BINANCE_PAY_NICKNAME=

# --- Saldo (dos monedas independientes, sin tipo de cambio) ---
WALLET_ENABLED=true

# --- Worker ---
WORKER_INTERVAL_MS=20000
WORKER_BINANCE_MIN_INTERVAL_MS=15000

# --- Correo ---
EMAIL_USER=
EMAIL_PASS=
ADMIN_ALERT_EMAIL=

# --- Telegram ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_CHANNEL_ID=

# --- Fase final ---
CREDENTIALS_ENCRYPTION_KEY=  # 32 bytes en base64
```

Se retiran `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

---

## 20. Pruebas y criterios de aceptación

### 20.1 Unitarias (Vitest, siguiendo el patrón de los `*.test.js` actuales)

| Archivo | Casos |
|---|---|
| `taypi.test.js` | Firma correcta; firma alterada rechazada; timestamp viejo rechazado; cuerpo con caracteres UTF-8 |
| `binanceAccount.test.js` | `normalizeNote` con espacios, minúsculas y guiones; `truncate3` nunca redondea a favor; `transactionId` ya consumido rechazado; nota que no corresponde al cliente rechazada |
| `settle.test.js` | Evento duplicado no entrega dos veces; monto menor no entrega; monto mayor acredita excedente; sin stock marca `needsManual` y conserva el cobro |
| `wallet.test.js` | Débito sin fondos hace rollback y calcula el faltante; crédito USDT trunca a 3 decimales; saldo nunca negativo; cuadre ledger/balance |
| `ledger.test.js` | Comisión cero para `manual_yape`, `binance_account` y saldo; comisión TAYPI exacta en los cuatro precios de §10.3; ninguna función mezcla monedas |
| `providers.test.js` | `availableProviders` respeta las banderas; con `TAYPI_ENABLED=false` no aparece TAYPI; al activarlo desaparece `manual_yape` |
| `delivery.test.js` | `resolveSlotCredentials` con `email_type` admin y customer, con campos vacíos y con solo cuenta maestra |
| `reserve.test.js` | Reserva vencida vuelve a `free`; cupo reservado no cuenta como stock disponible |

Para las pruebas que tocan base, usar una base Postgres de pruebas local (`musicapremium_test`) con las migraciones aplicadas, y envolver cada caso en una transacción con rollback. Ahora que la base es propia, esto es trivial y no requiere mocks del cliente de Supabase.

### 20.2 Integración de punta a punta

1. Yape manual: pedido real de S/6, confirmación desde la cola, credenciales en pantalla en menos de 5 s; confirmación con monto menor; intento que expira y libera el cupo; doble clic en Confirmar (debe liquidar una sola vez).
2. Binance real con montos mínimos: pago con nota correcta, con nota mal escrita, sin nota, recarga de monto libre con el código permanente, y reclamo de un Order ID ya consumido.
3. Carrera de stock: dos pedidos simultáneos del último cupo (`Promise.all`) → uno recibe cuenta, el otro recibe "sin stock" y no se le cobra.
4. Caída del webhook: bloquear la URL en Caddy, pagar, y verificar que el worker liquida en el siguiente ciclo.
5. Saldo: recargar S/25 (monto libre), comprar cuatro planes de S/6, verificar saldo final S/1.00, cuatro asientos con comisión cero y el cuadre `wallet_accounts` = `wallet_ledger`. Repetir en USDT con un monto con 5 decimales para comprobar el truncado a 3.
6. Reinicio en caliente: reiniciar el servicio web durante un pago y comprobar que la liquidación no queda a medias.
7. Cuando llegue la API: TAYPI sandbox con pago exitoso, QR expirado, webhook duplicado (reenviar el mismo POST 3 veces), firma inválida y pago de menos (§11.7).

### 20.3 Criterios de aceptación

- Un pago en USDT se confirma y entrega credenciales en menos de 40 segundos (un ciclo del worker), sin intervención humana.
- Un pago por Yape entrega credenciales en menos de 5 segundos desde tu clic de confirmación, y el único trabajo humano es ese clic: nadie transcribe montos ni fechas.
- Un pago con saldo entrega en menos de 3 segundos.
- Al poner `TAYPI_ENABLED=true` no hace falta tocar código: el checkout, la liquidación, la entrega y la contabilidad funcionan igual.
- Reenviar el mismo webhook 5 veces produce exactamente 1 fila en `payments`, 1 en `subscriptions`, 1 cupo ocupado y 1 correo.
- Un pago de menos nunca entrega credenciales y genera aviso al cliente y al admin.
- Un Order ID de Binance no puede usarse dos veces ni por dos clientes distintos.
- Ningún pedido pagado queda sin entregar más de 10 minutos sin generar alerta.
- `wallet_accounts` cuadra con `wallet_ledger` todos los días.
- El total de `payments.net_amount` del día cuadra con el extracto de TAYPI y con el historial de Binance, sin ajustes manuales.
- Web y Telegram venden en simultáneo sin duplicar la asignación de un cupo.
- No queda ninguna ruta que acepte imágenes de comprobante.

---

## 21. Fases y orden de ejecución

| Fase | Objetivo | Entregables | Depende de |
|---|---|---|---|
| **0. VPS, dominio y PostgreSQL** | Infraestructura lista | DNS de `cheapmusic.best` apuntando al VPS, usuario `deploy` y SSH endurecido, UFW + firewall de Contabo, VNC cerrado, PostgreSQL 18.6 instalado y ajustado, roles `mpb_app`/`mpb_migrator`, Caddy con TLS, servicios systemd, respaldos con restauración probada, Cloudflare al frente | — |
| **1. Migración de datos** | Salir de Supabase | `pg.js`, `db.js` reescrito sobre SQL, runner de migraciones, `001_baseline.sql`, verificación de conteos, Supabase en solo lectura | Fase 0 |
| **2. Saneamiento** | Base lista para automatizar | Migraciones 7.1–7.2; `payments` fuera de `updateMemberProfile`; `resolveSlotCredentials` único; endpoint de pedidos sin `status`; rate limit persistido; `getFreeSlotsStock` corregido; lectura de pedido firmada; `/api/client/renew` eliminado; precios nuevos en `config.js` con `pricePen` y `priceUsdt` | Fase 1 |
| **3. Intentos, reservas y proveedores** | El armazón que TAYPI reutilizará | `providers.js` con banderas, `reserve.js`, `paymentIntents.js`, `POST /api/payments/intents`, `GET …/[id]`, checkout que dibuja según `ui` | Fase 2 |
| **4. Yape verificado + entrega y contabilidad** | **Primera ganancia real**: un clic reemplaza todo el trabajo manual | `settle.js` con `withTransaction`, `delivery.js`, `ledger.js`, `deliveries`, cola "Por verificar", `confirm-manual`, correo con `after()`, alertas de pedido nuevo, columnas nuevas en PaymentsTab y OrdersTab | Fase 3 |
| **5. Worker** | Tolerancia a fallos | `worker.js`, `reconcile.js`, expiración de reservas, reintentos de entrega, alertas, pestaña Conciliación | Fase 4 |
| **6. USDT automático** | Primer cobro sin intervención | `binanceAccount.js`, emparejamiento por nota, reclamo asistido, API key de solo lectura restringida a `169.58.139.103` | Fase 5 |
| **7. Saldo dual** | Menos verificaciones y compras instantáneas | `wallet.js`, `wallet_accounts`, `wallet_ledger`, `customers.wallet_note_code`, recargas de monto libre en ambas monedas, compra con saldo, bloque "Mi saldo", cuadre diario | Fase 6 |
| **8. Telegram** | Segundo canal | `telegram/webhook`, menú con ambos saldos, compra con saldo, entrega por chat, anuncios de stock al canal | Fase 7 |
| **9. TAYPI** | Yape 100% automático | Solo cuando tengas la API: claves, webhook, pruebas en sandbox y el checklist de §11.7. `TAYPI_ENABLED=true` | Fase 5 (se puede hacer en cualquier momento posterior) |
| **10. Endurecimiento** | Cierre | Cifrado de contraseñas en reposo, otras criptomonedas, métricas, documentación operativa | Fase 8 |

Camino crítico: fases 0 a 4. Al terminar la 4 ya no anotas nada ni revisas capturas: tu trabajo por venta se reduce a un clic, y la entrega, el inventario y la contabilidad son automáticos. La fase 6 es el primer cobro sin intervención humana alguna, y la fase 9 extiende eso a Yape el día que tengas la API, sin tocar código.

Las fases 0 y 1 no aportan función visible pero son ineludibles: sin base propia y sin migraciones versionadas, todo lo demás se construye sobre arena. La fase 3 es la que hace que TAYPI sea después un cambio de configuración: si se salta y se hace Yape manual "a mano", habría que rehacer el checkout entero más adelante.

---

## 22. Runbook operativo

- **Un cliente dice que pagó por Yape y no recibió nada**: buscarlo en la cola "Por verificar". Si el ingreso está en tu app, Confirmar. Si el intento ya expiró, confirmarlo desde la cola de expirados: se crea un intento nuevo sobre el mismo pedido y se liquida igual.
- **Un cliente dice que pagó en USDT y no recibió nada**: revisar Conciliación. Si el intento está `awaiting`, usar "Verificar con el proveedor". Si está `underpaid`, mostrarle el faltante. Si está `paid` sin entrega, "Reenviar credenciales".
- **Pagó en USDT sin poner la nota**: buscar el `transactionId` en el historial, verificar monto y hora, y aplicarlo manualmente desde Conciliación (queda auditado en `events_log` con tu nombre).
- **Te vas a dormir y hay pedidos en la cola**: el intento expira en 30 minutos y libera el cupo, y al cliente se le avisa que su pago se revisa en el siguiente horario de atención. Conviene declarar un horario visible en el checkout mientras Yape sea manual, o encender el saldo (fase 7) para que los clientes recurrentes no dependan de tu verificación.
- **TAYPI caído (cuando esté activo)**: poner `TAYPI_ENABLED=false` y `MANUAL_YAPE_ENABLED=true`, reiniciar el servicio y seguir vendiendo con la cola manual. No volver nunca al comprobante por imagen.
- **Pago confirmado sin stock**: el pedido queda `paid` con evento `out_of_stock` y alerta. Importar cupos y pulsar "Completar entrega", o reembolsar al saldo.
- **Firma inválida repetida**: revisar que `TAYPI_WEBHOOK_SECRET` corresponda al ambiente y que Caddy no esté alterando el cuerpo (no habilitar compresión ni reescrituras en esa ruta).
- **Worker caído**: `systemctl restart musicapremium-worker` y revisar `journalctl -u musicapremium-worker -n 200`. Mientras esté caído, los webhooks siguen funcionando: solo se pierde la conciliación de respaldo y la expiración de reservas.
- **Base de datos**: restaurar con `pg_restore -c -d musicapremium respaldo.dump`. Antes de cualquier restauración en producción, tomar un dump del estado actual.
- **Despliegue**: `deploy.sh` → migrar, construir, reiniciar web, reiniciar worker. Si una migración falla, el script se detiene antes de reiniciar y el sitio sigue con la versión anterior.
- **Rotación de claves**: generar la nueva, desplegar, verificar un pago, retirar la antigua.

---

## 23. Decisiones cerradas y lo único que falta

Cerradas en esta revisión:

| Punto | Decisión |
|---|---|
| Yape automático | Pospuesto hasta tener la API de TAYPI. Mientras tanto, verificación con un clic; la infraestructura se construye desde ahora (§11) |
| VPS | Contabo Cloud VPS 4: 4 vCPU, 8 GB, 100 GB, región EU, IP `169.58.139.103` (§4.1) |
| Dominio | `cheapmusic.best` |
| Tipo de cambio | No existe. Soles y USDT son monedas independientes en precios, saldos y contabilidad (§10.1) |
| Recargas | Monto libre, sin mínimo ni montos fijos (§13.1) |
| Comprobantes | Eliminados por completo |

**Lo único que falta definir: los precios en USDT.** Al no haber conversión automática, hay que fijarlos a mano. La propuesta de §10.2 toma los valores que ya tiene `config.js` para Deezer (1.79 · 2.69 · 7.29 · 13.29, y 2.69 para Qobuz) y los aplica también a Tidal. Si te parecen bien, esa tabla entra tal cual en la fase 2.

Dos cosas que no son decisiones pero conviene tener en el radar antes de la fase 4:

1. **Correo**: Gmail SMTP con contraseña de aplicación tiene tope de envíos diarios y peor reputación de entrega. Como estos correos llevan credenciales de acceso, no pueden caer en spam. Con `cheapmusic.best` ya en tu poder, conviene un servicio transaccional con dominio verificado (Resend, Brevo o Amazon SES) y registros SPF, DKIM y DMARC.
2. **Horario de atención visible**: mientras Yape dependa de tu verificación, decir en el checkout en qué horario confirmas evita reclamos por pagos hechos de madrugada. El saldo (fase 7) es la solución de fondo para los clientes recurrentes.



