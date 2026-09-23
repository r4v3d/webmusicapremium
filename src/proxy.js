import { NextResponse } from "next/server";
import { isAdminSessionToken } from "./lib/session";

export async function proxy(request) {
  const session = request.cookies.get("admin_session")?.value;
  const { pathname } = request.nextUrl;
  let isAdmin = false;
  try {
    isAdmin = await isAdminSessionToken(session);
  } catch (e) {
    isAdmin = false;
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (pathname === "/admin/login") {
    if (isAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
