"use client";

import { useAdmin } from "../AdminContext";

export default function RenewalsTab() {
  const {
    editingCosts,
    editingRates,
    exchangeRateUsdToArs,
    exchangeRateUsdToPen,
    familyAccounts,
    getCostInPen,
    handleFamilyAccountChange,
    handleSaveExchangeRates,
    handleSavePlatformCosts,
    handleSaveRenewalInfo,
    platformCosts,
    renewalsPage,
    renewalsPlatform,
    renewalsSearch,
    savingAccountId,
    selectedRenewalDay,
    setEditingCosts,
    setEditingRates,
    setPlatformCosts,
    setRenewalsPage,
    setRenewalsPlatform,
    setRenewalsSearch,
    setSelectedRenewalDay,
    settingsFromServer,
    stats
  } = useAdmin();

  // Filter family accounts for renewals view
          const filteredForRenewals = familyAccounts.filter(acc => {
            if (renewalsPlatform !== "all" && acc.service !== renewalsPlatform) {
              return false;
            }
            if (renewalsSearch) {
              const q = renewalsSearch.toLowerCase();
              const matchEmail = acc.masterEmail?.toLowerCase().includes(q);
              const matchNotes = acc.notes?.toLowerCase().includes(q);
              if (!matchEmail && !matchNotes) {
                return false;
              }
            }
            return true;
          });

          // Generate 31-day timeline
          const today = new Date();
          today.setHours(0,0,0,0);
          
          const timelineDays = [];
          for (let i = 0; i < 31; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const dayVal = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayVal}`;
            
            const dayAccounts = filteredForRenewals.filter(acc => acc.ownerRenewalDate === dateStr);
            const count = dayAccounts.length;
            
            const totalCostPen = dayAccounts.reduce((sum, acc) => {
              const pCost = platformCosts[acc.service] || { cost: 0, currency: "PEN" };
              return sum + getCostInPen(pCost.cost, pCost.currency, acc.service);
            }, 0);
            
            timelineDays.push({
              dateStr,
              label: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              isToday: i === 0,
              count,
              totalCostPen
            });
          }

          // Filter by selected timeline day
          const finalRenewalsList = selectedRenewalDay 
            ? filteredForRenewals.filter(acc => acc.ownerRenewalDate === selectedRenewalDay)
            : filteredForRenewals;

          // Stats
          const totalFilteredAccounts = finalRenewalsList.length;
          const totalFilteredCostPen = finalRenewalsList.reduce((sum, acc) => {
            const pCost = platformCosts[acc.service] || { cost: 0, currency: "PEN" };
            return sum + getCostInPen(pCost.cost, pCost.currency, acc.service);
          }, 0);

          // Pagination
          const itemsPerPage = 50;
          const totalRenewalsPages = Math.ceil(finalRenewalsList.length / itemsPerPage) || 1;
          const renewalsStartIdx = (renewalsPage - 1) * itemsPerPage;
          const paginatedRenewals = finalRenewalsList.slice(renewalsStartIdx, renewalsStartIdx + itemsPerPage);

          return (
            <section className="renewals-section animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Pago de Renovaciones</h2>
                  <p className="section-instruction">
                    Administración agrupada de costos mensuales y proyección de pagos de las cuentas titulares maestras.
                  </p>
                </div>
              </div>

              {/* STATS OVERVIEW FOR RENEWALS */}
              <div className="stats-grid animate-fade-in" style={{ marginBottom: '24px' }}>
                <div className="stat-card glass-panel border-cyan">
                  <span className="stat-label">Total Cuentas Filtradas</span>
                  <strong className="stat-value text-cyan">{totalFilteredAccounts}</strong>
                </div>
                <div className="stat-card glass-panel border-purple">
                  <span className="stat-label">Costo Total Estimado (Soles)</span>
                  <strong className="stat-value text-purple">S/. {totalFilteredCostPen.toFixed(2)}</strong>
                </div>
                {/* Exchange Rates Box */}
                <div className="stat-card glass-panel border-gold">
                  <span className="stat-label">Tipos de Cambio (TC)</span>
                  {editingRates ? (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '80px' }}>USD a ARS:</span>
                        <input 
                          type="number" 
                          step="0.1" 
                          style={{ width: '90px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                          defaultValue={exchangeRateUsdToArs}
                          id="newUsdArs"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '80px' }}>USD a PEN:</span>
                        <input 
                          type="number" 
                          step="0.01" 
                          style={{ width: '90px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                          defaultValue={exchangeRateUsdToPen}
                          id="newUsdPen"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                          onClick={() => {
                            const usdArs = parseFloat(document.getElementById("newUsdArs").value) || 1400.0;
                            const usdPen = parseFloat(document.getElementById("newUsdPen").value) || 3.75;
                            handleSaveExchangeRates(usdArs, usdPen);
                            setEditingRates(false);
                          }}
                        >
                          Aplicar
                        </button>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                          onClick={() => setEditingRates(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      <div style={{ fontSize: '0.85rem' }}>1 USD = <strong style={{ color: 'var(--accent-gold)' }}>{exchangeRateUsdToArs} ARS</strong></div>
                      <div style={{ fontSize: '0.85rem' }}>1 USD = <strong style={{ color: 'var(--accent-gold)' }}>{exchangeRateUsdToPen} PEN</strong></div>
                      <button 
                        onClick={() => setEditingRates(true)} 
                        className="btn btn-secondary"
                        style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '4px', alignSelf: 'flex-start' }}
                      >
                        Modificar TC
                      </button>
                    </div>
                  )}
                </div>
                {/* Platform Costs Card */}
                <div className="stat-card glass-panel border-green">
                  <span className="stat-label">Costo por Cuenta Titular</span>
                  {settingsFromServer ? (
                    <span className="text-muted" style={{ fontSize: "0.7rem" }}>Guardado en el servidor</span>
                  ) : (
                    <span className="text-muted" style={{ fontSize: "0.7rem" }}>Se guarda al aplicar; queda compartido entre dispositivos</span>
                  )}
                  {editingCosts ? (
                    <div style={{ marginTop: '10px' }}>
                      {renewalsPlatform === "all" ? (
                        <>
                          {["tidal", "deezer", "qobuz"].map(plat => (
                            <div key={plat} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '60px', textTransform: 'capitalize' }}>{plat}:</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                style={{ width: '80px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                                defaultValue={platformCosts[plat]?.cost || 0}
                                id={`cost_${plat}`}
                              />
                              <select
                                style={{ width: '75px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                                defaultValue={platformCosts[plat]?.currency || "PEN"}
                                id={`curr_${plat}`}
                              >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                                <option value="PEN">PEN</option>
                              </select>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button 
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => {
                                const newCosts = { ...platformCosts };
                                ["tidal", "deezer", "qobuz"].forEach(plat => {
                                  const cost = parseFloat(document.getElementById(`cost_${plat}`).value) || 0;
                                  const currency = document.getElementById(`curr_${plat}`).value;
                                  newCosts[plat] = { cost, currency };
                                });
                                setPlatformCosts(newCosts);
                                handleSavePlatformCosts(newCosts);
                                setEditingCosts(false);
                              }}
                            >
                              Aplicar
                            </button>
                            <button 
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => setEditingCosts(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '60px', textTransform: 'capitalize' }}>{renewalsPlatform}:</span>
                            <input 
                              type="number" 
                              step="0.01" 
                              style={{ width: '80px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                              defaultValue={platformCosts[renewalsPlatform]?.cost || 0}
                              id={`cost_${renewalsPlatform}`}
                            />
                            <select
                              style={{ width: '75px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                              defaultValue={platformCosts[renewalsPlatform]?.currency || "PEN"}
                              id={`curr_${renewalsPlatform}`}
                            >
                              <option value="ARS">ARS</option>
                              <option value="USD">USD</option>
                              <option value="PEN">PEN</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => {
                                const cost = parseFloat(document.getElementById(`cost_${renewalsPlatform}`).value) || 0;
                                const currency = document.getElementById(`curr_${renewalsPlatform}`).value;
                                const newCosts = {
                                  ...platformCosts,
                                  [renewalsPlatform]: { cost, currency }
                                };
                                setPlatformCosts(newCosts);
                                handleSavePlatformCosts(newCosts);
                                setEditingCosts(false);
                              }}
                            >
                              Aplicar
                            </button>
                            <button 
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => setEditingCosts(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {renewalsPlatform === "all" ? (
                        <>
                          {["tidal", "deezer", "qobuz"].map(plat => {
                            const pCost = platformCosts[plat] || { cost: 0, currency: "PEN" };
                            const costInPen = getCostInPen(pCost.cost, pCost.currency, plat);
                            return (
                              <div key={plat} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                                <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{plat}:</span>
                                <span>
                                  <strong>{pCost.cost} {pCost.currency}</strong> 
                                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginLeft: '6px' }}>(S/. {costInPen.toFixed(2)})</span>
                                </span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '0.95rem' }}>
                            <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', marginRight: '6px' }}>{renewalsPlatform}:</span>
                            <strong>{platformCosts[renewalsPlatform]?.cost || 0} {platformCosts[renewalsPlatform]?.currency || "PEN"}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                            Equivalente: <strong>S/. {getCostInPen(platformCosts[renewalsPlatform]?.cost || 0, platformCosts[renewalsPlatform]?.currency || "PEN", renewalsPlatform).toFixed(2)}</strong>
                          </div>
                        </>
                      )}
                      <button 
                        onClick={() => setEditingCosts(true)} 
                        className="btn btn-secondary"
                        style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '4px', alignSelf: 'flex-start' }}
                      >
                        Modificar Costo
                      </button>
                    </div>
                  )}
                </div>
              </div>



              {/* TIMELINE */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Línea de Tiempo de Renovaciones (Proyección 31 días)</h3>
                  {selectedRenewalDay && (
                    <button 
                      onClick={() => setSelectedRenewalDay(null)} 
                      className="btn btn-secondary"
                      style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      Mostrar Todos los Días
                    </button>
                  )}
                </div>
                
                <div className="timeline-container" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity' }}>
                  {timelineDays.map((day) => {
                    const isSelected = selectedRenewalDay === day.dateStr;
                    const maxCount = Math.max(...timelineDays.map(d => d.count), 1);
                    const percent = (day.count / maxCount) * 100;
                    
                    return (
                      <div 
                        key={day.dateStr}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedRenewalDay(null);
                          } else {
                            setSelectedRenewalDay(day.dateStr);
                            setRenewalsPage(1);
                          }
                        }}
                        style={{
                          flex: '0 0 105px',
                          background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.05)',
                          boxShadow: isSelected ? '0 0 10px rgba(6, 182, 212, 0.2)' : 'none',
                          borderRadius: '8px',
                          padding: '10px 6px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          minHeight: '160px',
                          scrollSnapAlign: 'start'
                        }}
                        className="timeline-day-card"
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: day.isToday ? 'var(--accent-cyan)' : '#fff' }}>
                          {day.label}
                          {day.isToday && <div style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>HOY</div>}
                        </div>
                        
                        {/* Bar */}
                        <div style={{ height: '60px', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', margin: '8px 0', background: 'rgba(255,255,255,0.01)', borderRadius: '4px' }}>
                          <div 
                            style={{ 
                              height: `${percent}%`, 
                              width: '12px', 
                              background: isSelected ? 'linear-gradient(to top, var(--accent-cyan), #0891b2)' : 'linear-gradient(to top, rgba(255,255,255,0.1), rgba(255,255,255,0.25))', 
                              borderRadius: '6px',
                              transition: 'height 0.2s ease'
                            }} 
                          />
                        </div>
                        
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: day.count > 0 ? '#fff' : 'var(--text-muted)' }}>
                            {day.count} {day.count === 1 ? 'cuenta' : 'cuentas'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: day.totalCostPen > 0 ? 'var(--accent-green, #10b981)' : 'var(--text-muted)' }}>
                            S/. {day.totalCostPen.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* LIST & CONTROLS */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {/* Platform Filters */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {["all", "tidal", "deezer", "qobuz"].map(plat => (
                      <button
                        key={plat}
                        onClick={() => {
                          setRenewalsPlatform(plat);
                          setSelectedRenewalDay(null);
                          setRenewalsPage(1);
                        }}
                        className={`btn ${renewalsPlatform === plat ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', textTransform: 'capitalize', borderRadius: '8px' }}
                      >
                        {plat === "all" ? "Todos" : plat}
                      </button>
                    ))}
                  </div>
                  
                  {/* Search Box */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: '1', maxWidth: '350px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por correo o notas..."
                      value={renewalsSearch}
                      onChange={(e) => {
                        setRenewalsSearch(e.target.value);
                        setRenewalsPage(1);
                      }}
                      style={{ marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="bulk-table-container">
                  <table className="bulk-table admin-table--stack renewals-table">
                    <thead>
                      <tr>
                        <th>Plataforma</th>
                        <th>Correo Titular</th>
                        <th style={{ width: '160px' }}>Vencimiento Dueño</th>
                        <th>Notas</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRenewals.length === 0 ? (
                        <tr className="admin-table-empty">
                          <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            No se encontraron cuentas titulares que coincidan con los filtros.
                          </td>
                        </tr>
                      ) : (
                        paginatedRenewals.map((acc) => (
                          <tr key={acc.id}>
                            <td className="cell-primary">
                              <span className={`badge-service badge-${acc.service} family-service-tag`}>
                                {acc.service}
                              </span>
                            </td>
                            <td data-label="Titular" className="cell-email renewals-email">
                              {acc.masterEmail}
                            </td>
                            <td data-label="Vencimiento dueño" className="cell-block cell-half">
                              <input
                                type="date"
                                aria-label="Vencimiento del dueño"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '0.85rem', marginBottom: 0, width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                                value={acc.ownerRenewalDate || ""}
                                onChange={(e) => handleFamilyAccountChange(acc.id, "ownerRenewalDate", e.target.value)}
                              />
                            </td>
                            <td data-label="Notas" className="cell-block cell-half">
                              <input
                                type="text"
                                aria-label="Notas"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '0.85rem', marginBottom: 0, width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                                placeholder="Notas..."
                                value={acc.notes || ""}
                                onChange={(e) => handleFamilyAccountChange(acc.id, "notes", e.target.value)}
                              />
                            </td>
                            <td className="cell-actions" style={{ textAlign: 'center' }}>
                              <div className="cell-actions-inner">
                              <button
                                type="button"
                                onClick={() => handleSaveRenewalInfo(acc.id)}
                                className={`btn btn-primary ${savingAccountId === acc.id ? "btn-disabled" : ""}`}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '4px', width: '100%', minWidth: '80px' }}
                                disabled={savingAccountId === acc.id}
                              >
                                {savingAccountId === acc.id ? "..." : "Guardar"}
                              </button>
                              </div>
                            </td>
                          </tr>
                        )))
                      }
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalRenewalsPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      type="button"
                      onClick={() => setRenewalsPage(prev => Math.max(1, prev - 1))}
                      className="btn btn-secondary"
                      style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
                      disabled={renewalsPage === 1}
                    >
                      Anterior
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Página <strong>{renewalsPage}</strong> de <strong>{totalRenewalsPages}</strong> ({finalRenewalsList.length} cuentas)
                    </span>
                    <button
                      type="button"
                      onClick={() => setRenewalsPage(prev => Math.min(totalRenewalsPages, prev + 1))}
                      className="btn btn-secondary"
                      style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
                      disabled={renewalsPage === totalRenewalsPages}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            </section>
          )
}
