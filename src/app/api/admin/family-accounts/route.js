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

    const { data, error } = await supabase
      .from("platform_accounts")
      .select(`
        id,
        platform_code,
        account_email,
        account_password,
        notes,
        created_at,
        owner_renewal_date,
        renewal_cost,
        renewal_currency,
        account_slots (
          id,
          slot_number,
          member_email,
          member_password,
          email_type,
          status,
          customer_id,
          customers (
            id,
            display_name,
            customer_contacts (
              contact_value,
              normalized_value,
              contact_type,
              is_primary
            )
          ),
          subscriptions (
            id,
            plan_price,
            renewal_date,
            subscription_status
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const grouped = (data || []).map(acc => {
      const accProfiles = (acc.account_slots || []).map(slot => {
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
        if (slot.customers) {
          const primaryContact = (slot.customers.customer_contacts || []).find(c => c.contact_type === 'whatsapp' && c.is_primary) || slot.customers.customer_contacts?.[0];
          client = {
            id: slot.customers.id,
            _id: slot.customers.id,
            nickname: slot.customers.display_name,
            currentWhatsApp: primaryContact ? primaryContact.contact_value : "",
            usedEmails: [],
            pastWhatsApps: []
          };
        }
        
        let pricePen = 0;
        let renewalDate = null;
        if (slot.status !== "free" && slot.subscriptions && slot.subscriptions.length > 0) {
          const activeSub = slot.subscriptions.find(s => s.subscription_status === "active" || s.subscription_status === "pending_payment") || slot.subscriptions[0];
          pricePen = Number(activeSub.plan_price) || 0;
          renewalDate = activeSub.renewal_date;
        }
        
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
