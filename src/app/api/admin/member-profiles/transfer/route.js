import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { withTransaction } from "../../../../../lib/pg";
import { logEvent, updateMemberProfile } from "../../../../../lib/db";

class TransferError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function loadSlot(tx, id) {
  const res = await tx.query(
    `select s.*, pa.platform_code, pa.account_email
       from account_slots s join platform_accounts pa on pa.id = s.platform_account_id
      where s.id = $1 for update of s`,
    [id]
  );
  return res.rows[0] || null;
}

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { sourceSlotId, targetSlotId } = await req.json();
    if (!sourceSlotId || !targetSlotId) {
      return NextResponse.json({ message: "Los IDs de ranura de origen y destino son requeridos." }, { status: 400 });
    }

    // Origen y destino cambian en la misma transacción: nunca queda el perfil duplicado ni perdido.
    const result = await withTransaction(async (tx) => {
      const sourceSlot = await loadSlot(tx, sourceSlotId);
      if (!sourceSlot) throw new TransferError("La ranura de origen no existe.", 404);
      if (sourceSlot.status !== "active" || !sourceSlot.customer_id) {
        throw new TransferError("La ranura de origen debe estar activa y asociada a un cliente.", 400);
      }
      const targetSlot = await loadSlot(tx, targetSlotId);
      if (!targetSlot) throw new TransferError("La ranura de destino no existe.", 404);
      if (targetSlot.status !== "free") throw new TransferError("La ranura de destino debe estar libre (free).", 400);
      if (sourceSlot.platform_code !== targetSlot.platform_code) {
        throw new TransferError(`No se pueden mover perfiles entre plataformas distintas (${sourceSlot.platform_code} a ${targetSlot.platform_code}).`, 400);
      }

      const subRes = await tx.query(
        `select plan_price, renewal_date from subscriptions
          where account_slot_id = $1 and subscription_status in ('active','pending_payment')
          order by id desc limit 1`,
        [sourceSlotId]
      );
      const activeSub = subRes.rows[0];

      await updateMemberProfile(targetSlotId, {
        clientId: sourceSlot.customer_id,
        memberEmail: sourceSlot.member_email,
        memberPassword: sourceSlot.member_password,
        emailType: sourceSlot.email_type || "client",
        status: "active",
        pricePen: Number(activeSub?.plan_price) || 0,
        renewalDate: activeSub?.renewal_date || null,
      }, { tx });

      await updateMemberProfile(sourceSlotId, {
        clientId: null,
        memberEmail: "",
        memberPassword: "",
        emailType: "admin",
        status: "free",
      }, { tx });

      await logEvent(
        "member_profile", sourceSlotId, "transfer",
        { slot_id: sourceSlotId, account_email: sourceSlot.account_email, member_email: sourceSlot.member_email },
        { slot_id: targetSlotId, account_email: targetSlot.account_email, member_email: sourceSlot.member_email },
        `Perfil ${sourceSlot.member_email} transferido de ${sourceSlot.account_email} (Slot ${sourceSlot.slot_number}) a ${targetSlot.account_email} (Slot ${targetSlot.slot_number})`,
        { tx }
      );
      return { memberEmail: sourceSlot.member_email, targetEmail: targetSlot.account_email };
    });

    return NextResponse.json({
      success: true,
      message: `El miembro ${result.memberEmail} fue movido exitosamente a la cuenta titular ${result.targetEmail}.`,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof TransferError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    console.error("Transfer Member Profile Error:", error);
    return NextResponse.json({ message: `Error interno al transferir perfil: ${error.message}` }, { status: 500 });
  }
}
