"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { formatMoney } from "../adminUi";

// Libro real del mes (§15.1): net_amount de payments, una fila por moneda y nunca sumadas.
function RealLedgerStrip() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    fetch("/api/admin/reconciliation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.monthLedger || []))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  return (
    <div className="hoy-stock-strip glass-panel" style={{ marginBottom: "20px" }}>
      <span>Cobrado este mes (libro real)</span>
      {["PEN", "USDT"].map((currency) => {
        const row = rows.find((r) => r.currency === currency) || {};
        return (
          <strong key={currency}>
            {formatMoney(row.sales_net || 0, currency)} neto · comisiones {formatMoney(row.fees || 0, currency)}
          </strong>
        );
      })}
      <span className="text-muted">Soles y USDT no se suman: no hay tipo de cambio.</span>
    </div>
  );
}

export default function ProfitabilityTab() {
  const {
    allSlots,
    exchangeRateUsdToArs,
    exchangeRateUsdToPen,
    familyAccounts,
    getCostInPen,
    platformCosts,
    selectedReportMonth,
    setSelectedReportMonth,
    setSimClientIncrease,
    setSimTidalCost,
    setSimUsdArs,
    simClientIncrease,
    simTidalCost,
    simUsdArs,
    stats
  } = useAdmin();

  // 1. Helper to generate month options list (2 months back, current month, 5 months forward)
          const getMonthsList = () => {
            const list = [];
            const d = new Date();
            d.setMonth(d.getMonth() - 2);
            for (let i = 0; i < 8; i++) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const label = d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
              list.push({ val: `${y}-${m}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
              d.setMonth(d.getMonth() + 1);
            }
            return list;
          };

          // 2. Calculate metrics for each service in the selected targetMonth
          const getPlatformStats = (serviceName, simulatedCost = null, simulatedTC = null, simClientMult = 1, targetMonth = selectedReportMonth) => {
            const serviceAccounts = familyAccounts.filter(acc => acc.service === serviceName);
            const serviceSlots = allSlots.filter(s => s.service === serviceName);
            
            // Filter accounts and slots that expire/renew in the targetMonth
            const monthAccounts = serviceAccounts.filter(acc => acc.ownerRenewalDate && acc.ownerRenewalDate.substring(0, 7) === targetMonth);
            const monthSlots = serviceSlots.filter(s => s.status === 'active' && s.renewalDate && s.renewalDate.substring(0, 7) === targetMonth);

            // Costs calculation
            const totalCost = monthAccounts.reduce((sum, acc) => {
              if (serviceName === 'tidal' && simulatedCost !== null) {
                const cur = platformCosts[serviceName]?.currency || "ARS";
                const tc = simulatedTC !== null ? simulatedTC : exchangeRateUsdToArs;
                
                if (cur === 'ARS') {
                  const costInUsd = tc > 0 ? (simulatedCost / tc) : 0;
                  return sum + (costInUsd * exchangeRateUsdToPen);
                } else if (cur === 'USD') {
                  return sum + (simulatedCost * exchangeRateUsdToPen);
                } else {
                  return sum + simulatedCost;
                }
              }

              const pCost = platformCosts[serviceName] || { cost: 0, currency: "PEN" };
              return sum + getCostInPen(pCost.cost, pCost.currency, serviceName);
            }, 0);

            // Revenue calculation (total cash due to be billed in the targetMonth)
            const baseRevenue = monthSlots.reduce((sum, s) => {
              return sum + (Number(s.pricePen) || 0);
            }, 0);
            
            const totalRevenue = baseRevenue * simClientMult;
            const profit = totalRevenue - totalCost;
            const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

            return {
              accountsCount: monthAccounts.length,
              slotsCount: monthSlots.length,
              activeSlotsCount: monthSlots.length,
              simulatedActiveSlotsCount: Math.round(monthSlots.length * simClientMult),
              totalCost,
              totalRevenue,
              profit,
              margin
            };
          };

          // Compute actual statistics for the selected month
          const statsTidal = getPlatformStats('tidal');
          const statsDeezer = getPlatformStats('deezer');
          const statsQobuz = getPlatformStats('qobuz');

          const overallRevenue = statsTidal.totalRevenue + statsDeezer.totalRevenue + statsQobuz.totalRevenue;
          const overallCost = statsTidal.totalCost + statsDeezer.totalCost + statsQobuz.totalCost;
          const overallProfit = overallRevenue - overallCost;
          const overallMargin = overallRevenue > 0 ? (overallProfit / overallRevenue) * 100 : 0;

          // Compute simulated statistics
          const simMult = 1 + (simClientIncrease / 100);
          const simTidal = getPlatformStats('tidal', simTidalCost, simUsdArs, simMult);
          const simDeezer = getPlatformStats('deezer', null, null, simMult);
          const simQobuz = getPlatformStats('qobuz', null, null, simMult);

          const simOverallRevenue = simTidal.totalRevenue + simDeezer.totalRevenue + simQobuz.totalRevenue;
          const simOverallCost = simTidal.totalCost + simDeezer.totalCost + simQobuz.totalCost;
          const simOverallProfit = simOverallRevenue - simOverallCost;
          const simOverallMargin = simOverallRevenue > 0 ? (simOverallProfit / simOverallRevenue) * 100 : 0;

          // Donut Chart Math (angles and offsets)
          const profits = [
            { name: "Tidal", value: Math.max(0, statsTidal.profit), color: "#a855f7" },
            { name: "Deezer", value: Math.max(0, statsDeezer.profit), color: "#eab308" },
            { name: "Qobuz", value: Math.max(0, statsQobuz.profit), color: "#06b6d4" }
          ];
          const totalProfitForDonut = profits.reduce((sum, p) => sum + p.value, 0);

          let accumPercentage = 0;
          const donutSegments = profits.map((p) => {
            const percentage = totalProfitForDonut > 0 ? (p.value / totalProfitForDonut) * 100 : 0;
            const strokeDasharray = `${percentage} ${100 - percentage}`;
            const strokeDashoffset = 100 - accumPercentage + 25; // 25 is rotation adjustment
            accumPercentage += percentage;
            return {
              ...p,
              percentage,
              strokeDasharray,
              strokeDashoffset
            };
          });

          // Maximum value for vertical bar chart scaling
          const maxVal = Math.max(
            statsTidal.totalRevenue, statsTidal.totalCost,
            statsDeezer.totalRevenue, statsDeezer.totalCost,
            statsQobuz.totalRevenue, statsQobuz.totalCost,
            100 // fallback floor
          );

          const getBarHeight = (val) => {
            return `${(val / maxVal) * 100}%`;
          };

          // Calculate 6-month trends for projected cash flows
          const trendsData = [];
          const trendsD = new Date();
          trendsD.setMonth(trendsD.getMonth() - 1); // 1 month back for context
          for (let k = 0; k < 6; k++) {
            const y = trendsD.getFullYear();
            const m = String(trendsD.getMonth() + 1).padStart(2, '0');
            const monthKey = `${y}-${m}`;
            const label = trendsD.toLocaleString('es-ES', { month: 'short' });
            
            const tSlots = allSlots.filter(s => s.status === 'active' && s.renewalDate && s.renewalDate.substring(0, 7) === monthKey);
            const tAccounts = familyAccounts.filter(acc => acc.ownerRenewalDate && acc.ownerRenewalDate.substring(0, 7) === monthKey);
            
            const tRevenue = tSlots.reduce((sum, s) => sum + (Number(s.pricePen) || 0), 0);
            const tCost = tAccounts.reduce((sum, acc) => {
              const pCost = platformCosts[acc.service] || { cost: 0, currency: "PEN" };
              return sum + getCostInPen(pCost.cost, pCost.currency, acc.service);
            }, 0);
            
            trendsData.push({
              label: label.charAt(0).toUpperCase() + label.slice(1) + " " + String(y).substring(2),
              revenue: tRevenue,
              cost: tCost
            });
            trendsD.setMonth(trendsD.getMonth() + 1);
          }

          const maxTrendVal = Math.max(...trendsData.map(d => Math.max(d.revenue, d.cost)), 100);

          // Group the selected month's slots by price
          const priceBreakdown = {};
          const monthSlotsOverall = allSlots.filter(s => s.status === 'active' && s.renewalDate && s.renewalDate.substring(0, 7) === selectedReportMonth);
          
          monthSlotsOverall.forEach(s => {
            const price = Number(s.pricePen) || 0;
            const priceKey = `S/. ${price.toFixed(2)}`;
            if (!priceBreakdown[priceKey]) {
              priceBreakdown[priceKey] = {
                price,
                count: 0,
                total: 0
              };
            }
            priceBreakdown[priceKey].count++;
            priceBreakdown[priceKey].total += price;
          });

          const sortedBreakdown = Object.values(priceBreakdown).sort((a, b) => b.price - a.price);

          return (
            <section className="profitability-section animate-fade-in">
              <RealLedgerStrip />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Dashboard de Rentabilidad (Flujo de Caja)</h2>
                  <p className="section-instruction">
                    Análisis contable basado en los vencimientos y cobros del mes seleccionado.
                  </p>
                </div>
                
                <div className="profit-month-picker" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: '500' }}>Mes de Análisis:</span>
                  <select
                    value={selectedReportMonth}
                    onChange={(e) => setSelectedReportMonth(e.target.value)}
                    className="admin-select"
                    style={{ 
                      minWidth: '165px', 
                      padding: '8px 12px', 
                      background: 'rgba(255,255,255,0.05)', 
                      color: '#fff', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      borderRadius: '6px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {getMonthsList().map(m => (
                      <option key={m.val} value={m.val}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card glass-panel border-cyan">
                  <span className="stat-label">Cobros Proyectados en el Mes</span>
                  <strong className="stat-value text-cyan">S/. {overallRevenue.toFixed(2)}</strong>
                  <span className="stat-desc">Suma de mensualidades de miembros que vencen este mes</span>
                </div>

                <div className="stat-card glass-panel border-purple">
                  <span className="stat-label">Costos de Renovación en el Mes</span>
                  <strong className="stat-value text-purple">S/. {overallCost.toFixed(2)}</strong>
                  <span className="stat-desc">Costo de las cuentas titulares que vencen este mes</span>
                </div>

                <div className="stat-card glass-panel border-green">
                  <span className="stat-label">Utilidad del Mes (Caja)</span>
                  <strong className="stat-value text-green">S/. {overallProfit.toFixed(2)}</strong>
                  <span className="stat-desc">Retorno neto de cobros menos pagos de proveedores</span>
                </div>

                <div className="stat-card glass-panel border-yellow">
                  <span className="stat-label">Margen de Cobros</span>
                  <strong className="stat-value text-yellow">{overallMargin.toFixed(1)}%</strong>
                  <span className="stat-desc">Ganancia neta sobre el volumen de cobros del mes</span>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="profitability-grid-charts">
                {/* 1. Bar Chart: Revenues vs Costs */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-cyan)' }}>📊</span> Cobros vs. Costos del Mes
                  </h3>
                  <div className="bar-chart-vertical">
                    {/* Tidal */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsTidal.totalRevenue) }}>
                          <span className="bar-tooltip-val">Cobros: S/. {statsTidal.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsTidal.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsTidal.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Tidal</span>
                    </div>

                    {/* Deezer */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsDeezer.totalRevenue) }}>
                          <span className="bar-tooltip-val">Cobros: S/. {statsDeezer.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsDeezer.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsDeezer.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Deezer</span>
                    </div>

                    {/* Qobuz */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsQobuz.totalRevenue) }}>
                          <span className="bar-tooltip-val">Cobros: S/. {statsQobuz.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsQobuz.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsQobuz.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Qobuz</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Cobros</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ef4444', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Costos</span>
                    </div>
                  </div>
                </div>

                {/* 2. Donut Chart: Utility Breakdown */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-purple)' }}>🍩</span> Utilidad por Plataforma (Mes)
                  </h3>
                  <div className="chart-container-flex">
                    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                      <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut-svg">
                        <circle className="donut-hole" cx="21" cy="21" r="15.915"></circle>
                        <circle className="donut-ring" cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4"></circle>
                        
                        {totalProfitForDonut > 0 ? (
                          donutSegments.map((seg, idx) => (
                            <circle
                              key={idx}
                              className="donut-segment"
                              cx="21"
                              cy="21"
                              r="15.915"
                              fill="transparent"
                              stroke={seg.color}
                              strokeDasharray={seg.strokeDasharray}
                              strokeDashoffset={seg.strokeDashoffset}
                            ></circle>
                          ))
                        ) : (
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="3" strokeDasharray="100 0"></circle>
                        )}
                      </svg>
                      <div className="donut-center-text">
                        <span className="donut-center-val">S/. {overallProfit.toFixed(0)}</span>
                        <span className="donut-center-lbl">Utilidad</span>
                      </div>
                    </div>

                    <div className="donut-legend">
                      {donutSegments.map((seg, idx) => (
                        <div key={idx} className="legend-item">
                          <span className="legend-color-dot" style={{ background: seg.color }}></span>
                          <span style={{ fontWeight: '500' }}>{seg.name}:</span>
                          <span style={{ color: 'var(--text-muted)' }}>{seg.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Trends Chart: Projected cash flow */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-yellow)' }}>📈</span> Tendencia de Cobros vs. Costos
                  </h3>
                  <div className="bar-chart-vertical" style={{ height: '180px', marginTop: '10px' }}>
                    {trendsData.map((t, idx) => {
                      const getTrendHeight = (val) => `${(val / maxTrendVal) * 100}%`;
                      return (
                        <div key={idx} className="bar-group-platform" style={{ flex: 1 }}>
                          <div className="bars-dual-wrapper" style={{ height: '140px' }}>
                            <div className="bar-single-rect income" style={{ height: getTrendHeight(t.revenue) }}>
                              <span className="bar-tooltip-val">Cobros: S/. {t.revenue.toFixed(0)}</span>
                            </div>
                            <div className="bar-single-rect cost" style={{ height: getTrendHeight(t.cost) }}>
                              <span className="bar-tooltip-val">Costo: S/. {t.cost.toFixed(0)}</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '0.65rem', color: '#fff', textAlign: 'center', whiteSpace: 'nowrap' }}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Cobros</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ef4444', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Costos</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-column analysis layout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* Column 1: Table Platform Breakdown */}
                <div className="glass-panel profit-breakdown" style={{ padding: '20px', margin: 0, gridColumn: '1 / -1' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#fff' }}>Detalle Económico del Mes Seleccionado</h3>
                  <div className="table-responsive">
                    <table className="admin-table admin-table--stack profit-table">
                      <thead>
                        <tr>
                          <th>Plataforma</th>
                          <th className="text-center">Cuentas Titulares a Vencer</th>
                          <th className="text-center">Miembros a Cobrar</th>
                          <th className="text-right">Cobros Proyectados</th>
                          <th className="text-right">Costos de Renovación</th>
                          <th className="text-right">Utilidad Neta</th>
                          <th className="text-right">Margen ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Tidal */}
                        <tr>
                          <td className="cell-primary">
                            <span className="badge-service badge-tidal">Tidal</span>
                          </td>
                          <td data-label="Titulares a vencer" className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsTidal.accountsCount}</td>
                          <td data-label="Miembros a cobrar" className="text-center" style={{ color: 'var(--text-muted)' }}>
                            <span style={{ color: '#fff', fontWeight: '600' }}>{statsTidal.activeSlotsCount}</span>
                          </td>
                          <td data-label="Cobros proyectados" className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsTidal.totalRevenue.toFixed(2)}</td>
                          <td data-label="Costos de renovación" className="text-right" style={{ color: '#f87171' }}>S/. {statsTidal.totalCost.toFixed(2)}</td>
                          <td data-label="Utilidad neta" className="text-right" style={{ color: statsTidal.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                            S/. {statsTidal.profit.toFixed(2)}
                          </td>
                          <td data-label="Margen ROI" className="text-right" style={{ color: statsTidal.margin >= 40 ? '#4ade80' : statsTidal.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                            {statsTidal.margin.toFixed(1)}%
                          </td>
                        </tr>

                        {/* Deezer */}
                        <tr>
                          <td className="cell-primary">
                            <span className="badge-service badge-deezer">Deezer</span>
                          </td>
                          <td data-label="Titulares a vencer" className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsDeezer.accountsCount}</td>
                          <td data-label="Miembros a cobrar" className="text-center" style={{ color: 'var(--text-muted)' }}>
                            <span style={{ color: '#fff', fontWeight: '600' }}>{statsDeezer.activeSlotsCount}</span>
                          </td>
                          <td data-label="Cobros proyectados" className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsDeezer.totalRevenue.toFixed(2)}</td>
                          <td data-label="Costos de renovación" className="text-right" style={{ color: '#f87171' }}>S/. {statsDeezer.totalCost.toFixed(2)}</td>
                          <td data-label="Utilidad neta" className="text-right" style={{ color: statsDeezer.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                            S/. {statsDeezer.profit.toFixed(2)}
                          </td>
                          <td data-label="Margen ROI" className="text-right" style={{ color: statsDeezer.margin >= 40 ? '#4ade80' : statsDeezer.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                            {statsDeezer.margin.toFixed(1)}%
                          </td>
                        </tr>

                        {/* Qobuz */}
                        <tr>
                          <td className="cell-primary">
                            <span className="badge-service badge-qobuz">Qobuz</span>
                          </td>
                          <td data-label="Titulares a vencer" className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsQobuz.accountsCount}</td>
                          <td data-label="Miembros a cobrar" className="text-center" style={{ color: 'var(--text-muted)' }}>
                            <span style={{ color: '#fff', fontWeight: '600' }}>{statsQobuz.activeSlotsCount}</span>
                          </td>
                          <td data-label="Cobros proyectados" className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsQobuz.totalRevenue.toFixed(2)}</td>
                          <td data-label="Costos de renovación" className="text-right" style={{ color: '#f87171' }}>S/. {statsQobuz.totalCost.toFixed(2)}</td>
                          <td data-label="Utilidad neta" className="text-right" style={{ color: statsQobuz.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                            S/. {statsQobuz.profit.toFixed(2)}
                          </td>
                          <td data-label="Margen ROI" className="text-right" style={{ color: statsQobuz.margin >= 40 ? '#4ade80' : statsQobuz.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                            {statsQobuz.margin.toFixed(1)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column 2: Price/Client Distribution */}
                <div className="glass-panel" style={{ padding: '20px', margin: 0, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#fff' }}>Desglose de Clientes por Monto a Cobrar</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                    {sortedBreakdown.length > 0 ? (
                      sortedBreakdown.map((item, idx) => {
                        const pctOfTotal = overallRevenue > 0 ? (item.total / overallRevenue) * 100 : 0;
                        return (
                          <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{item.count} clientes</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                pagan el monto de <strong style={{ color: 'var(--accent-cyan)' }}>S/. {item.price.toFixed(2)}</strong>
                              </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: '0.95rem', color: '#4ade80', display: 'block' }}>S/. {item.total.toFixed(2)}</strong>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{pctOfTotal.toFixed(1)}% del total</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No hay cobros registrados para este mes.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Simulation projection panel */}
              <div className="simulator-panel glass-panel border-cyan">
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>🚀</span> Simulador de Proyección de Cobros
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Modifica las variables en tiempo real para proyectar los cobros de este mes ante cambios en el tipo de cambio, costos de cuenta y volumen de clientes.
                </p>

                <div className="simulator-controls-grid">
                  {/* Control 1: T.C. USD -> ARS */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>T.C. Dólar en Argentina (ARS)</span>
                      <strong>{simUsdArs} ARS</strong>
                    </div>
                    <input
                      type="range"
                      min="800"
                      max="2200"
                      step="10"
                      value={simUsdArs}
                      onChange={(e) => setSimUsdArs(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>

                  {/* Control 2: Costo Cuenta Tidal */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>Costo de Cuenta Tidal (ARS)</span>
                      <strong>{simTidalCost} ARS</strong>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="4000"
                      step="50"
                      value={simTidalCost}
                      onChange={(e) => setSimTidalCost(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>

                  {/* Control 3: Incremento de Clientes */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>Crecimiento de Clientes (%)</span>
                      <strong style={{ color: simClientIncrease >= 0 ? '#4ade80' : '#f87171' }}>
                        {simClientIncrease >= 0 ? `+${simClientIncrease}` : simClientIncrease}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="100"
                      step="5"
                      value={simClientIncrease}
                      onChange={(e) => setSimClientIncrease(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>
                </div>

                {/* Simulation results comparison */}
                <div style={{ background: 'rgba(0, 229, 255, 0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.15)' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>Resultados Proyectados Simulados</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '16px' }}>
                    
                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ingreso Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                        S/. {simOverallRevenue.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallRevenue >= overallRevenue ? '#4ade80' : '#f87171' }}>
                        {simOverallRevenue >= overallRevenue ? `+S/. ${(simOverallRevenue - overallRevenue).toFixed(0)}` : `-S/. ${(overallRevenue - simOverallRevenue).toFixed(0)}`} respecto al real
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Costo Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                        S/. {simOverallCost.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallCost <= overallCost ? '#4ade80' : '#f87171' }}>
                        {simOverallCost <= overallCost ? `Ahorro: S/. ${(overallCost - simOverallCost).toFixed(0)}` : `Aumento: S/. ${(simOverallCost - overallCost).toFixed(0)}`}
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Utilidad Proyectada:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#4ade80' }}>
                        S/. {simOverallProfit.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallProfit >= overallProfit ? '#4ade80' : '#f87171' }}>
                        {simOverallProfit >= overallProfit ? `+S/. ${(simOverallProfit - overallProfit).toFixed(0)}` : `-S/. ${(overallProfit - simOverallProfit).toFixed(0)}`} de ganancia
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Margen Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: simOverallMargin >= overallMargin ? '#4ade80' : '#eab308' }}>
                        {simOverallMargin.toFixed(1)}%
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallMargin >= overallMargin ? '#4ade80' : '#f87171' }}>
                        {simOverallMargin >= overallMargin ? `+${(simOverallMargin - overallMargin).toFixed(1)}%` : `${(simOverallMargin - overallMargin).toFixed(1)}%`} de margen
                      </span>
                    </div>

                  </div>
                </div>
              </div>

            </section>
          );
}
