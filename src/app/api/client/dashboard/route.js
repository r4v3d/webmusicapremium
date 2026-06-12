import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/db";
import { getCustomerSession } from "../../../../lib/libClientAuth";
import { CONFIG } from "../../../../data/config";

export async function GET() {
  try {
    // Validate session
    const customerId = await getCustomerSession();
    if (!customerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Fetch customer details
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*, customer_contacts(*)")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Fetch customer subscriptions with related family accounts and slots
    const { data: subscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        platform_accounts:platform_account_id(*),
        account_slots:account_slot_id(*)
      `)
      .eq("customer_id", customerId)
      .order("renewal_date", { ascending: true }); // Soonest to expire first

    if (subError) throw subError;

    // Process and format subscriptions for display
    const activeSubscriptions = [];
    const expiredSubscriptions = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sub of (subscriptions || [])) {
      // Calculate remaining days
      let daysRemaining = 0;
      let isExpired = true;
      let renewalDateObj = null;

      if (sub.renewal_date) {
        renewalDateObj = new Date(sub.renewal_date);
        renewalDateObj.setHours(23, 59, 59, 999); // End of renewal day
        const diffTime = renewalDateObj - today;
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isExpired = daysRemaining < 0;
      }

      // Resolve login credentials
      // Account Slot takes priority for profile details.
      const slot = sub.account_slots;
      const account = sub.platform_accounts;

      let emailAcc = "";
      let passwordAcc = "";
      let profileLabel = "";

      if (slot) {
        // If email type is "admin", the user logs in with the master email of the family account.
        // If it is "customer", they use the member email.
        emailAcc = slot.email_type === "admin" && account 
          ? account.account_email 
          : slot.member_email || account?.account_email || "";
        
        // Similarly for passwords
        passwordAcc = slot.member_password || account?.account_password || "";
        profileLabel = slot.slot_label || `Perfil ${slot.slot_number || ""}`;
      } else if (account) {
        // Complete account subscription
        emailAcc = account.account_email || "";
        passwordAcc = account.account_password || "";
        profileLabel = "Cuenta Completa";
      } else {
        // Fallback to subscription values
        emailAcc = sub.activation_email || "";
        passwordAcc = "";
        profileLabel = "Sin asignar";
      }

      // Check for pending payments under this subscription
      const { data: pendingPayments } = await supabase
        .from("payments")
        .select("id, amount, payment_method, created_at, proof_url")
        .eq("subscription_id", sub.id)
        .eq("payment_status", "pending");

      const hasPendingReport = pendingPayments && pendingPayments.length > 0;

      const formattedSub = {
        id: sub.id,
        service: sub.platform_code || "tidal",
        serviceName: CONFIG.services[sub.platform_code]?.name || (sub.platform_code || "Tidal").toUpperCase(),
        email: emailAcc,
        password: passwordAcc,
        profile: profileLabel,
        pricePen: sub.plan_price || 0,
        renewalDate: sub.renewal_date,
        daysRemaining: isExpired ? 0 : daysRemaining,
        status: sub.subscription_status,
        hasPendingReport,
        pendingReportDetails: hasPendingReport ? pendingPayments[0] : null
      };

      if (isExpired || sub.subscription_status === "expired" || sub.subscription_status === "cancelled") {
        expiredSubscriptions.push(formattedSub);
      } else {
        activeSubscriptions.push(formattedSub);
      }
    }

    // Retrieve last 10 payments for payment history
    const { data: paymentHistory, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, currency, payment_method, payment_status, created_at, notes")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (paymentError) console.error("Payment history fetch error:", paymentError);

    // Format contact phone number
    const contacts = customer.customer_contacts || [];
    const phone = contacts.find(c => c.contact_type === "whatsapp")?.contact_value || "";

    return NextResponse.json({
      success: true,
      client: {
        id: customer.id,
        nickname: customer.display_name || customer.legal_name || "Cliente",
        phone,
        email: contacts.find(c => c.contact_type === "email")?.contact_value || ""
      },
      activeSubscriptions,
      expiredSubscriptions,
      payments: paymentHistory || [],
      paymentMethods: CONFIG.payments
    });
  } catch (error) {
    console.error("Fetch dashboard data error:", error);
    return NextResponse.json({ error: "Error al cargar la información del panel" }, { status: 500 });
  }
}
