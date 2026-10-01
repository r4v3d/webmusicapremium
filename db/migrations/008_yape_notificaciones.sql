-- 008_yape_notificaciones.sql
--
-- Yape directo al número del negocio, validado con las notificaciones que llegan
-- al celular (una app del teléfono las reenvía al servidor). Sin comisiones.
--
-- 1. yape_notifications: cada notificación de «te envió un pago» recibida.
--    dedupe_key evita guardar dos veces el mismo aviso (reintentos del teléfono).
--    Una notificación paga como máximo un intento (intent_id + consumed_provider_txns).
-- 2. payment_intents.payer_code: código de seguridad de 3 dígitos que el cliente
--    copia de su constancia de Yape. Sirve para desempatar y para la revisión manual.
-- 3. yape_device: última señal del teléfono, para avisar si deja de reportar.

create table if not exists yape_notifications (
  id            bigserial   primary key,
  dedupe_key    text        not null,
  content_key   text        not null,             -- monto + nombre + código: detecta el mismo pago reenviado más tarde
  title         text,
  body          text        not null,
  sender_name   text,
  amount        numeric(12,2),
  security_code text,
  device_at     timestamptz,                      -- hora que informa el teléfono (si la manda)
  received_at   timestamptz not null default now(),
  status        text        not null default 'unmatched',
  intent_id     bigint      references payment_intents(id),
  resolved_by   text,
  resolved_at   timestamptz,
  note          text,
  alerted_at    timestamptz,
  constraint yape_notifications_status_chk check (status in (
    'unmatched',   -- llegó y aún no se asigna
    'matched',     -- pagó un intento
    'review',      -- espera decisión del admin
    'duplicate',   -- el mismo aviso repetido: no paga nada
    'ignored',     -- no es un pago (publicidad, otro tipo de aviso) o el admin lo descartó
    'unparsed'     -- parece un pago pero no se pudo leer el monto
  ))
);

create unique index if not exists yape_notifications_dedupe_uidx on yape_notifications(dedupe_key);
create index if not exists yape_notifications_intent_idx on yape_notifications(intent_id) where intent_id is not null;
create index if not exists yape_notifications_open_idx on yape_notifications(amount, received_at) where status in ('unmatched','review');
create index if not exists yape_notifications_content_idx on yape_notifications(content_key, received_at);

alter table payment_intents add column if not exists payer_code text;
alter table payment_intents add column if not exists payer_claimed_at timestamptz;
alter table payment_intents add column if not exists review_sent_at timestamptz;

-- Un monto exacto pendiente por intento abierto de Yape directo: así cada
-- notificación apunta a un solo pedido. Se valida también en el código.
create index if not exists payment_intents_yape_amount_idx
  on payment_intents(amount_expected, created_at) where provider = 'yape_notify';

create table if not exists yape_device (
  id            int         primary key default 1 check (id = 1),
  last_seen_at  timestamptz,
  last_alert_at timestamptz
);
insert into yape_device(id) values (1) on conflict do nothing;
