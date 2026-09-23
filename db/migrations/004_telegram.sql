-- 004_telegram.sql (§17)

-- Estado conversacional del bot por chat: qué espera el bot del usuario
-- (un Order ID de Binance, el número para vincular, el OTP...).
create table if not exists telegram_chats (
  chat_id     bigint      primary key,
  user_id     bigint      not null,
  customer_id mpb_customer_ref references customers(id),
  username    text,
  state       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists telegram_chats_customer_idx on telegram_chats(customer_id);
