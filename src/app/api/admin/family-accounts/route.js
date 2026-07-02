export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { supabase, createFamilyAccount, updateFamilyAccount, deleteFamilyAccount, createMemberProfile } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    // 1. Fetch flat tables in parallel (no SQL joins)
    const [
      { data: accounts, error: errAcc },
      { data: slots, error: errSlot },
      { data: activeSubs, error: errSub },
      { data: customers, error: errCust },
      { data: contacts, error: errCont }
    ] = await Promise.all([
      supabase.from("platform_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("account_slots").select("id, platform_account_id, slot_number, member_email, member_password, email_type, status, customer_id"),
      supabase.from("subscriptions").select("id, account_slot_id, plan_price, renewal_date, subscription_status").in("subscription_status", ["active", "pending_payment"]),
      supabase.from("customers").select("id, display_name"),
      supabase.from("customer_contacts").select("customer_id, contact_value").eq("contact_type", "whatsapp").eq("is_primary", true)
    ]);

    if (errAcc) throw errAcc;
    if (errSlot) throw errSlot;
    if (errSub) throw errSub;
    if (errCust) throw errCust;
    if (errCont) throw errCont;

    // 2. Create index maps for O(1) in-memory lookups
    const slotsByAccount = {};
    (slots || []).forEach(slot => {
      const accId = slot.platform_account_id;
      if (!slotsByAccount[accId]) {
        slotsByAccount[accId] = [];
      }
      slotsByAccount[accId].push(slot);
    });

    const subsBySlot = {};
    (activeSubs || []).forEach(sub => {
      if (sub.account_slot_id) {
        subsBySlot[sub.account_slot_id] = sub;
      }
    });

    const customerMap = {};
    (customers || []).forEach(cust => {
      customerMap[cust.id] = cust;
    });

    const contactMap = {};
    (contacts || []).forEach(cont => {
      if (cont.customer_id) {
        contactMap[cont.customer_id] = cont.contact_value;
      }
    });

    // 3. Assemble hierarchy structure in memory
    const grouped = (accounts || []).map(acc => {
      const accId = acc.id;
      const rawSlots = slotsByAccount[accId] || [];
      
      const accProfiles = rawSlots.map(slot => {
        const familyAccount = {
          id: acc.id,
          _id: acc.id,
          service: acc.platform_code,
          masterEmail: acc.account_email,
          password: acc.account_password,
          notes: acc.notes || "",
          createdAt: acc.created_at,
          ownerRenewalDate: acc.owner_renewal_date,
          renewalCost: Number(acc.renewal_cost) || 0,
          renewalCurrency: acc.renewal_currency || "PEN"
        };
        
        let client = null;
        if (slot.customer_id && customerMap[slot.customer_id]) {
          const cust = customerMap[slot.customer_id];
          const whatsApp = contactMap[slot.customer_id] || "";
          client = {
            id: cust.id,
            _id: cust.id,
            nickname: cust.display_name,
            currentWhatsApp: whatsApp,
            usedEmails: [],
            pastWhatsApps: []
          };
        }
        
        const sub = subsBySlot[slot.id];
        const pricePen = sub ? (Number(sub.plan_price) || 0) : 0;
        const renewalDate = sub ? sub.renewal_date : null;
        
        return {
          id: slot.id,
          _id: slot.id,
          familyAccountId: familyAccount,
          clientId: client,
          memberEmail: slot.member_email || "",
          emailType: slot.email_type || "admin",
          memberPassword: slot.member_password || "",
          pricePen,
          renewalDate,
          status: slot.status,
          slotNumber: slot.slot_number
        };
      });
      
      accProfiles.sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));

      return {
        id: acc.id,
        _id: acc.id,
        service: acc.platform_code,
        masterEmail: acc.account_email,
        password: acc.account_password,
        notes: acc.notes || "",
        createdAt: acc.created_at,
        ownerRenewalDate: acc.owner_renewal_date,
        renewalCost: Number(acc.renewal_cost) || 0,
        renewalCurrency: acc.renewal_currency || "PEN",
        profiles: accProfiles
      };
    });

    return NextResponse.json(grouped, { status: 200 });
  } catch (error) {
    console.error("Fetch Family Accounts Error:", error);
    return NextResponse.json({ message: `Error al cargar cuentas familiares: ${error.message}` }, { status: 500 });
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

    // 1. Create the Family Account
    const newAcc = await createFamilyAccount({
      service,
      masterEmail,
      password,
      notes: notes || ""
    });

    const accId = newAcc._id || newAcc.id;

    // 2. Automatically create 5 empty slots (profiles) for this account
    for (let i = 1; i <= 5; i++) {
      await createMemberProfile({
        familyAccountId: accId,
        slotNumber: i,
        clientId: null,
        memberEmail: "", // Empty to indicate an unconfigured cupo
        emailType: "admin",
        memberPassword: "", // Empty to indicate an unconfigured cupo
        pricePen: 0,
        renewalDate: null,
        status: "free"
      });
    }

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
