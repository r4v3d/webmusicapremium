-- 003_intents_wallet.sql (§7.2)

-- Intento de pago: un pedido puede tener varios (cambió de método, expiró el QR)
create table if not exists payment_intents (
  id                 bigserial primary key,
  order_id           text,                                  -- null en recargas de saldo
  customer_id        mpb_customer_ref references customers(id),
  purpose            text        not null default 'order',  -- order | wallet_topup | renewal
  provider           text        not null,                  -- manual_yape | taypi | binance_account | wallet_pen | wallet_usdt
  sales_channel      text        not null default 'web',
  amount_expected    numeric(18,8),                         -- null = recarga de monto libre
  amount_received    numeric(18,8) not null default 0,      -- acumulado: permite completar un pago parcial
  currency           text        not null check (currency in ('PEN','USDT')),
  status             text        not null default 'created',
  provider_ref       text,                                  -- payment_id de TAYPI
  checkout_url       text,
  qr_payload         text,
  note_code          text,                                  -- lo que el cliente escribe en "Note to Payee"
  customer_reference text,                                  -- dato de búsqueda que declara el cliente (Yape): nunca es prueba
  account_slot_id    mpb_slot_ref references account_slots(id) on delete set null,
  idempotency_key    text        not null,
  expires_at         timestamptz not null,
  paid_at            timestamptz,
  confirmed_by       text,
  alerted_at         timestamptz,                           -- aviso al admin de "nuevo por verificar"
  reminded_at        timestamptz,                           -- recordatorio a los 10 minutos
  raw_request        jsonb,
  raw_response       jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint payment_intents_status_chk check (status in (
    'created','awaiting','paid','underpaid','overpaid','expired','failed','cancelled'))
);

create unique index if not exists payment_intents_idem_uidx on payment_intents(idempotency_key);
create unique index if not exists payment_intents_provider_ref_uidx
  on payment_intents(provider, provider_ref) where provider_ref is not null;
create unique index if not exists payment_intents_note_uidx
  on payment_intents(note_code) where note_code is not null;
create index if not exists payment_intents_open_idx
  on payment_intents(status, expires_at) where status in ('created','awaiting','underpaid');
create index if not exists payment_intents_order_idx on payment_intents(order_id, created_at desc);

alter table payments
  add column if not exists intent_id bigint references payment_intents(id);

-- Bitácora cruda de webhooks y consultas: deduplicación + auditoría forense
create table if not exists payment_events (
  id              bigserial primary key,
  provider        text        not null,
  event_id        text        not null,   -- payment_id:status | transactionId
  event_type      text,
  signature_valid boolean     not null default false,
  payload         jsonb       not null,
  headers         jsonb,
  intent_id       bigint      references payment_intents(id),
  processed_at    timestamptz,
  process_result  text,                   -- settled | duplicate | mismatch | ignored | error | underpaid | credited
  error_detail    text,
  received_at     timestamptz not null default now()
);

create unique index if not exists payment_events_uidx on payment_events(provider, event_id);
create index if not exists payment_events_payload_gin on payment_events using gin (payload);
create index if not exists payment_events_result_idx on payment_events(process_result, received_at desc);

-- Transacciones de proveedor ya consumidas: impide reutilizar un Order ID de Binance
create table if not exists consumed_provider_txns (
  provider    text        not null,
  txn_id      text        not null,
  intent_id   bigint      references payment_intents(id),
  customer_id mpb_customer_ref references customers(id),
  amount      numeric(18,8),
  currency    text,
  consumed_at timestamptz not null default now(),
  primary key (provider, txn_id)
);

-- Entregas: qué credencial se entregó, a quién, por dónde y cuándo
create table if not exists deliveries (
  id              bigserial primary key,
  order_id        text        not null,
  customer_id     mpb_customer_ref     references customers(id),
  account_slot_id mpb_slot_ref         references account_slots(id) on delete set null,
  subscription_id mpb_subscription_ref references subscriptions(id) on delete set null,
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
  customer_id mpb_customer_ref not null references customers(id),
  currency    text        not null check (currency in ('PEN','USDT')),
  balance     numeric(18,8) not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now(),
  primary key (customer_id, currency)
);

create table if not exists wallet_ledger (
  id            bigserial primary key,
  customer_id   mpb_customer_ref not null references customers(id),
  currency      text        not null check (currency in ('PEN','USDT')),
  direction     text        not null check (direction in ('credit','debit')),
  amount        numeric(18,8) not null check (amount > 0),
  balance_after numeric(18,8) not null,
  reason        text        not null,   -- topup | purchase | refund | adjustment | overpay
  ref_type      text,                   -- order | intent | admin | provider_txn
  ref_id        text,
  created_by    text        not null default 'system',
  created_at    timestamptz not null default now()
);

create index if not exists wallet_ledger_customer_idx
  on wallet_ledger(customer_id, currency, created_at desc);

-- Límite de tasa persistido (reemplaza el Map en memoria)
create table if not exists rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         int         not null default 1,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_gc_idx on rate_limits(window_start);
