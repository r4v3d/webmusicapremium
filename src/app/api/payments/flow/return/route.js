import { NextResponse, after } from "next/server";
import { query } from "../../../../../lib/pg";
import { syncFlowIntentByToken } from "../../../../../lib/providerSync";
import { deliverOrder } from "../../../../../lib/delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Regreso del cliente desde Flow (urlReturn): Flow lo manda aquí por POST con
// «token». Se consulta el estado (por si la confirmación aún no llegó) y se
// lleva al cliente a su pedido, que muestra el resultado y sus credenciales.
async function handle(req) {
  let token = new URL(req.url).searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    const form = await req.formData().catch(() => null);
    token = String(form?.get("token") || "");
  }
  token = token.trim().slice(0, 200);
  const site = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
  if (!token) return NextResponse.redirect(`${site}/`, 303);

  const res = await query(
    `select i.order_id, o.access_token
       from payment_intents i join orders o on o.order_id = i.order_id
      where i.provider = 'flow_qr' and i.provider_ref = $1
      order by i.id desc limit 1`,
    [token]
  );
  const row = res.rows[0];
  try {
    const result = await syncFlowIntentByToken(token, { eventType: "return" });
    if (result.status === "settled" && result.orderId) {
      after(() => deliverOrder(result.orderId).catch((e) => console.error("deliverOrder:", e)));
    }
  } catch (error) {
    console.error("[flow] regreso:", error.message);
  }
  if (!row) return NextResponse.redirect(`${site}/`, 303);
  const t = row.access_token ? `?t=${encodeURIComponent(row.access_token)}` : "";
  return NextResponse.redirect(`${site}/checkout/${encodeURIComponent(row.order_id)}${t}`, 303);
}

export const POST = handle;
export const GET = handle;
