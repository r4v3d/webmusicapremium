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

    // Helper: parse flexible date formats (DD/MM, DD-MM, YYYY-MM-DD, or DD)
    const parseDateInput = (str) => {
      if (!str) return null;
      str = str.trim();
      
      // Try YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
      }
      
      // Try DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY or DD-MM-YY
      let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);
        if (year < 100) {
          year = 2000 + year;
        }
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      
      // Try DD/MM or DD-MM
      match = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        let year = currentYear;
        // If parsed month is early next year and we are at the end of the year, adjust year
        if (month < currentMonth && (currentMonth - month) >= 9) {
          year = currentYear + 1;
        } else if (month > currentMonth && (month - currentMonth) >= 9) {
          year = currentYear - 1;
        }
        
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      
      // Try just a day number (e.g. "25" or "5")
      if (/^\d{1,2}$/.test(str)) {
        const day = parseInt(str, 10);
        if (day >= 1 && day <= 31) {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;
          return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      
      return null;
    };

    if (mode === "master_accounts") {
      // Flexible format: masterEmail | password | renewalDate/notes | notes/renewalDate
      for (const line of lines) {
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 2) continue;

        const masterEmail = parts[0];
        const password = parts[1];
        
        let renewalDateStr = null;
        let notes = "";

        if (parts.length >= 3) {
          const part2Date = parseDateInput(parts[2]);
          if (part2Date) {
            renewalDateStr = part2Date;
            notes = parts.slice(3).join(" - ");
          } else {
            notes = parts[2];
            if (parts.length >= 4) {
              const part3Date = parseDateInput(parts[3]);
              if (part3Date) {
                renewalDateStr = part3Date;
              } else {
                notes += " - " + parts.slice(3).join(" - ");
              }
            }
          }
        }

        if (!renewalDateStr) {
          renewalDateStr = getDefaultRenewalDate();
        }

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
              owner_renewal_date: renewalDateStr,
              updated_at: new Date().toISOString()
            })
            .eq("id", accId);
        } else {
          const newAcc = await createFamilyAccount({
            service,
            masterEmail,
            password,
            notes,
            ownerRenewalDate: renewalDateStr
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
      // Format: TITULAR PLAN FAMILIAR [tab] CLIENTE (WHATSAPP O NOMBRE) [tab] CORREO MIEMBRO [tab] CONTRASEÑA [tab] PRECIO [tab] FECHA
      for (const line of lines) {
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 4) continue; // Requires at least masterEmail, clientIdentifier, memberEmail, memberPassword

        const masterEmail = parts[0];
        const clientIdentifier = parts[1];
        const memberEmail = parts[2];
        const memberPassword = parts[3];
        const pricePen = parts[4] ? (parseFloat(parts[4]) || 0) : 0;
        const renewalDateStr = (parts[5] ? parseDateInput(parts[5]) : null) || getDefaultRenewalDate();

        if (!masterEmail || !clientIdentifier || !memberEmail) continue;

        let whatsapp = "";
        let nickname = "";
        const cleanPhone = clientIdentifier.replace(/\D/g, "");
        if (cleanPhone.length >= 6) {
          whatsapp = clientIdentifier;
          nickname = "Cliente Nuevo";
        } else {
          nickname = clientIdentifier;
          whatsapp = "";
        }

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
