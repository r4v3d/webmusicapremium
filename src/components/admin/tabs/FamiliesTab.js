"use client";

import { useRef, useState } from "react";
import { useAdmin } from "../AdminContext";
import { getCountryFlag } from "../adminHelpers";
import SlotsGrid from "./SlotsGrid";

export default function FamiliesTab() {
  const {
    activeSubTab,
    bulkAction,
    bulkDateValue,
    bulkPriceValue,
    clientSearchQuery,
    clients,
    formatDisplayDate,
    getClientMemberships,
    handleBulkAction,
    handleSearchClients,
    isBulkLoading,
    isClientsLoading,
    selectedClient,
    selectedSlotIds,
    setBulkAction,
    setBulkDateValue,
    setBulkPriceValue,
    setClientSearchQuery,
    setSelectedClient,
    setTableExpiryFilter,
    setTablePlatformFilter,
    setTableSearchQuery,
    setTableStatusFilter,
    tableExpiryFilter,
    tablePlatformFilter,
    tableSearchQuery,
    tableStatusFilter
  } = useAdmin();
  const detailRef = useRef(null);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = [tablePlatformFilter, tableStatusFilter, tableExpiryFilter].filter((v) => v !== "all").length;

  // En móvil el directorio es maestro-detalle: la ficha reemplaza a la lista.
  const selectClient = (c) => {
    setSelectedClient(c);
    if (window.matchMedia("(max-width: 768px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "instant", block: "start" }));
    }
  };

  return (
    <section className="families-section animate-fade-in">
            <div className="section-header-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>Gestión de Clientes</h2>
                <p className="section-instruction" style={{ margin: 0 }}>
                  Titulares y clientes: edítalos directo en la tabla, igual que en Google Sheets.
                </p>
              </div>
            </div>

            {activeSubTab === "tableList" && (
              <div className="table-list-subtab animate-fade-in">
                {/* Advanced Filters */}
                <div className={`table-filters-bar ${showFilters ? "filters-open" : ""}`}>
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por apodo, whatsapp, correo ranura o maestro..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary admin-btn-compact filters-toggle"
                    aria-expanded={showFilters}
                    onClick={() => setShowFilters((v) => !v)}
                  >
                    Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} {showFilters ? "▲" : "▼"}
                  </button>
                  
                  <select
                    className="form-input form-select-input"
                    value={tablePlatformFilter}
                    onChange={(e) => setTablePlatformFilter(e.target.value)}
                  >
                    <option value="all">Todas las plataformas</option>
                    <option value="tidal">Tidal</option>
                    <option value="deezer">Deezer</option>
                  </select>

                  <select
                    className="form-input form-select-input"
                    value={tableStatusFilter}
                    onChange={(e) => setTableStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    <option value="pending_payment">Falta Pago</option>
                    <option value="expired">Vencido</option>
                    <option value="free">Disponible</option>
                  </select>

                  <select
                    className="form-input form-select-input"
                    value={tableExpiryFilter}
                    onChange={(e) => setTableExpiryFilter(e.target.value)}
                  >
                    <option value="all">Todos los vencimientos</option>
                    <option value="expired">Vencidos (Ya expiró)</option>
                    <option value="today">Vencen hoy</option>
                    <option value="7days">Vencen en 7 días</option>
                    <option value="15days">Vencen en 15 días</option>
                    <option value="30days">Vencen en 30 días</option>
                  </select>
                </div>

                <SlotsGrid />

                {/* Floating Actions Bar */}
                <div className={`floating-bulk-bar ${selectedSlotIds.length > 0 ? "visible" : ""}`}>
                  <div className="bulk-bar-selection-info">
                    <strong>{selectedSlotIds.length}</strong>
                    <span>perfiles seleccionados</span>
                  </div>

                  <div className="bulk-bar-actions">
                    <div className="bulk-action-group">
                      <select
                        className="bulk-action-select"
                        value={bulkAction}
                        onChange={(e) => setBulkAction(e.target.value)}
                      >
                        <option value="status_active">Marcar como Activo</option>
                        <option value="status_pending_payment">Marcar como Falta Pago</option>
                        <option value="status_expired">Marcar como Vencido</option>
                        <option value="extend_1">Extender +1 Mes</option>
                        <option value="extend_12">Extender +12 Meses</option>
                        <option value="update_price">Actualizar Precio</option>
                        <option value="update_expiry">Actualizar Vencimiento</option>
                      </select>
                    </div>

                    {bulkAction === "update_price" && (
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Precio S/."
                        className="bulk-action-input"
                        value={bulkPriceValue}
                        onChange={(e) => setBulkPriceValue(e.target.value)}
                      />
                    )}

                    {bulkAction === "update_expiry" && (
                      <input
                        type="date"
                        className="bulk-action-input"
                        style={{ width: '130px' }}
                        value={bulkDateValue}
                        onChange={(e) => setBulkDateValue(e.target.value)}
                      />
                    )}

                    <button
                      type="button"
                      onClick={handleBulkAction}
                      className="bulk-action-btn-go"
                      disabled={isBulkLoading}
                    >
                      {isBulkLoading ? "Aplicando..." : "Aplicar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkAction("clear_slots")}
                      className="btn-bulk-danger"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      disabled={isBulkLoading}
                    >
                      Liberar Cupos
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === "directory" && (
              <div className={`client-directory-panel glass-panel ${selectedClient ? "has-selection" : ""}`} style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
                <div className="directory-sidebar">
                  <h3>Directorio</h3>
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por apodo, whatsapp o email..."
                      value={clientSearchQuery}
                      onChange={(e) => {
                        setClientSearchQuery(e.target.value);
                        handleSearchClients(e.target.value);
                      }}
                    />
                  </div>

                  {isClientsLoading && clients.length === 0 ? (
                    <div className="admin-loading-screen" style={{ minHeight: '100px' }}>
                      <span className="admin-spinner"></span>
                    </div>
                  ) : clients.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '12px' }}>
                      No se encontraron clientes.
                    </div>
                  ) : (
                    <div className="search-results-list">
                      {clients.map((c) => {
                        const cId = c._id || c.id;
                        const isSelected = selectedClient && (selectedClient._id || selectedClient.id).toString() === cId.toString();
                        return (
                          <div
                            key={cId}
                            onClick={() => selectClient(c)}
                            className={`client-search-card glass-panel ${isSelected ? "active" : ""}`}
                            style={{ borderRadius: 'var(--radius-sm)' }}
                          >
                            <div className="client-search-name">
                              {getCountryFlag(c.currentWhatsApp)} {c.nickname || "Sin Apodo"}
                            </div>
                            <div className="client-search-phone">
                              {c.currentWhatsApp}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="directory-detail-view" ref={detailRef}>
                  {selectedClient ? (
                    <div className="client-detail-card glass-panel" style={{ height: '100%', borderRadius: 'var(--radius-lg)' }}>
                      <button type="button" className="btn btn-secondary admin-btn-compact directory-back-btn" onClick={() => setSelectedClient(null)}>
                        ← Clientes
                      </button>
                      <div className="client-detail-header">
                        <div className="client-main-name">
                          {getCountryFlag(selectedClient.currentWhatsApp)} {selectedClient.nickname || "Cliente Sin Apodo"}
                        </div>
                      </div>

                      <div className="client-detail-grid">
                        <div>
                          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}>Datos de Contacto</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>WhatsApp Principal: </span>
                              <a
                                href={`https://wa.me/${selectedClient.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="client-phone-link"
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                              >
                                {selectedClient.currentWhatsApp}
                              </a>
                            </div>

                            {selectedClient.pastWhatsApps && selectedClient.pastWhatsApps.length > 0 && (
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>WhatsApps Anteriores:</span>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {selectedClient.pastWhatsApps.map((phone, i) => (
                                    <li key={i}>
                                      <a
                                        href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="client-phone-link"
                                        style={{ fontSize: '0.8rem' }}
                                      >
                                        {getCountryFlag(phone)} {phone}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {selectedClient.usedEmails && selectedClient.usedEmails.length > 0 && (
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Correos Utilizados:</span>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {selectedClient.usedEmails.map((email, i) => (
                                    <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#fff' }}>
                                      {email}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}>Planes / Membresías Activas e Históricas</h4>
                          {getClientMemberships(selectedClient._id || selectedClient.id).length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Este cliente no tiene ranuras activas o registradas en este momento.
                            </div>
                          ) : (
                            <div className="history-items-list">
                              {getClientMemberships(selectedClient._id || selectedClient.id).map((m) => {
                                const statusNames = {
                                  active: "Activo",
                                  expired: "Vencido",
                                  pending_payment: "Falta Pago",
                                  free: "Disponible"
                                };
                                return (
                                  <div key={m.id} className="history-item-row glass-panel" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div>
                                      <span className={`badge-service badge-${m.service}`} style={{ fontSize: '0.65rem', marginRight: '6px', textTransform: 'uppercase' }}>
                                        {m.service}
                                      </span>
                                      <span style={{ fontWeight: '600' }}>{m.memberEmail}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                      <span className={`status-badge-mini ${m.status}`} style={{ fontSize: '0.6rem' }}>
                                        {statusNames[m.status]}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        S/. {m.pricePen} {m.renewalDate && `| Vence: ${formatDisplayDate(m.renewalDate)}`}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel text-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', minHeight: '300px' }}>
                      Selecciona un cliente del directorio para ver sus detalles.
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
  );
}
