"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { PROVIDER_LABELS, STATUS_LABELS, RelativeTime, formatDateTimePe, formatMoney } from "../adminUi";

// Conciliación (§15.3): el tablero que sustituye la revisión de comprobantes.
export default function ReconciliationTab() {
  const { showToast, handleResendCredentials, handleRefundOrder } = useAdmin();
  const [data, setData] = useState(null);
  const [applyTo, setApplyTo] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => fetch("/api/admin/reconciliation", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => { if (json) setData(json); })
    .catch(() => {}), []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    window.addEventListener("admin:refresh", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("admin:refresh", load);
    };
  }, [load]);

  const apply = async (ev) => {
    const orderId = (applyTo[ev.id] || "").trim();
    if (!/^MPB-\d{6}$/i.test(orderId)) return showToast("Escribe el pedido como MPB-123456.", "error");
    setBusy(`ev-${ev.id}`);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: ev.id, orderId }),
      });
      const out = await res.json();
      showToast(out.message, out.success ? "success" : "error");
      await load();
    } finally {
      setBusy("");
    }
  };

  const withReload = (fn) => async (...args) => {
    await fn(...args);
    await load();
  };

  if (!data) {
    return (
      <section className="animate-fade-in">
        <h2>Conciliación</h2>
        <p className="section-instruction">Cargando…</p>
      </section>
    );
  }

  return (
    <section className="admin-section animate-fade-in">
      <div className="admin-section-head">
        <h2>Conciliación</h2>
        <p className="section-instruction">
          Soles y USDT son libros separados: las cifras nunca se suman. «Ventas» son pagos atados a un pedido; «caja» es lo que entró por Yape/TAYPI/Binance (sin contar compras con saldo).
        </p>
      </div>

      <div className="hoy-queue-grid recon-kpis">
        {["PEN", "USDT"].map((currency) => {
          const row = data.monthLedger.find((r) => r.currency === currency) || {};
          return (
            <div key={currency} className="hoy-queue-card glass-panel">
              <span className="hoy-queue-label">Mes en curso · {currency === "PEN" ? "Soles" : "USDT"}</span>
              <strong className="hoy-queue-value">{formatMoney(row.sales_net || 0, currency)}</strong>
              <span className="hoy-queue-hint">
                Ventas netas · comisiones {formatMoney(row.fees || 0, currency)} · caja {formatMoney(row.cash_in || 0, currency)} · {row.operations || 0} operaciones
              </span>
            </div>
          );
        })}
      </div>

      {data.walletMismatches.length > 0 && (
        <div className="error-alert">
          🚨 Descuadre de saldo en {data.walletMismatches.length} cuenta(s): alguien escribió fuera de una transacción. Revisa events_log antes de seguir operando.
        </div>
      )}

      <div className="glass-panel hoy-list-panel">
        <div className="hoy-list-header"><h3>Pagados sin entregar ({data.undelivered.length})</h3></div>
        {data.undelivered.length === 0 ? <p className="empty-inline">Todo lo pagado está entregado.</p> : (
          <ul className="hoy-plain-list">
            {data.undelivered.map((o) => (
              <li key={o.order_id}>
                <strong>#{o.order_id}</strong>
                <span>{(o.service || "").toUpperCase()} · {o.full_name || ""} · pagado {formatDateTimePe(o.paid_at)}</span>
                <span className="text-muted">{o.no_stock ? "SIN STOCK" : o.last_delivery_error ? `Error: ${o.last_delivery_error}` : `${o.delivery_attempts} intento(s)`}</span>
                <span className="hoy-list-actions">
                  <button type="button" className="btn btn-primary btn-sm-mobile" onClick={withReload(handleResendCredentials).bind(null, o.order_id)}>
                    {o.no_stock ? "Completar entrega" : "Reenviar"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm-mobile" onClick={withReload(handleRefundOrder).bind(null, o.order_id)}>Reembolsar al saldo</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass-panel hoy-list-panel">
        <div className="hoy-list-header"><h3>Pagos para revisar ({data.review.length})</h3></div>
        <p className="section-instruction">Transferencias USDT sin nota, con nota que no coincide o de otra cuenta de Binance. Verifica monto y hora y aplícalas al pedido correcto.</p>
        {data.review.length === 0 ? <p className="empty-inline">Nada pendiente.</p> : (
          <div className="table-responsive">
            <table className="admin-table admin-table--stack">
              <thead><tr><th>Recibido</th><th>Transacción</th><th>Monto</th><th>Nota / pagador</th><th>Motivo</th><th>Aplicar a</th></tr></thead>
              <tbody>
                {data.review.map((ev) => (
                  <tr key={ev.id}>
                    <td data-label="Recibido" className="nowrap"><RelativeTime value={ev.received_at} /></td>
                    <td data-label="Transacción" className="cell-mono cell-small cell-email">{ev.event_id}</td>
                    <td data-label="Monto" className="num">{ev.amount ? formatMoney(ev.amount, "USDT") : "—"}</td>
                    <td data-label="Nota / pagador" className="cell-small">{ev.note || "(sin nota)"}{ev.payer_name ? ` · ${ev.payer_name}` : ""}</td>
                    <td data-label="Motivo" className="cell-small">{ev.process_result}{ev.error_detail ? ` · ${ev.error_detail}` : ""}</td>
                    {ev.provider === "binance_account" ? (
                      <td data-label="Aplicar a" className="cell-block">
                        <div className="cell-actions-inner">
                          <input className="form-input recon-apply-input" placeholder="MPB-123456" aria-label="Pedido destino" value={applyTo[ev.id] || ""} onChange={(e) => setApplyTo((p) => ({ ...p, [ev.id]: e.target.value }))} />
                          <button type="button" className="btn btn-primary admin-btn-compact" disabled={busy === `ev-${ev.id}`} onClick={() => apply(ev)}>Aplicar</button>
                        </div>
                      </td>
                    ) : (
                      <td data-label="Aplicar a">—</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-panel hoy-list-panel">
        <div className="hoy-list-header"><h3>Intentos abiertos ({data.openIntents.length})</h3></div>
        {data.openIntents.length === 0 ? <p className="empty-inline">No hay pagos en curso.</p> : (
          <ul className="hoy-plain-list">
            {data.openIntents.map((i) => (
              <li key={i.id}>
                <strong>{i.order_id ? `#${i.order_id}` : `Recarga #${i.id}`}</strong>
                <span>{PROVIDER_LABELS[i.provider] || i.provider} · {STATUS_LABELS[i.status] || i.status} · {i.amount_expected != null ? formatMoney(i.amount_expected, i.currency) : "monto libre"}{Number(i.amount_received) > 0 ? ` (recibido ${formatMoney(i.amount_received, i.currency)})` : ""}</span>
                <span className="text-muted">vence {formatDateTimePe(i.expires_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass-panel hoy-list-panel">
        <div className="hoy-list-header"><h3>Webhooks con firma inválida (7 días): {data.invalidSignatures.length}</h3></div>
        {data.invalidSignatures.length > 0 && (
          <p className="section-instruction">Si se repiten, revisa TAYPI_WEBHOOK_SECRET y que Caddy/Cloudflare no alteren el cuerpo de /api/webhooks/*.</p>
        )}
      </div>
    </section>
  );
}
