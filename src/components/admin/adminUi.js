"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyIcon } from "./adminHelpers";

export const STATUS_LABELS = {
  paid: "Pagado",
  pending: "Pendiente",
  expired: "Expirado",
  failed: "Fallido",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  active: "Activo",
  pending_payment: "Falta pago",
  free: "Disponible",
  awaiting_payment: "Esperando pago",
  underpaid: "Pago incompleto",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  reserved: "Reservado",
  awaiting: "Por verificar",
  overpaid: "Pagado de más",
};

/** Proveedores de pago (§11.2) tal como se muestran en el panel. */
export const PROVIDER_LABELS = {
  manual_yape: "Yape/Plin (verificado)",
  taypi: "Yape/Plin · TAYPI",
  binance_account: "USDT · Binance",
  wallet_pen: "Saldo S/",
  wallet_usdt: "Saldo USDT",
  admin_manual: "Manual (panel)",
};

export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  return currency === "USDT" ? `${n.toFixed(3)} USDT` : `S/ ${n.toFixed(2)}`;
}

export const WORKSPACES = {
  hoy: {
    label: "Hoy",
    defaultSub: "cola",
    subs: { cola: "Cola", pedidos: "Pedidos", conciliacion: "Conciliación" },
  },
  clientes: {
    label: "Clientes",
    defaultSub: "familyAccounts",
    subs: { familyAccounts: "Familias", tableList: "Tabla", directory: "Directorio" },
  },
  inventario: {
    label: "Inventario",
    defaultSub: "stock",
    subs: { stock: "Stock", import: "Cargar", organizer: "Organizar" },
  },
  cobros: {
    label: "Cobros",
    defaultSub: "verificar",
    subs: { verificar: "Por verificar", pagos: "Pagos", saldos: "Saldos", whatsapp: "WhatsApp", renovaciones: "Renovaciones" },
  },
  numeros: {
    label: "Números",
    defaultSub: "",
    subs: {},
  },
};

const LEGACY_TAB_MAP = {
  orders: { tab: "hoy", sub: "pedidos" },
  families: { tab: "clientes", sub: "familyAccounts" },
  stock: { tab: "inventario", sub: "stock" },
  import: { tab: "inventario", sub: "import" },
  organizer: { tab: "inventario", sub: "organizer" },
  payments: { tab: "cobros", sub: "pagos" },
  verify: { tab: "cobros", sub: "verificar" },
  reconciliation: { tab: "hoy", sub: "conciliacion" },
  wallets: { tab: "cobros", sub: "saldos" },
  whatsapp_billing: { tab: "cobros", sub: "whatsapp" },
  renewals: { tab: "cobros", sub: "renovaciones" },
  profitability: { tab: "numeros", sub: "" },
};

export function parseAdminRoute(search) {
  const params = new URLSearchParams(search || "");
  let tab = params.get("tab") || "hoy";
  let sub = params.get("sub") || "";
  if (LEGACY_TAB_MAP[tab]) {
    const mapped = LEGACY_TAB_MAP[tab];
    tab = mapped.tab;
    sub = sub || mapped.sub;
  }
  if (!WORKSPACES[tab]) {
    tab = "hoy";
    sub = "cola";
  }
  const allowed = WORKSPACES[tab].subs;
  if (Object.keys(allowed).length > 0 && !allowed[sub]) {
    sub = WORKSPACES[tab].defaultSub;
  }
  return { tab, sub };
}

export function writeAdminRoute(tab, sub) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (sub) params.set("sub", sub);
  const next = `/admin?${params.toString()}`;
  window.history.replaceState(null, "", next);
}

export function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoDateOffset(daysFromToday) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + daysFromToday);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isBillingInWindow(renewalDate, windowKey, todayStr) {
  if (!renewalDate || renewalDate > todayStr) return false;
  if (windowKey === "all") return true;
  if (windowKey === "today") return renewalDate === todayStr;
  if (windowKey === "week") return renewalDate >= isoDateOffset(-7);
  if (windowKey === "month") return renewalDate >= isoDateOffset(-30);
  return true;
}

export function formatDatePe(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTimePe(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hace 5 min", "hace 3 h", "ayer"… y la fecha completa si es más antiguo. */
export function formatRelative(value, now) {
  if (!value) return "";
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return String(value);
  const secs = Math.round((now - ms) / 1000);
  if (secs < 0) return formatDateTimePe(value);
  if (secs < 45) return "hace un momento";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatDateTimePe(value);
}

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Fecha relativa con la absoluta en el tooltip. */
export function RelativeTime({ value }) {
  const now = useNow(30000);
  if (!value) return <span className="text-muted">—</span>;
  return (
    <time dateTime={new Date(value).toISOString()} title={formatDateTimePe(value)} className="relative-time">
      {formatRelative(value, now)}
    </time>
  );
}

/** "Actualizado hace X s" con botón para refrescar a mano. */
export function RefreshStatus({ lastUpdated, onRefresh }) {
  const now = useNow(5000);
  const [busy, setBusy] = useState(false);
  const secs = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null;
  const label = secs == null ? "Sin datos" : secs < 60 ? `hace ${secs} s` : `hace ${Math.round(secs / 60)} min`;
  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-refresh-status" aria-live="polite">
      <span>Actualizado {label}</span>
      <button type="button" className={`admin-refresh-btn ${busy ? "is-busy" : ""}`} onClick={refresh} disabled={busy} aria-label="Actualizar ahora" title="Actualizar ahora">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  );
}

/** true en pantallas de ≤768 px; se actualiza al rotar o redimensionar. */
export function useIsMobile() {
  const query = "(max-width: 768px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

/**
 * Estado sincronizado con un parámetro de la URL (?q=…): la vista se puede
 * recargar o compartir tal cual. Al cambiar de pestaña writeAdminRoute lo limpia.
 */
export function readUrlParam(key) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function setUrlParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  if (value === "" || value == null) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export function useUrlParam(key, fallback = "") {
  const [value, setValue] = useState(() => readUrlParam(key) ?? fallback);
  const update = useCallback((next) => {
    setValue(next);
    setUrlParam(key, next === fallback ? "" : next);
  }, [key, fallback]);
  return [value, update];
}

/** Enlace wa.me con el mensaje ya escrito. */
export function whatsappUrl(phone, text) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Mensaje de entrega de credenciales para enviar por WhatsApp. */
export function buildDeliveryMessage(order, account) {
  const name = String(order?.fullName || "").trim().split(/\s+/)[0] || "";
  const service = String(order?.service || "").toUpperCase();
  return [
    `¡Hola${name ? ` ${name}` : ""}! Tu pedido #${order?.orderId} de ${service}${order?.duration ? ` (${order.duration})` : ""} ya está activo.`,
    "",
    "Tus datos de acceso:",
    account,
    "",
    "Cualquier duda, escríbenos por aquí.",
  ].join("\n");
}

export function SecretField({ value, copyId, copiedId, onCopy, compact = false }) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return <span className="text-muted">-</span>;
  return (
    <span className={`secret-field ${compact ? "secret-field-compact" : ""}`}>
      <code>{revealed ? value : "••••••••"}</code>
      <button
        type="button"
        className="btn-mini-copy"
        title={revealed ? "Ocultar" : "Mostrar"}
        onClick={() => setRevealed((v) => !v)}
      >
        {revealed ? "Ocultar" : "Ver"}
      </button>
      {onCopy && (
        <button
          type="button"
          className="btn-mini-copy"
          title="Copiar"
          onClick={() => onCopy(value, copyId)}
        >
          <CopyIcon />
          {copiedId === copyId ? <span>Copiado</span> : null}
        </button>
      )}
    </span>
  );
}

export function ToastHost({ toasts }) {
  if (!toasts?.length) return null;
  return (
    <div className="admin-toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`admin-toast admin-toast-${toast.type || "success"}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({ state, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onCancel]);

  if (!state) return null;
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true">
      <div className="admin-modal-container glass-panel admin-confirm-dialog">
        <h3>{state.title}</h3>
        <p>{state.message}</p>
        <div className="modal-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${state.danger ? "btn-logout" : "btn-primary"}`}
            onClick={onConfirm}
            autoFocus
          >
            {state.confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProofLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="admin-lightbox glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-bar">
          <h3>Comprobante</h3>
          <button type="button" className="btn-modal-close" onClick={onClose}>Cerrar</button>
        </div>
        <img src={url} alt="Comprobante de pago" className="admin-lightbox-image" />
      </div>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div className="admin-dashboard-wrapper">
      <header className="admin-header glass-panel admin-header-sticky">
        <div className="container admin-header-inner">
          <div className="admin-brand">
            <span className="admin-brand-dot"></span>
            <h1>Panel Administrativo</h1>
          </div>
        </div>
      </header>
      <div className="container admin-content-layout">
        <section className="stats-grid stats-grid-compact admin-kpis">
          <div className="stat-card glass-panel admin-skeleton-block" />
          <div className="stat-card glass-panel admin-skeleton-block" />
          <div className="stat-card glass-panel admin-skeleton-block" />
          <div className="stat-card glass-panel admin-skeleton-block" />
        </section>
        <div className="admin-tabs-nav glass-panel admin-skeleton-block" style={{ height: 48 }} />
        <div className="glass-panel admin-skeleton-block" style={{ height: 220 }} />
      </div>
    </div>
  );
}
