import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// --- ENV CONFIG ---
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Sanitize: strip surrounding quotes and whitespace
if (SUPABASE_URL) {
  SUPABASE_URL = SUPABASE_URL.replace(/^['"]|['"]$/g, "").trim();
}
if (SUPABASE_SERVICE_ROLE_KEY) {
  SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY.replace(/^['"]|['"]$/g, "").trim();
}

// Validate URL format
let isValidUrl = false;
if (SUPABASE_URL) {
  try {
    new URL(SUPABASE_URL);
    isValidUrl = true;
  } catch (e) {
    isValidUrl = false;
  }
}

const isConfigured = isValidUrl && SUPABASE_URL !== "https://placeholder.supabase.co" && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY !== "placeholder_key";

// Initialize official Supabase client (using service role key on backend to bypass RLS)
export let supabase;
try {
  supabase = createSupabaseClient(
    isConfigured ? SUPABASE_URL : "https://placeholder.supabase.co",
    isConfigured ? SUPABASE_SERVICE_ROLE_KEY : "placeholder_key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
} catch (e) {
  console.error("⚠️ Failed to initialize Supabase client with configured variables:", e);
  supabase = createSupabaseClient(
    "https://placeholder.supabase.co",
    "placeholder_key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

if (!isConfigured) {
  console.warn("⚠️ Supabase credentials not fully configured. Database requests will run with placeholders.");
}

// Assert configuration helper to prevent silent mock fallback in production/runtime
function assertConfig() {
  if (!isConfigured) {
    throw new Error("Base de datos Supabase no configurada o mal configurada. Verifica que hayas configurado las variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel sin comillas ni espacios adicionales, y que hayas hecho un Redeploy.");
  }
}

// --- DATABASE INITIALIZER ---
export async function initDb() {
  // Supabase client is initialized synchronously. No-op for compatibility.
  return;
}

// --- LOG EVENT HELPER (Audit Trail) ---
export async function logEvent(entityType, entityId, eventType, oldValue = null, newValue = null, reason = "") {
  try {
    assertConfig();
    await supabase.from("events_log").insert({
      entity_type: entityType,
      entity_id: String(entityId),
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
      performed_by: "admin",
      reason: reason || "Updated from Admin Panel"
    });
  } catch (error) {
    console.error("Error writing audit event log:", error);
  }
}

// --- CLIENT DATA FORMATTER HELPER ---
function formatClient(customer) {
  if (!customer) return null;
  const contacts = customer.customer_contacts || [];
  const primaryWhatsApp = contacts.find(c => c.contact_type === "whatsapp" && c.is_primary)?.contact_value || "";
  const pastWhatsApps = contacts.filter(c => c.contact_type === "whatsapp" && !c.is_primary).map(c => c.contact_value);
  const usedEmails = contacts.filter(c => c.contact_type === "email").map(c => c.contact_value);

  return {
    id: customer.id,
    _id: customer.id,
    customerCode: customer.customer_code,
    nickname: customer.display_name || customer.customer_code || "Cliente",
    currentWhatsApp: primaryWhatsApp,
    pastWhatsApps,
    usedEmails,
    notes: customer.notes || "",
    status: customer.status,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at
  };
}

// --- PROFILE/SLOT FORMATTER HELPER ---
function formatMemberProfile(slot, clientData = null, familyAccountData = null) {
  if (!slot) return null;

  // Format client object if populated
  let client = null;
  if (slot.customers) {
    client = formatClient(slot.customers);
  } else if (clientData) {
    client = clientData;
  }

  // Format parent family account if populated
  let familyAccount = slot.platform_account_id;
  if (slot.platform_accounts) {
    familyAccount = {
      id: slot.platform_accounts.id,
      _id: slot.platform_accounts.id,
      service: slot.platform_accounts.platform_code,
      masterEmail: slot.platform_accounts.account_email,
      password: slot.platform_accounts.account_password,
      notes: slot.platform_accounts.notes || "",
      createdAt: slot.platform_accounts.created_at
    };
  } else if (familyAccountData) {
    familyAccount = familyAccountData;
  }

  // Get pricing/renewal details
  let pricePen = 0;
  let renewalDate = null;
  if (slot.status !== "free" && slot.subscriptions && slot.subscriptions.length > 0) {
    // Pick the most recent active or pending subscription
    const activeSub = slot.subscriptions.find(s => s.subscription_status === "active" || s.subscription_status === "pending_payment") || slot.subscriptions[0];
    pricePen = Number(activeSub.plan_price) || 0;
    renewalDate = activeSub.renewal_date;
  }

  return {
    id: slot.id,
    _id: slot.id,
    familyAccountId: familyAccount,
    clientId: client,
    memberEmail: slot.member_email || "",
    emailType: slot.email_type || "admin",
    memberPassword: slot.member_password || "",
    pricePen,
    renewalDate,
    status: slot.status,
    updatedAt: slot.updated_at
  };
}

// --- ORDER FORMATTER HELPER ---
function formatOrder(o) {
  if (!o) return null;
  return {
    id: o.id,
    _id: o.id,
    orderId: o.order_id,
    fullName: o.full_name,
    email: o.email,
    whatsapp: o.whatsapp,
    service: o.service,
    duration: o.duration,
    pricePen: o.price_pen,
    priceUsd: o.price_usd,
    paymentMethod: o.payment_method,
    status: o.status,
    assignedAccount: o.assigned_account,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  };
}

// --- ORDERS API ---

export async function getOrders() {
  assertConfig();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(formatOrder);
}

export async function getOrderById(orderId) {
  assertConfig();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  return formatOrder(data);
}

export async function createOrder(orderData) {
  assertConfig();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_id: orderData.orderId,
      full_name: orderData.fullName,
      email: orderData.email,
      whatsapp: orderData.whatsapp,
      service: orderData.service,
      duration: orderData.duration,
      price_pen: orderData.pricePen,
      price_usd: orderData.priceUsd,
      payment_method: orderData.paymentMethod,
      status: orderData.status,
      assigned_account: orderData.assignedAccount,
      created_at: orderData.createdAt
    })
    .select()
    .single();
  if (error) throw error;
  return formatOrder(data);
}

export async function updateOrder(orderId, updatedFields) {
  assertConfig();
  const fields = {};
  if (updatedFields.status !== undefined) fields.status = updatedFields.status;
  if (updatedFields.assignedAccount !== undefined) fields.assigned_account = updatedFields.assignedAccount;
  fields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("orders")
    .update(fields)
    .eq("order_id", orderId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return formatOrder(data);
}

// --- STOCK API (Unlinked stock credentials) ---

export async function getStock() {
  assertConfig();
  const { data, error } = await supabase.from("stock").select("*");
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id,
    service: s.service,
    accountData: s.account_data,
    isUsed: s.is_used,
    assignedToOrder: s.assigned_to_order,
    createdAt: s.created_at
  }));
}

export async function addStockItems(items) {
  assertConfig();
  const mapped = items.map(s => ({
    id: s.id,
    service: s.service,
    account_data: s.accountData,
    is_used: s.isUsed || false,
    assigned_to_order: s.assignedToOrder || null
  }));
  const { error } = await supabase.from("stock").insert(mapped);
  if (error) throw error;
}

export async function deleteStockItem(id) {
  assertConfig();
  const { error } = await supabase.from("stock").delete().eq("id", id);
  if (error) throw error;
}

// --- CLIENTS & SEARCH ---

export async function getClients() {
  assertConfig();
  const { data, error } = await supabase
    .from("customers")
    .select("*, customer_contacts(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(formatClient);
}

export async function getClientById(id) {
  assertConfig();
  const { data, error } = await supabase
    .from("customers")
    .select("*, customer_contacts(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return formatClient(data);
}

export async function createClient(clientData) {
  assertConfig();
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      display_name: clientData.nickname || "",
      notes: clientData.notes || ""
    })
    .select()
    .single();
  if (error) throw error;

  // Insert primary phone number contact row
  if (clientData.currentWhatsApp) {
    const cleanPhone = clientData.currentWhatsApp.replace(/\D/g, "");
    await supabase.from("customer_contacts").insert({
      customer_id: customer.id,
      contact_type: "whatsapp",
      contact_value: clientData.currentWhatsApp,
      normalized_value: cleanPhone,
      is_primary: true,
      status: "active"
    });
  }

  // Insert emails if any
  if (clientData.usedEmails && clientData.usedEmails.length > 0) {
    for (const email of clientData.usedEmails) {
      await supabase.from("customer_contacts").insert({
        customer_id: customer.id,
        contact_type: "email",
        contact_value: email,
        normalized_value: email.trim().toLowerCase(),
        is_primary: false,
        status: "active"
      });
    }
  }

  // Fetch fully populated client
  const { data: finalCustomer } = await supabase
    .from("customers")
    .select("*, customer_contacts(*)")
    .eq("id", customer.id)
    .single();

  await logEvent("customer", customer.id, "create", null, finalCustomer, "Client created");
  return formatClient(finalCustomer);
}

export async function updateClient(id, updatedFields) {
  assertConfig();
  const fields = {};
  if (updatedFields.nickname !== undefined) fields.display_name = updatedFields.nickname;
  if (updatedFields.notes !== undefined) fields.notes = updatedFields.notes;
  fields.updated_at = new Date().toISOString();

  // Get old value for log
  const { data: oldData } = await supabase.from("customers").select("*, customer_contacts(*)").eq("id", id).maybeSingle();

  if (Object.keys(fields).length > 0) {
    const { error } = await supabase.from("customers").update(fields).eq("id", id);
    if (error) throw error;
  }

  // Update contacts if specified
  if (updatedFields.currentWhatsApp !== undefined) {
    const cleanPhone = updatedFields.currentWhatsApp.replace(/\D/g, "");
    // Mark previous primary whatsapp as not primary
    await supabase
      .from("customer_contacts")
      .update({ is_primary: false, status: "inactive" })
      .eq("customer_id", id)
      .eq("contact_type", "whatsapp")
      .eq("is_primary", true);

    // Check if new number already in contacts
    const { data: existing } = await supabase
      .from("customer_contacts")
      .select("id")
      .eq("customer_id", id)
      .eq("contact_type", "whatsapp")
      .eq("normalized_value", cleanPhone)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("customer_contacts")
        .update({ is_primary: true, status: "active" })
        .eq("id", existing.id);
    } else {
      await supabase.from("customer_contacts").insert({
        customer_id: id,
        contact_type: "whatsapp",
        contact_value: updatedFields.currentWhatsApp,
        normalized_value: cleanPhone,
        is_primary: true,
        status: "active"
      });
    }
  }

  if (updatedFields.usedEmails !== undefined) {
    // Insert new emails that aren't there
    const { data: existingEmails } = await supabase
      .from("customer_contacts")
      .select("normalized_value")
      .eq("customer_id", id)
      .eq("contact_type", "email");
    const existingSet = new Set((existingEmails || []).map(e => e.normalized_value));

    for (const email of updatedFields.usedEmails) {
      const cleanEmail = email.trim().toLowerCase();
      if (!existingSet.has(cleanEmail)) {
        await supabase.from("customer_contacts").insert({
          customer_id: id,
          contact_type: "email",
          contact_value: email.trim(),
          normalized_value: cleanEmail,
          is_primary: false,
          status: "active"
        });
      }
    }
  }

  const { data: newData } = await supabase.from("customers").select("*, customer_contacts(*)").eq("id", id).maybeSingle();
  await logEvent("customer", id, "update", oldData, newData, "Client fields updated");
  return formatClient(newData);
}

export async function searchClients(query) {
  assertConfig();
  const trimQuery = query.trim();
  if (!trimQuery) return [];

  // Search by display_name or matching contacts
  const cleanPhone = trimQuery.replace(/\D/g, "");
  const cleanEmail = trimQuery.trim().toLowerCase();

  // Find contact matches first
  let customerIds = [];
  if (cleanPhone || cleanEmail) {
    const { data: contacts } = await supabase
      .from("customer_contacts")
      .select("customer_id")
      .or(`normalized_value.like.%${cleanPhone || "non_existent"}%,normalized_value.ilike.%${cleanEmail}%`);
    if (contacts && contacts.length > 0) {
      customerIds = contacts.map(c => c.customer_id);
    }
  }

  // Get matching customers
  let dbQuery = supabase.from("customers").select("*, customer_contacts(*)");
  if (customerIds.length > 0) {
    dbQuery = dbQuery.or(`id.in.(${customerIds.map(id => `"${id}"`).join(",")}),display_name.ilike.%${trimQuery}%,customer_code.ilike.%${trimQuery}%`);
  } else {
    dbQuery = dbQuery.or(`display_name.ilike.%${trimQuery}%,customer_code.ilike.%${trimQuery}%`);
  }

  const { data, error } = await dbQuery.order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(formatClient);
}

export async function getOrCreateClient(whatsapp, nickname, email) {
  assertConfig();
  const cleanPhone = whatsapp.replace(/\D/g, "");

  // Look for client with primary or past whatsapp matching
  const { data: matchedContacts } = await supabase
    .from("customer_contacts")
    .select("customer_id")
    .eq("contact_type", "whatsapp")
    .eq("normalized_value", cleanPhone);

  let customerId = null;
  if (matchedContacts && matchedContacts.length > 0) {
    customerId = matchedContacts[0].customer_id;
  }

  // Look by email
  if (!customerId && email) {
    const cleanEmail = email.trim().toLowerCase();
    const { data: emailContacts } = await supabase
      .from("customer_contacts")
      .select("customer_id")
      .eq("contact_type", "email")
      .eq("normalized_value", cleanEmail);

    if (emailContacts && emailContacts.length > 0) {
      customerId = emailContacts[0].customer_id;
    }
  }

  if (customerId) {
    const updatedFields = {};
    const clientRecord = await getClientById(customerId);
    if (nickname && nickname !== clientRecord.nickname) {
      updatedFields.nickname = nickname;
    }
    if (clientRecord.currentWhatsApp !== whatsapp) {
      updatedFields.currentWhatsApp = whatsapp;
    }
    const emails = clientRecord.usedEmails || [];
    if (email && !emails.includes(email)) {
      emails.push(email);
      updatedFields.usedEmails = emails;
    }

    if (Object.keys(updatedFields).length > 0) {
      return await updateClient(customerId, updatedFields);
    }
    return clientRecord;
  } else {
    return await createClient({
      nickname: nickname || "",
      currentWhatsApp: whatsapp,
      pastWhatsApps: [],
      usedEmails: email ? [email] : [],
      notes: ""
    });
  }
}

// --- FAMILY ACCOUNTS CRUD ---

export async function getFamilyAccounts() {
  assertConfig();
  const { data, error } = await supabase
    .from("platform_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data || []).map(acc => ({
    id: acc.id,
    _id: acc.id,
    service: acc.platform_code,
    masterEmail: acc.account_email,
    password: acc.account_password,
    notes: acc.notes || "",
    createdAt: acc.created_at
  }));
}

export async function getFamilyAccountById(id) {
  assertConfig();
  const { data, error } = await supabase
    .from("platform_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    _id: data.id,
    service: data.platform_code,
    masterEmail: data.account_email,
    password: data.account_password,
    notes: data.notes || "",
    createdAt: data.created_at
  };
}

export async function createFamilyAccount(accountData) {
  assertConfig();
  const { data, error } = await supabase
    .from("platform_accounts")
    .insert({
      platform_code: accountData.service,
      account_email: accountData.masterEmail,
      account_password: accountData.password,
      notes: accountData.notes || ""
    })
    .select()
    .single();
  if (error) throw error;

  const result = {
    id: data.id,
    _id: data.id,
    service: data.platform_code,
    masterEmail: data.account_email,
    password: data.account_password,
    notes: data.notes || "",
    createdAt: data.created_at
  };

  await logEvent("family_account", data.id, "create", null, result, "Family account created");
  return result;
}

export async function updateFamilyAccount(id, updatedFields) {
  assertConfig();
  const fields = {};
  if (updatedFields.service !== undefined) fields.platform_code = updatedFields.service;
  if (updatedFields.masterEmail !== undefined) fields.account_email = updatedFields.masterEmail;
  if (updatedFields.password !== undefined) fields.account_password = updatedFields.password;
  if (updatedFields.notes !== undefined) fields.notes = updatedFields.notes;
  fields.updated_at = new Date().toISOString();

  const { data: oldData } = await supabase.from("platform_accounts").select("*").eq("id", id).maybeSingle();

  const { data, error } = await supabase
    .from("platform_accounts")
    .update(fields)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const result = {
    id: data.id,
    _id: data.id,
    service: data.platform_code,
    masterEmail: data.account_email,
    password: data.account_password,
    notes: data.notes || "",
    createdAt: data.created_at
  };

  await logEvent("family_account", id, "update", oldData, result, "Family account updated");
  return result;
}

export async function deleteFamilyAccount(id) {
  assertConfig();
  const { data: oldData } = await supabase.from("platform_accounts").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("platform_accounts").delete().eq("id", id);
  if (error) throw error;
  await logEvent("family_account", id, "delete", oldData, null, "Family account deleted");
}

// --- MEMBER PROFILES (Slots) CRUD ---

export async function getMemberProfiles(filters = {}) {
  assertConfig();
  let query = supabase
    .from("account_slots")
    .select("*, platform_accounts(*), customers(*, customer_contacts(*)), subscriptions(*)");

  if (filters.familyAccountId) {
    query = query.eq("platform_account_id", filters.familyAccountId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;

  return (data || []).map(slot => formatMemberProfile(slot));
}

export async function getMemberProfileById(id) {
  assertConfig();
  const { data, error } = await supabase
    .from("account_slots")
    .select("*, platform_accounts(*), customers(*, customer_contacts(*)), subscriptions(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return formatMemberProfile(data);
}

export async function createMemberProfile(profileData) {
  assertConfig();
  let slotNum = profileData.slotNumber;
  if (!slotNum) {
    const { count } = await supabase
      .from("account_slots")
      .select("*", { count: "exact", head: true })
      .eq("platform_account_id", profileData.familyAccountId);
    slotNum = (count || 0) + 1;
  }

  const { data, error } = await supabase
    .from("account_slots")
    .insert({
      platform_account_id: profileData.familyAccountId,
      customer_id: profileData.clientId,
      slot_number: slotNum,
      member_email: profileData.memberEmail || "",
      email_type: profileData.emailType || "admin",
      member_password: profileData.memberPassword || "",
      status: profileData.status || "free"
    })
    .select("*, platform_accounts(*)")
    .single();
  if (error) throw error;

  return formatMemberProfile(data);
}

export async function updateMemberProfile(id, updatedFields) {
  assertConfig();

  // Retrieve current slot record before modifications
  const { data: oldSlot } = await supabase
    .from("account_slots")
    .select("*, platform_accounts(*), customers(*, customer_contacts(*)), subscriptions(*)")
    .eq("id", id)
    .maybeSingle();

  if (!oldSlot) return null;

  const fields = {};
  if (updatedFields.clientId !== undefined) fields.customer_id = updatedFields.clientId;
  if (updatedFields.memberEmail !== undefined) fields.member_email = updatedFields.memberEmail;
  if (updatedFields.emailType !== undefined) fields.email_type = updatedFields.emailType;
  if (updatedFields.memberPassword !== undefined) fields.member_password = updatedFields.memberPassword;
  if (updatedFields.status !== undefined) fields.status = updatedFields.status;
  fields.updated_at = new Date().toISOString();

  // Perform slot update
  const { error: slotUpdateError } = await supabase
    .from("account_slots")
    .update(fields)
    .eq("id", id);
  if (slotUpdateError) throw slotUpdateError;

  const currentClientId = updatedFields.clientId !== undefined ? updatedFields.clientId : oldSlot.customer_id;
  const currentStatus = updatedFields.status !== undefined ? updatedFields.status : oldSlot.status;

  // Manage Subscription and Payment Ledgers
  if (currentStatus !== "free" && currentClientId) {
    const price = updatedFields.pricePen !== undefined ? updatedFields.pricePen : 0;
    const renewalDate = updatedFields.renewalDate !== undefined ? updatedFields.renewalDate : null;
    let renewalDateStr = null;
    if (renewalDate) {
      if (renewalDate instanceof Date) {
        renewalDateStr = renewalDate.toISOString().substring(0, 10);
      } else if (typeof renewalDate === "string") {
        renewalDateStr = renewalDate.substring(0, 10);
      }
    }

    // Check if there is an active subscription on this slot for this customer
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("account_slot_id", id)
      .eq("customer_id", currentClientId)
      .eq("subscription_status", "active")
      .maybeSingle();

    let subscriptionId = existingSub?.id;

    if (existingSub) {
      // Update subscription dates and status
      const { data: updatedSub } = await supabase
        .from("subscriptions")
        .update({
          plan_price: price,
          renewal_date: renewalDateStr,
          subscription_status: currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingSub.id)
        .select()
        .single();
      
      subscriptionId = updatedSub.id;
    } else {
      // Create a brand new active subscription record
      const serviceCode = oldSlot.platform_accounts?.platform_code || "tidal";
      const { data: newSub } = await supabase
        .from("subscriptions")
        .insert({
          customer_id: currentClientId,
          platform_code: serviceCode,
          platform_account_id: oldSlot.platform_account_id,
          account_slot_id: id,
          activation_email: updatedFields.memberEmail || oldSlot.member_email || "",
          activation_email_owner: updatedFields.emailType || oldSlot.email_type || "admin",
          plan_price: price,
          currency: "PEN",
          start_date: new Date().toISOString().substring(0, 10),
          renewal_date: renewalDateStr || new Date().toISOString().substring(0, 10),
          subscription_status: currentStatus
        })
        .select()
        .single();

      subscriptionId = newSub.id;
    }

    // Record Payment Transaction if this was a renewal/purchase action
    if (price > 0 && subscriptionId) {
      await supabase.from("payments").insert({
        customer_id: currentClientId,
        subscription_id: subscriptionId,
        amount: price,
        currency: "PEN",
        payment_method: "Manual / Panel Admin",
        payment_status: "confirmed",
        coverage_from: new Date().toISOString().substring(0, 10),
        coverage_to: renewalDateStr || new Date().toISOString().substring(0, 10)
      });
    }
  } else if (currentStatus === "free") {
    // If the slot is freed up, expire/cancel any currently active subscriptions for this slot
    await supabase
      .from("subscriptions")
      .update({
        subscription_status: "expired",
        updated_at: new Date().toISOString()
      })
      .eq("account_slot_id", id)
      .eq("subscription_status", "active");
  }

  // Fetch updated slot
  const { data: finalSlot } = await supabase
    .from("account_slots")
    .select("*, platform_accounts(*), customers(*, customer_contacts(*)), subscriptions(*)")
    .eq("id", id)
    .single();

  const formattedProfile = formatMemberProfile(finalSlot);
  await logEvent("member_profile", id, "update", oldSlot, formattedProfile, "Member slot updated");
  return formattedProfile;
}

export async function deleteMemberProfile(id) {
  assertConfig();
  const { data: oldData } = await supabase.from("account_slots").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("account_slots").delete().eq("id", id);
  if (error) throw error;
  await logEvent("member_profile", id, "delete", oldData, null, "Member slot deleted");
}

// --- STOCK & ORDER AUTO-ASSIGNMENT ---

export async function assignStockAccount(orderId, service) {
  assertConfig();

  // 1. Fetch order
  const order = await getOrderById(orderId);
  if (!order) return null;

  // 2. Fetch all accounts configured for this service
  const { data: accounts } = await supabase
    .from("platform_accounts")
    .select("id")
    .eq("platform_code", service);

  if (!accounts || accounts.length === 0) return null;
  const accountIds = accounts.map(a => a.id);

  // 3. Find a free slot in these accounts with member_email filled out
  const { data: freeSlots, error } = await supabase
    .from("account_slots")
    .select("*, platform_accounts(*)")
    .in("platform_account_id", accountIds)
    .eq("status", "free")
    .neq("member_email", "")
    .limit(1);

  if (error || !freeSlots || freeSlots.length === 0) return null;
  const slot = freeSlots[0];

  // 4. Create or obtain permanent Client record
  const client = await getOrCreateClient(order.whatsapp, order.fullName, order.email);
  const clientId = client.id;

  // 5. Calculate pricing and renewal dates
  const pricePenNum = parsePrice(order.pricePen);
  const durationMonths = parseDurationMonths(order.duration);
  const renewalDateVal = calculateRenewalDate(new Date(), durationMonths);

  // 6. Bind client to the slot and make active
  const renewalDateStr = renewalDateVal.toISOString().substring(0, 10);
  await updateMemberProfile(slot.id, {
    clientId,
    pricePen: pricePenNum,
    renewalDate: renewalDateStr,
    status: "active"
  });

  // 7. Update the order object with the credentials delivered
  const accountInfo = `Correo: ${slot.member_email} | Clave: ${slot.member_password}`;
  await updateOrder(orderId, { assignedAccount: accountInfo });

  return accountInfo;
}

// --- UTILITY LOGIC FUNCTIONS ---

export function calculateRenewalDate(purchaseDate, monthsToAdd) {
  let date = new Date(purchaseDate);
  const day = date.getDate();

  if (day === 31) {
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
  }

  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
}

const COUNTRY_MAP = {
  "51": { code: "PE", name: "Perú", flag: "🇵🇪" },
  "54": { code: "AR", name: "Argentina", flag: "🇦🇷" },
  "56": { code: "CL", name: "Chile", flag: "🇨🇱" },
  "57": { code: "CO", name: "Colombia", flag: "🇨🇴" },
  "52": { code: "MX", name: "México", flag: "🇲🇽" },
  "34": { code: "ES", name: "España", flag: "🇪🇸" },
  "58": { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  "591": { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  "593": { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  "502": { code: "GT", name: "Guatemala", flag: "🇬🇹" }
};

export function getCountryFromPhone(phoneNumber) {
  if (!phoneNumber) return { code: "INT", name: "Otro / Internacional", flag: "🌐" };
  const cleanPhone = phoneNumber.replace(/\D/g, "");

  const prefix3 = cleanPhone.substring(0, 3);
  if (COUNTRY_MAP[prefix3]) return COUNTRY_MAP[prefix3];

  const prefix2 = cleanPhone.substring(0, 2);
  if (COUNTRY_MAP[prefix2]) return COUNTRY_MAP[prefix2];

  return { code: "INT", name: "Otro / Internacional", flag: "🌐" };
}

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const match = priceStr.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function parseDurationMonths(durationStr) {
  if (!durationStr) return 1;
  const match = durationStr.match(/\d+/);
  return match ? parseInt(match[0]) : 1;
}

// --- BULK OPERATIONS API ---

export async function updateMemberProfilesBulk(ids, updatedFields) {
  assertConfig();
  const results = [];
  for (const id of ids) {
    const res = await updateMemberProfile(id, updatedFields);
    results.push(res);
  }
  return results;
}

export async function extendMemberProfilesBulk(ids, monthsToAdd) {
  assertConfig();
  const results = [];
  for (const id of ids) {
    const slot = await getMemberProfileById(id);
    if (!slot || slot.status === "free") continue;

    // Calculate new date based on individual current renewal date
    let baseDate = slot.renewalDate ? new Date(slot.renewalDate) : new Date();
    const newRenewalDate = calculateRenewalDate(baseDate, monthsToAdd);
    const renewalDateStr = newRenewalDate.toISOString().substring(0, 10);

    const res = await updateMemberProfile(id, {
      pricePen: slot.pricePen,
      renewalDate: renewalDateStr,
      status: slot.status
    });
    results.push(res);
  }
  return results;
}

export async function clearMemberProfilesBulk(ids) {
  assertConfig();
  const results = [];
  for (const id of ids) {
    const res = await updateMemberProfile(id, {
      clientId: null,
      memberEmail: "",
      memberPassword: "",
      pricePen: 0,
      renewalDate: null,
      status: "free"
    });
    results.push(res);
  }
  return results;
}

