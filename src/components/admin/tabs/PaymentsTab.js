"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import { PROVIDER_LABELS, STATUS_LABELS, ProofLightbox, RelativeTime, formatMoney } from "../adminUi";

export default function PaymentsTab() {
  const {
    actionPaymentId,
    handleProcessPayment,
    payments,
    rejectNotesInput,
    rejectNotesModal,
    setRejectNotesInput,
    setRejectNotesModal,
    isPaymentsLoading,
  } = useAdmin();
  const [proofUrl, setProofUrl] = useState("");
  const pendingFirst = [...payments].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return 0;
  });

  const statusMeta = (p) => {
    if (p.status === "confirmed") return { cls: "is-confirmed", text: "Confirmado" };
    if (p.status === "rejected") return { cls: "is-rejected", text: "Rechazado" };
    if (p.status === "refunded") return { cls: "is-refunded", text: "Reembolsado" };
    return { cls: "is-pending", text: STATUS_LABELS[p.status] || p.status };
  };
  const closeReject = () => setRejectNotesModal({ show: false, paymentId: "" });

  return (
    <section className="admin-section animate-fade-in">
      <div className="admin-section-head">
        <h2>Libro de pagos</h2>
        <p className="section-instruction">
          Cada cobro llega confirmado por su proveedor o por tu verificación en «Por verificar». Los botones de aprobar solo aparecen en reportes con comprobante del sistema anterior.
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>{isPaymentsLoading ? "Cargando pagos…" : "Todavía no hay pagos registrados."}</p>
        </div>
      ) : (
        <div className="table-responsive glass-panel">
          <table className="admin-table admin-table--stack payments-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th className="num">Bruto</th>
                <th className="num">Comisión</th>
                <th className="num">Neto</th>
                <th>Proveedor</th>
                <th>Transacción / pedido</th>
                <th>Notas</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendingFirst.map((p) => {
                const isPending = p.status === "pending" && p.isLegacy;
                const status = statusMeta(p);
                const busy = actionPaymentId === p.id;
                return (
                  <tr key={p.id}>
                    <td className="cell-primary">
                      <strong>{p.clientName}</strong>
                      <span className="cell-sub">{p.clientCode}</span>
                    </td>
                    <td data-label="Servicio">
                      {p.service ? <span className={`badge-service badge-${p.service}`}>{p.service.toUpperCase()}</span> : "—"}
                    </td>
                    <td data-label="Bruto" className="num"><strong>{formatMoney(p.amount, p.currency)}</strong></td>
                    <td data-label="Comisión" className="num text-muted">{p.fee ? formatMoney(p.fee, p.currency) : "—"}</td>
                    <td data-label="Neto" className="num">{formatMoney(p.net, p.currency)}</td>
                    <td data-label="Proveedor" className="cell-small">
                      <span>
                        {PROVIDER_LABELS[p.provider] || p.paymentMethod || "—"}
                        {p.confirmedBy && p.confirmedBy !== "system" && <span className="cell-sub">por {p.confirmedBy}</span>}
                      </span>
                    </td>
                    <td data-label="Transacción" className="cell-small cell-mono payments-txn">
                      <span>
                        {p.providerTxnId || "—"}
                        {p.orderId && <span className="cell-sub payments-order">#{p.orderId}</span>}
                        {p.legacyProofUrl && (
                          <button type="button" className="proof-thumb-btn payments-proof" onClick={() => setProofUrl(p.legacyProofUrl)}>
                            Ver comprobante antiguo
                          </button>
                        )}
                      </span>
                    </td>
                    <td data-label="Notas" className="cell-small payments-notes">{p.notes || "-"}</td>
                    <td data-label="Fecha" className="cell-small nowrap text-muted"><RelativeTime value={p.createdAt} /></td>
                    <td data-label="Estado"><span className={`payment-status ${status.cls}`}>{status.text}</span></td>
                    {isPending ? (
                      <td className="cell-actions">
                        <div className="cell-actions-inner">
                          <button
                            type="button"
                            onClick={() => handleProcessPayment(p.id, "confirm")}
                            className="btn btn-approve admin-btn-compact"
                            disabled={busy}
                          >
                            {busy ? "..." : "Aprobar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectNotesModal({ show: true, paymentId: p.id })}
                            className="btn btn-secondary btn-reject admin-btn-compact"
                            disabled={busy}
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    ) : (
                      <td data-label="Acciones" className="cell-small text-muted">{p.status === "confirmed" ? "Asentado" : "—"}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejectNotesModal.show && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reject-payment-title">
          <div className="admin-modal-container glass-panel admin-confirm-dialog">
            <div className="modal-header-bar">
              <h3 id="reject-payment-title">Rechazar pago</h3>
            </div>
            <div className="modal-body-form">
              <p className="section-instruction">
                Ingresa el motivo del rechazo. El cliente podrá verlo en su panel para volver a reportarlo con los datos correctos.
              </p>
              <textarea
                className="form-input form-textarea"
                rows={4}
                placeholder="ej. El monto no coincide con la transferencia / Operación no encontrada en la cuenta."
                value={rejectNotesInput}
                onChange={(e) => setRejectNotesInput(e.target.value)}
              />
            </div>
            <div className="modal-footer-actions">
              <button type="button" className="btn btn-secondary" onClick={closeReject}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={() => handleProcessPayment(rejectNotesModal.paymentId, "reject", rejectNotesInput)}
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
      <ProofLightbox url={proofUrl} onClose={() => setProofUrl("")} />
    </section>
  );
}
