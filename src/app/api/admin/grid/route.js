export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { SheetError, applySheetEdits, buildInventoryRows, createTitular } from "../../../../lib/sheetsSync";

// Tabla editable del panel (Clientes → Tabla). Usa las mismas filas y la misma
// validación que Google Sheets, así panel y hoja siempre dicen lo mismo.

/**
 * Marca de cambios: cada cambio del inventario deja una fila en sheet_outbox
 * (triggers de 005_sheets_sync.sql). La secuencia solo avanza, aunque el
 * worker vacíe la cola, así que sirve para saber si hay algo nuevo.
 */
async function currentStamp() {
  const { rows } = await query("select last_value::text as v from sheet_outbox_id_seq");
  return rows[0]?.v || "0";
}

export async function GET(req) {
  if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  try {
    const stamp = await currentStamp();
    const known = new URL(req.url).searchParams.get("stamp");
    if (known && known === stamp) return NextResponse.json({ stamp, unchanged: true });
    return NextResponse.json({ stamp, rows: await buildInventoryRows() });
  } catch (error) {
    console.error("[grid] GET:", error);
    return NextResponse.json({ message: "No se pudo cargar la tabla." }, { status: 500 });
  }
}

export async function POST(req) {
  if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    if (body.action === "addTitular") {
      const rows = await createTitular({ service: body.service, email: body.email, password: body.password });
      return NextResponse.json({ rows });
    }
    const edits = Array.isArray(body.edits) ? body.edits.slice(0, 1000) : [];
    return NextResponse.json(await applySheetEdits(edits));
  } catch (error) {
    if (error instanceof SheetError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("[grid] POST:", error);
    return NextResponse.json({ message: "Error interno al guardar. Reintenta." }, { status: 500 });
  }
}
