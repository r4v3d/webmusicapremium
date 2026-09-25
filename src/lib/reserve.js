// Reserva de cupos (§8, §15.2). Un cupo reservado no cuenta como disponible
// ni como vendido; si la reserva vence, vuelve a estar libre.
import { query } from "./pg";

/**
 * Condición SQL de "cupo vendible" sobre el alias `s` (account_slots): tiene
 * correo y clave de miembro propios. Un cupo vacío jamás se vende: lo único
 * que podría entregarse sería la cuenta titular, que administra la familia.
 */
export const SLOT_HAS_CREDENTIALS_SQL =
  "(btrim(coalesce(s.member_email, '')) <> '' and coalesce(s.member_password, '') <> '')";

/**
 * Reserva un cupo del servicio para el pedido. Si el pedido ya tiene uno
 * reservado, solo extiende la reserva. Devuelve el id del cupo o null si no hay stock.
 */
export async function reserveSlot(tx, service, orderId, ttlSeconds = 900) {
  const renewed = await tx.query(
    `update account_slots s
        set reserved_until = now() + ($3::int * interval '1 second'), updated_at = now()
       from platform_accounts pa
      where pa.id = s.platform_account_id
        and pa.platform_code = $1
        and s.status = 'reserved'
        and s.reserved_for_order = $2
        and ${SLOT_HAS_CREDENTIALS_SQL}
      returning s.id`,
    [service, orderId, ttlSeconds]
  );
  if (renewed.rows[0]) return renewed.rows[0].id;

  const res = await tx.query(
    `with candidato as (
       select s.id
         from account_slots s
         join platform_accounts pa on pa.id = s.platform_account_id
        where pa.platform_code = $1
          and (s.status = 'free' or (s.status = 'reserved' and s.reserved_until < now()))
          and ${SLOT_HAS_CREDENTIALS_SQL}
        order by s.updated_at asc, s.id asc
        limit 1
        for update of s skip locked
     )
     update account_slots s
        set status = 'reserved',
            reserved_until = now() + ($3::int * interval '1 second'),
            reserved_for_order = $2,
            updated_at = now()
       from candidato
      where s.id = candidato.id
      returning s.id`,
    [service, orderId, ttlSeconds]
  );
  return res.rows[0]?.id ?? null;
}

/** Libera la reserva de un pedido (cambió de método, se canceló). */
export async function releaseReservation(tx, orderId) {
  const res = await tx.query(
    `update account_slots
        set status = 'free', reserved_until = null, reserved_for_order = null, updated_at = now()
      where status = 'reserved' and reserved_for_order = $1
      returning id`,
    [orderId]
  );
  return res.rows.map((r) => r.id);
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
