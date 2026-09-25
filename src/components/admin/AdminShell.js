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

export function AdminKpis({ stats }) {
  if (!stats) return null;
  const stock = stats.activeStock || {};
  return (
    <section className="stats-grid stats-grid-compact admin-kpis animate-fade-in" aria-label="Resumen">
      <div className="stat-card glass-panel border-purple">
        <span className="stat-label">Ventas Yape/Plin</span>
        <strong className="stat-value text-purple">S/. {stats.totalRevenuePen}</strong>
      </div>
      <div className="stat-card glass-panel border-yellow">
        <span className="stat-label">Ventas Binance Pay</span>
        <strong className="stat-value text-yellow">$ {stats.totalRevenueUsd}</strong>
      </div>
      <div className="stat-card glass-panel border-cyan">
        <span className="stat-label">Pedidos Pendientes</span>
        <strong className="stat-value text-cyan">{stats.pendingOrders}</strong>
      </div>
      <div className="stat-card glass-panel border-gold admin-kpi-stock">
        <span className="stat-label">Cuentas Disponibles</span>
        <div className="stat-sub-grid">
          {["tidal", "deezer", "qobuz"].map((service) => {
            const count = stock[service] ?? 0;
            return (
              <div key={service} className={count === 0 ? "is-empty" : ""}>
                <span>{service.charAt(0).toUpperCase() + service.slice(1)}:</span> <strong>{count}</strong>
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
