export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { formatDatabaseError, getFreeSlotsStock } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const [activeStock, counts, revenue] = await Promise.all([
      getFreeSlotsStock(),
      query(
        `select count(*)::int as total,
                count(*) filter (where status in ('pending','awaiting_payment','underpaid'))::int as pending,
                count(*) filter (where status in ('paid','delivered'))::int as paid
           from orders`
      ),
      // Dos libros que nunca se suman (§10.1): ventas confirmadas por moneda.
      query(
        `select currency, coalesce(sum(net_amount), 0) as net, coalesce(sum(gross_amount), 0) as gross
           from payments
          where payment_status = 'confirmed' and order_id is not null
          group by currency`
      ),
    ]);

    const byCurrency = Object.fromEntries(revenue.rows.map((r) => [r.currency, r]));
    return NextResponse.json({
      totalOrders: counts.rows[0].total,
      pendingOrders: counts.rows[0].pending,
      paidOrders: counts.rows[0].paid,
      totalRevenuePen: Number(byCurrency.PEN?.net || 0).toFixed(2),
      totalRevenueUsdt: Number(byCurrency.USDT?.net || 0).toFixed(2),
      // Compatibilidad con el panel anterior.
      totalRevenueUsd: Number(byCurrency.USDT?.net || 0).toFixed(2),
      activeStock,
    }, { status: 200 });
  } catch (error) {
    console.error("Fetch Stats Error:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}
