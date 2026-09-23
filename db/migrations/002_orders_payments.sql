-- 002_orders_payments.sql (§7.1)
--
-- Ajustes a tablas existentes para la liquidación automática.
--
-- Las columnas que apuntan a tablas heredadas usan dominios que copian el tipo
-- real del id (bigint o uuid, según lo que traiga el volcado de Supabase). Así
-- las claves foráneas cuadran sin tener que adivinar el esquema de origen.

do $$
declare
  r record;
  id_type text;
begin
  for r in
    select * from (values
      ('mpb_customer_ref',     'customers'),
      ('mpb_account_ref',      'platform_accounts'),
      ('mpb_slot_ref',         'account_slots'),
      ('mpb_subscription_ref', 'subscriptions')
    ) as v(dom, tbl)
  loop
    if not exists (select 1 from pg_type where typname = r.dom) then
      select format_type(a.atttypid, a.atttypmod) into id_type
        from pg_attribute a
       where a.attrelid = format('public.%I', r.tbl)::regclass
         and a.attname = 'id';
      execute format('create domain %I as %s', r.dom, id_type);
    end if;
  end loop;
end $$;

-- orders: identidad, canal y trazabilidad de pago/entrega
alter table orders
  add column if not exists customer_id       mpb_customer_ref     references customers(id),
  add column if not exists sales_channel     text not null default 'web',   -- web | telegram | manual
  add column if not exists plan_id           text,
  add column if not exists amount_pen        numeric(10,2),
  add column if not exists amount_usdt       numeric(18,8),
  add column if not exists pay_currency      text,                          -- PEN | USDT
  add column if not exists account_slot_id   mpb_slot_ref         references account_slots(id) on delete set null,
  add column if not exists subscription_id   mpb_subscription_ref references subscriptions(id) on delete set null,
  add column if not exists paid_at           timestamptz,
  add column if not exists delivered_at      timestamptz,
  add column if not exists expires_at        timestamptz,
  add column if not exists delivery_attempts int not null default 0,
  add column if not exists next_delivery_at  timestamptz,
  add column if not exists last_delivery_error text,
  add column if not exists access_token      text,                          -- lectura firmada del checkout (§14.4)
  -- Renovación: el pedido extiende esta suscripción en vez de tomar un cupo nuevo.
  -- Reemplaza el viejo flujo de /api/client/renew con comprobante.
  add column if not exists renew_subscription_id mpb_subscription_ref references subscriptions(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_status_chk') then
    alter table orders add constraint orders_status_chk check (status in (
      'pending','awaiting_payment','paid','delivered','underpaid',
      'expired','failed','refunded','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_pay_currency_chk') then
    alter table orders add constraint orders_pay_currency_chk
      check (pay_currency is null or pay_currency in ('PEN','USDT'));
  end if;
end $$;

create unique index if not exists orders_order_id_uidx     on orders(order_id);
create index        if not exists orders_status_created_idx on orders(status, created_at desc);
create index        if not exists orders_customer_idx       on orders(customer_id, created_at desc);
create index        if not exists orders_delivery_retry_idx on orders(next_delivery_at) where status = 'paid';

-- account_slots: reserva temporal para no vender stock inexistente
alter table account_slots
  add column if not exists reserved_until     timestamptz,
  add column if not exists reserved_for_order text;

create index if not exists account_slots_available_idx
  on account_slots(platform_account_id, status, reserved_until);

-- payments: contabilidad real (bruto, comisión, neto, proveedor). Cada fila vive en su moneda.
alter table payments
  add column if not exists order_id        text,
  add column if not exists provider        text,   -- manual_yape | taypi | binance_account | wallet_pen | wallet_usdt | admin_manual
  add column if not exists provider_txn_id text,
  add column if not exists gross_amount    numeric(18,8),
  add column if not exists fee_amount      numeric(18,8) default 0,
  add column if not exists net_amount      numeric(18,8),
  add column if not exists sales_channel   text,
  add column if not exists confirmed_by    text;   -- 'system' o el admin que confirmó a mano

-- Un pago por transacción de proveedor: la defensa central contra el doble cobro
create unique index if not exists payments_provider_txn_uidx
  on payments(provider, provider_txn_id)
  where provider_txn_id is not null;

create index if not exists payments_order_idx on payments(order_id);

-- El comprobante deja de existir como mecanismo de confirmación
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payments' and column_name = 'proof_url') then
    alter table payments rename column proof_url to legacy_proof_url;
  end if;
end $$;

-- Código permanente del cliente para recargas USDT de monto libre, y la cuenta
-- de Binance que pagó por primera vez (binding antifraude de §12.1)
alter table customers
  add column if not exists wallet_note_code text,
  add column if not exists binance_payer_id text;

create unique index if not exists customers_wallet_note_uidx
  on customers(wallet_note_code) where wallet_note_code is not null;

-- Configuración fuera de events_log
create table if not exists settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Arrastra la última configuración de tasas que /api/admin/settings guardaba en events_log
insert into settings(key, value, updated_by)
select 'business_rates', e.new_value, 'migration'
  from events_log e
 where e.entity_type = 'admin_settings'
   and e.entity_id = 'business_rates'
   and e.new_value is not null
 order by e.id desc
 limit 1
on conflict (key) do nothing;
