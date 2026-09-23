export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { listManualQueue } from "../../../../../lib/adminPayments";
import { formatDatabaseError } from "../../../../../lib/db";

// Cola "Por verificar" (§11.1): pagos Yape/Plin a confirmar contra tu app.
export async function GET() {
  try {
    if (!(await checkAdminAuth())) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    return NextResponse.json({ items: await listManualQueue() });
  } catch (error) {
    console.error("Manual queue error:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}
