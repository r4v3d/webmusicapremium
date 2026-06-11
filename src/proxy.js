import { NextResponse } from "next/server";

export function proxy(request) {
  const session = request.cookies.get("admin_session")?.value;
  const { pathname } = request.nextUrl;

  // Protect /admin from unauthorized access
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (session !== "authenticated") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Prevent authenticated admin from going back to login screen
  if (pathname === "/admin/login") {
    if (session === "authenticated") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match all admin routes
  matcher: ["/admin/:path*"],
};
