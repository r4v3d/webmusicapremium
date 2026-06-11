import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getFamilyAccounts, createFamilyAccount, deleteFamilyAccount, getMemberProfiles, createMemberProfile } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const accounts = await getFamilyAccounts();
    const profiles = await getMemberProfiles();

    // Group profiles by familyAccountId
    const grouped = accounts.map(acc => {
      const accId = (acc._id || acc.id).toString();
      const accProfiles = profiles.filter(p => {
        const pAcc = p.familyAccountId;
        const pAccId = (pAcc?._id || pAcc?.id || pAcc || "").toString();
        return pAccId === accId;
      });
      return {
        ...acc,
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
