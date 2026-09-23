"use client";

import { useEffect, useMemo, useState } from "react";
import { WORKSPACES } from "./adminUi";

export default function CommandPalette({ open, onClose, onGo, orders, familyAccounts }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.toLowerCase().trim();
  const items = useMemo(() => {
    const list = [];
    Object.entries(WORKSPACES).forEach(([tab, meta]) => {
      const subs = Object.keys(meta.subs).length ? Object.entries(meta.subs) : [["", meta.label]];
      subs.forEach(([sub, label]) => {
        const title = sub ? `${meta.label} → ${label}` : meta.label;
        if (!q || title.toLowerCase().includes(q)) {
          list.push({ id: `go-${tab}-${sub}`, title, hint: "Ir", tab, sub });
        }
      });
    });
    (orders || []).slice(0, 80).forEach((o) => {
      const hay = `${o.orderId} ${o.fullName} ${o.whatsapp} ${o.email}`.toLowerCase();
      if (q && hay.includes(q)) {
        list.push({ id: `ord-${o.orderId}`, title: `Pedido ${o.orderId} · ${o.fullName}`, hint: "Pedidos", tab: "hoy", sub: "pedidos" });
      }
    });
    (familyAccounts || []).slice(0, 80).forEach((acc) => {
      const hay = `${acc.masterEmail} ${acc.service}`.toLowerCase();
      if (q && hay.includes(q)) {
        list.push({
          id: `fam-${acc.id || acc._id}`,
          title: `${(acc.service || "").toUpperCase()} · ${acc.masterEmail}`,
          hint: "Familias",
          tab: "clientes",
          sub: "familyAccounts",
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
            tab: "clientes",
            sub: "tableList",
          });
        }
      });
    });
    return list.slice(0, 20);
  }, [q, orders, familyAccounts]);

  if (!open) return null;
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="command-palette glass-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <input
          autoFocus
          className="form-input"
          placeholder="Ir a una vista, pedido o titular…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="command-palette-list">
          {items.length === 0 ? (
            <li className="text-muted">Sin resultados</li>
          ) : (
            items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onGo(item.tab, item.sub);
                    onClose();
                  }}
                >
                  <span>{item.title}</span>
                  <em>{item.hint}</em>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="command-palette-hint">Ctrl/Cmd + K · Esc cierra</p>
      </div>
    </div>
  );
}
