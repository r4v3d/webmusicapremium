"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { formatDateTimePe, formatMoney } from "../adminUi";

const REASONS = { topup: "Recarga", purchase: "Compra", refund: "Reembolso", overpay: "Excedente", adjustment: "Ajuste" };

// Saldos (§15.3): saldo por cliente en ambas monedas, historial y ajuste manual auditado.
export default function WalletsTab() {
  const { showToast, askConfirm } = useAdmin();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [adjust, setAdjust] = useState({ currency: "PEN", direction: "credit", amount: "", reason: "" });

  const load = useCallback(() => fetch("/api/admin/wallets", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => { if (json) setData(json); })
    .catch(() => {}), []);

  useEffect(() => { load(); }, [load]);

  const open = async (w) => {
    setSelected(w);
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
    <section className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2>Saldos de clientes</h2>
        <p className="section-instruction">
          Lo que los clientes pueden gastar en la tienda, por moneda. Es un pasivo: no se retira. Pasivo total:{" "}
          <strong>{formatMoney(data?.totals?.PEN || 0, "PEN")}</strong> · <strong>{formatMoney(data?.totals?.USDT || 0, "USDT")}</strong>
        </p>
      </div>
      <input type="search" className="form-input" placeholder="Buscar cliente, código o SALDO-…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="table-responsive glass-panel">
        <table className="admin-table">
          <thead><tr><th>Cliente</th><th>Código recarga USDT</th><th>Soles</th><th>USDT</th><th>Último movimiento</th><th></th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.customerId}>
                <td><strong>{w.name || "—"}</strong><span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{w.code}</span></td>
                <td style={{ fontFamily: "monospace" }}>{w.walletNoteCode || "—"}</td>
                <td>{formatMoney(w.pen, "PEN")}</td>
                <td>{formatMoney(w.usdt, "USDT")}</td>
                <td>{formatDateTimePe(w.updatedAt)}</td>
                <td><button type="button" className="btn btn-secondary btn-sm-mobile" onClick={() => open(w)}>Ver</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center">{data ? "Ningún cliente tiene saldo todavía." : "Cargando…"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="glass-panel hoy-list-panel">
          <div className="hoy-list-header">
            <h3>{selected.name || selected.code}</h3>
            <button type="button" className="btn btn-secondary btn-sm-mobile" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
          <form onSubmit={submitAdjust} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select className="form-input" style={{ width: 110 }} value={adjust.direction} onChange={(e) => setAdjust((a) => ({ ...a, direction: e.target.value }))}>
              <option value="credit">Sumar</option>
              <option value="debit">Restar</option>
            </select>
            <select className="form-input" style={{ width: 100 }} value={adjust.currency} onChange={(e) => setAdjust((a) => ({ ...a, currency: e.target.value }))}>
              <option value="PEN">Soles</option>
              <option value="USDT">USDT</option>
            </select>
            <input className="form-input" style={{ width: 110 }} type="number" step="0.001" min="0" placeholder="Monto" value={adjust.amount} onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))} />
            <input className="form-input" style={{ flex: "1 1 200px" }} placeholder="Motivo (obligatorio)" value={adjust.reason} onChange={(e) => setAdjust((a) => ({ ...a, reason: e.target.value }))} />
            <button type="submit" className="btn btn-primary">Ajustar</button>
          </form>
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Motivo</th><th>Referencia</th><th>Movimiento</th><th>Saldo</th></tr></thead>
            <tbody>
              {ledger.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTimePe(m.createdAt)}</td>
                  <td>{REASONS[m.reason] || m.reason}{m.createdBy !== "system" ? ` · ${m.createdBy}` : ""}</td>
                  <td style={{ fontSize: "0.75rem" }}>{m.refType ? `${m.refType} ${m.refId || ""}` : "—"}</td>
                  <td style={{ color: m.direction === "credit" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                    {m.direction === "credit" ? "+" : "−"}{formatMoney(m.amount, m.currency)}
                  </td>
                  <td>{formatMoney(m.balanceAfter, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
