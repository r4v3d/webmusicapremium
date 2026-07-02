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

    // 1. Fetch flat tables in parallel (no SQL joins, bypassing the 1000 row limit)
    const [accounts, slots, activeSubs, customers, contacts] = await Promise.all([
      // Accounts loop
      (async () => {
        let list = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("platform_accounts")
            .select("*")
            .order("created_at", { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          list = list.concat(data || []);
          if (!data || data.length < pageSize) hasMore = false;
          else page++;
        }
        return list;
      })(),
      
      // Slots loop
      (async () => {
        let list = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("account_slots")
            .select("id, platform_account_id, slot_number, member_email, member_password, email_type, status, customer_id, updated_at")
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          list = list.concat(data || []);
          if (!data || data.length < pageSize) hasMore = false;
          else page++;
        }
        return list;
      })(),

      // Active Subscriptions loop
      (async () => {
        let list = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("subscriptions")
            .select("id, account_slot_id, plan_price, renewal_date, subscription_status")
            .in("subscription_status", ["active", "pending_payment"])
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          list = list.concat(data || []);
          if (!data || data.length < pageSize) hasMore = false;
          else page++;
        }
        return list;
      })(),

      // Customers loop
      (async () => {
        let list = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          list = list.concat(data || []);
          if (!data || data.length < pageSize) hasMore = false;
          else page++;
        }
        return list;
      })(),

      // Contacts loop
      (async () => {
        let list = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("customer_contacts")
            .select("customer_id, contact_value, contact_type, is_primary")
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          list = list.concat(data || []);
          if (!data || data.length < pageSize) hasMore = false;
          else page++;
        }
        return list;
      })()
    ]);

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

    const contactsByCustomer = {};
    (contacts || []).forEach(c => {
      if (c.customer_id) {
        if (!contactsByCustomer[c.customer_id]) {
          contactsByCustomer[c.customer_id] = [];
        }
        contactsByCustomer[c.customer_id].push(c);
      }
    });

    const customerMap = {};
    (customers || []).forEach(cust => {
      const custContacts = contactsByCustomer[cust.id] || [];
      const primaryWhatsApp = custContacts.find(c => c.contact_type === "whatsapp" && c.is_primary)?.contact_value || custContacts.find(c => c.contact_type === "whatsapp")?.contact_value || "";
      const pastWhatsApps = custContacts.filter(c => c.contact_type === "whatsapp" && c.contact_value !== primaryWhatsApp).map(c => c.contact_value);
      const usedEmails = custContacts.filter(c => c.contact_type === "email").map(c => c.contact_value);

      customerMap[cust.id] = {
        id: cust.id,
        _id: cust.id,
        customerCode: cust.customer_code,
        nickname: cust.display_name || "",
        currentWhatsApp: primaryWhatsApp,
        pastWhatsApps,
        usedEmails,
        notes: cust.notes || "",
        status: cust.status,
        createdAt: cust.created_at,
        updatedAt: cust.updated_at
      };
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
        
        const client = slot.customer_id ? customerMap[slot.customer_id] || null : null;
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
          slotNumber: slot.slot_number,
          updatedAt: slot.updated_at
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
