import { cookies } from "next/headers";
import { safeEqual } from "./cryptoEqual";
import { isAdminSessionToken } from "./session";

export { safeEqual };

export async function checkAdminAuth() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("admin_session");
    return isAdminSessionToken(session?.value);
  } catch (e) {
    return false;
  }
}

export function getAdminPassword() {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (process.env.NODE_ENV !== "production") {
    return "admin1234";
  }
  return null;
}
