// Capa de datos sobre PostgreSQL propio (§5.3). Mantiene la forma de los
// objetos que ya consume el panel (camelCase, `_id`, relaciones anidadas).
import { query, queryOne, withTransaction } from "./pg";
import { calculateRenewalDate } from "./renewal";
import { insertPayment } from "./ledger";
import { CONFIG } from "../data/config";

export function formatDatabaseError(error) {
  const message = error?.message || String(error || "Error desconocido");
  const code = error?.code || error?.cause?.code || "";
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "57P03"].includes(code) || message.includes("DATABASE_URL")) {
    return "No se pudo conectar a PostgreSQL. Revisa que el servicio esté activo (systemctl status postgresql) y que DATABASE_URL sea correcta.";
  }
  if (message.includes("timeout exceeded when trying to connect")) {
    return "PostgreSQL no respondió a tiempo. El pool de conexiones puede estar agotado.";
  }
  return message;
}

/** 'YYYY-MM-DD'. Un Date se formatea en hora local (el servicio corre con TZ=America/Lima). */
export function toDateStr(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${m}-${d}`;
  }
  return String(value).substring(0, 10);
}

// --- AUDITORÍA ---

export async function logEvent(entityType, entityId, eventType, oldValue = null, newValue = null, reason = "", { tx = null, performedBy = "admin" } = {}) {
  const runner = tx || { query };
  try {
    await runner.query(
      `insert into events_log(entity_type, entity_id, event_type, old_value, new_value, performed_by, reason)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [entityType, String(entityId), eventType,
       oldValue == null ? null : JSON.stringify(oldValue),
       newValue == null ? null : JSON.stringify(newValue),
       performedBy, reason || "Updated from Admin Panel"]
    );
  } catch (error) {
    // Dentro de una transacción el error debe propagarse: un asiento sin auditoría no vale.
    if (tx) throw error;
    console.error("Error writing audit event log:", error);
  }
}

// --- FORMATEADORES ---

export const CONTACTS_JSON = `(select coalesce(json_agg(cc order by cc.id), '[]'::json)
                          from customer_contacts cc where cc.customer_id = c.id) as customer_contacts`;

export function formatClient(customer) {
  if (!customer) return null;
  const contacts = customer.customer_contacts || [];
  const primaryWhatsApp =
    contacts.find((c) => c.contact_type === "whatsapp" && c.is_primary)?.contact_value ||
    contacts.find((c) => c.contact_type === "whatsapp")?.contact_value || "";
  const pastWhatsApps = contacts
    .filter((c) => c.contact_type === "whatsapp" && c.contact_value !== primaryWhatsApp)
    .map((c) => c.contact_value);
  const usedEmails = contacts.filter((c) => c.contact_type === "email").map((c) => c.contact_value);

  return {
    id: customer.id,
    _id: customer.id,
    customerCode: customer.customer_code,
    nickname: customer.display_name || "",
    currentWhatsApp: primaryWhatsApp,
    pastWhatsApps,
    usedEmails,
    notes: customer.notes || "",
    status: customer.status,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
  };
}

export function formatFamilyAccount(acc) {
  if (!acc) return null;
  return {
    id: acc.id,
    _id: acc.id,
    service: acc.platform_code,
    masterEmail: acc.account_email,
    password: acc.account_password,
    notes: acc.notes || "",
    createdAt: acc.created_at,
    ownerRenewalDate: acc.owner_renewal_date,
    renewalCost: Number(acc.renewal_cost) || 0,
    renewalCurrency: acc.renewal_currency || "PEN",
  };
}

function pickCurrentSubscription(subscriptions) {
  if (!subscriptions || subscriptions.length === 0) return null;
  return subscriptions.find((s) => s.subscription_status === "active" || s.subscription_status === "pending_payment") || subscriptions[0];
}

function formatMemberProfile(slot) {
  if (!slot) return null;
  const sub = slot.status !== "free" ? pickCurrentSubscription(slot.subscriptions) : null;

  return {
    id: slot.id,
    _id: slot.id,
    familyAccountId: slot.platform_accounts ? formatFamilyAccount(slot.platform_accounts) : slot.platform_account_id,
    clientId: slot.customers ? formatClient(slot.customers) : null,
    memberEmail: slot.member_email || "",
    emailType: slot.email_type || "admin",
    memberPassword: slot.member_password || "",
    pricePen: sub ? Number(sub.plan_price) || 0 : 0,
    renewalDate: sub ? sub.renewal_date : null,
    status: slot.status,
    slotNumber: slot.slot_number,
    reservedUntil: slot.reserved_until || null,
    updatedAt: slot.updated_at,
  };
}

export function formatOrder(o) {
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
    planId: o.plan_id,
    pricePen: o.price_pen,
    priceUsd: o.price_usd,
    amountPen: o.amount_pen,
    amountUsdt: o.amount_usdt,
    payCurrency: o.pay_currency,
    paymentMethod: o.payment_method,
    status: o.status,
    assignedAccount: o.assigned_account,
    customerId: o.customer_id,
    salesChannel: o.sales_channel,
    accountSlotId: o.account_slot_id,
    subscriptionId: o.subscription_id,
    paidAt: o.paid_at,
    deliveredAt: o.delivered_at,
    expiresAt: o.expires_at,
    renewSubscriptionId: o.renew_subscription_id,
    deliveryAttempts: o.delivery_attempts,
    lastDeliveryError: o.last_delivery_error,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

// --- PEDIDOS ---

export async function getOrders(limit = 250) {
  const { rows } = await query("select * from orders order by created_at desc limit $1", [limit]);
  return rows.map(formatOrder);
}

export async function getOrderById(orderId) {
  return formatOrder(await queryOne("select * from orders where order_id = $1", [orderId]));
}

export async function createOrder(orderData, { tx = null } = {}) {
  const runner = tx || { query };
  const res = await runner.query(
    `insert into orders(
       order_id, full_name, email, whatsapp, service, duration, plan_id,
       price_pen, price_usd, amount_pen, amount_usdt, pay_currency,
       payment_method, status, customer_id, sales_channel, access_token, renew_subscription_id, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, coalesce($19::timestamptz, now()))
     returning *`,
    [orderData.orderId, orderData.fullName, orderData.email, orderData.whatsapp,
     orderData.service, orderData.duration, orderData.planId ?? null,
     orderData.pricePen ?? null, orderData.priceUsd ?? null,
     orderData.amountPen ?? null, orderData.amountUsdt ?? null, orderData.payCurrency ?? null,
     orderData.paymentMethod, orderData.status || "pending",
     orderData.customerId ?? null, orderData.salesChannel || "web",
     orderData.accessToken ?? null, orderData.renewSubscriptionId ?? null, orderData.createdAt ?? null]
  );
  return formatOrder(res.rows[0]);
}

/**
 * Cambios administrativos del pedido. `paid` y `delivered` NO pasan por aquí:
 * solo los escribe settlePayment()/deliverOrder() (§9.1).
 */
export async function updateOrder(orderId, updatedFields) {
  if (updatedFields.status === "paid" || updatedFields.status === "delivered") {
    throw new Error("El estado paid/delivered solo lo escribe la liquidación.");
  }
  const sets = ["updated_at = now()"];
  const params = [orderId];
  if (updatedFields.status !== undefined) {
    params.push(updatedFields.status);
    sets.push(`status = $${params.length}`);
  }
  if (updatedFields.assignedAccount !== undefined) {
    params.push(updatedFields.assignedAccount);
    sets.push(`assigned_account = $${params.length}`);
  }
  const row = await queryOne(`update orders set ${sets.join(", ")} where order_id = $1 returning *`, params);
  return formatOrder(row);
}

// --- CLIENTES ---

export async function getClients() {
  const { rows } = await query(`select c.*, ${CONTACTS_JSON} from customers c order by c.created_at desc`);
  return rows.map(formatClient);
}

export async function getClientById(id, { tx = null } = {}) {
  const runner = tx || { query };
  const res = await runner.query(`select c.*, ${CONTACTS_JSON} from customers c where c.id = $1`, [id]);
  return formatClient(res.rows[0]);
}

async function upsertPrimaryWhatsApp(tx, customerId, whatsapp) {
  const cleanPhone = String(whatsapp).replace(/\D/g, "");
  await tx.query(
    `update customer_contacts set is_primary = false, status = 'inactive'
      where customer_id = $1 and contact_type = 'whatsapp' and is_primary`,
    [customerId]
  );
  const existing = await tx.query(
    `select id from customer_contacts
      where customer_id = $1 and contact_type = 'whatsapp' and normalized_value = $2
      order by id limit 1`,
    [customerId, cleanPhone]
  );
  if (existing.rows[0]) {
    await tx.query("update customer_contacts set is_primary = true, status = 'active' where id = $1", [existing.rows[0].id]);
  } else {
    await tx.query(
      `insert into customer_contacts(customer_id, contact_type, contact_value, normalized_value, is_primary, status)
       values ($1,'whatsapp',$2,$3,true,'active')`,
      [customerId, whatsapp, cleanPhone]
    );
  }
}

async function addEmails(tx, customerId, emails) {
  for (const email of emails || []) {
    const clean = String(email || "").trim();
    if (!clean) continue;
    await tx.query(
      `insert into customer_contacts(customer_id, contact_type, contact_value, normalized_value, is_primary, status)
       select $1,'email',$2,$3,false,'active'
        where not exists (select 1 from customer_contacts
                           where customer_id = $1 and contact_type = 'email' and normalized_value = $3)`,
      [customerId, clean, clean.toLowerCase()]
    );
  }
}

export async function createClient(clientData, { tx = null } = {}) {
  const run = async (t) => {
    const res = await t.query(
      "insert into customers(display_name, notes) values ($1,$2) returning id",
      [clientData.nickname || "", clientData.notes || ""]
    );
    const id = res.rows[0].id;
    if (clientData.currentWhatsApp) await upsertPrimaryWhatsApp(t, id, clientData.currentWhatsApp);
    await addEmails(t, id, clientData.usedEmails);
    const client = await getClientById(id, { tx: t });
    await logEvent("customer", id, "create", null, client, "Client created", { tx: t });
    return client;
  };
  return tx ? run(tx) : withTransaction(run);
}

export async function updateClient(id, updatedFields, { tx = null } = {}) {
  const run = async (t) => {
    const oldData = await getClientById(id, { tx: t });
    const sets = ["updated_at = now()"];
    const params = [id];
    if (updatedFields.nickname !== undefined) {
      params.push(updatedFields.nickname);
      sets.push(`display_name = $${params.length}`);
    }
    if (updatedFields.notes !== undefined) {
      params.push(updatedFields.notes);
      sets.push(`notes = $${params.length}`);
    }
    await t.query(`update customers set ${sets.join(", ")} where id = $1`, params);
    if (updatedFields.currentWhatsApp !== undefined && updatedFields.currentWhatsApp) {
      await upsertPrimaryWhatsApp(t, id, updatedFields.currentWhatsApp);
    }
    if (updatedFields.usedEmails !== undefined) await addEmails(t, id, updatedFields.usedEmails);
    const newData = await getClientById(id, { tx: t });
    await logEvent("customer", id, "update", oldData, newData, "Client fields updated", { tx: t });
    return newData;
  };
  return tx ? run(tx) : withTransaction(run);
}

function sanitizeSearchTerm(value) {
  return String(value || "").replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function searchClients(rawQuery) {
  const term = sanitizeSearchTerm(rawQuery);
  if (!term) return [];
  const cleanPhone = term.replace(/\D/g, "");
  const { rows } = await query(
    `select c.*, ${CONTACTS_JSON}
       from customers c
      where c.display_name ilike $1
         or c.customer_code ilike $1
         or exists (
              select 1 from customer_contacts cc
               where cc.customer_id = c.id
                 and (cc.normalized_value ilike $2
                      or ($3 <> '' and cc.normalized_value like '%' || $3 || '%'))
            )
      order by c.created_at desc
      limit 200`,
    [`%${term}%`, `%${term.toLowerCase()}%`, cleanPhone.length >= 4 ? cleanPhone : ""]
  );
  return rows.map(formatClient);
}

export async function getOrCreateClient(whatsapp, nickname, email, { tx = null } = {}) {
  const run = async (t) => {
    const cleanPhone = whatsapp ? String(whatsapp).replace(/\D/g, "") : "";
    const isPhone = cleanPhone.length >= 6;
    let customerId = null;

    if (isPhone) {
      const res = await t.query(
        `select customer_id from customer_contacts
          where contact_type = 'whatsapp' and normalized_value = $1
          order by is_primary desc, id limit 1`,
        [cleanPhone]
      );
      customerId = res.rows[0]?.customer_id ?? null;
    } else {
      const nameToSearch = (nickname || whatsapp || "").trim();
      if (nameToSearch) {
        const res = await t.query("select id from customers where display_name ilike $1 limit 1", [sanitizeSearchTerm(nameToSearch)]);
        customerId = res.rows[0]?.id ?? null;
      }
    }

    if (!customerId) {
      return createClient({
        nickname: isPhone ? (nickname || "Cliente Nuevo") : (nickname || whatsapp || "Cliente Nuevo"),
        currentWhatsApp: isPhone ? whatsapp : "",
        usedEmails: email ? [email] : [],
        notes: "",
      }, { tx: t });
    }

    const clientRecord = await getClientById(customerId, { tx: t });
    const updatedFields = {};
    const targetNickname = isPhone ? nickname : (nickname || whatsapp);
    if (targetNickname && targetNickname !== clientRecord.nickname && targetNickname !== "Cliente Nuevo") {
      updatedFields.nickname = targetNickname;
    }
    if (isPhone && clientRecord.currentWhatsApp !== whatsapp) updatedFields.currentWhatsApp = whatsapp;
    if (email && !clientRecord.usedEmails.map((e) => e.toLowerCase()).includes(String(email).toLowerCase())) {
      updatedFields.usedEmails = [email];
    }
    return Object.keys(updatedFields).length > 0 ? updateClient(customerId, updatedFields, { tx: t }) : clientRecord;
  };
  return tx ? run(tx) : withTransaction(run);
}

// --- CUENTAS FAMILIARES ---

export async function getFamilyAccountById(id) {
  return formatFamilyAccount(await queryOne("select * from platform_accounts where id = $1", [id]));
}

export async function createFamilyAccount(accountData, { tx = null } = {}) {
  const run = async (t) => {
    const res = await t.query(
      `insert into platform_accounts(platform_code, account_email, account_password, notes,
                                     owner_renewal_date, renewal_cost, renewal_currency)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [accountData.service, accountData.masterEmail, accountData.password, accountData.notes || "",
       toDateStr(accountData.ownerRenewalDate), accountData.renewalCost || 0, accountData.renewalCurrency || "PEN"]
    );
    const result = formatFamilyAccount(res.rows[0]);
    await logEvent("family_account", result.id, "create", null, result, "Family account created", { tx: t });
    return result;
  };
  return tx ? run(tx) : withTransaction(run);
}

export async function updateFamilyAccount(id, updatedFields) {
  const map = {
    service: "platform_code",
    masterEmail: "account_email",
    password: "account_password",
    notes: "notes",
    ownerRenewalDate: "owner_renewal_date",
    renewalCost: "renewal_cost",
    renewalCurrency: "renewal_currency",
  };
  return withTransaction(async (tx) => {
    const old = await tx.query("select * from platform_accounts where id = $1 for update", [id]);
    if (!old.rows[0]) return null;
    const sets = ["updated_at = now()"];
    const params = [id];
    for (const [key, column] of Object.entries(map)) {
      if (updatedFields[key] === undefined) continue;
      params.push(key === "ownerRenewalDate" ? toDateStr(updatedFields[key]) : updatedFields[key]);
      sets.push(`${column} = $${params.length}`);
    }
    const res = await tx.query(`update platform_accounts set ${sets.join(", ")} where id = $1 returning *`, params);
    const result = formatFamilyAccount(res.rows[0]);
    await logEvent("family_account", id, "update", formatFamilyAccount(old.rows[0]), result, "Family account updated", { tx });
    return result;
  });
}

export async function deleteFamilyAccount(id) {
  await withTransaction(async (tx) => {
    const old = await tx.query("select * from platform_accounts where id = $1 for update", [id]);
    if (!old.rows[0]) return;
    // Las suscripciones históricas se conservan, sin referencia al inventario que desaparece.
    await tx.query(
      `update subscriptions set account_slot_id = null, platform_account_id = null, updated_at = now()
        where platform_account_id = $1
           or account_slot_id in (select id from account_slots where platform_account_id = $1)`,
      [id]
    );
    await tx.query("delete from account_slots where platform_account_id = $1", [id]);
    await tx.query("delete from platform_accounts where id = $1", [id]);
    await logEvent("family_account", id, "delete", formatFamilyAccount(old.rows[0]), null, "Family account deleted", { tx });
  });
}

// --- CUPOS (member profiles) ---

const SLOT_SELECT = `
  select s.*,
         to_json(pa) as platform_accounts,
         (select to_json(x) from (select c.*, ${CONTACTS_JSON} from customers c where c.id = s.customer_id) x) as customers,
         (select coalesce(json_agg(sb order by sb.id desc), '[]'::json)
            from subscriptions sb where sb.account_slot_id = s.id) as subscriptions
    from account_slots s
    left join platform_accounts pa on pa.id = s.platform_account_id`;

export async function getMemberProfileById(id, { tx = null } = {}) {
  const runner = tx || { query };
  const res = await runner.query(`${SLOT_SELECT} where s.id = $1`, [id]);
  return formatMemberProfile(res.rows[0]);
}

/** Cupos libres por servicio. Un cupo con reserva vencida vuelve a contar como libre (§15.2). */
export async function getFreeSlotsStock() {
  const { rows } = await query(
    `select pa.platform_code, count(*)::int as free
       from account_slots s
       join platform_accounts pa on pa.id = s.platform_account_id
      where s.status = 'free' or (s.status = 'reserved' and s.reserved_until < now())
      group by pa.platform_code`
  );
  const stock = Object.fromEntries(Object.keys(CONFIG.services).map((code) => [code, 0]));
  for (const row of rows) {
    if (stock[row.platform_code] !== undefined) stock[row.platform_code] = row.free;
  }
  return stock;
}

export async function createMemberProfile(profileData, { tx = null } = {}) {
  const run = async (t) => {
    let slotNum = profileData.slotNumber;
    if (!slotNum) {
      const res = await t.query(
        "select coalesce(max(slot_number), 0) + 1 as next from account_slots where platform_account_id = $1",
        [profileData.familyAccountId]
      );
      slotNum = res.rows[0].next;
    }
    const res = await t.query(
      `insert into account_slots(platform_account_id, customer_id, slot_number, member_email, email_type, member_password, status)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [profileData.familyAccountId, profileData.clientId ?? null, slotNum,
       profileData.memberEmail || "", profileData.emailType || "admin",
       profileData.memberPassword || "", profileData.status || "free"]
    );
    return getMemberProfileById(res.rows[0].id, { tx: t });
  };
  return tx ? run(tx) : withTransaction(run);
}

/**
 * Edita un cupo y mantiene su suscripción coherente. Ya NO escribe en `payments`
 * (defecto 1 de §2.3): el asiento contable lo registra quien cobra, nunca una edición.
 */
export async function updateMemberProfile(id, updatedFields, { tx = null } = {}) {
  const run = async (t) => {
    const oldRes = await t.query(`${SLOT_SELECT} where s.id = $1 for update of s`, [id]);
    const oldSlot = oldRes.rows[0];
    if (!oldSlot) return null;

    const map = {
      clientId: "customer_id",
      memberEmail: "member_email",
      emailType: "email_type",
      memberPassword: "member_password",
      status: "status",
    };
    const sets = ["updated_at = now()"];
    const params = [id];
    for (const [key, column] of Object.entries(map)) {
      if (updatedFields[key] === undefined) continue;
      params.push(updatedFields[key]);
      sets.push(`${column} = $${params.length}`);
    }
    const nextStatus = updatedFields.status !== undefined ? updatedFields.status : oldSlot.status;
    if (nextStatus !== "reserved") sets.push("reserved_until = null", "reserved_for_order = null");
    await t.query(`update account_slots set ${sets.join(", ")} where id = $1`, params);

    const currentClientId = updatedFields.clientId !== undefined ? updatedFields.clientId : oldSlot.customer_id;

    if (nextStatus !== "free" && nextStatus !== "reserved" && currentClientId) {
      // Un cupo no puede tener dos suscripciones vivas: si cambió de cliente, la anterior termina.
      await t.query(
        `update subscriptions set subscription_status = 'expired', updated_at = now()
          where account_slot_id = $1 and customer_id is distinct from $2
            and subscription_status in ('active','pending_payment')`,
        [id, currentClientId]
      );

      const existing = await t.query(
        `select * from subscriptions
          where account_slot_id = $1 and customer_id = $2
            and subscription_status in ('active','pending_payment')
          order by id desc limit 1`,
        [id, currentClientId]
      );
      const renewalDateStr = updatedFields.renewalDate !== undefined ? toDateStr(updatedFields.renewalDate) : undefined;

      if (existing.rows[0]) {
        const subSets = ["updated_at = now()", "subscription_status = $2"];
        const subParams = [existing.rows[0].id, nextStatus];
        if (updatedFields.pricePen !== undefined) {
          subParams.push(Number(updatedFields.pricePen) || 0);
          subSets.push(`plan_price = $${subParams.length}`);
        }
        if (renewalDateStr !== undefined) {
          subParams.push(renewalDateStr);
          subSets.push(`renewal_date = $${subParams.length}::date`);
        }
        await t.query(`update subscriptions set ${subSets.join(", ")} where id = $1`, subParams);
      } else {
        await t.query(
          `insert into subscriptions(
             customer_id, platform_code, platform_account_id, account_slot_id,
             activation_email, activation_email_owner, plan_price, currency,
             start_date, renewal_date, subscription_status)
           values ($1,$2,$3,$4,$5,$6,$7,'PEN',current_date, coalesce($8::date, current_date), $9)`,
          [currentClientId, oldSlot.platform_accounts?.platform_code || "tidal",
           oldSlot.platform_account_id, id,
           updatedFields.memberEmail ?? oldSlot.member_email ?? "",
           updatedFields.emailType ?? oldSlot.email_type ?? "admin",
           Number(updatedFields.pricePen) || 0, renewalDateStr ?? null, nextStatus]
        );
      }
    } else if (nextStatus === "free") {
      await t.query(
        `update subscriptions set subscription_status = 'expired', updated_at = now()
          where account_slot_id = $1 and subscription_status in ('active','pending_payment')`,
        [id]
      );
    }

    const formatted = await getMemberProfileById(id, { tx: t });
    await logEvent("member_profile", id, "update", formatMemberProfile(oldSlot), formatted, "Member slot updated", { tx: t });
    return formatted;
  };
  return tx ? run(tx) : withTransaction(run);
}

export async function deleteMemberProfile(id) {
  await withTransaction(async (tx) => {
    const old = await tx.query("select * from account_slots where id = $1 for update", [id]);
    if (!old.rows[0]) return;
    await tx.query("update subscriptions set account_slot_id = null, updated_at = now() where account_slot_id = $1", [id]);
    await tx.query("delete from account_slots where id = $1", [id]);
    await logEvent("member_profile", id, "delete", old.rows[0], null, "Member slot deleted", { tx });
  });
}

// --- OPERACIONES MASIVAS ---

export async function updateMemberProfilesBulk(ids, updatedFields) {
  const results = [];
  for (const id of ids) results.push(await updateMemberProfile(id, updatedFields));
  return results;
}

/**
 * Renovación manual desde el panel: el cliente pagó fuera del sistema (WhatsApp).
 * Extiende la cobertura y deja UN asiento `admin_manual` por cupo, en la misma transacción.
 */
export async function extendMemberProfilesBulk(ids, monthsToAdd, { performedBy = "admin" } = {}) {
  const results = [];
  for (const id of ids) {
    const res = await withTransaction(async (tx) => {
      const slot = await getMemberProfileById(id, { tx });
      if (!slot || slot.status === "free" || !slot.clientId) return null;

      const base = slot.renewalDate ? new Date(`${slot.renewalDate}T12:00:00`) : new Date();
      const coverageFrom = slot.renewalDate || toDateStr(new Date());
      const renewalDateStr = toDateStr(calculateRenewalDate(base, monthsToAdd));

      const updated = await updateMemberProfile(id, { renewalDate: renewalDateStr, status: slot.status }, { tx });
      const sub = await tx.query(
        `select id from subscriptions where account_slot_id = $1 and customer_id = $2
            and subscription_status in ('active','pending_payment') order by id desc limit 1`,
        [id, slot.clientId.id]
      );
      if (slot.pricePen > 0) {
        await insertPayment(tx, {
          customerId: slot.clientId.id,
          subscriptionId: sub.rows[0]?.id ?? null,
          provider: "admin_manual",
          paymentMethod: "Manual / Panel Admin",
          grossAmount: slot.pricePen,
          currency: "PEN",
          salesChannel: "manual",
          confirmedBy: performedBy,
          coverageFrom,
          coverageTo: renewalDateStr,
          notes: `Renovación manual +${monthsToAdd} mes(es)`,
        });
      }
      return updated;
    });
    if (res) results.push(res);
  }
  return results;
}

export async function clearMemberProfilesBulk(ids) {
  const results = [];
  for (const id of ids) {
    results.push(await updateMemberProfile(id, {
      clientId: null,
      memberEmail: "",
      memberPassword: "",
      status: "free",
    }));
  }
  return results;
}

// --- UTILIDADES ---

export { calculateRenewalDate } from "./renewal";

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
  "502": { code: "GT", name: "Guatemala", flag: "🇬🇹" },
};

export function getCountryFromPhone(phoneNumber) {
  if (!phoneNumber) return { code: "INT", name: "Otro / Internacional", flag: "🌐" };
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return COUNTRY_MAP[cleanPhone.substring(0, 3)] || COUNTRY_MAP[cleanPhone.substring(0, 2)] ||
    { code: "INT", name: "Otro / Internacional", flag: "🌐" };
}
