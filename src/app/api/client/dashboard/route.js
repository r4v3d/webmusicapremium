import { NextResponse } from "next/server";
import { query } from "../../../../lib/pg";
import { getClientById } from "../../../../lib/db";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { resolveSlotCredentials } from "../../../../lib/credentials";
import { CONFIG } from "../../../../data/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const client = await getClientById(customerId);
    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const { rows: subscriptions } = await query(
      `select sb.*,
              to_json(pa) as platform_account,
              to_json(s)  as slot,
              (select json_build_object('order_id', o.order_id, 'access_token', o.access_token, 'status', o.status)
                 from orders o
                where o.renew_subscription_id = sb.id and o.status in ('pending','awaiting_payment','underpaid')
                order by o.created_at desc limit 1) as open_renewal
         from subscriptions sb
         left join platform_accounts pa on pa.id = sb.platform_account_id
         left join account_slots s on s.id = sb.account_slot_id
        where sb.customer_id = $1
        order by sb.renewal_date asc nulls last`,
      [customerId]
    );

    const activeSubscriptions = [];
    const expiredSubscriptions = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sub of subscriptions) {
      let daysRemaining = 0;
      let isExpired = true;
      if (sub.renewal_date) {
        const renewal = new Date(`${sub.renewal_date}T23:59:59`);
        daysRemaining = Math.ceil((renewal - today) / (1000 * 60 * 60 * 24));
        isExpired = daysRemaining < 0;
      }

      const slot = sub.slot;
      const account = sub.platform_account;
      let credentials = { email: sub.activation_email || "", password: "" };
      let profileLabel = "Sin asignar";
      // Un cupo reasignado a otro cliente no debe mostrar credenciales ajenas.
      if (slot && String(slot.customer_id) === String(customerId)) {
        credentials = resolveSlotCredentials(slot, account);
        profileLabel = slot.slot_label || `Perfil ${slot.slot_number || ""}`.trim();
      }
      // Sin cupo propio no se muestra nada: los datos del titular nunca se entregan.
      const live = !isExpired && !["expired", "cancelled"].includes(sub.subscription_status);

      const formatted = {
        id: sub.id,
        service: sub.platform_code || "tidal",
        serviceName: CONFIG.services[sub.platform_code]?.name || (sub.platform_code || "Tidal").toUpperCase(),
        email: live ? credentials.email : "",
        password: live ? credentials.password : "",
        profile: profileLabel,
        pricePen: Number(sub.plan_price) || 0,
        currency: sub.currency || "PEN",
        renewalDate: sub.renewal_date,
        daysRemaining: isExpired ? 0 : daysRemaining,
        status: sub.subscription_status,
        openRenewal: sub.open_renewal
          ? { orderId: sub.open_renewal.order_id, checkoutUrl: `/checkout/${sub.open_renewal.order_id}?t=${sub.open_renewal.access_token}` }
          : null,
      };
      (live ? activeSubscriptions : expiredSubscriptions).push(formatted);
    }

    const { rows: paymentHistory } = await query(
      `select id, gross_amount as amount, currency, provider, payment_method, payment_status, order_id, created_at, notes
         from payments where customer_id = $1
        order by created_at desc limit 10`,
      [customerId]
    );

    return NextResponse.json({
      success: true,
      client: {
        id: client.id,
        nickname: client.nickname || "Cliente",
        phone: client.currentWhatsApp,
        email: client.usedEmails[0] || "",
      },
      activeSubscriptions,
      expiredSubscriptions,
      payments: paymentHistory,
      plans: Object.fromEntries(Object.entries(CONFIG.services).map(([code, s]) => [code, s.plans])),
    });
  } catch (error) {
    console.error("Fetch dashboard data error:", error);
    return NextResponse.json({ error: "Error al cargar la información del panel" }, { status: 500 });
  }
}
