import { NextResponse, after } from "next/server";
import { verifySheetsRequest, sheetsPushConfigured, sheetsSecret } from "../../../lib/sheetsAuth";
import {
  SheetError, applySheetEdits, applyTitularEdits, buildInventoryRows, buildTitularRows, createTitular,
  importSheetRows, importTitularRows, loadSheetRows, sheetServices,
} from "../../../lib/sheetsSync";
import { getFreeSlotsStock } from "../../../lib/db";
import { announceStock } from "../../../lib/telegramBot";

export const dynamic = "force-dynamic";

const REJECTED = {
  stale: "La hora del mensaje no coincide con la del servidor (más de 5 min). Reintenta.",
  bad_signature: "Firma inválida: la clave secreta del script no coincide con GOOGLE_SHEETS_SECRET del servidor.",
  replay: "Mensaje repetido: se ignoró.",
};

// Mismo anuncio de stock al canal de Telegram que la importación del panel.
function announceLater(sellableByService) {
  if (!Object.keys(sellableByService).length) return;
  after(async () => {
    const stock = await getFreeSlotsStock().catch(() => null);
    for (const [service, added] of Object.entries(sellableByService)) {
      await announceStock(service, added, stock?.[service] ?? null).catch((e) => console.error("announceStock:", e));
    }
  });
}

// Puerta única de la hoja de Google (Apps Script). Toda petición va firmada con
// GOOGLE_SHEETS_SECRET; sin firma válida no se lee ni se escribe nada.
export async function POST(req) {
  if (!sheetsSecret()) {
    return NextResponse.json(
      { ok: false, error: "La conexión con Google Sheets no está activada en el servidor (falta GOOGLE_SHEETS_SECRET)." },
      { status: 503 }
    );
  }

  const body = await req.text();
  const check = await verifySheetsRequest({
    timestamp: req.headers.get("x-mpb-timestamp"),
    signature: req.headers.get("x-mpb-signature"),
    body,
  });
  if (!check.ok) return NextResponse.json({ ok: false, error: REJECTED[check.reason] || "No autorizado." }, { status: 401 });

  let msg;
  try {
    msg = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    switch (msg.action) {
      case "ping":
        return NextResponse.json({ ok: true, servicios: sheetServices(), envioAutomatico: sheetsPushConfigured() });

      case "snapshot":
        return NextResponse.json({
          ok: true, servicios: sheetServices(), rows: await buildInventoryRows(), titulares: await buildTitularRows(),
        });

      case "edit": {
        const edits = Array.isArray(msg.edits) ? msg.edits.slice(0, 1000) : [];
        return NextResponse.json({ ok: true, ...(await applySheetEdits(edits)) });
      }

      case "titularEdit": {
        const edits = Array.isArray(msg.edits) ? msg.edits.slice(0, 1000) : [];
        return NextResponse.json({ ok: true, ...(await applyTitularEdits(edits)) });
      }

      case "titularImport": {
        const rows = Array.isArray(msg.rows) ? msg.rows.slice(0, 500) : [];
        return NextResponse.json({ ok: true, ...(await importTitularRows(rows)) });
      }

      case "addTitular": {
        try {
          return NextResponse.json({ ok: true, rows: await createTitular({ service: msg.service, email: msg.email }) });
        } catch (error) {
          if (error instanceof SheetError) return NextResponse.json({ ok: false, error: error.message });
          throw error;
        }
      }

      case "import": {
        const rows = Array.isArray(msg.rows) ? msg.rows.slice(0, 200) : [];
        const { results, rows: slotRows, sellableByService } = await importSheetRows(rows);
        announceLater(sellableByService);
        return NextResponse.json({ ok: true, results, rows: slotRows });
      }

      case "load": {
        const rows = Array.isArray(msg.rows) ? msg.rows.slice(0, 500) : [];
        const { results, sellableByService } = await loadSheetRows(rows);
        announceLater(sellableByService);
        return NextResponse.json({ ok: true, results });
      }

      default:
        return NextResponse.json({ ok: false, error: "Acción desconocida." }, { status: 400 });
    }
  } catch (error) {
    console.error("[sheets] error:", error);
    return NextResponse.json({ ok: false, error: "Error interno del servidor. Reintenta en un momento." }, { status: 500 });
  }
}
