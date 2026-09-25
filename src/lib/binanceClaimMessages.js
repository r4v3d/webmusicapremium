// Mensajes para el cliente al verificar un pago de Binance por Order ID.
// Los comparten el checkout, la recarga de saldo web y el bot de Telegram.

const MESSAGES = {
  settled: "¡Pago verificado! Aquí tienes tus datos de acceso.",
  underpaid: "Recibimos tu pago, pero el monto es menor al total. Envía la diferencia y pega también ese Order ID.",
  credited: "El pedido ya estaba pagado: el monto se abonó a tu saldo.",
  duplicate: "Ese Order ID ya fue usado. Cada pago se acredita una sola vez.",
  needs_manual: "Pago verificado. Estamos preparando tu cuenta y te la enviamos en breve.",
  not_found: "Todavía no vemos ese Order ID. Si acabas de pagar, espera 30 segundos y vuelve a intentarlo.",
  invalid_order_id: "Pega el Order ID completo que te muestra Binance (solo números).",
  before_order: "Ese pago es anterior a este pedido. Pega el Order ID del pago que hiciste para este pedido.",
  too_late: "Ese pago es demasiado antiguo para este pedido. Escríbenos por WhatsApp.",
  currency: "Ese pago no es en USDT.",
  outgoing: "Ese Order ID corresponde a un pago enviado, no recibido.",
  note_other_order: "Ese pago parece ser de otro pedido. Lo revisaremos a mano en breve.",
};

/** Traduce el resultado de claimBinanceByOrderId a { key, message }. */
export function claimMessage(result, { topup = false } = {}) {
  const key = result.status === "rejected" ? result.reason : result.status;
  if (topup && key === "credited") {
    return { key, message: `¡Recarga exitosa! Se añadieron ${Number(result.amount).toFixed(3)} USDT a tu saldo.` };
  }
  if (topup && key === "before_order") {
    return { key, message: "Ese pago tiene más de 24 horas. Escríbenos por WhatsApp y lo revisamos." };
  }
  return { key, message: MESSAGES[key] || "Pago recibido. Lo estamos procesando." };
}
