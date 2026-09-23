export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { formatDatabaseError } from "../../../../lib/db";
import { adminApplyEvent } from "../../../../lib/adminPayments";
import { findWalletMismatches } from "../../../../lib/wallet";
import { deliverOrder } from "../../../../lib/delivery";

// Tablero de conciliación (§15.3): sustituye la revisión de comprobantes.
export async function GET() {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

    const [openIntents, review, invalid, undelivered, ledger, mismatches] = await Promise.all([
      query(
        `select i.id, i.order_id, i.provider, i.purpose, i.status, i.currency, i.amount_expected, i.amount_received,
                i.expires_at, i.created_at, o.full_name
           from payment_intents i left join orders o on o.order_id = i.order_id
          where i.status in ('created','awaiting','underpaid')
          order by i.created_at asc limit 100`
      ),
      query(
        `select id, provider, event_id, process_result, error_detail, intent_id, received_at,
                payload->>'amount' as amount, payload->>'currency' as currency, payload->>'note' as note,
                payload->'payerInfo'->>'name' as payer_name
           from payment_events
          where process_result in ('unmatched','mismatch','claimed_without_note','error')
          order by received_at desc limit 100`
      ),
      query(
        `select id, provider, received_at, headers from payment_events
          where signature_valid = false and received_at > now() - interval '7 days'
          order by received_at desc limit 50`
      ),
      query(
        `select order_id, service, full_name, whatsapp, paid_at, delivery_attempts, last_delivery_error,
                assigned_account is null as no_stock
           from orders where status = 'paid' order by paid_at asc limit 100`
      ),
      // Dos libros por moneda, nunca sumados (§15.1). "Ventas" = pagos atados a pedido;
      // "caja" = dinero que entró por un proveedor externo (excluye compras con saldo).
      query(
        `select currency,
                coalesce(sum(net_amount) filter (where order_id is not null and payment_status = 'confirmed'), 0) as sales_net,
                coalesce(sum(fee_amount) filter (where order_id is not null and payment_status = 'confirmed'), 0) as fees,
                coalesce(sum(gross_amount) filter (where provider not like 'wallet_%' and payment_status in ('confirmed','refunded')), 0) as cash_in,
                count(*) filter (where payment_status = 'confirmed')::int as operations
           from payments
          where created_at >= date_trunc('month', now())
          group by currency`
      ),
      findWalletMismatches(),
    ]);

    return NextResponse.json({
      openIntents: openIntents.rows,
      review: review.rows,
      invalidSignatures: invalid.rows,
      undelivered: undelivered.rows,
      monthLedger: ledger.rows,
      walletMismatches: mismatches,
    });
  } catch (error) {
    console.error("Reconciliation error:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}

// Aplicar a mano una transacción USDT sin nota (runbook §22). Queda auditado.
export async function POST(req) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const { eventId, orderId } = await req.json();
    if (!eventId || !orderId) return NextResponse.json({ message: "Faltan el evento y el pedido." }, { status: 400 });
    const r = await adminApplyEvent({ eventId, orderId: String(orderId).trim().toUpperCase() });
    if (r.status === "settled" && r.orderId) after(() => deliverOrder(r.orderId).catch(() => {}));
    const messages = {
      settled: "Pago aplicado y credenciales entregadas.",
      underpaid: "Aplicado como pago parcial: el monto no cubre el pedido.",
      credited: "El pedido ya estaba pagado: el monto se abonó al saldo del cliente.",
      duplicate: "Esa transacción ya estaba aplicada.",
      needs_manual: "Pago aplicado, pero no hay stock. Importa cupos y completa la entrega.",
      already_processed: "Ese evento ya fue procesado.",
      not_found: "No se encontró el evento o el pedido.",
      invalid_payload: "El evento no es un cobro USDT válido.",
    };
    return NextResponse.json({ success: ["settled", "underpaid", "credited", "needs_manual"].includes(r.status), message: messages[r.status] || r.status });
  } catch (error) {
    console.error("Reconciliation apply error:", error);
    return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
  }
}
