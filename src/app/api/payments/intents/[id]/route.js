import { NextResponse } from "next/server";
import { authorizeCheckout } from "../../../../../lib/checkoutView";
import { getIntentById, intentUi } from "../../../../../lib/paymentIntents";
import { LIMITS, rateLimitAll } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Estado del intento para el polling del checkout (§11.6).
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const limited = await rateLimitAll([
      [getClientKey(req, "intent-read"), LIMITS.intentReadIp],
      [`intent-read:${String(id).slice(0, 20)}`, LIMITS.intentReadPerIntent],
    ]);
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const intent = await getIntentById(id);
    if (!intent?.order_id) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

    const token = new URL(req.url).searchParams.get("t");
    const auth = await authorizeCheckout(intent.order_id, token);
    if (!auth.ok) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

    return NextResponse.json({ intent: intentUi(intent, auth.order), orderStatus: auth.order.status });
  } catch (error) {
    console.error("Intent read error:", error);
    return NextResponse.json({ message: "Error interno." }, { status: 500 });
  }
}
