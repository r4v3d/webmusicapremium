// Catálogo de planes (§10.2). El precio SIEMPRE sale de aquí en el servidor:
// nunca del cuerpo de la petición. Soles y USDT son precios independientes.
import { CONFIG } from "../data/config";

export function findPlan(service, planId) {
  const plans = CONFIG.services[service]?.plans || [];
  return plans.find((p) => p.id === planId) || null;
}

/** Busca un plan por servicio y meses (renovaciones). */
export function findPlanByMonths(service, months) {
  const plans = CONFIG.services[service]?.plans || [];
  return plans.find((p) => p.months === Number(months)) || null;
}

export function planPrice(plan, currency) {
  if (!plan) return null;
  return currency === "USDT" ? plan.priceUsdt : plan.pricePen;
}

export function formatPen(amount) {
  return `S/ ${(Number(amount) || 0).toFixed(2)}`;
}

export function formatUsdt(amount) {
  return `${(Number(amount) || 0).toFixed(2)} USDT`;
}

export function formatPlanPrice(plan, currency) {
  return currency === "USDT" ? formatUsdt(plan?.priceUsdt) : formatPen(plan?.pricePen);
}
