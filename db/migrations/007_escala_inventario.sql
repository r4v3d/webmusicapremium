-- 007_escala_inventario.sql
--
-- Pensado para miles de cupos:
--
-- 1. sheet_outbox ya no se vacía al enviar a Google Sheets: cada cambio queda
--    marcado con pushed_at y se borra a las 2 horas. Así la tabla del panel
--    puede pedir «qué cambió desde X» y bajar solo esas filas, en vez de todo
--    el inventario en cada cambio.
-- 2. Índices para buscar titulares y correos de clientes sin distinguir
--    mayúsculas (la sincronización completa de la hoja busca por correo).

alter table sheet_outbox add column if not exists pushed_at timestamptz;

create index if not exists sheet_outbox_pending_idx on sheet_outbox(id) where pushed_at is null;
create index if not exists sheet_outbox_pushed_idx on sheet_outbox(pushed_at) where pushed_at is not null;

create index if not exists platform_accounts_email_lower_idx on platform_accounts(lower(account_email));
create index if not exists account_slots_member_lower_idx on account_slots(lower(member_email)) where member_email <> '';
