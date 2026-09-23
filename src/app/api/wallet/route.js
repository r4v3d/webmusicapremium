import { NextResponse } from "next/server";
import { getCustomerSession } from "../../../lib/libClientAuth";
import { ensureWalletNoteCode, getBalances, getLedger } from "../../../lib/wallet";
import { walletEnabled, availableProviders } from "../../../lib/providers";
import { intentUi } from "../../../lib/paymentIntents";
import { query } from "../../../lib/pg";
import { CONFIG } from "../../../data/config";

export const dynamic = "force-dynamic";

// Saldos del cliente en soles y USDT, por separado y sin conversión (§13).
export async function GET() {
  try {
    const customerId = await getCustomerSession();
    if (!customerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!walletEnabled()) return NextResponse.json({ enabled: false });

    const [balances, ledger, noteCode, pending] = await Promise.all([
      getBalances(customerId),
      getLedger(customerId, { limit: 30 }),
      ensureWalletNoteCode(customerId),
      query(
        `select * from payment_intents
          where customer_id = $1 and purpose = 'wallet_topup' and status in ('awaiting','created','underpaid')
            and created_at > now() - interval '2 days'
          order by id desc limit 5`,
        [customerId]
      ),
    ]);

    return NextResponse.json({
      enabled: true,
      balances,
      ledger,
      topupPen: {
        providers: availableProviders("PEN").filter((p) => p.ui !== "wallet").map((p) => ({ id: p.id, label: p.label, ui: p.ui })),
        pending: pending.rows.map((i) => intentUi(i)),
      },
      topupUsdt: {
        noteCode,
        payId: process.env.BINANCE_PAY_ID || CONFIG.payments.binancePay.payId,
        nickname: process.env.BINANCE_PAY_NICKNAME || CONFIG.payments.binancePay.nickname,
        qrImage: CONFIG.payments.binancePay.qrImage,
      },
    });
  } catch (error) {
    console.error("Wallet GET error:", error);
    return NextResponse.json({ error: "No se pudo cargar tu saldo." }, { status: 500 });
  }
}
