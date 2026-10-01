import { after } from "next/server";
import { syncFlowIntentByToken } from "../../../../lib/providerSync";
import { deliverOrder } from "../../../../lib/delivery";
import { getProvider } from "../../../../lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Confirmación de Flow (urlConfirmation): llega un POST con «token». El aviso
// no se cree: con ese token se consulta payment/getStatus firmado y se liquida
// según lo que diga Flow. Flow espera un 200 en menos de 15 segundos.
export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "").trim();
  if (!token || token.length > 200) return Response.json({ error: "missing_token" }, { status: 400 });
  if (!getProvider("flow_qr")?.enabled) return Response.json({ received: true, ignored: "disabled" });

  try {
    const result = await syncFlowIntentByToken(token, { eventType: "confirmation" });
    if (result.status === "settled" && result.orderId) {
      after(() => deliverOrder(result.orderId).catch((e) => console.error("deliverOrder:", e)));
    }
    return Response.json({ received: true });
  } catch (error) {
    // 500: Flow reintenta (y la consulta de respaldo del worker también lo cubre).
    console.error("[flow] confirmación:", error.message);
    return Response.json({ error: "temporary" }, { status: 500 });
  }
}
