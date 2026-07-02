export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getOrders, getFamilyAccounts, getFreeSlotsStock } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const orders = await getOrders();
    const accounts = await getFamilyAccounts();
    const activeStock = await getFreeSlotsStock();

    // Calculate order metrics
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === "pending").length;
    const paidOrdersList = orders.filter(o => o.status === "paid");
    const paidOrders = paidOrdersList.length;

    // Helper to extract numeric value from price strings (e.g. "S/. 22.00" -> 22)
    const parsePrice = (priceStr) => {
      if (!priceStr) return 0;
      const match = priceStr.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : 0;
    };

    let totalRevenuePen = 0;
    let totalRevenueUsd = 0;

    paidOrdersList.forEach(o => {
      if (o.paymentMethod === "binance_pay") {
        totalRevenueUsd += parsePrice(o.priceUsd);
      } else {
        totalRevenuePen += parsePrice(o.pricePen);
      }
    });

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
