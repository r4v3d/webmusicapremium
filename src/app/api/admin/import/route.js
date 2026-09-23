import { NextResponse, after } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { createFamilyAccount, createMemberProfile, getFreeSlotsStock, getOrCreateClient, updateMemberProfile } from "../../../../lib/db";
import { parseDateInput, previewImport } from "../../../../lib/importParse";
import { announceStock } from "../../../../lib/telegramBot";

async function findAccount(service, masterEmail) {
  const res = await query(
    "select id, account_password from platform_accounts where platform_code = $1 and account_email = $2 order by id limit 1",
    [service, masterEmail]
  );
  return res.rows[0] || null;
}

async function createFiveSlots(accId) {
  await query(
    `insert into account_slots(platform_account_id, slot_number, status, email_type, member_email, member_password)
     select $1, n, 'free', 'admin', '', '' from generate_series(1, 5) as n`,
    [accId]
  );
}

async function slotsOf(accId) {
  const res = await query("select * from account_slots where platform_account_id = $1 order by slot_number asc", [accId]);
  return res.rows;
}

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { service, mode, rawInput, dryRun } = await req.json();

    if (!service || !mode || !rawInput) {
      return NextResponse.json({ message: "Plataforma, modo y datos de entrada son requeridos." }, { status: 400 });
    }

    const lines = rawInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ message: "No se encontraron datos para importar." }, { status: 400 });
    }

    if (dryRun) {
      const preview = previewImport(mode, rawInput);
      return NextResponse.json({
        success: true,
        dryRun: true,
        preview,
        validCount: preview.filter((row) => row.ok).length,
        errorCount: preview.filter((row) => !row.ok).length,
      });
    }

    let importedCount = 0;
    let familiesCreated = 0;
    let slotsUpdated = 0;

    const getDefaultRenewalDate = () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().substring(0, 10);
    };

    let skippedLogs = [];
    let lineIndex = 0;

    if (mode === "master_accounts") {
      // Flexible format: masterEmail | password | renewalDate/notes | notes/renewalDate
      for (const line of lines) {
        lineIndex++;
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 2) {
          skippedLogs.push(`Línea ${lineIndex} omitida (columnas insuficientes: ${parts.length}, se necesitan al menos 2)`);
          continue;
        }

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

        if (!masterEmail || !password) {
          skippedLogs.push(`Línea ${lineIndex} omitida (correo titular o contraseña vacíos)`);
          continue;
        }

        try {
          // Check if exists in the current service
          const existing = await findAccount(service, masterEmail);

          let accId;
          if (existing) {
            accId = existing.id;
            await query(
              `update platform_accounts set account_password = $2, notes = $3, owner_renewal_date = $4::date, updated_at = now()
                where id = $1`,
              [accId, password, notes, renewalDateStr]
            );
          } else {
            // Check if the email already exists globally under another platform
            const globalRes = await query(
              "select id, platform_code from platform_accounts where account_email = $1 order by id limit 1",
              [masterEmail]
            );
            const globalExisting = globalRes.rows[0];

            if (globalExisting) {
              skippedLogs.push(`Línea ${lineIndex} omitida (El correo titular '${masterEmail}' ya está registrado en la plataforma '${globalExisting.platform_code.toUpperCase()}')`);
              continue;
            }

            const newAcc = await createFamilyAccount({
              service,
              masterEmail,
              password,
              notes,
              ownerRenewalDate: renewalDateStr
            });
            accId = newAcc.id;
            familiesCreated++;

            await createFiveSlots(accId);
          }
          importedCount++;
        } catch (err) {
          console.error(`Error importando línea ${lineIndex} (${masterEmail}):`, err);
          skippedLogs.push(`Línea ${lineIndex} omitida por error: ${err.message || err}`);
        }
      }
    } else if (mode === "active_members") {
      // Format: TITULAR PLAN FAMILIAR [tab] CLIENTE (WHATSAPP O NOMBRE) [tab] CORREO MIEMBRO [tab] CONTRASEÑA [tab] PRECIO [tab] FECHA
      for (const line of lines) {
        lineIndex++;
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 4) {
          skippedLogs.push(`Línea ${lineIndex} omitida (columnas insuficientes: ${parts.length}, se necesitan al menos 4. Fila: "${line}")`);
          continue;
        }

        const masterEmail = parts[0];
        const clientIdentifier = parts[1];
        const memberEmail = parts[2];
        const memberPassword = parts[3];
        const pricePen = parts[4] ? (parseFloat(parts[4]) || 0) : 0;
        const renewalDateStr = (parts[5] ? parseDateInput(parts[5]) : null) || getDefaultRenewalDate();

        if (!masterEmail || !clientIdentifier || !memberEmail) {
          skippedLogs.push(`Línea ${lineIndex} omitida (datos obligatorios vacíos: titular=${masterEmail || 'vacío'}, cliente=${clientIdentifier || 'vacío'}, miembro=${memberEmail || 'vacío'})`);
          continue;
        }

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
        const family = await findAccount(service, masterEmail);

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

          await createFiveSlots(accId);
        } else {
          accId = family.id;
        }

        // 2. Find or create client permanent record
        const clientRecord = await getOrCreateClient(whatsapp, nickname, memberEmail);
        const clientId = clientRecord.id;

        // 3. Find a slot in this family account to assign
        // Try to find a slot matching memberEmail or the first free slot
        const slots = await slotsOf(accId);

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
        lineIndex++;
        const parts = line.split(/\t|,|;|\|/).map(p => p.trim());
        if (parts.length < 3) {
          skippedLogs.push(`Línea ${lineIndex} omitida (columnas insuficientes: ${parts.length}, se necesitan al menos 3)`);
          continue;
        }

        const memberEmail = parts[0];
        const memberPassword = parts[1];
        const masterEmail = parts[2];

        if (!memberEmail || !masterEmail) {
          skippedLogs.push(`Línea ${lineIndex} omitida (correo miembro o correo titular vacíos)`);
          continue;
        }

        // 1. Find or create family account
        const family = await findAccount(service, masterEmail);

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

          await createFiveSlots(accId);
        } else {
          accId = family.id;
        }

        // 2. Find a slot in this family account to assign
        const slots = await slotsOf(accId);

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

    let finalMessage = `Importación completada: se procesaron ${importedCount} registros, se crearon ${familiesCreated} cuentas familiares y se actualizaron/crearon ${slotsUpdated} ranuras de perfiles.`;
    
    if (skippedLogs.length > 0) {
      finalMessage += `\n\n[ATENCIÓN] Ocurrieron omisiones:\n${skippedLogs.join("\n")}`;
    }

    // Anuncio automático de stock al canal de Telegram (§17), como el bot de referencia.
    if (mode === "stock_members" && slotsUpdated > 0) {
      after(async () => {
        const stock = await getFreeSlotsStock().catch(() => null);
        await announceStock(service, slotsUpdated, stock?.[service] ?? null).catch((e) => console.error("announceStock:", e));
      });
    }

    return NextResponse.json({
      success: true,
      importedCount,
      familiesCreated,
      slotsUpdated,
      message: finalMessage
    }, { status: 200 });

  } catch (error) {
    console.error("Bulk Import Tool Error:", error);
    return NextResponse.json({ message: `Error al procesar la importación masiva: ${error.message}` }, { status: 500 });
  }
}
