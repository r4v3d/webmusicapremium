"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "../AdminContext";
import { RelativeTime, formatDateTimePe, formatMoney, useUrlParam } from "../adminUi";

const REASONS = { topup: "Recarga", purchase: "Compra", refund: "Reembolso", overpay: "Excedente", adjustment: "Ajuste" };

// Saldos (§15.3): saldo por cliente en ambas monedas, historial y ajuste manual auditado.
export default function WalletsTab() {
  const { showToast, askConfirm } = useAdmin();
  const [data, setData] = useState(null);
  const [search, setSearch] = useUrlParam("q");
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState([]);
  const detailRef = useRef(null);
  const [adjust, setAdjust] = useState({ currency: "PEN", direction: "credit", amount: "", reason: "" });

  const load = useCallback(() => fetch("/api/admin/wallets", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => { if (json) setData(json); })
    .catch(() => {}), []);

  useEffect(() => {
    load();
    window.addEventListener("admin:refresh", load);
    return () => window.removeEventListener("admin:refresh", load);
  }, [load]);

  const open = async (w) => {
    setSelected(w);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const res = await fetch(`/api/admin/wallets?customerId=${encodeURIComponent(w.customerId)}`);
    setLedger(res.ok ? (await res.json()).ledger : []);
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    const ok = await askConfirm({
      title: "Ajuste de saldo",
      message: `${adjust.direction === "credit" ? "Sumar" : "Restar"} ${formatMoney(adjust.amount, adjust.currency)} a ${selected.name || selected.code}. Queda auditado con tu motivo.`,
      confirmLabel: "Aplicar ajuste",
    });
    if (!ok) return;
    const res = await fetch("/api/admin/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selected.customerId, ...adjust }),
    });
    const out = await res.json();
    showToast(out.message || (res.ok ? "Ajuste aplicado." : "No se pudo ajustar."), res.ok ? "success" : "error");
    if (res.ok) {
      setAdjust({ currency: "PEN", direction: "credit", amount: "", reason: "" });
      await load();
      await open(selected);
    }
  };

  const rows = (data?.wallets || []).filter((w) => {
    const q = search.trim().toLowerCase();
    return !q || [w.name, w.code, w.walletNoteCode].filter(Boolean).some((v) => v.toLowerCase().includes(q));
  });

  return (
    <section className="admin-section animate-fade-in">
      <div className="admin-section-head">
        <h2>Saldos de clientes</h2>
        <p className="section-instruction">
          Lo que los clientes pueden gastar en la tienda, por moneda. Es un pasivo: no se retira.
        </p>
      </div>
      <div className="wallet-totals">
        <div className="wallet-total glass-panel">
          <span className="stat-label">Pasivo en soles</span>
          <strong>{formatMoney(data?.totals?.PEN || 0, "PEN")}</strong>
        </div>
        <div className="wallet-total glass-panel">
          <span className="stat-label">Pasivo en USDT</span>
          <strong>{formatMoney(data?.totals?.USDT || 0, "USDT")}</strong>
        </div>
      </div>
      <input type="search" className="form-input" placeholder="Buscar cliente, código o SALDO-…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="table-responsive glass-panel">
        <table className="admin-table admin-table--stack">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Código recarga USDT</th>
              <th className="num">Soles</th>
              <th className="num">USDT</th>
              <th>Último movimiento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.customerId} className={selected?.customerId === w.customerId ? "row-selected" : ""}>
                <td className="cell-primary"><strong>{w.name || "—"}</strong><span className="cell-sub">{w.code}</span></td>
                <td data-label="Código recarga" className="cell-mono">{w.walletNoteCode || "—"}</td>
                <td data-label="Soles" className="num">{formatMoney(w.pen, "PEN")}</td>
                <td data-label="USDT" className="num">{formatMoney(w.usdt, "USDT")}</td>
                <td data-label="Último movimiento" className="nowrap"><RelativeTime value={w.updatedAt} /></td>
                <td className="cell-actions">
                  <div className="cell-actions-inner">
                    <button type="button" className="btn btn-secondary admin-btn-compact" onClick={() => open(w)}>Ver movimientos</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="admin-table-empty"><td colSpan={6}>{data ? "Ningún cliente tiene saldo todavía." : "Cargando…"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div ref={detailRef} className="glass-panel hoy-list-panel wallet-detail">
          <div className="hoy-list-header">
            <h3>{selected.name || selected.code}</h3>
            <button type="button" className="btn btn-secondary admin-btn-compact" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
          <form onSubmit={submitAdjust} className="admin-inline-form wallet-adjust-form">
            <div className="admin-inline-pair">
              <select className="form-input" aria-label="Tipo de ajuste" value={adjust.direction} onChange={(e) => setAdjust((a) => ({ ...a, direction: e.target.value }))}>
                <option value="credit">Sumar</option>
                <option value="debit">Restar</option>
              </select>
              <select className="form-input" aria-label="Moneda" value={adjust.currency} onChange={(e) => setAdjust((a) => ({ ...a, currency: e.target.value }))}>
                <option value="PEN">Soles</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
            <input className="form-input" type="number" inputMode="decimal" step="0.001" min="0" placeholder="Monto" aria-label="Monto" value={adjust.amount} onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))} />
            <input className="form-input grow" placeholder="Motivo (obligatorio)" aria-label="Motivo" value={adjust.reason} onChange={(e) => setAdjust((a) => ({ ...a, reason: e.target.value }))} />
            <button type="submit" className="btn btn-primary admin-btn-compact">Ajustar</button>
          </form>
          <div className="table-responsive">
            <table className="admin-table admin-table--stack">
              <thead>
                <tr>
                  <th>Movimiento</th>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Referencia</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((m) => (
                  <tr key={m.id}>
                    <td className={`cell-primary num ${m.direction === "credit" ? "ledger-credit" : "ledger-debit"}`}>
                      {m.direction === "credit" ? "+" : "−"}{formatMoney(m.amount, m.currency)}
                    </td>
                    <td data-label="Fecha" className="nowrap">{formatDateTimePe(m.createdAt)}</td>
                    <td data-label="Motivo">{REASONS[m.reason] || m.reason}{m.createdBy !== "system" ? ` · ${m.createdBy}` : ""}</td>
                    <td data-label="Referencia" className="cell-small">{m.refType ? `${m.refType} ${m.refId || ""}` : "—"}</td>
                    <td data-label="Saldo" className="num">{formatMoney(m.balanceAfter, m.currency)}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr className="admin-table-empty"><td colSpan={5}>Sin movimientos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
