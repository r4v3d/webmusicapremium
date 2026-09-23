"use client";

import { useAdmin } from "../AdminContext";
import { CopyIcon, PlusIcon, TrashIcon, getCountryFlag } from "../adminHelpers";
import { SecretField } from "../adminUi";

export default function FamiliesTab() {
  const {
    activeSubTab,
    allVisibleSelected,
    bulkAction,
    bulkDateValue,
    bulkPriceValue,
    clientSearchQuery,
    clients,
    copiedId,
    familyAccounts,
    filteredSlots,
    formatDisplayDate,
    getExpiryTag,
    handleBulkAction,
    handleCopyToClipboard,
    handleDeleteFamily,
    handleOpenEditSlotModal,
    handleSearchClients,
    isBulkLoading,
    isClientsLoading,
    isFamiliesLoading,
    loading,
    selectedClient,
    selectedSlotIds,
    setActiveSubTab,
    setBulkAction,
    setBulkDateValue,
    setBulkPriceValue,
    setClientSearchQuery,
    setSelectedClient,
    setShowAddFamilyModal,
    setTableExpiryFilter,
    setTablePlatformFilter,
    setTableSearchQuery,
    setTableStatusFilter,
    stock,
    tableExpiryFilter,
    tablePlatformFilter,
    tableSearchQuery,
    tableStatusFilter,
    toggleSelectAllVisible,
    toggleSelectSlot
  } = useAdmin();

  return (
    <section className="families-section animate-fade-in">
            <div className="section-header-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>Gestión de Clientes y Familias</h2>
                <p className="section-instruction" style={{ margin: 0 }}>
                  Administra las cuentas familiares dueñas y los perfiles de clientes vinculados.
                </p>
              </div>
            </div>

            {activeSubTab === "familyAccounts" && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                  <button onClick={() => setShowAddFamilyModal(true)} className="btn btn-primary">
                    <PlusIcon /> <span>Añadir Cuenta Familiar</span>
                  </button>
                </div>

                {isFamiliesLoading && familyAccounts.length === 0 ? (
                  <div className="admin-loading-screen" style={{ minHeight: '200px' }}>
                    <span className="admin-spinner"></span>
                    <p>Cargando cuentas familiares...</p>
                  </div>
                ) : familyAccounts.length === 0 ? (
                  <div className="empty-panel glass-panel text-center">
                    <p>No se han registrado cuentas familiares todavía. Haz clic en &ldquo;Añadir Cuenta Familiar&rdquo; para crear una.</p>
                  </div>
                ) : (
                  <div className="families-grid-layout">
                    {familyAccounts.map((acc) => {
                      const accId = acc._id || acc.id;
                      return (
                        <div key={accId} className="family-card glass-panel border-purple">
                          <div className="family-info-col">
                            <div className="family-card-header">
                              <div className="family-brand-info">
                                <span className={`badge-service badge-${acc.service} family-service-tag`}>
                                  {acc.service}
                                </span>
                                <strong style={{ color: '#fff' }}>Familiar</strong>
                              </div>
                              <button
                                onClick={() => handleDeleteFamily(accId, acc.masterEmail)}
                                className="btn-delete-stock"
                                style={{ padding: '4px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                title="Eliminar Cuenta Familiar"
                              >
                                <TrashIcon />
                              </button>
                            </div>

                            <div className="family-master-credentials">
                              <div className="cred-row">
                                <span className="cred-label">Correo Dueño:</span>
                                <div className="cred-value-wrap">
                                  <span className="cred-value">{acc.masterEmail}</span>
                                  <button
                                    onClick={() => handleCopyToClipboard(acc.masterEmail, `master-email-${accId}`)}
                                    className="btn-mini-copy"
                                    title="Copiar correo dueño"
                                  >
                                    <CopyIcon />
                                    <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>
                                      {copiedId === `master-email-${accId}` ? "Copiado" : ""}
                                    </span>
                                  </button>
                                </div>
                              </div>
                              <div className="cred-row">
                                <span className="cred-label">Clave Maestro:</span>
                                <div className="cred-value-wrap">
                                  <SecretField
                                    value={acc.password}
                                    copyId={`master-pass-${accId}`}
                                    copiedId={copiedId}
                                    onCopy={handleCopyToClipboard}
                                    compact
                                  />
                                </div>
                              </div>
                              {acc.notes && (
                                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                                  <strong>Notas:</strong> {acc.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="family-slots-col">
                            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Ranuras (Max 5 miembros)</h4>
                            <div className="family-slots-row-layout">
                              {acc.profiles && acc.profiles.map((p) => {
                                const pId = p._id || p.id;
                                const statusNames = {
                                  active: "Activo",
                                  expired: "Vencido",
                                  pending_payment: "Falta Pago",
                                  free: "Disponible"
                                };
                                return (
                                  <div key={pId} className="slot-item-row">
                                    <div className="slot-row-header">
                                      <div className="slot-email-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
                                        <span className="slot-email-text" title={p.memberEmail || "Cupo Disponible"} style={{ maxWidth: '75%' }}>
                                          {p.memberEmail ? p.memberEmail : "Cupo Disponible"}
                                        </span>
                                        {p.memberEmail && (
                                          <button
                                            onClick={() => handleCopyToClipboard(p.memberEmail, `slot-email-${pId}`)}
                                            className="btn-mini-copy"
                                            title="Copiar correo ranura"
                                          >
                                            <CopyIcon />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                                      {p.memberEmail && (
                                        <span className={`slot-badge-email-type ${p.emailType}`} style={{ fontSize: '0.55rem' }}>
                                          {p.emailType === "admin" ? "Propio" : "Cliente"}
                                        </span>
                                      )}
                                      <span className={`status-badge-mini ${p.status}`} style={{ fontSize: '0.55rem' }}>{statusNames[p.status] || p.status}</span>
                                    </div>
    
                                    {p.status !== "free" && p.clientId && (
                                      <div className="slot-client-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                        <span className="client-name-tag" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                          👤 {p.clientId.customerCode || "CLI-XXXXXX"}{p.clientId.nickname ? ` | ${p.clientId.nickname}` : ""}
                                        </span>
                                        <a
                                          href={`https://wa.me/${p.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="client-phone-link"
                                          style={{ fontSize: '0.75rem' }}
                                        >
                                          {getCountryFlag(p.clientId.currentWhatsApp)} {p.clientId.currentWhatsApp}
                                        </a>
                                      </div>
                                    )}
    
                                    <div className="slot-item-footer" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '4px', marginTop: '4px' }}>
                                      {p.memberPassword ? (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                          <span style={{ fontSize: '0.7rem' }}>Clave: <code>{p.memberPassword}</code></span>
                                          <button
                                            onClick={() => handleCopyToClipboard(p.memberPassword, `slot-pass-${pId}`)}
                                            className="btn-mini-copy"
                                            title="Copiar clave"
                                          >
                                            <CopyIcon />
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Sin clave</span>
                                      )}
                                      {p.status !== "free" && (
                                        <span style={{ fontSize: '0.7rem', alignSelf: 'flex-end', color: 'var(--accent-cyan)' }}>
                                          S/. {p.pricePen} {p.renewalDate && `| Vence: ${formatDisplayDate(p.renewalDate)}`}
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                      <button
                                        onClick={() => handleOpenEditSlotModal(p)}
                                        className="btn-slot-edit"
                                        style={{ width: '100%', padding: '4px 8px', fontSize: '0.7rem', textAlign: 'center' }}
                                      >
                                        Editar Ranura
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeSubTab === "tableList" && (
              <div className="table-list-subtab animate-fade-in">
                {/* Advanced Filters */}
                <div className="table-filters-bar">
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por apodo, whatsapp, correo ranura o maestro..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <select
                    className="form-input form-select-input"
                    value={tablePlatformFilter}
                    onChange={(e) => setTablePlatformFilter(e.target.value)}
                  >
                    <option value="all">Todas las plataformas</option>
                    <option value="tidal">Tidal</option>
                    <option value="deezer">Deezer</option>
                    <option value="qobuz">Qobuz</option>
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

                {/* Table list of slots */}
                {filteredSlots.length === 0 ? (
                  <div className="empty-panel glass-panel text-center">
                    <p>No se encontraron cupos/ranuras con los filtros seleccionados.</p>
                  </div>
                ) : (
                  <div className="bulk-table-container">
                    <table className="bulk-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>
                            <label className="custom-checkbox">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleSelectAllVisible}
                              />
                              <span className="checkmark"></span>
                            </label>
                          </th>
                          <th>Plataforma</th>
                          <th>Correo Maestro</th>
                          <th>Correo Ranura</th>
                          <th>Contraseña</th>
                          <th>Cliente / WhatsApp</th>
                          <th>Precio</th>
                          <th>Vencimiento</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSlots.map(slot => {
                          const isSelected = selectedSlotIds.includes(slot.id);
                          const expiryInfo = getExpiryTag(slot.renewalDate);
                          const statusNames = {
                            active: "Activo",
                            expired: "Vencido",
                            pending_payment: "Falta Pago",
                            free: "Disponible"
                          };

                          return (
                            <tr key={slot.id} className={isSelected ? "selected" : ""}>
                              <td>
                                <label className="custom-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectSlot(slot.id)}
                                  />
                                  <span className="checkmark"></span>
                                </label>
                              </td>
                              <td>
                                <span className={`badge-service badge-${slot.service}`} style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                  {slot.service}
                                </span>
                              </td>
                              <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.masterEmail}>
                                {slot.masterEmail}
                              </td>
                              <td style={{ fontWeight: '600', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.memberEmail || "Disponible"}>
                                {slot.memberEmail ? slot.memberEmail : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Disponible</span>}
                              </td>
                              <td>
                                {slot.memberPassword ? (
                                  <SecretField
                                    value={slot.memberPassword}
                                    copyId={`tbl-pass-${slot.id}`}
                                    copiedId={copiedId}
                                    onCopy={handleCopyToClipboard}
                                    compact
                                  />
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>
                              <td>
                                {slot.clientId ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                     <span style={{ fontWeight: '600' }}>
                                       {slot.clientId.customerCode || "CLI-XXXXXX"}{slot.clientId.nickname ? ` | ${slot.clientId.nickname}` : ""}
                                     </span>
                                    <a
                                      href={`https://wa.me/${slot.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="client-phone-link"
                                      style={{ fontSize: '0.75rem' }}
                                    >
                                      {getCountryFlag(slot.clientId.currentWhatsApp)} {slot.clientId.currentWhatsApp}
                                    </a>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Sin Cliente</span>
                                )}
                              </td>
                              <td>
                                {slot.status !== "free" ? `S/. ${slot.pricePen}` : "-"}
                              </td>
                              <td>
                                {slot.status !== "free" && slot.renewalDate ? (
                                  <span className={`expiry-tag ${expiryInfo.className}`}>
                                    {expiryInfo.label}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>
                              <td>
                                <span className={`status-badge-mini ${slot.status}`}>
                                  {statusNames[slot.status] || slot.status}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSlotModal(slot)}
                                  className="btn-slot-edit"
                                  style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

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
              <div className="client-directory-panel glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
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
                            onClick={() => setSelectedClient(c)}
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

                <div className="directory-detail-view">
                  {selectedClient ? (
                    <div className="client-detail-card glass-panel" style={{ height: '100%', borderRadius: 'var(--radius-lg)' }}>
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
