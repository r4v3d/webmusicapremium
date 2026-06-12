import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/db";
import { getCustomerSession } from "../../../../lib/libClientAuth";

export async function POST(req) {
  try {
    // Validate session
    const customerId = await getCustomerSession();
    if (!customerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await req.formData();
    const subscriptionId = formData.get("subscriptionId");
    const paymentMethod = formData.get("paymentMethod");
    const operationNumber = formData.get("operationNumber") || "";
    const amountStr = formData.get("amount");
    const file = formData.get("file");

    if (!subscriptionId || !paymentMethod || !amountStr) {
      return NextResponse.json({ error: "Faltan campos obligatorios (suscripción, método de pago o monto)" }, { status: 400 });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser un número válido mayor a 0" }, { status: 400 });
    }

    // Verify the subscription belongs to this customer
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (subError) throw subError;
    if (!sub) {
      return NextResponse.json({ error: "Suscripción no válida o no pertenece al cliente" }, { status: 404 });
    }

    // Upload receipt image to Supabase Storage if present
    let proofUrl = "";
    if (file && file instanceof File && file.size > 0) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Sanitize file name
        const fileExtension = file.name.split(".").pop() || "png";
        const fileName = `receipt-${customerId}-${Date.now()}.${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, buffer, {
            contentType: file.type,
            upsert: true
          });

        if (uploadError) {
          console.error("Supabase Storage Upload Error:", uploadError);
          // Return an informative message if the bucket doesn't exist
          if (uploadError.message?.toLowerCase().includes("bucket not found")) {
            return NextResponse.json({
              error: "Configuración incompleta",
              message: "El administrador debe crear el bucket público 'receipts' en Supabase Storage para poder subir imágenes de comprobantes."
            }, { status: 500 });
          }
          throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("receipts")
          .getPublicUrl(fileName);

        proofUrl = urlData.publicUrl;
      } catch (err) {
        console.error("Error uploading file to storage:", err);
        return NextResponse.json({ error: "Error al subir la imagen del comprobante de pago" }, { status: 500 });
      }
    }

    // Insert pending payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        customer_id: customerId,
        subscription_id: subscriptionId,
        amount: amount,
        currency: "PEN",
        payment_method: paymentMethod,
        payment_status: "pending",
        proof_url: proofUrl,
        notes: operationNumber ? `Nro. Operación: ${operationNumber}` : "Sin número de operación informado",
        coverage_from: new Date().toISOString().substring(0, 10), // Temporary coverage
        coverage_to: new Date().toISOString().substring(0, 10)     // Temporary coverage
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Update subscription status to pending_payment to flag it for the administrator
    await supabase
      .from("subscriptions")
      .update({
        subscription_status: "pending_payment",
        updated_at: new Date().toISOString()
      })
      .eq("id", subscriptionId);

    return NextResponse.json({
      success: true,
      message: "Pago reportado con éxito. Está en espera de verificación por el administrador.",
      payment
    });
  } catch (error) {
    console.error("Renew report payment error:", error);
    return NextResponse.json({ error: "Error interno al reportar el pago" }, { status: 500 });
  }
}
