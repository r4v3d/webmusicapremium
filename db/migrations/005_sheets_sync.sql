-- 005_sheets_sync.sql
--
-- Sincronización con Google Sheets. Cada cambio en el inventario (cupos,
-- cuentas titulares, suscripciones, clientes) deja el id del cupo afectado en
-- sheet_outbox y avisa por NOTIFY; el worker lo recoge en segundos y manda las
-- filas actualizadas a la hoja. Los triggers atrapan TODOS los caminos que
-- tocan el inventario (panel, checkout, bot, importación, la propia hoja) sin
-- tener que acordarse de cada uno en el código.

create table if not exists sheet_outbox (
  id         bigint generated always as identity primary key,
  slot_id    text        not null,
  created_at timestamptz not null default now()
);

create or replace function mpb_sheet_enqueue(p_slot_id text) returns void
language plpgsql as $$
begin
  if p_slot_id is null then return; end if;
  insert into sheet_outbox(slot_id) values (p_slot_id);
  -- NOTIFY con la misma carga en una transacción se entrega una sola vez.
  perform pg_notify('mpb_sheets', '');
end $$;

create or replace function mpb_sheet_slot_trg() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform mpb_sheet_enqueue(old.id::text);
  else
    perform mpb_sheet_enqueue(new.id::text);
  end if;
  return null;
end $$;

create or replace function mpb_sheet_account_trg() returns trigger
language plpgsql as $$
begin
  perform mpb_sheet_enqueue(s.id::text) from account_slots s where s.platform_account_id = new.id;
  return null;
end $$;

create or replace function mpb_sheet_subscription_trg() returns trigger
language plpgsql as $$
begin
  if tg_op <> 'INSERT' then perform mpb_sheet_enqueue(old.account_slot_id::text); end if;
  if tg_op <> 'DELETE' and new.account_slot_id is distinct from
     (case when tg_op = 'UPDATE' then old.account_slot_id end) then
    perform mpb_sheet_enqueue(new.account_slot_id::text);
  end if;
  return null;
end $$;

create or replace function mpb_sheet_customer_trg() returns trigger
language plpgsql as $$
begin
  perform mpb_sheet_enqueue(s.id::text) from account_slots s where s.customer_id = new.id;
  return null;
end $$;

create or replace function mpb_sheet_contact_trg() returns trigger
language plpgsql as $$
declare cid text;
begin
  cid := case when tg_op = 'DELETE' then old.customer_id::text else new.customer_id::text end;
  perform mpb_sheet_enqueue(s.id::text) from account_slots s where s.customer_id::text = cid;
  return null;
end $$;

drop trigger if exists mpb_sheet_slot on account_slots;
create trigger mpb_sheet_slot after insert or update or delete on account_slots
  for each row execute function mpb_sheet_slot_trg();

drop trigger if exists mpb_sheet_account on platform_accounts;
create trigger mpb_sheet_account after update on platform_accounts
  for each row execute function mpb_sheet_account_trg();

drop trigger if exists mpb_sheet_subscription on subscriptions;
create trigger mpb_sheet_subscription after insert or update or delete on subscriptions
  for each row execute function mpb_sheet_subscription_trg();

drop trigger if exists mpb_sheet_customer on customers;
create trigger mpb_sheet_customer after update on customers
  for each row execute function mpb_sheet_customer_trg();

drop trigger if exists mpb_sheet_contact on customer_contacts;
create trigger mpb_sheet_contact after insert or update or delete on customer_contacts
  for each row execute function mpb_sheet_contact_trg();
