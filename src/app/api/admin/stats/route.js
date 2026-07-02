export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { supabase, getFamilyAccounts, getFreeSlotsStock } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const accounts = await getFamilyAccounts();
    const activeStock = await getFreeSlotsStock();

    // Calculate order metrics using fast count queries
    const { count: totalOrders, error: errTotal } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });
    if (errTotal) throw errTotal;

    const { count: pendingOrders, error: errPending } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    if (errPending) throw errPending;

    const { data: paidOrdersList, error: errPaid } = await supabase
      .from("orders")
      .select("price_pen, price_usd, payment_method")
      .eq("status", "paid");
    if (errPaid) throw errPaid;

    const paidOrders = paidOrdersList ? paidOrdersList.length : 0;

    // Helper to extract numeric value from price strings (e.g. "S/. 22.00" -> 22)
    const parsePrice = (priceStr) => {
      if (!priceStr) return 0;
      const match = priceStr.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : 0;
    };

    let totalRevenuePen = 0;
    let totalRevenueUsd = 0;

    if (paidOrdersList) {
      paidOrdersList.forEach(o => {
        if (o.payment_method === "binance_pay") {
          totalRevenueUsd += parsePrice(o.price_usd);
        } else {
          totalRevenuePen += parsePrice(o.price_pen);
        }
      });
    }

    return NextResponse.json({
      totalOrders,
      pendingOrders,
      paidOrders,
      totalRevenuePen: totalRevenuePen.toFixed(2),
      totalRevenueUsd: totalRevenueUsd.toFixed(2),
      activeStock
    }, { status: 200 });

  } catch (error) {
    console.error("Fetch Stats Error:", error);
    return NextResponse.json({ message: `Error de base de datos: ${error.message}` }, { status: 500 });
  }
}
