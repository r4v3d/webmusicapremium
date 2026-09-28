"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { WhatsAppIcon, formatDate, getCountryFlag, getDaysAgo } from "../adminHelpers";
import { isBillingInWindow, todayIso } from "../adminUi";

const CONTACTED_KEY = "wa_contacted_v1";

export default function WhatsAppBillingTab() {
  const {
    allSlots,
    billingSearchQuery,
    billingWindow,
    getMessageForSlot,
    handleMessageChange,
    handleSaveTemplates,
    isFamiliesLoading,
    setBillingSearchQuery,
    setBillingWindow,
    setShowTemplateConfig,
    showTemplateConfig,
    showToast,
    templatePast,
    templateToday
  } = useAdmin();
  const [selectedBillingIds, setSelectedBillingIds] = useState([]);
  const [contactedSlotIds, setContactedSlotIds] = useState({});
  const [hideContacted, setHideContacted] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTACTED_KEY);
      if (raw) setContactedSlotIds(JSON.parse(raw) || {});
    } catch {
      setContactedSlotIds({});
    }
  }, []);

  const persistContacted = (next) => {
    setContactedSlotIds(next);
    localStorage.setItem(CONTACTED_KEY, JSON.stringify(next));
  };

  const markSlotsContacted = (ids) => {
    const next = { ...contactedSlotIds };
    const now = Date.now();
    ids.forEach((id) => {
      next[id] = now;
    });
    persistContacted(next);
    setSelectedBillingIds((prev) => prev.filter((id) => !ids.includes(id)));
  };

  // 1. Grouping and filtering logic
          const todayStr = todayIso();

          // Filter: occupied slots with client, then apply billing window (default: today + 7d)
          let filteredBillingSlots = allSlots.filter(s => 
            s.clientId && 
            s.status !== "free" && 
            isBillingInWindow(s.renewalDate, billingWindow || "week", todayStr)
          );

          // Apply billingSearchQuery if present
          if (billingSearchQuery.trim()) {
            const q = billingSearchQuery.toLowerCase().trim();
            filteredBillingSlots = filteredBillingSlots.filter(s => {
              const nickname = s.clientId?.nickname?.toLowerCase() || "";
              const code = s.clientId?.customerCode?.toLowerCase() || "";
              const phone = s.clientId?.currentWhatsApp || "";
              return nickname.includes(q) || code.includes(q) || phone.includes(q);
            });
          }

          if (hideContacted) {
            filteredBillingSlots = filteredBillingSlots.filter((s) => !contactedSlotIds[s.id]);
          }

          const toggleBillingSelect = (id) => {
            setSelectedBillingIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
          };

          const openWhatsApp = (slot, { mark = true } = {}) => {
            const phoneNum = slot.clientId?.currentWhatsApp || "";
            const cleanPhone = phoneNum.replace(/[^0-9]/g, "");
            if (!cleanPhone) {
              showToast?.("Este cliente no tiene WhatsApp.", "error");
              return;
            }
            const msgText = getMessageForSlot(slot);
            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`, "_blank", "noopener,noreferrer");
            if (mark) markSlotsContacted([slot.id]);
          };

          const openNextWhatsApp = () => {
            const withPhone = filteredBillingSlots.filter((s) => (s.clientId?.currentWhatsApp || "").replace(/[^0-9]/g, "").length >= 6);
            const pool = selectedBillingIds.length
              ? withPhone.filter((s) => selectedBillingIds.includes(s.id))
              : withPhone;
            const next = pool[0];
            if (!next) {
              showToast?.("No hay más clientes en la cola.", "error");
              return;
            }
            openWhatsApp(next);
          };

          // Group by renewalDate
          const grouped = {};
          filteredBillingSlots.forEach(s => {
            const date = s.renewalDate;
            if (!grouped[date]) {
              grouped[date] = [];
            }
            grouped[date].push(s);
          });

          // Sort dates: today first, then past dates descending (most recent first)
          const sortedDates = Object.keys(grouped).sort((a, b) => {
            if (a === todayStr) return -1;
            if (b === todayStr) return 1;
            return b.localeCompare(a);
          });

          const totalBillingCount = filteredBillingSlots.length;

          // Helper to get formatted title
          const getSectionTitle = (dateStr) => {
            if (dateStr === todayStr) {
              return `Vencen Hoy - ${formatDate(dateStr)}`;
            } else {
              const days = getDaysAgo(dateStr, todayStr);
              return `Vencieron el ${formatDate(dateStr)} (${days} ${days === 1 ? 'día' : 'días'} de retraso)`;
            }
          };

          return (
            <section className="whatsapp-billing-section animate-fade-in" style={{ paddingBottom: '40px' }}>
              
              {/* Header block with statistics and search */}
              <div className="wa-header">
                <div>
                  <h2 className="wa-title">
                    Gestión de Cobranzas por WhatsApp
                    <span className="wa-count">
                      {totalBillingCount} Clientes
                    </span>
                  </h2>
                  <p className="section-instruction">
                    Envía recordatorios personalizados de pago directamente al WhatsApp de los clientes que vencen hoy o que tienen vencimientos pasados.
                  </p>
                </div>

                <div className="admin-toolbar wa-controls">
                  <div className="stock-filter-tabs">
                    {[
                      { id: "today", label: "Hoy" },
                      { id: "week", label: "Hoy + 7d" },
                      { id: "month", label: "30 días" },
                      { id: "all", label: "Histórico" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`filter-btn ${billingWindow === opt.id ? "active" : ""}`}
                        onClick={() => setBillingWindow(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por apodo, código o celular..."
                    aria-label="Buscar cliente"
                    value={billingSearchQuery}
                    onChange={(e) => setBillingSearchQuery(e.target.value)}
                  />

                  {/* Toggle templates config button */}
                  <button
                    onClick={() => setShowTemplateConfig(!showTemplateConfig)}
                    className="btn btn-secondary wa-template-toggle"
                    aria-expanded={showTemplateConfig}
                  >
                    <span>Configurar Plantillas</span>
                    <span style={{ transition: 'transform 0.2s', transform: showTemplateConfig ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                  </button>
                </div>
              </div>

              <div className="wa-queue-toolbar glass-panel">
                <label className="wa-queue-check">
                  <input
                    type="checkbox"
                    checked={hideContacted}
                    onChange={(e) => setHideContacted(e.target.checked)}
                  />
                  Ocultar contactados
                </label>
                <span className="text-muted">{selectedBillingIds.length} seleccionados</span>
                <button type="button" className="btn btn-primary btn-sm-mobile" onClick={openNextWhatsApp}>
                  Abrir siguiente
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm-mobile"
                  disabled={!selectedBillingIds.length}
                  onClick={() => markSlotsContacted(selectedBillingIds)}
                >
                  Marcar contactados
                </button>
              </div>

              {/* Collapsed Template Configuration Area */}
              {showTemplateConfig && (
                <div className="glass-panel wa-template-panel">
                  <h3 style={{ marginBottom: '15px', fontSize: '1.1rem', color: 'var(--accent-cyan, #00e5ff)' }}>Plantillas de Mensajes</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                    Personaliza los mensajes predeterminados usando las siguientes etiquetas variables:
                    <br />
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{cliente}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{servicio}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{perfil}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{vencimiento}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{precio}`}</code>
                  </p>
                  
                  {/* Template Editor Form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                      <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Mensaje para clientes que vencen hoy:</label>
                      <textarea
                        className="form-input form-textarea"
                        rows={3}
                        defaultValue={templateToday}
                        id="temp-today-input"
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Mensaje para clientes con vencimiento pasado (Deudores):</label>
                      <textarea
                        className="form-input form-textarea"
                        rows={3}
                        defaultValue={templatePast}
                        id="temp-past-input"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowTemplateConfig(false)} 
                        className="btn btn-secondary"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const todayVal = document.getElementById("temp-today-input").value;
                          const pastVal = document.getElementById("temp-past-input").value;
                          handleSaveTemplates(todayVal, pastVal);
                        }} 
                        className="btn btn-primary"
                      >
                        Guardar Plantillas
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main lists */}
              {isFamiliesLoading && totalBillingCount === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '12px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Cargando cola de cobranzas…</p>
                </div>
              ) : totalBillingCount === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '12px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
                    {billingSearchQuery ? "No se encontraron clientes que coincidan con la búsqueda." : "No hay clientes pendientes de cobro (vencimientos hoy o pasados) sin registrar pago."}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                  {sortedDates.map(dateKey => {
                    const slots = grouped[dateKey];
                    const isToday = dateKey === todayStr;
                    
                    return (
                      <div 
                        key={dateKey} 
                        className="glass-panel wa-date-panel" 
                        style={{ 
                          border: isToday ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        {/* Title block with date */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          marginBottom: '15px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          paddingBottom: '10px'
                        }}>
                          <h3 style={{ 
                            fontSize: '1.1rem', 
                            fontWeight: '600', 
                            color: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              background: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444',
                              display: 'inline-block' 
                            }}></span>
                            {getSectionTitle(dateKey)}
                          </h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {slots.length} {slots.length === 1 ? 'cliente' : 'clientes'}
                          </span>
                        </div>

                        <div className="table-responsive">
                          <table className="admin-table admin-table--stack whatsapp-billing-table">
                            <thead>
                              <tr>
                                <th></th>
                                <th>Cliente</th>
                                <th>Servicio</th>
                                <th>Correo Perfil</th>
                                <th className="num">Precio</th>
                                <th className="wa-col-message">Mensaje Personalizado</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map(slot => {
                                const phoneNum = slot.clientId?.currentWhatsApp || "";
                                const msgText = getMessageForSlot(slot);
                                const contacted = Boolean(contactedSlotIds[slot.id]);

                                return (
                                  <tr key={slot.id} className={contacted ? "row-contacted" : ""}>
                                    <td className="cell-half wa-cell-check">
                                      <input
                                        type="checkbox"
                                        checked={selectedBillingIds.includes(slot.id)}
                                        onChange={() => toggleBillingSelect(slot.id)}
                                        aria-label={`Seleccionar ${slot.clientId?.nickname || slot.memberEmail}`}
                                      />
                                    </td>
                                    <td className="cell-primary">
                                      <div className="wa-client">
                                        <strong>{slot.clientId?.nickname || "Sin Apodo"}</strong>
                                        <span className="cell-sub">Código: {slot.clientId?.customerCode || "---"}</span>
                                        <span className="wa-phone">{getCountryFlag(phoneNum)} {phoneNum}</span>
                                      </div>
                                    </td>
                                    <td className="cell-half wa-cell-service">
                                      <span className={`service-badge badge-${slot.service}`}>
                                        {slot.service ? slot.service.toUpperCase() : ""}
                                      </span>
                                    </td>
                                    <td data-label="Perfil" className="cell-email cell-small">{slot.memberEmail}</td>
                                    <td data-label="Precio" className="num"><strong>S/. {slot.pricePen || "0.00"}</strong></td>
                                    <td data-label="Mensaje" className="cell-block">
                                      <textarea
                                        className="form-input form-textarea wa-message"
                                        rows={2}
                                        aria-label="Mensaje personalizado"
                                        value={msgText}
                                        onChange={(e) => handleMessageChange(slot.id, e.target.value)}
                                      />
                                    </td>
                                    <td className="cell-actions">
                                      <div className="cell-actions-inner">
                                        <button
                                          type="button"
                                          className={`btn-whatsapp-send ${contacted ? "is-contacted" : ""}`}
                                          onClick={() => openWhatsApp(slot)}
                                        >
                                          <WhatsAppIcon size={14} />
                                          <span>{contacted ? "Reenviar" : "Enviar"}</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </section>
          );
}
