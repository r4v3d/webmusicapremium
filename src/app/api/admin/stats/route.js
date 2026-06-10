import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getOrders, getStock } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const orders = await getOrders();
    const stock = await getStock();

    // Calculate order metrics
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === "pending").length;
    const paidOrdersList = orders.filter(o => o.status === "paid");
    const paidOrders = paidOrdersList.length;

    // Helper to extract numeric value from price strings (e.g. "S/. 22.00" -> 22)
    const parsePrice = (priceStr) => {
      if (!priceStr) return 0;
      const numStr = priceStr.replace(/[^0-9.]/g, "");
      const val = parseFloat(numStr);
      return isNaN(val) ? 0 : val;
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

    // Calculate stock metrics (count unused accounts by service)
    const activeStock = {
      tidal: stock.filter(item => item.service === "tidal" && !item.isUsed).length,
      deezer: stock.filter(item => item.service === "deezer" && !item.isUsed).length,
      qobuz: stock.filter(item => item.service === "qobuz" && !item.isUsed).length
    };

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
    return NextResponse.json({ message: "Error interno al cargar estadísticas." }, { status: 500 });
  }
}
