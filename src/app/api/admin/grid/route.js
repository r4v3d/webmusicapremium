export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { SheetError, applySheetEdits, createTitular, inventoryChangesSince } from "../../../../lib/sheetsSync";

// Tabla editable del panel (Clientes → Tabla). Usa las mismas filas y la misma
// validación que Google Sheets, así panel y hoja siempre dicen lo mismo.

export async function GET(req) {
  if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  try {
    // ?since=<marca>: solo lo que cambió desde entonces (miles de cupos no se bajan en cada cambio).
    const since = new URL(req.url).searchParams.get("since");
    return NextResponse.json(await inventoryChangesSince(since));
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
