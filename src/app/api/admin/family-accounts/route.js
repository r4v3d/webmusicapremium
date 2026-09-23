export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query, withTransaction } from "../../../../lib/pg";
import { CONTACTS_JSON, createFamilyAccount, updateFamilyAccount, deleteFamilyAccount, createMemberProfile, formatClient, formatDatabaseError, formatFamilyAccount } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    // Sin el tope de 1000 filas de PostgREST: tres consultas planas y armado en memoria.
    const [accounts, slots, customers] = await Promise.all([
      query("select * from platform_accounts order by created_at desc"),
      query(
        `select s.id, s.platform_account_id, s.slot_number, s.member_email, s.member_password, s.email_type,
                s.status, s.customer_id, s.updated_at, s.reserved_until,
                sub.plan_price, sub.renewal_date
           from account_slots s
           left join lateral (
             select plan_price, renewal_date from subscriptions sb
              where sb.account_slot_id = s.id and sb.subscription_status in ('active','pending_payment')
              order by sb.id desc limit 1
           ) sub on true`
      ),
      query(`select c.*, ${CONTACTS_JSON} from customers c where c.id in (select customer_id from account_slots where customer_id is not null)`),
    ]);

    const customerMap = new Map(customers.rows.map((c) => [String(c.id), formatClient(c)]));
    const slotsByAccount = new Map();
    for (const slot of slots.rows) {
      const key = String(slot.platform_account_id);
      if (!slotsByAccount.has(key)) slotsByAccount.set(key, []);
      slotsByAccount.get(key).push(slot);
    }

    const grouped = accounts.rows.map((acc) => {
      const familyAccount = formatFamilyAccount(acc);
      const profiles = (slotsByAccount.get(String(acc.id)) || [])
        .map((slot) => ({
          id: slot.id,
          _id: slot.id,
          familyAccountId: familyAccount,
          clientId: slot.customer_id ? customerMap.get(String(slot.customer_id)) || null : null,
          memberEmail: slot.member_email || "",
          emailType: slot.email_type || "admin",
          memberPassword: slot.member_password || "",
          pricePen: slot.status !== "free" ? Number(slot.plan_price) || 0 : 0,
          renewalDate: slot.status !== "free" ? slot.renewal_date : null,
          status: slot.status,
          slotNumber: slot.slot_number,
          reservedUntil: slot.reserved_until,
          updatedAt: slot.updated_at,
        }))
        .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));
      return { ...familyAccount, profiles };
    });

    return NextResponse.json(grouped, { status: 200 });
  } catch (error) {
    console.error("Fetch Family Accounts Error:", error);
    return NextResponse.json({ message: `Error al cargar cuentas familiares: ${formatDatabaseError(error)}` }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { service, masterEmail, password, notes } = body;

    if (!service || !masterEmail || !password) {
      return NextResponse.json({ message: "Servicio, correo y contraseña son requeridos." }, { status: 400 });
    }

    // Cuenta y sus 5 cupos en una sola transacción: o existen todos o ninguno.
    const newAcc = await withTransaction(async (tx) => {
      const acc = await createFamilyAccount({ service, masterEmail, password, notes: notes || "" }, { tx });
      for (let i = 1; i <= 5; i++) {
        await createMemberProfile({
          familyAccountId: acc.id, slotNumber: i, clientId: null,
          memberEmail: "", emailType: "admin", memberPassword: "", status: "free",
        }, { tx });
      }
      return acc;
    });

    return NextResponse.json({ success: true, account: newAcc }, { status: 201 });
  } catch (error) {
    console.error("Create Family Account Error:", error);
    return NextResponse.json({ message: `Error al crear cuenta familiar: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ message: "ID de cuenta familiar requerido." }, { status: 400 });
    }

    await deleteFamilyAccount(id);
    return NextResponse.json({ success: true, message: "Cuenta familiar y sus ranuras eliminadas." }, { status: 200 });
  } catch (error) {
    console.error("Delete Family Account Error:", error);
    return NextResponse.json({ message: `Error al eliminar cuenta familiar: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { id, service, masterEmail, password, notes, ownerRenewalDate, renewalCost, renewalCurrency } = body;

    if (!id) {
      return NextResponse.json({ message: "ID de cuenta familiar requerido." }, { status: 400 });
    }

    const updated = await updateFamilyAccount(id, {
      service,
      masterEmail,
      password,
      notes,
      ownerRenewalDate,
      renewalCost,
      renewalCurrency
    });

    if (!updated) {
      return NextResponse.json({ message: "Cuenta familiar no encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, account: updated }, { status: 200 });
  } catch (error) {
    console.error("Update Family Account Error:", error);
    return NextResponse.json({ message: `Error al actualizar cuenta familiar: ${error.message}` }, { status: 500 });
  }
}
