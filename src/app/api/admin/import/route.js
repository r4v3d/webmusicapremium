import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/db";
import { createFamilyAccount, createMemberProfile, getOrCreateClient, updateMemberProfile } from "../../../../lib/db";

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { service, mode, rawInput } = await req.json();

    if (!service || !mode || !rawInput) {
      return NextResponse.json({ message: "Plataforma, modo y datos de entrada son requeridos." }, { status: 400 });
    }

    const lines = rawInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ message: "No se encontraron datos para importar." }, { status: 400 });
    }

    let importedCount = 0;
    let familiesCreated = 0;
    let slotsUpdated = 0;

    // Helper: calculate default renewal date (+30 days)
    const getDefaultRenewalDate = () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().substring(0, 10);
    };

    if (mode === "master_accounts") {
      // Format: masterEmail | password | notes | renewalDate (optional)
      for (const line of lines) {
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 2) continue;

        const masterEmail = parts[0];
        const password = parts[1];
        const notes = parts[2] || "";
        const renewalDateStr = parts[3] || getDefaultRenewalDate();

        if (!masterEmail || !password) continue;

        // Check if exists
        const { data: existing } = await supabase
          .from("platform_accounts")
          .select("id")
          .eq("platform_code", service)
          .eq("account_email", masterEmail)
          .maybeSingle();

        let accId;
        if (existing) {
          accId = existing.id;
          await supabase
            .from("platform_accounts")
            .update({
              account_password: password,
              notes: notes,
              updated_at: new Date().toISOString()
            })
            .eq("id", accId);
        } else {
          const newAcc = await createFamilyAccount({
            service,
            masterEmail,
            password,
            notes
          });
          accId = newAcc.id;
          familiesCreated++;

          // Auto-generate 5 slots for new family
          for (let i = 1; i <= 5; i++) {
            await createMemberProfile({
              familyAccountId: accId,
              slotNumber: i,
              clientId: null,
              memberEmail: "",
              emailType: "admin",
              memberPassword: "",
              pricePen: 0,
              renewalDate: null,
              status: "free"
            });
          }
        }
        importedCount++;
      }
    } else if (mode === "active_members") {
      // Format: memberEmail | memberPassword | masterEmail | nickname | currentWhatsApp | pricePen | renewalDate
      for (const line of lines) {
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 5) continue; // Requires at least memberEmail, memberPassword, masterEmail, nickname, whatsapp

        const memberEmail = parts[0];
        const memberPassword = parts[1];
        const masterEmail = parts[2];
        const nickname = parts[3];
        const currentWhatsApp = parts[4];
        const pricePen = parseFloat(parts[5]) || 0;
        const renewalDateStr = parts[6] || getDefaultRenewalDate();

        if (!memberEmail || !masterEmail || !nickname || !currentWhatsApp) continue;

        // 1. Find or create master family account
        let { data: family } = await supabase
          .from("platform_accounts")
          .select("id, account_password")
          .eq("platform_code", service)
          .eq("account_email", masterEmail)
          .maybeSingle();

        let accId;
        if (!family) {
          const newAcc = await createFamilyAccount({
            service,
            masterEmail,
            password: memberPassword || "masterpass123",
            notes: "Creado automáticamente en importación masiva de perfiles activos."
          });
          accId = newAcc.id;
          familiesCreated++;

          // Auto-generate 5 slots for new family
          for (let i = 1; i <= 5; i++) {
            await createMemberProfile({
              familyAccountId: accId,
              slotNumber: i,
              clientId: null,
              memberEmail: "",
              emailType: "admin",
              memberPassword: "",
              pricePen: 0,
              renewalDate: null,
              status: "free"
            });
          }
        } else {
          accId = family.id;
        }

        // 2. Find or create client permanent record
        const clientRecord = await getOrCreateClient(currentWhatsApp, nickname, memberEmail);
        const clientId = clientRecord.id;

        // 3. Find a slot in this family account to assign
        // Try to find a slot matching memberEmail or the first free slot
        const { data: slots } = await supabase
          .from("account_slots")
          .select("*")
          .eq("platform_account_id", accId)
          .order("slot_number", { ascending: true });

        let targetSlot = slots.find(s => s.member_email === memberEmail);
        if (!targetSlot) {
          targetSlot = slots.find(s => s.status === "free");
        }

        if (targetSlot) {
          // Update the slot with client and pricing details
          await updateMemberProfile(targetSlot.id, {
            clientId,
            memberEmail,
            memberPassword: memberPassword || targetSlot.member_password || "password123",
            emailType: "client",
            status: "active",
            pricePen,
            renewalDate: renewalDateStr
          });
          slotsUpdated++;
        } else {
          // If no free slots, create a new one (e.g. slot number 6, though not recommended, but keeps import from losing data)
          const newSlot = await createMemberProfile({
            familyAccountId: accId,
            clientId,
            memberEmail: "",
            emailType: "client",
            memberPassword: memberPassword || "password123",
            pricePen,
            renewalDate: renewalDateStr,
            status: "active"
          });
          
          // Since updateMemberProfile manages subscriptions and payments, call it on the newly created slot
          await updateMemberProfile(newSlot.id, {
            clientId,
            memberEmail,
            memberPassword: memberPassword || "password123",
            emailType: "client",
            status: "active",
            pricePen,
            renewalDate: renewalDateStr
          });
          slotsUpdated++;
        }
        importedCount++;
      }
    } else if (mode === "stock_members") {
      // Format: memberEmail | memberPassword | masterEmail
      for (const line of lines) {
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 3) continue; // Requires memberEmail, memberPassword, masterEmail

        const memberEmail = parts[0];
        const memberPassword = parts[1];
        const masterEmail = parts[2];

        if (!memberEmail || !masterEmail) continue;

        // 1. Find or create family account
        let { data: family } = await supabase
          .from("platform_accounts")
          .select("id")
          .eq("platform_code", service)
          .eq("account_email", masterEmail)
          .maybeSingle();

        let accId;
        if (!family) {
          const newAcc = await createFamilyAccount({
            service,
            masterEmail,
            password: memberPassword || "masterpass123",
            notes: "Creado automáticamente en importación masiva de perfiles libres (stock)."
          });
          accId = newAcc.id;
          familiesCreated++;

          // Auto-generate 5 slots for new family
          for (let i = 1; i <= 5; i++) {
            await createMemberProfile({
              familyAccountId: accId,
              slotNumber: i,
              clientId: null,
              memberEmail: "",
              emailType: "admin",
              memberPassword: "",
              pricePen: 0,
              renewalDate: null,
              status: "free"
            });
          }
        } else {
          accId = family.id;
        }

        // 2. Find a slot in this family account to assign
        const { data: slots } = await supabase
          .from("account_slots")
          .select("*")
          .eq("platform_account_id", accId)
          .order("slot_number", { ascending: true });

        let targetSlot = slots.find(s => s.member_email === memberEmail);
        if (!targetSlot) {
          targetSlot = slots.find(s => s.status === "free");
        }

        if (targetSlot) {
          await updateMemberProfile(targetSlot.id, {
            clientId: null,
            memberEmail,
            memberPassword: memberPassword || "password123",
            emailType: "admin",
            status: "free",
            pricePen: 0,
            renewalDate: null
          });
          slotsUpdated++;
        } else {
          await createMemberProfile({
            familyAccountId: accId,
            clientId: null,
            memberEmail,
            emailType: "admin",
            memberPassword: memberPassword || "password123",
            pricePen: 0,
            renewalDate: null,
            status: "free"
          });
          slotsUpdated++;
        }
        importedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      importedCount,
      familiesCreated,
      slotsUpdated,
      message: `Importación completada: se procesaron ${importedCount} registros, se crearon ${familiesCreated} cuentas familiares y se actualizaron/crearon ${slotsUpdated} ranuras de perfiles.`
    }, { status: 200 });

  } catch (error) {
    console.error("Bulk Import Tool Error:", error);
    return NextResponse.json({ message: `Error al procesar la importación masiva: ${error.message}` }, { status: 500 });
  }
}
