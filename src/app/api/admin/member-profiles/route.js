import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { updateMemberProfile, getClients, createClient, updateClient, getCountryFromPhone } from "../../../../lib/db";

// Helper to find or create a Client record and update their phone history
async function getOrCreateClient(whatsapp, nickname, email) {
  const clients = await getClients();
  const cleanPhone = whatsapp.replace(/\D/g, "");

  // Find client by current WhatsApp or in their past WhatsApp list
  let client = clients.find(c => {
    const currentClean = c.currentWhatsApp ? c.currentWhatsApp.replace(/\D/g, "") : "";
    if (currentClean === cleanPhone) return true;
    const matchPast = c.pastWhatsApps && c.pastWhatsApps.some(p => p.replace(/\D/g, "") === cleanPhone);
    return matchPast;
  });

  const countryData = getCountryFromPhone(whatsapp);

  if (client) {
    const updatedFields = {};
    if (nickname && nickname !== client.nickname) {
      updatedFields.nickname = nickname;
    }
    
    // Check if they changed their primary WhatsApp number
    if (client.currentWhatsApp !== whatsapp) {
      const past = client.pastWhatsApps || [];
      if (!past.includes(client.currentWhatsApp)) {
        past.push(client.currentWhatsApp);
      }
      updatedFields.currentWhatsApp = whatsapp;
      updatedFields.pastWhatsApps = past;
      updatedFields.clientCountryCode = countryData.code;
    }

    // Ensure email is added to their history of used emails
    const emails = client.usedEmails || [];
    if (email && !emails.includes(email)) {
      emails.push(email);
      updatedFields.usedEmails = emails;
    }

    if (Object.keys(updatedFields).length > 0) {
      const clientId = client._id || client.id;
      client = await updateClient(clientId, updatedFields);
    }
  } else {
    // Create new permanent client
    client = await createClient({
      nickname: nickname || "Cliente Nuevo",
      currentWhatsApp: whatsapp,
      pastWhatsApps: [],
      usedEmails: email ? [email] : [],
      clientCountryCode: countryData.code,
      notes: ""
    });
  }

  return client;
}

export async function PUT(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const {
      profileId,
      clientNickname,
      clientWhatsApp,
      memberEmail,
      emailType,
      memberPassword,
      pricePen,
      renewalDate,
      status
    } = body;

    if (!profileId) {
      return NextResponse.json({ message: "ID del perfil requerido." }, { status: 400 });
    }

    let clientId = null;

    if (status !== "free") {
      if (!clientWhatsApp) {
        return NextResponse.json({ message: "El WhatsApp del cliente es requerido para perfiles ocupados." }, { status: 400 });
      }
      
      const client = await getOrCreateClient(clientWhatsApp, clientNickname, memberEmail);
      clientId = client._id || client.id;
    }

    const updatedFields = {
      clientId,
      memberEmail,
      emailType,
      memberPassword,
      pricePen: status === "free" ? 0 : parseFloat(pricePen) || 0,
      renewalDate: status === "free" ? null : (renewalDate ? new Date(renewalDate) : null),
      status
    };

    const updatedProfile = await updateMemberProfile(profileId, updatedFields);

    return NextResponse.json({ success: true, profile: updatedProfile }, { status: 200 });

  } catch (error) {
    console.error("Update Member Profile Error:", error);
    return NextResponse.json({ message: `Error al actualizar perfil de miembro: ${error.message}` }, { status: 500 });
  }
}
