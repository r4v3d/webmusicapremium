"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LogOutIcon } from "./adminHelpers";
import { WORKSPACES } from "./adminUi";

const svgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function SearchIcon() {
  return (
    <svg {...svgProps} width={18} height={18}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...svgProps} width={18} height={18}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// Íconos de la barra inferior (móvil), uno por espacio de trabajo.
const WORKSPACE_ICONS = {
  hoy: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  clientes: (
    <svg {...svgProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  inventario: (
    <svg {...svgProps}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  cobros: (
    <svg {...svgProps}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  numeros: (
    <svg {...svgProps}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

export function AdminHeader({ onSearch, onLogout }) {
  return (
    <header className="admin-header glass-panel admin-header-sticky">
      <div className="container admin-header-inner">
        <div className="admin-brand">
          <span className="admin-brand-dot"></span>
          <h1>
            <span className="admin-brand-full">Panel Administrativo</span>
            <span className="admin-brand-short">Panel</span>
          </h1>
        </div>

        <div className="admin-header-actions">
          <button type="button" className="btn btn-secondary admin-header-btn" onClick={onSearch} aria-label="Buscar (Ctrl K)">
            <SearchIcon />
            <span className="admin-header-btn-label">Buscar</span>
            <kbd className="admin-kbd">Ctrl K</kbd>
          </button>
          <Link href="/" className="btn btn-secondary admin-header-btn" aria-label="Ver web">
            <ExternalIcon />
            <span className="admin-header-btn-label">Ver Web</span>
          </Link>
          <button type="button" onClick={onLogout} className="btn btn-logout admin-header-btn" aria-label="Cerrar sesión">
            <LogOutIcon />
            <span className="admin-header-btn-label">Cerrar Sesión</span>
          </button>
        </div>
      </div>
    </header>
  );
}

const LOW_STOCK = 2;
const DAY_FMT = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric" });

// Sparkline de 7 días: línea atenuada, el día de hoy resaltado con el color de la tarjeta.
function Sparkline({ series, currency, color }) {
  if (!series?.length) return null;
  const values = series.map((d) => d[currency] || 0);
  const max = Math.max(...values);
  const W = 84;
  const H = 26;
  const pad = 3;
  const x = (i) => pad + (i * (W - pad * 2)) / (values.length - 1);
  const y = (v) => (max > 0 ? H - pad - (v / max) * (H - pad * 2) : H - pad);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fmt = (v) => (currency === "USDT" ? `${v.toFixed(2)} USDT` : `S/ ${v.toFixed(2)}`);
  const label = (d) => DAY_FMT.format(new Date(`${d.day}T12:00:00`));
  const total = values.reduce((acc, v) => acc + v, 0);
  const last = values.length - 1;
  return (
    <svg
      className="kpi-sparkline"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Últimos 7 días: ${fmt(total)} en total, hoy ${fmt(values[last])}`}
    >
      <polyline points={points} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3.5" fill={color} stroke="var(--bg-primary)" strokeWidth="1.5" />
      {series.map((d, i) => (
        <rect key={d.day} x={x(i) - (W - pad * 2) / 12} y="0" width={(W - pad * 2) / 6} height={H} fill="transparent">
          <title>{`${label(d)}: ${fmt(values[i])}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function AdminKpis({ stats, onGoImport }) {
  if (!stats) return null;
  const stock = stats.activeStock || {};
  const services = ["tidal", "deezer", "qobuz"];
  const lowStock = services.some((service) => (stock[service] ?? 0) <= LOW_STOCK);
  return (
    <section className="stats-grid stats-grid-compact admin-kpis animate-fade-in" aria-label="Resumen">
      <div className="stat-card glass-panel border-purple">
        <span className="stat-label">Ventas Yape/Plin</span>
        <div className="kpi-value-row">
          <strong className="stat-value text-purple">S/. {stats.totalRevenuePen}</strong>
          <Sparkline series={stats.daily} currency="PEN" color="#9b59b6" />
        </div>
      </div>
      <div className="stat-card glass-panel border-yellow">
        <span className="stat-label">Ventas Binance Pay</span>
        <div className="kpi-value-row">
          <strong className="stat-value text-yellow">$ {stats.totalRevenueUsd}</strong>
          <Sparkline series={stats.daily} currency="USDT" color="#f1c40f" />
        </div>
      </div>
      <div className="stat-card glass-panel border-cyan">
        <span className="stat-label">Pedidos Pendientes</span>
        <strong className="stat-value text-cyan">{stats.pendingOrders}</strong>
      </div>
      <div className={`stat-card glass-panel border-gold admin-kpi-stock ${lowStock ? "has-low" : ""}`}>
        <div className="kpi-stock-head">
          <span className="stat-label">Cuentas Disponibles</span>
          {lowStock && onGoImport && (
            <button type="button" className="kpi-stock-cta" onClick={onGoImport}>
              Cargar
            </button>
          )}
        </div>
        <div className="stat-sub-grid">
          {services.map((service) => {
            const count = stock[service] ?? 0;
            const level = count === 0 ? "is-empty" : count <= LOW_STOCK ? "is-low" : "";
            return (
              <div key={service} className={level}>
                <span>{service.charAt(0).toUpperCase() + service.slice(1)}:</span>
                <strong>
                  {count}
                  {level && <span className="sr-only">{count === 0 ? " (sin stock)" : " (stock bajo)"}</span>}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AdminNav({ activeTab, activeSubTab, badges, onWorkspace, onSubTab }) {
  const subnavRef = useRef(null);
  const workspaceSubs = WORKSPACES[activeTab]?.subs || {};
  const hasSubs = Object.keys(workspaceSubs).length > 0;

  // En móvil el subnav es una fila con scroll: mantener visible la píldora activa.
  useEffect(() => {
    const active = subnavRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  }, [activeTab, activeSubTab]);

  const tabs = Object.entries(WORKSPACES).map(([id, meta]) => ({ id, label: meta.label, badge: badges[id] || 0 }));

  return (
    <>
      <nav className="admin-tabs-nav glass-panel admin-tabs-sticky" role="tablist" aria-label="Espacios de trabajo">
        {tabs.map(({ id, label, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => onWorkspace(id)}
            className={`tab-btn ${activeTab === id ? "active" : ""}`}
          >
            <span>{label}</span>
            {badge > 0 && <span className="admin-tab-badge">{badge}</span>}
          </button>
        ))}
      </nav>

      {hasSubs && (
        <div className="admin-subnav" ref={subnavRef}>
          {Object.entries(workspaceSubs).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={activeSubTab === id ? "page" : undefined}
              className={`btn ${activeSubTab === id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => onSubTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <nav className="admin-bottomnav" aria-label="Espacios de trabajo">
        {tabs.map(({ id, label, badge }) => (
          <button
            key={id}
            type="button"
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => {
              onWorkspace(id);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
            className={`admin-bottomnav-btn ${activeTab === id ? "active" : ""}`}
          >
            <span className="admin-bottomnav-icon">
              {WORKSPACE_ICONS[id]}
              {badge > 0 && <span className="admin-tab-badge">{badge > 99 ? "99+" : badge}</span>}
            </span>
            <span className="admin-bottomnav-label">{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
