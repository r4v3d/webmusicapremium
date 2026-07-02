export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { supabase, updateMemberProfile, createFamilyAccount, createMemberProfile } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { data: slots, error } = await supabase
      .from("account_slots")
      .select("id, member_email, member_password, updated_at, platform_accounts(platform_code, account_email)")
      .eq("status", "free");

    if (error) throw error;

    const freeProfiles = (slots || []).map(p => {
      const parent = p.platform_accounts;
      return {
        id: p.id,
        service: parent ? parent.platform_code : "unknown",
        accountData: `${p.member_email || ""}:${p.member_password || ""}`,
        familyMasterEmail: parent ? parent.account_email : "No anotado",
        isUsed: false,
        createdAt: p.updated_at || new Date().toISOString()
      };
    });

    return NextResponse.json(freeProfiles, { status: 200 });
  } catch (error) {
    console.error("Fetch Stock Error:", error);
    return NextResponse.json({ message: `Error al cargar el stock: ${error.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { service, rawInput } = body;

    if (!service || !rawInput) {
      return NextResponse.json({ message: "Plataforma e información de entrada son requeridos." }, { status: 400 });
    }

    // Split input into lines
    const lines = rawInput.split(/\r?\n/);
    const newItems = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return; // Skip empty lines

      let accountData = "";
      const parts = trimmed.split(/\t|,|;|:/);
      
      if (parts.length >= 2) {
        const col1 = parts[0].trim();
        const col2 = parts[1].trim();
        accountData = `${col1}:${col2}`;
      } else {
        accountData = trimmed;
      }

      if (accountData) {
        newItems.push({
          accountData
        });
      }
    });

    if (newItems.length === 0) {
      return NextResponse.json({ message: "No se encontraron cuentas válidas para importar." }, { status: 400 });
    }

    // 1. Get free slots of this service directly from DB
    const { data: freeSlots, error: freeError } = await supabase
      .from("account_slots")
      .select("id, slot_number, platform_accounts!inner(id, platform_code)")
      .eq("status", "free")
      .eq("platform_accounts.platform_code", service);

    if (freeError) throw freeError;

    let slotsUpdated = 0;
    let familiesCreated = 0;

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const parts = item.accountData.split(":");
      const email = parts[0];
      const password = parts[1] || "password123";

      if (slotsUpdated < freeSlots.length) {
        // Update credentials of an existing free slot
        const targetSlot = freeSlots[slotsUpdated];
        const pId = targetSlot._id || targetSlot.id;
        await updateMemberProfile(pId, {
          memberEmail: email,
          memberPassword: password,
          emailType: "admin",
          status: "free"
        });
        slotsUpdated++;
      } else {
        // Create a new family account to hold this slot and 4 other default slots
        const dummyMasterEmail = `familiar_autocreado_${Math.floor(1000 + Math.random() * 9000)}@webmusicapremium.com`;
        const dummyPassword = Math.random().toString(36).substring(2, 10);

        const newAcc = await createFamilyAccount({
          service,
          masterEmail: dummyMasterEmail,
          password: dummyPassword,
          notes: "Creado automáticamente al importar stock bulk."
        });
        familiesCreated++;

        const accId = newAcc._id || newAcc.id;

        // Generate 5 slots for this new family account
        for (let j = 1; j <= 5; j++) {
          let slotEmail = `${j}_perfil_${dummyMasterEmail}`;
          let slotPassword = dummyPassword;

          // If we still have pasted accounts in this iteration, use one!
          if (i < newItems.length && j === 1) {
            slotEmail = email;
            slotPassword = password;
          } else if (i + 1 < newItems.length) {
            i++;
            const nextItem = newItems[i];
            const nextParts = nextItem.accountData.split(":");
            slotEmail = nextParts[0];
            slotPassword = nextParts[1] || "password123";
          }

          await createMemberProfile({
            familyAccountId: accId,
            slotNumber: j,
            clientId: null,
            memberEmail: slotEmail,
            emailType: "admin",
            memberPassword: slotPassword,
            pricePen: 0,
            renewalDate: null,
            status: "free"
          });
        }
        slotsUpdated++;
      }
    }

    return NextResponse.json({
      success: true,
      count: newItems.length,
      message: `Se importaron con éxito ${newItems.length} cuentas de ${service.toUpperCase()}. Se actualizaron ranuras libres y se crearon ${familiesCreated} nuevos grupos familiares.`
    }, { status: 201 });

  } catch (error) {
    console.error("Import Stock Error:", error);
    return NextResponse.json({ message: `Error al importar stock: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    // Deleting a slot from stock isn't supported since they must belong to family accounts.
    // The admin can manage/delete slots by managing their parent family account or modifying the slot to "free".
    return NextResponse.json({ 
      success: true, 
      message: "Las ranuras de stock derivan de planes familiares. Para eliminarlas o modificarlas, por favor edítalas en la pestaña 'Clientes y Familias'." 
    }, { status: 200 });
  } catch (error) {
    console.error("Delete Stock Error:", error);
    return NextResponse.json({ message: `Error al eliminar la cuenta de stock: ${error.message}` }, { status: 500 });
  }
}
