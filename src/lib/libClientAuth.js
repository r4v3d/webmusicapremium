import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE_MAX_AGE,
  isCustomerSessionPayload,
  signToken,
  verifyToken,
} from "./session";
import { hashOtp, hashPin, otpCodesMatch, verifyPin } from "./pinOtp";

export { hashOtp, hashPin, otpCodesMatch, verifyPin };

export async function setCustomerSession(customerId) {
  try {
    const token = await signToken({ customerId, timestamp: Date.now() });
    const cookieStore = await cookies();
    cookieStore.set("customer_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: CUSTOMER_COOKIE_MAX_AGE,
      path: "/",
    });
  } catch (e) {
    console.error("Error setting customer session cookie:", e);
  }
}

export async function getCustomerSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("customer_session");
    if (!sessionCookie || !sessionCookie.value) return null;

    const payload = await verifyToken(sessionCookie.value);
    if (!isCustomerSessionPayload(payload)) return null;
    return payload.customerId;
  } catch (e) {
    console.error("Error reading customer session cookie:", e);
    return null;
  }
}

export async function clearCustomerSession() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("customer_session");
  } catch (e) {
    console.error("Error clearing customer session cookie:", e);
  }
}
