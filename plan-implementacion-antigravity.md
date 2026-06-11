# Plan de implementación: lógica y estructura de datos para panel administrativo en Google Antigravity

## Alcance del documento

Este documento define la lógica de implementación y la estructura de datos para migrar la administración de clientes y suscripciones desde Google Sheets hacia un panel administrativo ya creado en Google Antigravity. El enfoque se limita al modelo de datos, reglas de negocio, relaciones entre entidades, criterios de trazabilidad y orden de implementación técnico, sin incluir diseño visual ni desarrollo de interfaz. [cite:28][cite:35][cite:38]

La propuesta asume una operación con miles de usuarios, múltiples plataformas y datos incompletos o variables, especialmente en nombre, correo y número de WhatsApp. Ese contexto exige una identidad flexible del cliente, separación entre datos de contacto y acceso, y una estructura orientada a historial y auditoría en lugar de edición destructiva. [cite:4][cite:3][cite:17]

## Objetivo lógico del sistema

El sistema debe resolver cinco problemas operativos: identificar clientes aunque cambien de WhatsApp, operar aunque no exista nombre real, permitir activaciones con correo del negocio o del cliente, separar cliente de cuenta/plataforma, y mantener historial de cambios sin perder trazabilidad. [cite:3][cite:4]

La lógica central debe basarse en un identificador interno inmutable (`customer_id`) y no en WhatsApp o correo, porque esos valores cambian o pueden no existir. En diseño de bases de datos, los identificadores internos desacoplados de campos editables reducen errores de integridad y evitan que otras tablas dependan de un correo como clave externa. [cite:17]

## Principios de estructuración

### 1. Identidad interna primero

Cada cliente debe existir como una entidad independiente con un identificador único interno. WhatsApp, correo, alias y cualquier otro dato editable deben quedar desacoplados del identificador principal. [cite:17][cite:4]

### 2. Contactos como historial, no como campo único

El sistema no debe almacenar un solo número de WhatsApp por cliente. Debe manejar múltiples contactos por persona, con vigencia, prioridad y estado, para conservar números anteriores y permitir búsquedas históricas. [cite:4]

### 3. Separación entre cliente y cuenta de plataforma

Un cliente no es lo mismo que una cuenta maestra de Tidal, Deezer o Spotify. La cuenta de plataforma debe modelarse como inventario operativo, mientras que la relación del cliente con esa cuenta debe guardarse en la suscripción o asignación de cupo. [cite:4]

### 4. Historial antes que sobreescritura

Cambios de número, renovaciones, reasignaciones, pagos y modificaciones manuales deben dejar rastro. La base no debe “reemplazar” silenciosamente datos sensibles, sino registrar eventos. [cite:4]

### 5. Estados calculables

Valores como “libre”, “vencido” o “falta pago” no deben vivir como color o texto suelto en una tabla manual. Deben existir como estados de datos o derivarse mediante reglas sobre fechas, pagos y asignaciones. [cite:4]

## Arquitectura lógica de datos

La estructura propuesta se organiza en seis dominios principales: clientes, contactos, inventario de cuentas, asignaciones/suscripciones, pagos y eventos. Este esquema es consistente con una migración desde hojas manuales hacia un backend relacional manejable desde Antigravity con integración de base de datos vía MCP y flujos asistidos por agentes. [cite:35][cite:33]

### Entidades principales

| Entidad | Función lógica |
|---|---|
| `customers` | Identidad base del cliente, aunque no tenga nombre ni correo. |
| `customer_contacts` | Historial de WhatsApp, email u otros medios de contacto. |
| `platforms` | Catálogo de plataformas vendidas. |
| `platform_accounts` | Cuentas maestras operativas por plataforma. |
| `account_slots` | Cupos o perfiles disponibles dentro de una cuenta. |
| `subscriptions` | Relación entre cliente y slot/cuenta asignada. |
| `payments` | Registro de pagos, renovaciones y deudas. |
| `events_log` | Auditoría de cambios operativos y administrativos. |

## Estructura detallada recomendada

### Tabla `customers`

Representa la identidad principal del cliente. Debe existir incluso cuando no haya nombre, correo ni un WhatsApp estable. [cite:4]

Campos sugeridos:

- `id` (UUID o bigserial): clave primaria.
- `customer_code`: código legible para panel, por ejemplo `CLI-000245`.
- `display_name`: alias opcional o nombre visible de trabajo.
- `legal_name`: nombre real si alguna vez se obtiene.
- `notes`: notas internas.
- `status`: activo, bloqueado, archivado, riesgo, etc.
- `first_seen_at`: fecha de primer registro.
- `created_at`
- `updated_at`

Regla: `display_name` no es obligatorio, pero conviene para búsqueda humana rápida. Si no existe, el sistema debe mostrar el `customer_code`. [cite:4]

### Tabla `customer_contacts`

Permite varios contactos por cliente, con historial. Es la pieza más importante para tu caso por los cambios frecuentes de WhatsApp. [cite:3][cite:4]

Campos sugeridos:

- `id`
- `customer_id`
- `contact_type`: whatsapp, email, telegram, otro.
- `contact_value`: número o correo.
- `normalized_value`: versión limpia para búsquedas.
- `is_primary`: contacto principal actual.
- `is_verified`: validado o no.
- `status`: activo, inactivo, rebotado, reemplazado.
- `valid_from`
- `valid_to`
- `notes`
- `created_at`

Restricción lógica: un cliente puede tener varios contactos activos, pero solo uno debería marcarse como principal por tipo si así se define la política interna. [cite:4]

### Tabla `platforms`

Define el catálogo de servicios vendidos. Ayuda a separar la operación por plataforma y evita repetir texto libre en cada cuenta. [cite:4]

Campos sugeridos:

- `id`
- `code`: tidal, deezer, spotify.
- `name`
- `country_scope`
- `billing_cycle_default_days`
- `status`

### Tabla `platform_accounts`

Representa la cuenta maestra o unidad operativa desde la que se asignan cupos. No es el cliente: es el inventario del negocio. [cite:4]

Campos sugeridos:

- `id`
- `platform_id`
- `account_email`
- `account_password_encrypted`
- `plan_name`
- `account_owner_type`: business o customer.
- `country`
- `max_slots`
- `status`: activa, suspendida, vencida, mantenimiento.
- `renewal_cost`
- `renewal_currency`
- `next_owner_payment_date`
- `notes`
- `created_at`
- `updated_at`

Regla: si la activación se hace con un correo del negocio, ese dato se modela aquí o en la asignación, no como correo personal del cliente. [cite:3][cite:4]

### Tabla `account_slots`

Descompone una cuenta maestra en cupos utilizables. Esto permite saber qué está libre, ocupado o reservado sin recurrir a marcas visuales manuales. [cite:4]

Campos sugeridos:

- `id`
- `platform_account_id`
- `slot_number`
- `slot_label`
- `status`: free, assigned, reserved, blocked.
- `current_subscription_id` (nullable)
- `created_at`
- `updated_at`

Restricción lógica: `slot_number` debe ser único dentro de cada cuenta. Un slot no debe tener más de una suscripción activa simultáneamente. [cite:4]

### Tabla `subscriptions`

Es la relación operativa entre cliente y cuenta o slot. Aquí vive la suscripción real del negocio. [cite:4]

Campos sugeridos:

- `id`
- `customer_id`
- `platform_id`
- `platform_account_id`
- `account_slot_id` (nullable si alguna plataforma no usa slots)
- `activation_email`
- `activation_email_owner`: customer o business.
- `delivery_channel`: whatsapp, email, manual.
- `plan_price`
- `currency`
- `start_date`
- `renewal_date`
- `grace_until`
- `subscription_status`: active, expiring, expired, pending_payment, suspended, cancelled.
- `internal_tags`
- `notes`
- `created_at`
- `updated_at`

Regla central: el estado de la suscripción puede derivarse por lógica temporal y estado de pago, pero conviene guardar también un estado operativo para consultas rápidas. [cite:4]

### Tabla `payments`

Guarda pagos y renovaciones. No debe sobrescribir el historial de cobros. [cite:4]

Campos sugeridos:

- `id`
- `customer_id`
- `subscription_id`
- `amount`
- `currency`
- `payment_method`
- `payment_status`: pending, confirmed, rejected, refunded.
- `paid_at`
- `coverage_from`
- `coverage_until`
- `proof_url`
- `received_by`
- `notes`
- `created_at`

Regla: cada pago debe poder explicar qué periodo cubre. Esto facilita renovaciones anticipadas y cálculo correcto de vencimientos. [cite:4]

### Tabla `events_log`

Es la auditoría del sistema. Debe registrar cambios críticos sobre clientes, contactos, suscripciones, slots y pagos. [cite:4]

Campos sugeridos:

- `id`
- `entity_type`
- `entity_id`
- `event_type`
- `old_value` (JSON)
- `new_value` (JSON)
- `performed_by`
- `performed_at`
- `reason`

Ejemplos de eventos: cambio de WhatsApp, reasignación de slot, actualización de fecha de renovación, aprobación de pago, bloqueo de cliente. [cite:4]

## Relaciones clave

La relación base del sistema es `customers 1:N customer_contacts`. Un cliente puede tener múltiples contactos y estos pueden cambiar con el tiempo. [cite:4]

La operación de inventario se modela con `platform_accounts 1:N account_slots`. Una cuenta maestra contiene varios cupos y cada uno puede asignarse a diferentes clientes en distintos momentos, pero no simultáneamente. [cite:4]

La relación comercial central es `customers 1:N subscriptions` y `subscriptions N:1 account_slots` cuando aplica. Los pagos se relacionan con la suscripción, no solo con el cliente, porque el cobro debe vincularse al servicio específico que se renovó. [cite:4]

## Lógica de estados

### Estado del slot

- `free`: cupo disponible.
- `reserved`: separado temporalmente, aún no activado.
- `assigned`: ocupado por una suscripción activa o pendiente.
- `blocked`: no disponible por incidencias o mantenimiento.

### Estado de la suscripción

- `active`: pago confirmado y fecha vigente.
- `expiring`: próximo a vencer según umbral operativo, por ejemplo 3 días.
- `expired`: fecha vencida sin cobertura nueva.
- `pending_payment`: hay intención o renovación en proceso sin validación final.
- `suspended`: acceso detenido manualmente.
- `cancelled`: cierre definitivo.

### Estado del pago

- `pending`: enviado, no revisado.
- `confirmed`: validado y aplicado.
- `rejected`: no válido.
- `refunded`: revertido.

Estos estados deben existir como datos explícitos para poder filtrar, automatizar y generar métricas, en lugar de depender de colores o textos visuales en una hoja. [cite:4]

## Reglas de negocio indispensables

### Regla 1. El cliente no depende del nombre

El sistema debe permitir crear clientes sin nombre ni apellido. La identidad operativa nace con `customer_id` y, de ser necesario, un alias o código interno. [cite:4]

### Regla 2. El cliente no depende del WhatsApp actual

Debe ser posible reemplazar el contacto principal sin perder el historial anterior. Las búsquedas por un número viejo deberían seguir encontrando al cliente si ese número estuvo asociado antes. [cite:3][cite:4]

### Regla 3. Correo de activación y correo del cliente son conceptos distintos

El correo usado para activar una cuenta puede pertenecer al cliente o al negocio. Esa diferencia debe quedar registrada explícitamente. [cite:3][cite:4]

### Regla 4. La renovación extiende cobertura, no solo actualiza una fecha

Una renovación debe registrar pago, cobertura y evento. No conviene simplemente editar `renewal_date` sin dejar rastro. [cite:4]

### Regla 5. Un slot no puede estar doblemente activo

Debe existir una validación que impida dos suscripciones activas sobre el mismo slot en el mismo periodo. [cite:4]

### Regla 6. Todo cambio sensible debe auditarse

Cambios en contacto principal, reasignación de cuentas, pagos y estados deben crear un evento en `events_log`. [cite:4]

## Índices y criterios de búsqueda

Para operación diaria, el panel debe responder rápido a búsquedas por WhatsApp, correo, alias, correo de activación y código de cliente. Eso exige normalización e índices específicos. [cite:4]

Índices recomendados:

- Índice en `customer_contacts.normalized_value`
- Índice en `customers.customer_code`
- Índice en `subscriptions.renewal_date`
- Índice compuesto en `subscriptions.subscription_status, renewal_date`
- Índice en `platform_accounts.account_email`
- Índice en `payments.payment_status, paid_at`

También conviene guardar versiones normalizadas de correos y teléfonos para evitar diferencias por espacios, prefijos o mayúsculas. [cite:4]

## Orden de implementación dentro de Antigravity

Como el proyecto ya existe en Google Antigravity, el plan debe ejecutarse sobre la base del proyecto actual y no como un proyecto nuevo. Antigravity permite a sus agentes planificar, ejecutar tareas y trabajar con integraciones externas mediante MCP, lo que resulta útil para diseñar y aplicar cambios en una base relacional sin salir del entorno principal. [cite:28][cite:35][cite:38]

### Etapa 1. Definición del schema

Crear o ajustar el modelo relacional con las tablas descritas, claves primarias, claves foráneas, enums y restricciones lógicas. Esta etapa debe producir migraciones versionadas. [cite:35][cite:33]

### Etapa 2. Reglas de normalización

Implementar funciones de normalización de teléfono, correo y etiquetas antes de guardar datos. Esto es especialmente importante para búsquedas confiables y deduplicación básica. [cite:4]

### Etapa 3. Motor de estados

Implementar la lógica que derive estados operativos a partir de fechas, pagos y asignaciones. Debe poder recalcular qué está libre, vencido o pendiente. [cite:4]

### Etapa 4. Auditoría

Agregar el registro de eventos para cambios críticos. La auditoría debe formar parte del flujo de escritura y no dejarse como tarea futura. [cite:4]

### Etapa 5. Migración de datos históricos

Tomar la data de Google Sheets, mapearla al nuevo modelo, limpiar campos ambiguos y separar visualización de datos reales. La migración debe transformar “LIBRE”, “VENCIDO” y “FALTA PAGO” en estados estructurados del sistema. [cite:4]

### Etapa 6. Validaciones de integridad

Antes de usar el panel en producción, verificar que no existan slots duplicados, suscripciones activas duplicadas para el mismo cupo, pagos sin suscripción asociada o contactos sin referencia válida a cliente. [cite:4]

## Esquema de migración desde Google Sheets

La migración no debe copiar la hoja tal cual. Primero hay que interpretar qué significa cada bloque visual y convertirlo en entidades separadas. [cite:4]

Transformación recomendada:

- Columna de nombre o alias → `customers.display_name`
- Teléfonos o WhatsApp → `customer_contacts`
- Correos visibles en la hoja → `subscriptions.activation_email` o `customer_contacts`, según su uso real
- Contraseña → `platform_accounts.account_password_encrypted`
- Precio pagado → `subscriptions.plan_price` o `payments.amount`
- Renovación → `subscriptions.renewal_date`
- Estado visual “LIBRE” → `account_slots.status = free`
- Estado visual “VENCIDO” → `subscriptions.subscription_status = expired`
- Estado visual “FALTA PAGO” → `subscriptions.subscription_status = pending_payment`

## Criterios de calidad del modelo

El modelo estará correctamente implementado si cumple lo siguiente:

- Se puede crear un cliente sin nombre y sin correo.
- Se puede cambiar el WhatsApp principal sin perder historial.
- Se puede buscar por número antiguo y encontrar el cliente correcto.
- Se puede registrar una activación con correo del negocio sin confundirlo con el correo del cliente.
- Se puede identificar de inmediato qué cupos están libres y cuáles tienen conflicto.
- Cada renovación queda respaldada por pago, cobertura y evento.
- Los estados operativos se calculan desde datos estructurados y no desde formato visual. [cite:3][cite:4][cite:17]

## Entregables técnicos esperados

La implementación lógica dentro del proyecto actual debería dejar como mínimo los siguientes entregables internos:

- Migraciones SQL o equivalentes del schema.
- Definición de enums y restricciones.
- Funciones o servicios de normalización.
- Reglas de cálculo de estados.
- Rutinas de auditoría.
- Script de importación desde CSV/Google Sheets.
- Dataset de prueba para validación funcional.

## Cierre técnico

La estructura adecuada para este proyecto no debe girar alrededor de una hoja editable, sino alrededor de una identidad flexible del cliente, inventario separado por plataforma y trazabilidad completa de contactos, pagos y renovaciones. Ese enfoque es el que mejor se adapta a un panel administrativo manejado desde Google Antigravity sobre una base relacional y con automatizaciones posteriores. [cite:28][cite:35][cite:4]
