import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/auth";
import { supabase, updateMemberProfile } from "../../../../../lib/db";

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

    // 1. Fetch source slot (including family account and subscriptions)
    const { data: sourceSlot, error: sourceErr } = await supabase
      .from("account_slots")
      .select("*, platform_accounts(*), subscriptions(*)")
      .eq("id", sourceSlotId)
      .maybeSingle();

    if (sourceErr) throw sourceErr;
    if (!sourceSlot) {
      return NextResponse.json({ message: "La ranura de origen no existe." }, { status: 404 });
    }

    // Verify source slot is active and has a customer
    if (sourceSlot.status !== "active" || !sourceSlot.customer_id) {
      return NextResponse.json({ message: "La ranura de origen debe estar activa y asociada a un cliente." }, { status: 400 });
    }

    // 2. Fetch target slot (including family account)
    const { data: targetSlot, error: targetErr } = await supabase
      .from("account_slots")
      .select("*, platform_accounts(*)")
      .eq("id", targetSlotId)
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!targetSlot) {
      return NextResponse.json({ message: "La ranura de destino no existe." }, { status: 404 });
    }

    // Verify target slot is free
    if (targetSlot.status !== "free") {
      return NextResponse.json({ message: "La ranura de destino debe estar libre (free)." }, { status: 400 });
    }

    // Verify both accounts belong to the same service
    const sourceService = sourceSlot.platform_accounts?.platform_code;
    const targetService = targetSlot.platform_accounts?.platform_code;
    if (sourceService !== targetService) {
      return NextResponse.json({ message: `No se pueden mover perfiles entre plataformas distintas (${sourceService} a ${targetService}).` }, { status: 400 });
    }

    // 3. Find active subscription details for the source slot
    const activeSub = sourceSlot.subscriptions?.find(s => s.subscription_status === "active");
    const pricePen = activeSub?.plan_price || 0;
    const renewalDateStr = activeSub?.renewal_date || null;

    // 4. Update Target Slot to be active with client details
    await updateMemberProfile(targetSlotId, {
      clientId: sourceSlot.customer_id,
      memberEmail: sourceSlot.member_email,
      memberPassword: sourceSlot.member_password,
      emailType: sourceSlot.email_type || "client",
      status: "active",
      pricePen,
      renewalDate: renewalDateStr
    });

    // 5. Reset Source Slot to free (this cancels the source slot subscription)
    await updateMemberProfile(sourceSlotId, {
      clientId: null,
      memberEmail: "",
      memberPassword: "",
      emailType: "admin",
      status: "free",
      pricePen: 0,
      renewalDate: null
    });

    // 6. Log the transfer event
    const sourceEmail = sourceSlot.platform_accounts?.account_email;
    const targetEmail = targetSlot.platform_accounts?.account_email;
    await supabase.from("events_log").insert({
      entity_type: "member_profile",
      entity_id: String(sourceSlotId),
      event_type: "transfer",
      old_value: { slot_id: sourceSlotId, account_email: sourceEmail, member_email: sourceSlot.member_email },
      new_value: { slot_id: targetSlotId, account_email: targetEmail, member_email: sourceSlot.member_email },
      performed_by: "admin",
      reason: `Perfil ${sourceSlot.member_email} transferido de ${sourceEmail} (Slot ${sourceSlot.slot_number}) a ${targetEmail} (Slot ${targetSlot.slot_number})`
    });

    return NextResponse.json({
      success: true,
      message: `El miembro ${sourceSlot.member_email} fue movido exitosamente a la cuenta titular ${targetEmail}.`
    }, { status: 200 });

  } catch (error) {
    console.error("Transfer Member Profile Error:", error);
    return NextResponse.json({ message: `Error interno al transferir perfil: ${error.message}` }, { status: 500 });
  }
}
