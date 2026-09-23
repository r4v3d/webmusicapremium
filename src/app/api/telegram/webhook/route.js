import { safeEqual } from "../../../../lib/cryptoEqual";
import { handleTelegramUpdate } from "../../../../lib/telegramBot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Adaptador del bot (§17). Telegram firma con el header secreto que se fijó en
// setWebhook: sin él, la petición no viene de Telegram.
export async function POST(req) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !header || !safeEqual(header, secret)) {
    return Response.json({ ok: false }, { status: 403 });
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return Response.json({ ok: true });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    // 200 igual: un error nuestro no debe hacer que Telegram reintente en bucle.
    console.error("[telegram] error procesando update:", error);
  }
  return Response.json({ ok: true });
}
