export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/pg";
import { logEvent } from "../../../../lib/db";
import { checkAdminAuth } from "../../../../lib/auth";
import { computeExtendedRenewalDate } from "../../../../lib/renewal";

// GET: libro de pagos. Los automáticos llegan 'confirmed'; los 'pending' que
// quedan son reportes con comprobante del sistema anterior (cola heredada).
export async function GET() {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { rows } = await query(
      `select p.*, c.display_name, c.customer_code,
              sb.platform_code, sb.plan_price, sb.renewal_date, o.service as order_service
         from payments p
         left join customers c on c.id = p.customer_id
         left join subscriptions sb on sb.id = p.subscription_id
         left join orders o on o.order_id = p.order_id
        order by p.created_at desc
        limit 300`
    );

    const payments = rows.map((p) => ({
      id: p.id,
      customerId: p.customer_id,
      clientName: p.display_name || "Cliente Desconocido",
      clientCode: p.customer_code || "",
      subscriptionId: p.subscription_id,
      orderId: p.order_id,
      service: p.platform_code || p.order_service || "",
      planPrice: Number(p.plan_price) || 0,
      currentRenewalDate: p.renewal_date || "",
      amount: Number(p.gross_amount ?? p.amount) || 0,
      currency: p.currency || "PEN",
      fee: Number(p.fee_amount) || 0,
      net: Number(p.net_amount ?? p.amount) || 0,
      provider: p.provider || null,
      providerTxnId: p.provider_txn_id || null,
      confirmedBy: p.confirmed_by || null,
      salesChannel: p.sales_channel || null,
      paymentMethod: p.payment_method,
      status: p.payment_status,
      legacyProofUrl: p.legacy_proof_url || null,
      notes: p.notes,
      createdAt: p.created_at,
      verifiedAt: p.verified_at,
      isLegacy: !p.provider,
    }));

    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error("Admin list payments error:", error);
    return NextResponse.json({ error: "Error al listar pagos" }, { status: 500 });
  }
}

// POST: aprobar o rechazar un reporte heredado (con comprobante). Los pagos
// nuevos nunca pasan por aquí: se confirman en "Por verificar".
export async function POST(req) {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { paymentId, action, notes, monthsToAdd = 1 } = await req.json();
    if (!paymentId || !["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "Datos incompletos o acción inválida" }, { status: 400 });
    }

    const outcome = await withTransaction(async (tx) => {
      const pRes = await tx.query("select * from payments where id = $1 for update", [paymentId]);
      const payment = pRes.rows[0];
      if (!payment) return { status: 404, body: { error: "Pago no encontrado" } };
      if (payment.payment_status !== "pending") return { status: 409, body: { error: "Este pago ya fue procesado." } };

      const sRes = await tx.query("select * from subscriptions where id = $1 for update", [payment.subscription_id]);
      const sub = sRes.rows[0];
      if (!sub) return { status: 404, body: { error: "Suscripción asociada no encontrada" } };

      const todayStr = new Date().toISOString().substring(0, 10);

      if (action === "confirm") {
        const newRenewalDateStr = computeExtendedRenewalDate(sub.renewal_date, monthsToAdd);
        await tx.query(
          "update subscriptions set subscription_status = 'active', renewal_date = $2::date, updated_at = now() where id = $1",
          [sub.id, newRenewalDateStr]
        );
        if (sub.account_slot_id) {
          await tx.query("update account_slots set status = 'active', updated_at = now() where id = $1", [sub.account_slot_id]);
        }
        await tx.query(
          `update payments
              set payment_status = 'confirmed', verified_at = now(), coverage_from = $2::date, coverage_to = $3::date,
                  provider = coalesce(provider, 'admin_manual'), confirmed_by = 'admin',
                  gross_amount = coalesce(gross_amount, amount), fee_amount = coalesce(fee_amount, 0),
                  net_amount = coalesce(net_amount, amount)
            where id = $1`,
          [paymentId, sub.renewal_date || todayStr, newRenewalDateStr]
        );
        await logEvent("subscription", sub.id, "renew",
          { status: sub.subscription_status, renewal_date: sub.renewal_date },
          { status: "active", renewal_date: newRenewalDateStr },
          `Payment approved by admin. Extended by ${monthsToAdd} month(s).`, { tx });
        return { status: 200, body: { success: true, message: `Pago confirmado y suscripción extendida hasta el ${newRenewalDateStr}.`, newRenewalDate: newRenewalDateStr } };
      }

      const isExpired = sub.renewal_date ? sub.renewal_date < todayStr : true;
      const revertedStatus = isExpired ? "expired" : "active";
      await tx.query("update subscriptions set subscription_status = $2, updated_at = now() where id = $1", [sub.id, revertedStatus]);
      const finalNotes = notes
        ? `${payment.notes || ""}\n[RECHAZADO]: ${notes}`
        : `${payment.notes || ""}\n[RECHAZADO por el administrador]`;
      await tx.query("update payments set payment_status = 'rejected', notes = $2, verified_at = now() where id = $1", [paymentId, finalNotes]);
      await logEvent("subscription", sub.id, "reject_payment",
        { status: sub.subscription_status }, { status: revertedStatus },
        `Payment rejected by admin. Reason: ${notes || "No especificado"}`, { tx });
      return { status: 200, body: { success: true, message: "Pago rechazado. La suscripción ha regresado a su estado anterior." } };
    });

    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Admin process payment error:", error);
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 500 });
  }
}
