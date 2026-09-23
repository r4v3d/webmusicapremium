import { NextResponse } from "next/server";
import { authorizeCheckout } from "../../../../../lib/checkoutView";
import { getIntentById, intentUi } from "../../../../../lib/paymentIntents";
import { rateLimitDb } from "../../../../../lib/rateLimitDb";
import { getClientKey, rateLimitedJson } from "../../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Estado del intento para el polling del checkout (§11.6).
export async function GET(req, { params }) {
  try {
    const limited = await rateLimitDb(getClientKey(req, "intent-read"), { limit: 240, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) return rateLimitedJson(limited.retryAfterMs);

    const { id } = await params;
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
