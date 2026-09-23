export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query, withTransaction } from "../../../../lib/pg";
import { formatDatabaseError, logEvent } from "../../../../lib/db";
import { credit, debit, getLedger } from "../../../../lib/wallet";

// Pestaña Saldos (§15.3): saldo por cliente en ambas monedas, historial y ajuste auditado.
export async function GET(req) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const customerId = new URL(req.url).searchParams.get("customerId");

    if (customerId) {
      return NextResponse.json({ ledger: await getLedger(customerId, { limit: 100 }) });
    }

    const { rows } = await query(
      `select c.id, c.display_name, c.customer_code, c.wallet_note_code,
              coalesce(max(w.balance) filter (where w.currency = 'PEN'), 0)  as pen,
              coalesce(max(w.balance) filter (where w.currency = 'USDT'), 0) as usdt,
              max(w.updated_at) as updated_at
         from wallet_accounts w join customers c on c.id = w.customer_id
        group by c.id
        order by max(w.updated_at) desc
        limit 300`
    );
    const totals = await query("select currency, coalesce(sum(balance), 0) as total from wallet_accounts group by currency");
    return NextResponse.json({
      wallets: rows.map((r) => ({
        customerId: r.id, name: r.display_name || "", code: r.customer_code || "",
        walletNoteCode: r.wallet_note_code, pen: Number(r.pen), usdt: Number(r.usdt), updatedAt: r.updated_at,
      })),
      // Pasivo con clientes por moneda (saldo que deben poder gastar).
      totals: Object.fromEntries(totals.rows.map((t) => [t.currency, Number(t.total)])),
    });
  } catch (error) {
    console.error("Admin wallets error:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}

// Ajuste manual: siempre con motivo, siempre en wallet_ledger y events_log.
export async function POST(req) {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    const { customerId, currency, amount, direction, reason } = await req.json();
    const monto = Number(amount);
    if (!customerId || !["PEN", "USDT"].includes(currency) || !(monto > 0) || !["credit", "debit"].includes(direction)) {
      return NextResponse.json({ message: "Datos del ajuste inválidos." }, { status: 400 });
    }
    if (!reason || String(reason).trim().length < 4) {
      return NextResponse.json({ message: "El ajuste necesita un motivo." }, { status: 400 });
    }

    const balanceAfter = await withTransaction(async (tx) => {
      const fn = direction === "credit" ? credit : debit;
      const after = await fn(tx, { customerId, currency, amount: monto, reason: "adjustment", refType: "admin", refId: String(reason).slice(0, 120), createdBy: "admin" });
      await logEvent("customer", customerId, "wallet_adjustment", null, { currency, amount: monto, direction, balanceAfter: after }, String(reason).slice(0, 200), { tx });
      return after;
    });
    return NextResponse.json({ success: true, balanceAfter });
  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ message: `El saldo no alcanza para ese débito (saldo actual: ${error.balance}).` }, { status: 409 });
    }
    console.error("Admin wallet adjust error:", error);
    return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
  }
}
