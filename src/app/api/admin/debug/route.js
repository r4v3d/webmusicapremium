import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";

export async function GET() {
  const isAuth = await checkAdminAuth();
  if (!isAuth) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  return NextResponse.json({ message: "Endpoint de depuración deshabilitado." }, { status: 410 });
}
