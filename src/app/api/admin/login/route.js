import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminPassword, safeEqual } from "../../../../lib/auth";
import { getClientKey, rateLimit, rateLimitedJson } from "../../../../lib/rateLimit";
import { ADMIN_COOKIE_MAX_AGE, signToken } from "../../../../lib/session";

export async function POST(req) {
  try {
    const limited = rateLimit(getClientKey(req, "admin-login"), { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      return rateLimitedJson(limited.retryAfterMs, "Demasiados intentos de acceso al panel. Espera unos minutos.");
    }

    const { password } = await req.json();
    const correctPassword = getAdminPassword();

    if (!correctPassword) {
      return NextResponse.json(
        { success: false, message: "ADMIN_PASSWORD no está configurada en el servidor." },
        { status: 500 }
      );
    }

    if (password && safeEqual(password, correctPassword)) {
      const token = await signToken({ role: "admin", timestamp: Date.now() });
      const cookieStore = await cookies();
      cookieStore.set("admin_session", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ADMIN_COOKIE_MAX_AGE,
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
