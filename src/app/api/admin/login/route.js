import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminPassword } from "../../../../lib/auth";

export async function POST(req) {
  try {
    const { password } = await req.json();
    const correctPassword = getAdminPassword();

    if (password === correctPassword) {
      const cookieStore = await cookies();
      cookieStore.set("admin_session", "authenticated", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 1 day
      });

      return NextResponse.json({ success: true, message: "Inicio de sesión exitoso." }, { status: 200 });
    }

    return NextResponse.json({ success: false, message: "Contraseña incorrecta." }, { status: 401 });
  } catch (error) {
    console.error("Admin Login Error:", error);
    return NextResponse.json({ message: "Error interno del servidor." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("admin_session");
    return NextResponse.json({ success: true, message: "Sesión cerrada." }, { status: 200 });
  } catch (error) {
    console.error("Admin Logout Error:", error);
    return NextResponse.json({ message: "Error al cerrar sesión." }, { status: 500 });
  }
}
