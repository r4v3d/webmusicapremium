import { cookies } from "next/headers";
import { CONFIG } from "../data/config";

export async function checkAdminAuth() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("admin_session");
    return session?.value === "authenticated";
  } catch (e) {
    return false;
  }
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || CONFIG.adminPasswordDefault;
}
