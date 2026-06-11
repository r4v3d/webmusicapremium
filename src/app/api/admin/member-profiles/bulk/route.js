import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { updateMemberProfilesBulk, extendMemberProfilesBulk, clearMemberProfilesBulk } from "../../../../../lib/db";

export async function PUT(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { profileIds, action, status, pricePen, renewalDate, months } = body;

    if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
      return NextResponse.json({ message: "Se requiere un array de IDs de perfiles válido." }, { status: 400 });
    }

    if (!action || !["update", "extend", "clear"].includes(action)) {
      return NextResponse.json({ message: "Acción masiva inválida o no especificada." }, { status: 400 });
    }

    let result = null;

    if (action === "update") {
      const fields = {};
      if (status !== undefined) fields.status = status;
      if (pricePen !== undefined) fields.pricePen = parseFloat(pricePen) || 0;
      if (renewalDate !== undefined) {
        fields.renewalDate = renewalDate ? new Date(renewalDate) : null;
      }
      
      result = await updateMemberProfilesBulk(profileIds, fields);
    } else if (action === "extend") {
      const monthsToAdd = parseInt(months) || 1;
      result = await extendMemberProfilesBulk(profileIds, monthsToAdd);
    } else if (action === "clear") {
      result = await clearMemberProfilesBulk(profileIds);
    }

    return NextResponse.json({ success: true, count: result?.length || 0, message: "Operación masiva completada con éxito." }, { status: 200 });

  } catch (error) {
    console.error("Bulk Operation Error:", error);
    return NextResponse.json({ message: `Error al ejecutar operación masiva: ${error.message}` }, { status: 500 });
  }
}
