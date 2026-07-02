export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase, logEvent } from "../../../../lib/db";
import { checkAdminAuth } from "../../../../lib/auth";

// GET: List all payments
export async function GET() {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: allData, error } = await supabase
      .from("payments")
      .select(`
        *,
        customers:customer_id(display_name, customer_code),
        subscriptions:subscription_id(*)
      `)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) throw error;

    const formattedPayments = allData.map(p => {
      return {
        id: p.id,
        customerId: p.customer_id,
        clientName: p.customers?.display_name || "Cliente Desconocido",
        clientCode: p.customers?.customer_code || "",
        subscriptionId: p.subscription_id,
        service: p.subscriptions?.platform_code || "tidal",
        planPrice: p.subscriptions?.plan_price || 0,
        currentRenewalDate: p.subscriptions?.renewal_date || "",
        amount: p.amount,
        currency: p.currency,
        paymentMethod: p.payment_method,
        status: p.payment_status,
        proofUrl: p.proof_url,
        notes: p.notes,
        createdAt: p.created_at,
        verifiedAt: p.verified_at
      };
    });

    return NextResponse.json({ success: true, payments: formattedPayments });
  } catch (error) {
    console.error("Admin list payments error:", error);
    return NextResponse.json({ error: "Error al listar pagos" }, { status: 500 });
  }
}

// POST: Approve or reject a payment
export async function POST(req) {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { paymentId, action, notes, monthsToAdd = 1 } = await req.json();

    if (!paymentId || !action || !["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "Datos incompletos o acción inválida" }, { status: 400 });
    }

    // 1. Fetch current payment details
    const { data: payment, error: pError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (pError) throw pError;
    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    // 2. Fetch associated subscription
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", payment.subscription_id)
      .maybeSingle();

    if (subError) throw subError;
    if (!sub) {
      return NextResponse.json({ error: "Suscripción asociada no encontrada" }, { status: 404 });
    }

    const todayStr = new Date().toISOString().substring(0, 10);

    if (action === "confirm") {
      // Calculate new renewal date
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      let baseDate = new Date();
      baseDate.setHours(0,0,0,0);

      if (sub.renewal_date) {
        const currentRenewal = new Date(sub.renewal_date);
        currentRenewal.setHours(0,0,0,0);
        // If the subscription is still active (not expired yet), extend from the expiration date.
        // Otherwise, extend from today.
        if (currentRenewal > now) {
          baseDate = currentRenewal;
        }
      }

      // Add months
      baseDate.setMonth(baseDate.getMonth() + parseInt(monthsToAdd));
      const newRenewalDateStr = baseDate.toISOString().substring(0, 10);

      // Update Subscription in DB
      const { data: updatedSub, error: updateSubErr } = await supabase
        .from("subscriptions")
        .update({
          subscription_status: "active",
          renewal_date: newRenewalDateStr,
          updated_at: new Date().toISOString()
        })
        .eq("id", sub.id)
        .select()
        .single();

      if (updateSubErr) throw updateSubErr;

      // Update associated Account Slot in DB to make sure it is assigned
      if (sub.account_slot_id) {
        await supabase
          .from("account_slots")
          .update({
            status: "assigned",
            updated_at: new Date().toISOString()
          })
          .eq("id", sub.account_slot_id);
      }

      // Update Payment Transaction in DB
      const { error: updatePayErr } = await supabase
        .from("payments")
        .update({
          payment_status: "confirmed",
          verified_at: new Date().toISOString(),
          coverage_from: sub.renewal_date || todayStr,
          coverage_to: newRenewalDateStr
        })
        .eq("id", paymentId);

      if (updatePayErr) throw updatePayErr;

      // Log audit event
      await logEvent(
        "subscription",
        sub.id,
        "renew",
        { status: sub.subscription_status, renewal_date: sub.renewal_date },
        { status: updatedSub.subscription_status, renewal_date: updatedSub.renewal_date },
        `Payment approved by admin. Extended by ${monthsToAdd} month(s).`
      );

      return NextResponse.json({
        success: true,
        message: `Pago confirmado y suscripción extendida hasta el ${newRenewalDateStr}.`,
        newRenewalDate: newRenewalDateStr
      });

    } else if (action === "reject") {
      // Determine what status the subscription should revert to
      // If it is already past its renewal date, revert to expired. Otherwise, active.
      const isExpired = sub.renewal_date ? sub.renewal_date < todayStr : true;
      const revertedStatus = isExpired ? "expired" : "active";

      // Revert subscription status
      const { data: updatedSub, error: updateSubErr } = await supabase
        .from("subscriptions")
        .update({
          subscription_status: revertedStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", sub.id)
        .select()
        .single();

      if (updateSubErr) throw updateSubErr;

      // Update payment record to rejected
      const finalNotes = notes 
        ? `${payment.notes || ""}\n[RECHAZADO]: ${notes}`
        : `${payment.notes || ""}\n[RECHAZADO por el administrador]`;

      const { error: updatePayErr } = await supabase
        .from("payments")
        .update({
          payment_status: "rejected",
          notes: finalNotes,
          verified_at: new Date().toISOString()
        })
        .eq("id", paymentId);

      if (updatePayErr) throw updatePayErr;

      // Log audit event
      await logEvent(
        "subscription",
        sub.id,
        "reject_payment",
        { status: sub.subscription_status },
        { status: updatedSub.subscription_status },
        `Payment rejected by admin. Reason: ${notes || "No especificado"}`
      );

      return NextResponse.json({
        success: true,
        message: "Pago rechazado. La suscripción ha regresado a su estado anterior."
      });
    }

  } catch (error) {
    console.error("Admin process payment error:", error);
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 500 });
  }
}
