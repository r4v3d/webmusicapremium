export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/pg";
import { SLOT_HAS_CREDENTIALS_SQL } from "../../../../lib/reserve";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    // Libres + reservados (con su cuenta atrás, §15.3). Una reserva vencida cuenta como libre.
    // Solo cupos vendibles: con correo y clave de miembro. Un cupo vacío de un
    // titular (p. ej. los que crea la hoja) no es stock: nunca se entrega.
    const { rows: slots } = await query(
      `select s.id, s.member_email, s.member_password, s.updated_at, s.status, s.reserved_until, s.reserved_for_order,
              pa.platform_code, pa.account_email
         from account_slots s
         join platform_accounts pa on pa.id = s.platform_account_id
        where (s.status = 'free' or s.status = 'reserved') and ${SLOT_HAS_CREDENTIALS_SQL}
        order by s.updated_at desc`
    );

    const now = Date.now();
    const freeProfiles = slots.map((p) => {
      const reserved = p.status === "reserved" && p.reserved_until && new Date(p.reserved_until).getTime() > now;
      return {
        id: p.id,
        service: p.platform_code || "unknown",
        accountData: `${p.member_email || ""}:${p.member_password || ""}`,
        familyMasterEmail: p.account_email || "No anotado",
        isUsed: false,
        reserved,
        reservedUntil: reserved ? p.reserved_until : null,
        reservedForOrder: reserved ? p.reserved_for_order : null,
        createdAt: p.updated_at || new Date().toISOString(),
      };
    });

    return NextResponse.json(freeProfiles, { status: 200 });
  } catch (error) {
    console.error("Fetch Stock Error:", error);
    return NextResponse.json({ message: `Error al cargar el stock: ${error.message}` }, { status: 500 });
  }
}

// La carga de stock va por Inventario → Cargar (/api/admin/import). El cargador
// viejo que vivía aquí pisaba stock sin vender e inventaba titulares con claves
// de relleno que quedaban a la venta: se quitó.

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
      message: "Los cupos se editan en Clientes → Tabla: para sacar uno del stock, borra su correo y contraseña ahí (o en la hoja)." 
    }, { status: 200 });
  } catch (error) {
    console.error("Delete Stock Error:", error);
    return NextResponse.json({ message: `Error al eliminar la cuenta de stock: ${error.message}` }, { status: 500 });
  }
}
