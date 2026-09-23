"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { formatDateTimePe, formatMoney } from "../adminUi";

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
    return () => clearInterval(id);
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
    <section className="payments-section animate-fade-in">
      <h2>Por verificar</h2>
      <p className="section-instruction">
        Pagos por Yape/Plin esperando tu confirmación. Busca el ingreso en tu app, escribe el número de operación y confirma:
        el cliente recibe sus credenciales en segundos. El número de operación impide confirmar el mismo Yape dos veces.
      </p>

      {items.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>{loading ? "Cargando…" : "No hay pagos por verificar. 🎉"}</p>
        </div>
      ) : (
        <div className="table-responsive glass-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Desde</th>
                <th>Pedido / cliente</th>
                <th>Esperado</th>
                <th>Dato del cliente</th>
                <th>Monto recibido</th>
                <th>Nº de operación</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const form = formFor(item);
                return (
                  <tr key={item.intentId} className={item.status === "expired" ? "verify-row-expired" : ""}>
                    <td>
                      {formatDateTimePe(item.createdAt)}
                      {item.status === "expired" && <span className="status-badge badge-expired" style={{ display: "block", marginTop: 4 }}>Vencido</span>}
                      {item.status === "underpaid" && <span className="status-badge badge-pending" style={{ display: "block", marginTop: 4 }}>Parcial</span>}
                    </td>
                    <td>
                      <strong>{item.purpose === "wallet_topup" ? "Recarga de saldo" : `#${item.orderId}`}</strong>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {item.name}{item.customerCode ? ` · ${item.customerCode}` : ""}
                        {item.service ? ` · ${item.service.toUpperCase()} ${item.duration || ""}` : ""}
                        {item.isRenewal ? " · renovación" : ""}
                      </span>
                    </td>
                    <td>
                      {item.amountExpected != null ? formatMoney(item.amountExpected, "PEN") : "Monto libre"}
                      {item.amountReceived > 0 && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>Recibido: {formatMoney(item.amountReceived, "PEN")}</span>}
                    </td>
                    <td style={{ maxWidth: 180, fontSize: "0.8rem" }}>{item.customerReference || "—"}</td>
                    <td>
                      <input className="form-input" style={{ width: 90, padding: "6px 8px" }} type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setField(item, "amount", e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" style={{ width: 130, padding: "6px 8px" }} placeholder="ej. 12345678" value={form.reference} onChange={(e) => setField(item, "reference", e.target.value)} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.75rem" }} disabled={busyId === item.intentId} onClick={() => confirm(item)}>
                          {busyId === item.intentId ? "…" : "Confirmar"}
                        </button>
                        {item.amountReceived === 0 && (
                          <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.75rem" }} disabled={busyId === item.intentId} onClick={() => dismiss(item)}>
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
