export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { formatDatabaseError, logEvent } from "../../../../lib/db";

// Tasas para valorizar el COSTO de renovar cuentas maestras (§10.1). No tienen
// relación con precios de venta ni pagos. Viven en `settings`, no en events_log.
const KEY = "business_rates";

function normalizePayload(raw = {}) {
  const platformCosts = raw.platformCosts || {};
  return {
    usdArs: Number(raw.usdArs) || 0,
    usdPen: Number(raw.usdPen) || 0,
    platformCosts: {
      tidal: platformCosts.tidal || { cost: 0, currency: "ARS" },
      deezer: platformCosts.deezer || { cost: 0, currency: "ARS" },
      qobuz: platformCosts.qobuz || { cost: 0, currency: "USD" },
    },
  };
}

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { rows } = await query("select value, updated_at from settings where key = $1", [KEY]);
    if (!rows[0]) return NextResponse.json({ exists: false, settings: null });
    return NextResponse.json({ exists: true, settings: normalizePayload(rows[0].value), updatedAt: rows[0].updated_at });
  } catch (error) {
    console.error("Admin settings GET:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const settings = normalizePayload(await req.json());
    const { rows } = await query("select value from settings where key = $1", [KEY]);
    await query(
      `insert into settings(key, value, updated_at, updated_by) values ($1, $2, now(), 'admin')
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'admin'`,
      [KEY, JSON.stringify(settings)]
    );
    await logEvent("admin_settings", KEY, "update", rows[0]?.value ?? null, settings, "Tasas y costos de plataforma");
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Admin settings PUT:", error);
    return NextResponse.json({ message: formatDatabaseError(error) }, { status: 500 });
  }
}
