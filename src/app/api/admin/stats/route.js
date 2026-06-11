import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getOrders, getFamilyAccounts, getMemberProfiles } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const orders = await getOrders();
    const accounts = await getFamilyAccounts();
    const profiles = await getMemberProfiles();

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

    // Calculate stock metrics (count free slots grouped by their parent family account service)
    const activeStock = { tidal: 0, deezer: 0, qobuz: 0 };
    
    profiles.forEach(p => {
      if (p.status === "free") {
        const parent = accounts.find(acc => {
          const accId = (acc._id || acc.id).toString();
          const pAcc = p.familyAccountId;
          const pAccId = (pAcc?._id || pAcc?.id || pAcc || "").toString();
          return pAccId === accId;
        });
        if (parent && activeStock[parent.service] !== undefined) {
          activeStock[parent.service]++;
        }
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
