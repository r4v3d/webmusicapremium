"use client";

import { useEffect, useMemo, useState } from "react";
import { WORKSPACES } from "./adminUi";

const OPEN_STATUSES = ["pending", "awaiting_payment", "underpaid"];

// actions: [{ id, title, hint, keywords, run }] — acciones directas además de la navegación.
export default function CommandPalette({ open, onClose, onGo, onConfirmOrder, onSearchOrder, actions = [], orders, familyAccounts }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const q = query.toLowerCase().trim();
  const items = useMemo(() => {
    const list = [];
    actions.forEach((action) => {
      const hay = `${action.title} ${action.keywords || ""}`.toLowerCase();
      if (!q || hay.includes(q)) list.push({ ...action, hint: action.hint || "Acción" });
    });
    Object.entries(WORKSPACES).forEach(([tab, meta]) => {
      const subs = Object.keys(meta.subs).length ? Object.entries(meta.subs) : [["", meta.label]];
      subs.forEach(([sub, label]) => {
        const title = sub ? `${meta.label} → ${label}` : meta.label;
        if (!q || title.toLowerCase().includes(q)) {
          list.push({ id: `go-${tab}-${sub}`, title, hint: "Ir", run: () => onGo(tab, sub) });
        }
      });
    });
    (orders || []).slice(0, 80).forEach((o) => {
      const hay = `${o.orderId} ${o.fullName} ${o.whatsapp} ${o.email}`.toLowerCase();
      if (!q || !hay.includes(q)) return;
      if (OPEN_STATUSES.includes(o.status) && onConfirmOrder) {
        list.push({ id: `confirm-${o.orderId}`, title: `Confirmar pago de #${o.orderId} · ${o.fullName}`, hint: "Acción", run: () => onConfirmOrder(o.orderId) });
      }
      list.push({
        id: `ord-${o.orderId}`,
        title: `Pedido ${o.orderId} · ${o.fullName}`,
        hint: "Pedidos",
        run: () => (onSearchOrder ? onSearchOrder(o.orderId) : onGo("hoy", "pedidos")),
      });
    });
    (familyAccounts || []).slice(0, 80).forEach((acc) => {
      const hay = `${acc.masterEmail} ${acc.service}`.toLowerCase();
      if (q && hay.includes(q)) {
        list.push({
          id: `fam-${acc.id || acc._id}`,
          title: `${(acc.service || "").toUpperCase()} · ${acc.masterEmail}`,
          hint: "Familias",
          run: () => onGo("clientes", "familyAccounts"),
        });
      }
      (acc.profiles || []).forEach((p) => {
        const nick = p.clientId?.nickname || "";
        const phone = p.clientId?.currentWhatsApp || "";
        const member = `${nick} ${phone} ${p.memberEmail || ""}`.toLowerCase();
        if (q && nick && member.includes(q)) {
          list.push({
            id: `slot-${p.id || p._id}`,
            title: `${nick} · ${(acc.service || "").toUpperCase()}`,
            hint: "Tabla",
            run: () => onGo("clientes", "tableList"),
          });
        }
      });
    });
    return list.slice(0, 20);
  }, [q, actions, orders, familyAccounts, onGo, onConfirmOrder, onSearchOrder]);

  const safeActive = Math.min(active, Math.max(0, items.length - 1));

  const runItem = (item) => {
    if (!item) return;
    close();
    item.run();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setQuery("");
        setActive(0);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onInputKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(items[safeActive]);
    }
  };

  if (!open) return null;
  return (
    <div className="admin-modal-overlay" onClick={close}>
      <div className="command-palette glass-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <input
          autoFocus
          className="form-input"
          placeholder="Ir a una vista, pedido, titular o acción…"
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={items[safeActive] ? `cp-${items[safeActive].id}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKey}
        />
        <ul className="command-palette-list" id="command-palette-list" role="listbox">
          {items.length === 0 ? (
            <li className="text-muted">Sin resultados</li>
          ) : (
            items.map((item, i) => (
              <li key={item.id} id={`cp-${item.id}`} role="option" aria-selected={i === safeActive}>
                <button
                  type="button"
                  className={i === safeActive ? "is-active" : ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runItem(item)}
                >
                  <span>{item.title}</span>
                  <em>{item.hint}</em>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="command-palette-hint">
          ↑↓ elegir · Enter abrir · Esc cerrar · Atajos: <kbd>/</kbd> buscar, <kbd>g</kbd>+<kbd>h</kbd> Hoy, <kbd>g</kbd>+<kbd>v</kbd> Por verificar, <kbd>g</kbd>+<kbd>c</kbd> Cobros, <kbd>g</kbd>+<kbd>i</kbd> Inventario, <kbd>g</kbd>+<kbd>l</kbd> Clientes, <kbd>g</kbd>+<kbd>n</kbd> Números
        </p>
      </div>
    </div>
  );
}
