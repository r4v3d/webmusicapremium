"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { RelativeTime, formatMoney } from "../adminUi";

// Cola "Por verificar" (§11.1, §15.3). Abres tu app de Yape, ves el ingreso y
// confirmas: la asignación, el asiento y la entrega los hace el sistema.
export default function VerifyQueueTab() {
  const { showToast, askConfirm, loadData } = useAdmin();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments/pending-manual", { cache: "no-store" });
      if (res.ok) setItems((await res.json()).items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
    window.addEventListener("admin:refresh", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("admin:refresh", load);
    };
  }, [load]);

  const formFor = (item) => forms[item.intentId] || {
    amount: item.status === "underpaid" && item.amountExpected != null
      ? String(Math.max(0, item.amountExpected - item.amountReceived).toFixed(2))
      : item.amountExpected != null ? String(item.amountExpected) : "",
    reference: "",
  };
  const setField = (item, field, value) => setForms((prev) => ({ ...prev, [item.intentId]: { ...formFor(item), [field]: value } }));

  const confirm = async (item) => {
    const form = formFor(item);
    const amount = Number(form.amount);
    if (!(amount > 0)) return showToast("Escribe el monto que recibiste en este Yape.", "error");
    if (form.reference.replace(/[^a-z0-9]/gi, "").length < 4) return showToast("Escribe el número de operación de tu app.", "error");
    if (item.amountExpected != null && Math.abs(amount - (item.amountExpected - item.amountReceived)) > 0.05) {
      const ok = await askConfirm({
        title: "El monto no coincide",
        message: `Se esperaba ${formatMoney(item.amountExpected - item.amountReceived, "PEN")} y escribiste ${formatMoney(amount, "PEN")}. Si falta dinero no se entrega nada; si sobra, el excedente va a su saldo. ¿Continuar?`,
        confirmLabel: "Registrar",
      });
      if (!ok) return;
    }
    setBusyId(item.intentId);
    try {
      const res = await fetch("/api/admin/payments/confirm-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: item.intentId, amountReceived: amount, reference: form.reference }),
      });
      const data = await res.json();
      showToast(data.message || "Procesado.", res.ok && data.success !== false ? "success" : "error");
      if (res.ok) {
        setForms((prev) => ({ ...prev, [item.intentId]: undefined }));
        await load();
        loadData();
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item) => {
    const ok = await askConfirm({
      title: "No llegó",
      message: `Marcar ${item.orderId || "esta recarga"} como no recibido libera el cupo reservado. ¿Seguro?`,
      confirmLabel: "No llegó",
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.intentId);
    try {
      const res = await fetch("/api/admin/payments/confirm-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", intentId: item.intentId }),
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="admin-section animate-fade-in">
      <div className="admin-section-head">
        <h2>Por verificar</h2>
        <details className="admin-help">
          <summary>¿Cómo funciona?</summary>
          <p>
            Pagos por Yape/Plin esperando tu confirmación. Busca el ingreso en tu app, escribe el número de operación y confirma:
            el cliente recibe sus credenciales en segundos. El número de operación impide confirmar el mismo Yape dos veces.
          </p>
        </details>
      </div>

      {items.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>{loading ? "Cargando…" : "No hay pagos por verificar. 🎉"}</p>
        </div>
      ) : (
        <div className="table-responsive glass-panel">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Pedido / cliente</th>
                <th>Desde</th>
                <th className="num">Esperado</th>
                <th>Dato del cliente</th>
                <th>Monto recibido</th>
                <th>Nº de operación</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const form = formFor(item);
                const busy = busyId === item.intentId;
                return (
                  <tr key={item.intentId} className={item.status === "expired" ? "verify-row-expired" : ""}>
                    <td className="cell-primary">
                      <strong>{item.purpose === "wallet_topup" ? "Recarga de saldo" : `#${item.orderId}`}</strong>
                      <span className="cell-sub">
                        {item.name}{item.customerCode ? ` · ${item.customerCode}` : ""}
                        {item.service ? ` · ${item.service.toUpperCase()} ${item.duration || ""}` : ""}
                        {item.isRenewal ? " · renovación" : ""}
                      </span>
                    </td>
                    <td data-label="Desde" className="nowrap">
                      <span>
                        <RelativeTime value={item.createdAt} />
                        {item.status === "expired" && <span className="status-badge badge-expired verify-status">Vencido</span>}
                        {item.status === "underpaid" && <span className="status-badge badge-pending verify-status">Parcial</span>}
                      </span>
                    </td>
                    <td data-label="Esperado" className="num">
                      <span>
                        <strong>{item.amountExpected != null ? formatMoney(item.amountExpected, "PEN") : "Monto libre"}</strong>
                        {item.amountReceived > 0 && <span className="cell-sub">Recibido: {formatMoney(item.amountReceived, "PEN")}</span>}
                      </span>
                    </td>
                    <td data-label="Dato del cliente" className="verify-customer-ref">{item.customerReference || "—"}</td>
                    <td data-label="Monto recibido" className="cell-block cell-half">
                      <input
                        className="form-input verify-input-amount"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        aria-label="Monto recibido"
                        value={form.amount}
                        onChange={(e) => setField(item, "amount", e.target.value)}
                      />
                    </td>
                    <td data-label="Nº de operación" className="cell-block cell-half">
                      <input
                        className="form-input verify-input-ref"
                        autoComplete="off"
                        placeholder="ej. 12345678"
                        aria-label="Número de operación"
                        value={form.reference}
                        onChange={(e) => setField(item, "reference", e.target.value)}
                      />
                    </td>
                    <td className="cell-actions">
                      <div className="cell-actions-inner">
                        <button type="button" className="btn btn-primary admin-btn-compact" disabled={busy} onClick={() => confirm(item)}>
                          {busy ? "…" : "Confirmar"}
                        </button>
                        {item.amountReceived === 0 && (
                          <button type="button" className="btn btn-secondary admin-btn-compact" disabled={busy} onClick={() => dismiss(item)}>
                            No llegó
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
