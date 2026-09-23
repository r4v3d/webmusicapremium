// Cerrojo 1 (§9.2): cada evento de proveedor se registra una sola vez.
// Recibir el mismo webhook cinco veces produce una fila y un único procesamiento.
import { query } from "./pg";

export async function recordEvent({ provider, eventId, eventType = null, payload, headers = null, signatureValid = false, intentId = null }) {
  const res = await query(
    `insert into payment_events(provider, event_id, event_type, signature_valid, payload, headers, intent_id)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (provider, event_id) do nothing
     returning id`,
    [provider, String(eventId), eventType, signatureValid,
     JSON.stringify(payload ?? {}), headers ? JSON.stringify(headers) : null, intentId]
  );
  if (res.rows[0]) return { duplicate: false, eventRowId: res.rows[0].id };
  const existing = await query("select id, process_result from payment_events where provider = $1 and event_id = $2", [provider, String(eventId)]);
  return { duplicate: true, eventRowId: existing.rows[0]?.id ?? null, previousResult: existing.rows[0]?.process_result ?? null };
}

export async function markEvent(eventRowId, result, { detail = null, intentId = null } = {}) {
  if (!eventRowId) return;
  await query(
    `update payment_events
        set processed_at = now(), process_result = $2, error_detail = $3,
            intent_id = coalesce($4, intent_id)
      where id = $1`,
    [eventRowId, result, detail, intentId]
  );
}

/** Registra un intento de webhook con firma inválida (no deduplica: cada uno cuenta como alerta). */
export async function recordInvalidSignature(provider, payload, headers) {
  await query(
    `insert into payment_events(provider, event_id, event_type, signature_valid, payload, headers, processed_at, process_result)
     values ($1, 'invalid:' || gen_random_uuid()::text, 'invalid_signature', false, $2, $3, now(), 'ignored')`,
    [provider, JSON.stringify({ raw: String(payload).slice(0, 4000) }), JSON.stringify(headers || {})]
  );
}
