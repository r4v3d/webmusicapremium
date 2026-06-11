import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { updateMemberProfile, getClients, createClient, updateClient, getCountryFromPhone, getOrCreateClient } from "../../../../lib/db";

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
