import { NextResponse } from "next/server";
import { clearCustomerSession } from "../../../../../lib/libClientAuth";

export async function POST() {
  try {
    await clearCustomerSession();
    return NextResponse.json({ success: true, message: "Sesión cerrada correctamente" });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
