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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Gestión de Cobranzas por WhatsApp
                    <span style={{ 
                      background: 'var(--accent-cyan, #00e5ff)', 
                      color: '#08080a', 
                      padding: '4px 10px', 
                      borderRadius: '9999px', 
                      fontSize: '0.85rem', 
                      fontWeight: 'bold' 
                    }}>
                      {totalBillingCount} Clientes
                    </span>
                  </h2>
                  <p className="section-instruction">
                    Envía recordatorios personalizados de pago directamente al WhatsApp de los clientes que vencen hoy o que tienen vencimientos pasados.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
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
                    style={{ maxWidth: '280px', height: '40px', margin: 0 }}
                    value={billingSearchQuery}
                    onChange={(e) => setBillingSearchQuery(e.target.value)}
                  />

                  {/* Toggle templates config button */}
                  <button
                    onClick={() => setShowTemplateConfig(!showTemplateConfig)}
                    className="btn btn-secondary"
                    style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}
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
                <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                        className="glass-panel" 
                        style={{ 
                          padding: '20px', 
                          borderRadius: '12px',
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

                        {/* DESKTOP VIEW (TABLE) */}
                        <div className="hidden-mobile-table-wrapper" style={{ overflowX: 'auto' }}>
                          <table className="admin-table whatsapp-billing-table">
                            <thead>
                              <tr>
                                <th></th>
                                <th>Cliente</th>
                                <th>Servicio</th>
                                <th>Correo Perfil</th>
                                <th>Precio</th>
                                <th style={{ width: '45%' }}>Mensaje Personalizado</th>
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
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={selectedBillingIds.includes(slot.id)}
                                        onChange={() => toggleBillingSelect(slot.id)}
                                        aria-label={`Seleccionar ${slot.clientId?.nickname || slot.memberEmail}`}
                                      />
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontWeight: 'bold' }}>{slot.clientId?.nickname || "Sin Apodo"}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Código: {slot.clientId?.customerCode || "---"}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan, #00e5ff)' }}>{getCountryFlag(phoneNum)} {phoneNum}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <span className={`service-badge badge-${slot.service}`}>
                                        {slot.service ? slot.service.toUpperCase() : ""}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '0.85rem' }}>{slot.memberEmail}</td>
                                    <td style={{ fontWeight: '600' }}>S/. {slot.pricePen || "0.00"}</td>
                                    <td>
                                      <textarea
                                        className="form-input form-textarea"
                                        rows={2}
                                        style={{ fontSize: '0.8rem', width: '100%', resize: 'vertical', minHeight: '60px' }}
                                        value={msgText}
                                        onChange={(e) => handleMessageChange(slot.id, e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn-whatsapp-send"
                                        onClick={() => openWhatsApp(slot)}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '6px',
                                          background: contacted ? '#128C7E' : '#25D366',
                                          color: '#fff',
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          fontSize: '0.8rem',
                                          fontWeight: 'bold',
                                          border: 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <WhatsAppIcon size={14} />
                                        <span>{contacted ? "Reenviar" : "Enviar"}</span>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* MOBILE VIEW (CARDS) */}
                        <div className="visible-mobile-cards-list" style={{ display: 'none', flexDirection: 'column', gap: '15px' }}>
                          {slots.map(slot => {
                            const phoneNum = slot.clientId?.currentWhatsApp || "";
                            const msgText = getMessageForSlot(slot);
                            const contacted = Boolean(contactedSlotIds[slot.id]);
                            
                            return (
                              <div 
                                key={slot.id} 
                                className="mobile-billing-card" 
                                style={{
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  borderRadius: '10px',
                                  padding: '15px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px',
                                  opacity: contacted ? 0.7 : 1
                                }}
                              >
                                {/* Card Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedBillingIds.includes(slot.id)}
                                      onChange={() => toggleBillingSelect(slot.id)}
                                    />
                                    <div>
                                    <h4 style={{ margin: '0 0 2px 0', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                      {slot.clientId?.nickname || "Sin Apodo"}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Cód: {slot.clientId?.customerCode || "---"} | WhatsApp: {phoneNum}
                                    </span>
                                    </div>
                                  </label>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <span className={`service-badge badge-${slot.service}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                      {slot.service ? slot.service.toUpperCase() : ""}
                                    </span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                                      S/. {slot.pricePen || "0.00"}
                                    </span>
                                  </div>
                                </div>

                                {/* Card body */}
                                <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Perfil:</span>
                                    <span style={{ fontWeight: '500', wordBreak: 'break-all' }}>{slot.memberEmail}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Vence:</span>
                                    <span style={{ fontWeight: '500', color: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444' }}>{formatDate(slot.renewalDate)}</span>
                                  </div>
                                </div>

                                {/* Text editor for customized message */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>Mensaje personalizado:</label>
                                  <textarea
                                    className="form-input form-textarea"
                                    rows={3}
                                    style={{ fontSize: '0.8rem', width: '100%', resize: 'none' }}
                                    value={msgText}
                                    onChange={(e) => handleMessageChange(slot.id, e.target.value)}
                                  />
                                </div>

                                {/* Action button */}
                                <button
                                  type="button"
                                  onClick={() => openWhatsApp(slot)}
                                  className="btn-whatsapp-send-mobile"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: contacted ? '#128C7E' : '#25D366',
                                    color: '#fff',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    boxShadow: '0 4px 10px rgba(37, 211, 102, 0.2)'
                                  }}
                                >
                                  <WhatsAppIcon size={16} />
                                  <span>{contacted ? "Reenviar WhatsApp" : "Enviar WhatsApp"}</span>
                                </button>

                              </div>
                            );
                          })}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </section>
          );
}
