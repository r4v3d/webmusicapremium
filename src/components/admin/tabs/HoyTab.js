"use client";

import { useAdmin } from "../AdminContext";
import { formatDatePe, formatMoney } from "../adminUi";

export default function HoyTab() {
  const { setWorkspace, stats, todayQueue } = useAdmin();

  const pendingOrders = todayQueue?.pendingOrders || { count: 0, items: [] };
  const pendingPayments = todayQueue?.pendingPayments || { count: 0, items: [] };
  const manualQueue = todayQueue?.manualQueue || { count: 0, items: [] };
  const undelivered = todayQueue?.undelivered || { count: 0, items: [] };
  const income = todayQueue?.todayIncome || {};
  const dueToday = todayQueue?.dueToday || { count: 0, items: [] };
  const overdueWeek = todayQueue?.overdueWeek || { count: 0, items: [] };
  const ownerRenewals = todayQueue?.ownerRenewals || { count: 0, items: [] };
  const stock = todayQueue?.activeStock || stats?.activeStock || {};

  if (!todayQueue) {
    return (
      <section className="hoy-section animate-fade-in">
        <h2>Cola de hoy</h2>
        <p className="section-instruction">Cargando la cola de trabajo…</p>
      </section>
    );
  }

  return (
    <section className="hoy-section animate-fade-in">
      <h2>Cola de hoy</h2>
      <p className="section-instruction">
        Lo que hay que operar ahora: pagos por verificar, entregas pendientes y clientes que vencen.
      </p>

      {todayQueue.invalidSignatures24h > 0 && (
        <div className="error-alert">
          ⚠️ {todayQueue.invalidSignatures24h} webhook(s) con firma inválida en las últimas 24 h. Revísalo en Conciliación.
        </div>
      )}

      <div className="hoy-queue-grid">
        <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("cobros", "verificar")}>
          <span className="hoy-queue-label">Por verificar</span>
          <strong className="hoy-queue-value">{manualQueue.count}</strong>
          <span className="hoy-queue-hint">Yape/Plin: un clic cada uno</span>
        </button>
        <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("hoy", "conciliacion")}>
          <span className="hoy-queue-label">Pagados sin entregar</span>
          <strong className="hoy-queue-value">{undelivered.count}</strong>
          <span className="hoy-queue-hint">{undelivered.items.some((o) => o.noStock) ? "¡Hay pedidos sin stock!" : "Revisar entregas"}</span>
        </button>
        {pendingPayments.count > 0 && (
          <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("cobros", "pagos")}>
            <span className="hoy-queue-label">Comprobantes antiguos</span>
            <strong className="hoy-queue-value">{pendingPayments.count}</strong>
            <span className="hoy-queue-hint">Cola heredada por vaciar</span>
          </button>
        )}
        <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("cobros", "whatsapp")}>
          <span className="hoy-queue-label">Vencen hoy</span>
          <strong className="hoy-queue-value">{dueToday.count}</strong>
          <span className="hoy-queue-hint">Recordatorio WhatsApp</span>
        </button>
        <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("cobros", "whatsapp")}>
          <span className="hoy-queue-label">Atraso 1–7 días</span>
          <strong className="hoy-queue-value">{overdueWeek.count}</strong>
          <span className="hoy-queue-hint">Deuda reciente</span>
        </button>
        <button type="button" className="hoy-queue-card glass-panel" onClick={() => setWorkspace("hoy", "pedidos")}>
          <span className="hoy-queue-label">Pedidos abiertos</span>
          <strong className="hoy-queue-value">{pendingOrders.count}</strong>
          <span className="hoy-queue-hint">Esperando pago</span>
        </button>
      </div>

      <div className="hoy-stock-strip glass-panel">
        <span>Cobrado hoy</span>
        <strong>{formatMoney(income.PEN?.net || 0, "PEN")} · {income.PEN?.sales || 0} venta(s)</strong>
        <strong>{formatMoney(income.USDT?.net || 0, "USDT")} · {income.USDT?.sales || 0} venta(s)</strong>
        <span className="text-muted">{(income.PEN?.topups || 0) + (income.USDT?.topups || 0)} recarga(s)</span>
      </div>

      <div className="hoy-stock-strip glass-panel">
        <span>Stock libre</span>
        <strong>Tidal {stock.tidal ?? 0}</strong>
        <strong>Deezer {stock.deezer ?? 0}</strong>
        <strong>Qobuz {stock.qobuz ?? 0}</strong>
      </div>

      <div className="hoy-lists">
        <div className="glass-panel hoy-list-panel">
          <div className="hoy-list-header">
            <h3>Pedidos abiertos</h3>
            <button type="button" className="btn btn-secondary btn-sm-mobile" onClick={() => setWorkspace("hoy", "pedidos")}>
              Ver todos
            </button>
          </div>
          {pendingOrders.items.length === 0 ? (
            <p className="empty-inline">No hay pedidos esperando pago.</p>
          ) : (
            <ul className="hoy-plain-list">
              {pendingOrders.items.map((o) => (
                <li key={o.orderId}>
                  <strong>{o.fullName}</strong>
                  <span>{(o.service || "").toUpperCase()} · {o.duration}</span>
                  <span className="text-muted">{formatDatePe(o.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-panel hoy-list-panel">
          <div className="hoy-list-header">
            <h3>Titulares a renovar (7 días)</h3>
            <button type="button" className="btn btn-secondary btn-sm-mobile" onClick={() => setWorkspace("cobros", "renovaciones")}>
              Abrir renovaciones
            </button>
          </div>
          {ownerRenewals.items.length === 0 ? (
            <p className="empty-inline">Ninguna cuenta titular vence esta semana.</p>
          ) : (
            <ul className="hoy-plain-list">
              {ownerRenewals.items.map((acc) => (
                <li key={acc.id}>
                  <strong>{acc.masterEmail}</strong>
                  <span>{(acc.service || "").toUpperCase()}</span>
                  <span className="text-muted">{formatDatePe(acc.ownerRenewalDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
