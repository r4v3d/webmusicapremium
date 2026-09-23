export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { formatDatabaseError, getFreeSlotsStock, toDateStr } from "../../../../lib/db";

function isoOffset(days) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  now.setDate(now.getDate() + days);
  return toDateStr(now);
}

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const today = isoOffset(0);
    const weekPast = isoOffset(-7);
    const weekAhead = isoOffset(7);

    const [pendingOrders, manualQueue, legacyPayments, undelivered, ownerRenewals, stock, overdue, todayIncome, invalidSigs, reviewEvents] = await Promise.all([
      query(
        `select order_id, full_name, service, duration, status, created_at, count(*) over() as total
           from orders where status in ('pending','awaiting_payment','underpaid')
          order by created_at desc limit 6`
      ),
      query(
        `select i.id, i.order_id, i.purpose, i.amount_expected, i.created_at, i.status,
                coalesce(o.full_name, c.display_name) as name, count(*) over() as total
           from payment_intents i
           left join orders o on o.order_id = i.order_id
           left join customers c on c.id = i.customer_id
          where i.provider = 'manual_yape' and i.status in ('awaiting','underpaid')
          order by i.created_at asc limit 6`
      ),
      query(
        `select p.id, p.amount, p.created_at, c.display_name, count(*) over() as total
           from payments p left join customers c on c.id = p.customer_id
          where p.payment_status = 'pending'
          order by p.created_at desc limit 6`
      ),
      query(
        `select order_id, service, full_name, paid_at, assigned_account is null as no_stock, count(*) over() as total
           from orders where status = 'paid' order by paid_at asc limit 6`
      ),
      query(
        `select id, platform_code, account_email, owner_renewal_date from platform_accounts
          where owner_renewal_date between $1::date and $2::date
          order by owner_renewal_date asc limit 12`,
        [today, weekAhead]
      ),
      getFreeSlotsStock(),
      query(
        `select s.id, s.member_email, sb.renewal_date, c.display_name, pa.platform_code
           from subscriptions sb
           join account_slots s on s.id = sb.account_slot_id and s.status <> 'free'
           left join customers c on c.id = s.customer_id
           left join platform_accounts pa on pa.id = s.platform_account_id
          where sb.subscription_status in ('active','pending_payment')
            and sb.renewal_date between $1::date and $2::date`,
        [weekPast, today]
      ),
      // Cobros del día por moneda: dos cifras que nunca se suman.
      query(
        `select currency,
                count(*) filter (where order_id is not null)::int as sales,
                coalesce(sum(net_amount) filter (where order_id is not null), 0) as net,
                count(*) filter (where payment_method = 'wallet_topup')::int as topups,
                count(*) filter (where confirmed_by = 'system')::int as automatic
           from payments
          where payment_status = 'confirmed' and created_at >= date_trunc('day', now())
          group by currency`
      ),
      query("select count(*)::int as n from payment_events where signature_valid = false and received_at >= now() - interval '24 hours'"),
      query("select count(*)::int as n from payment_events where process_result in ('unmatched','mismatch','claimed_without_note','error')"),
    ]);

    const dueToday = [];
    const overdueWeek = [];
    for (const row of overdue.rows) {
      const item = {
        id: row.id,
        service: row.platform_code || "",
        memberEmail: row.member_email,
        nickname: row.display_name || "",
        renewalDate: row.renewal_date,
      };
      if (row.renewal_date === today) dueToday.push(item);
      else overdueWeek.push(item);
    }

    const total = (res) => Number(res.rows[0]?.total || 0);

    return NextResponse.json({
      pendingOrders: {
        count: total(pendingOrders),
        items: pendingOrders.rows.map((o) => ({
          orderId: o.order_id, fullName: o.full_name, service: o.service,
          duration: o.duration, status: o.status, createdAt: o.created_at,
        })),
      },
      manualQueue: {
        count: total(manualQueue),
        items: manualQueue.rows.map((i) => ({
          id: i.id, orderId: i.order_id, purpose: i.purpose, status: i.status,
          amountExpected: i.amount_expected, name: i.name || "", createdAt: i.created_at,
        })),
      },
      // Cola heredada de comprobantes (desaparece cuando se vacíe).
      pendingPayments: {
        count: total(legacyPayments),
        items: legacyPayments.rows.map((p) => ({ id: p.id, amount: p.amount, clientName: p.display_name || "Cliente", createdAt: p.created_at })),
      },
      undelivered: {
        count: total(undelivered),
        items: undelivered.rows.map((o) => ({ orderId: o.order_id, service: o.service, fullName: o.full_name, paidAt: o.paid_at, noStock: o.no_stock })),
      },
      todayIncome: Object.fromEntries(todayIncome.rows.map((r) => [r.currency, { sales: r.sales, net: Number(r.net), topups: r.topups, automatic: r.automatic }])),
      invalidSignatures24h: invalidSigs.rows[0].n,
      reconciliationPending: reviewEvents.rows[0].n,
      dueToday: { count: dueToday.length, items: dueToday.slice(0, 8) },
      overdueWeek: { count: overdueWeek.length, items: overdueWeek.slice(0, 8) },
      ownerRenewals: {
        count: ownerRenewals.rows.length,
        items: ownerRenewals.rows.map((acc) => ({
          id: acc.id, service: acc.platform_code, masterEmail: acc.account_email, ownerRenewalDate: acc.owner_renewal_date,
        })),
      },
      activeStock: stock,
    });
  } catch (error) {
    console.error("Admin today error:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}
