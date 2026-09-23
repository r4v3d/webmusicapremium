"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import { PROVIDER_LABELS, STATUS_LABELS, ProofLightbox, formatDateTimePe, formatMoney } from "../adminUi";

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

  return (
            <section className="payments-section animate-fade-in" style={{ paddingBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Libro de pagos</h2>
                  <p className="section-instruction">
                    Cada cobro llega confirmado por su proveedor o por tu verificación en «Por verificar». Los botones de aprobar solo aparecen en reportes con comprobante del sistema anterior.
                  </p>
                </div>
              </div>

              {payments.length === 0 ? (
                <div className="empty-panel glass-panel text-center" style={{ padding: '40px' }}>
                  <p style={{ color: 'var(--text-muted)' }}>{isPaymentsLoading ? "Cargando pagos…" : "Todavía no hay pagos registrados."}</p>
                </div>
              ) : (
                <div className="payments-list-wrapper glass-panel" style={{ overflow: 'hidden', padding: '15px' }}>
                  <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 10px' }}>Cliente</th>
                          <th style={{ padding: '12px 10px' }}>Servicio</th>
                          <th style={{ padding: '12px 10px' }}>Bruto</th>
                          <th style={{ padding: '12px 10px' }}>Comisión</th>
                          <th style={{ padding: '12px 10px' }}>Neto</th>
                          <th style={{ padding: '12px 10px' }}>Proveedor</th>
                          <th style={{ padding: '12px 10px' }}>Transacción / pedido</th>
                          <th style={{ padding: '12px 10px' }}>Notas</th>
                          <th style={{ padding: '12px 10px' }}>Fecha</th>
                          <th style={{ padding: '12px 10px' }}>Estado</th>
                          <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                {pendingFirst.map((p) => {
                          const isPending = p.status === "pending" && p.isLegacy;
                          const isConfirmed = p.status === "confirmed";
                          const isRejected = p.status === "rejected";

                          let statusStyle = { color: '#eab308', background: 'rgba(234, 179, 8, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                          let statusText = STATUS_LABELS[p.status] || p.status;

                          if (isConfirmed) {
                            statusStyle = { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                            statusText = "Confirmado";
                          } else if (isRejected) {
                            statusStyle = { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                            statusText = "Rechazado";
                          } else if (p.status === "refunded") {
                            statusStyle = { color: '#60a5fa', background: 'rgba(96, 165, 250, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                            statusText = "Reembolsado";
                          }

                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} className="table-row-hover">
                              <td style={{ padding: '12px 10px' }}>
                                <strong style={{ color: '#fff', display: 'block' }}>{p.clientName}</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.clientCode}</span>
                              </td>
                              <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>
                                <span className={`platform-badge ${p.service}`} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                  {p.service}
                                </span>
                              </td>
                              <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#fff' }}>
                                {formatMoney(p.amount, p.currency)}
                              </td>
                              <td style={{ padding: '12px 10px', color: 'var(--text-muted)' }}>
                                {p.fee ? formatMoney(p.fee, p.currency) : "—"}
                              </td>
                              <td style={{ padding: '12px 10px', color: '#fff' }}>
                                {formatMoney(p.net, p.currency)}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem' }}>
                                {PROVIDER_LABELS[p.provider] || p.paymentMethod || "—"}
                                {p.confirmedBy && p.confirmedBy !== "system" && (
                                  <span style={{ display: 'block', color: 'var(--text-muted)' }}>por {p.confirmedBy}</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '160px' }}>
                                {p.providerTxnId || "—"}
                                {p.orderId && <span style={{ display: 'block', color: 'var(--accent-cyan)' }}>#{p.orderId}</span>}
                                {p.legacyProofUrl && (
                                  <button type="button" className="proof-thumb-btn" onClick={() => setProofUrl(p.legacyProofUrl)}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>Ver comprobante antiguo</span>
                                  </button>
                                )}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem', color: '#ccc', maxWidth: '180px', wordBreak: 'break-word' }}>
                                {p.notes || "-"}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {formatDateTimePe(p.createdAt)}
                              </td>
                              <td style={{ padding: '12px 10px' }}>
                                <span style={statusStyle}>{statusText}</span>
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                {isPending ? (
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                    <button
                                      onClick={() => handleProcessPayment(p.id, "confirm")}
                                      className="btn btn-primary"
                                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', background: 'var(--green-theme, #10b981)', border: 'none' }}
                                      disabled={actionPaymentId === p.id}
                                    >
                                      {actionPaymentId === p.id ? "..." : "Aprobar"}
                                    </button>
                                    <button
                                      onClick={() => setRejectNotesModal({ show: true, paymentId: p.id })}
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', borderColor: '#ef4444', color: '#ef4444' }}
                                      disabled={actionPaymentId === p.id}
                                    >
                                      Rechazar
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.status === "confirmed" ? "Asentado" : "—"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Reject Notes Modal */}
              {rejectNotesModal.show && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                  <div className="glass-panel p-6" style={{ maxWidth: '400px', width: '100%', margin: '0 15px', background: '#0f0f13', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                    <h3 style={{ marginBottom: '8px', color: '#fff' }}>Rechazar Pago</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '15px', lineHeight: '1.4' }}>
                      Ingresa el motivo del rechazo. El cliente podrá verlo en su panel para volver a reportarlo con los datos correctos.
                    </p>
                    <textarea
                      style={{ width: '100%', height: '100px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', marginBottom: '15px', resize: 'none' }}
                      placeholder="ej. El monto no coincide con la transferencia / Operación no encontrada en la cuenta."
                      value={rejectNotesInput}
                      onChange={(e) => setRejectNotesInput(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        onClick={() => setRejectNotesModal({ show: false, paymentId: "" })}
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#ef4444', border: 'none' }}
                        onClick={() => handleProcessPayment(rejectNotesModal.paymentId, "reject", rejectNotesInput)}
                      >
                        Confirmar Rechazo
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <ProofLightbox url={proofUrl} onClose={() => setProofUrl("")} />
            </section>
          );
}
