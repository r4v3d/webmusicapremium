// Vista del checkout: lo único que el navegador del cliente ve de un pedido.
// Nunca expone el access_token, notas internas ni credenciales antes de pagar.
import { query } from "./pg";
import { parseAssignedAccount } from "./credentials";
import { availableProviders, defaultProvider, WALLET_PROVIDERS } from "./providers";
import { getLatestIntentForOrder, intentUi } from "./paymentIntents";
import { getBalances } from "./wallet";
import { checkAdminAuth } from "./auth";
import { getCustomerSession } from "./libClientAuth";
import { orderAccessLevel } from "./orderAccess";

export async function loadOrderRow(orderId) {
  const res = await query(
    `select o.*, sb.renewal_date as sub_renewal_date
       from orders o left join subscriptions sb on sb.id = o.subscription_id
      where o.order_id = $1`,
    [orderId]
  );
  return res.rows[0] || null;
}

/**
 * Autoriza una acción del checkout sobre un pedido. Solo el acceso "full"
 * (token, dueño con sesión o admin) puede crear intentos o reclamar pagos.
 */
export async function authorizeCheckout(orderId, token) {
  const order = await loadOrderRow(orderId);
  const [isAdmin, sessionCustomerId] = await Promise.all([checkAdminAuth(), getCustomerSession()]);
  const access = orderAccessLevel(order, token, { isAdmin, sessionCustomerId });
  return { order, access, isAdmin, sessionCustomerId, ok: Boolean(order) && access === "full" };
}

export async function buildCheckoutView(order, { access, sessionCustomerId = null } = {}) {
  const currency = order.pay_currency || "PEN";
  const intent = await getLatestIntentForOrder(order.order_id);
  const settled = ["paid", "delivered"].includes(order.status);

  const providers = availableProviders(currency)
    .filter((p) => p.ui !== "wallet")
    .map((p) => ({ id: p.id, label: p.label, ui: p.ui, autoConfirm: p.autoConfirm }));

  let wallet = null;
  if (sessionCustomerId) {
    const balances = await getBalances(sessionCustomerId);
    const amount = currency === "USDT" ? Number(order.amount_usdt) : Number(order.amount_pen);
    const walletProvider = availableProviders(currency).find((p) => p.id === WALLET_PROVIDERS[currency]);
    if (walletProvider) {
      wallet = { providerId: walletProvider.id, balance: balances[currency], enough: balances[currency] + 1e-9 >= amount };
    }
  }

  const credentials = settled && access === "full" && order.assigned_account ? parseAssignedAccount(order.assigned_account) : null;

  return {
    order: {
      orderId: order.order_id,
      service: order.service,
      duration: order.duration,
      planId: order.plan_id,
      status: order.status,
      currency,
      amountPen: order.amount_pen,
      amountUsdt: order.amount_usdt,
      pricePen: order.price_pen,
      priceUsd: order.price_usd,
      email: order.email,
      isRenewal: Boolean(order.renew_subscription_id),
      expiresAt: order.expires_at,
      paidAt: order.paid_at,
      createdAt: order.created_at,
      renewalDate: order.sub_renewal_date || null,
      awaitingStock: settled && !order.assigned_account,
    },
    credentials,
    limited: access === "limited",
    intent: intentUi(intent, order),
    providers,
    defaultProviderId: defaultProvider(currency)?.id || null,
    wallet,
  };
}
