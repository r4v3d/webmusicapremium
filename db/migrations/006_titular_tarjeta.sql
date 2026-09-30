-- 006_titular_tarjeta.sql
--
-- Tarjeta con la que se paga la renovación de cada cuenta titular (p. ej. los
-- últimos 4 dígitos, «4642»). Texto libre: puede empezar con 0.
-- El trigger mpb_sheet_account de 005 ya encola los cupos de la cuenta al
-- actualizarla, así que la tarjeta llega sola a Google Sheets.

alter table platform_accounts add column if not exists renewal_card text not null default '';
