"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import { formatDate, getCountryFlag } from "../adminHelpers";
import { SecretField, formatDatePe } from "../adminUi";

function getDaysDiff(expiryDateStr) {
  if (!expiryDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = expiryDateStr.split("-");
  if (parts.length !== 3) return null;
  const expiry = new Date(parts[0], parts[1] - 1, parts[2]);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryMeta(days, ownerRenewalDate) {
  if (days === null) return { text: "Sin fecha de vencimiento", className: "badge-expired", critical: false };
  if (days < 0) return { text: `Vencida hace ${Math.abs(days)} días`, className: "badge-expired", critical: true };
  if (days === 0) return { text: "Vence hoy", className: "badge-expired pulsing-expiry-badge", critical: true };
  if (days === 1) return { text: "Vence mañana", className: "soon pulsing-expiry-badge", critical: true };
  if (days <= 3) return { text: `Vence en ${days} días`, className: "soon", critical: true };
  return { text: `Vence en ${days} días (${formatDate(ownerRenewalDate)})`, className: "active", critical: false };
}

export default function OrganizerTab() {
  const {
    askConfirm,
    copiedId,
    familyAccounts,
    handleCopyToClipboard,
    handleTransferMember,
    isFamiliesLoading,
    isTransferring,
    organizerPlatform,
    setOrganizerPlatform,
    setShowTransferModal,
    setTransferSourceAccount,
    setTransferSourceSlot,
    transferUndo,
  } = useAdmin();

  const [draggingId, setDraggingId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");

  const selectedServiceAccounts = familyAccounts.filter((acc) => acc.service === organizerPlatform);
  let totalActiveMembers = 0;
  let totalFreeSlots = 0;
  const accountsList = [];

  selectedServiceAccounts.forEach((acc) => {
    const activeSlots = (acc.profiles || []).filter((p) => p.status !== "free" && p.clientId);
    const freeSlots = (acc.profiles || []).filter((p) => p.status === "free");
    totalActiveMembers += activeSlots.length;
    totalFreeSlots += freeSlots.length;
    accountsList.push({
      ...acc,
      activeCount: activeSlots.length,
      freeCount: freeSlots.length,
      daysRemaining: getDaysDiff(acc.ownerRenewalDate),
    });
  });

  accountsList.sort((a, b) => {
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  const optimalAccounts = Math.ceil(totalActiveMembers / 5) || 0;
  const excessAccounts = Math.max(0, accountsList.length - optimalAccounts);

  const findSlot = (slotId) => {
    for (const acc of accountsList) {
      const slot = (acc.profiles || []).find((p) => (p.id || p._id) === slotId);
      if (slot) return { acc, slot };
    }
    return null;
  };

  const dropOnSlot = async (targetSlot, targetAcc) => {
    const source = findSlot(draggingId);
    setDropTargetId("");
    if (!source || !targetSlot || targetSlot.status !== "free") return;
    if ((source.acc.id || source.acc._id) === (targetAcc.id || targetAcc._id)) return;

    const srcDate = source.acc.ownerRenewalDate || "";
    const dstDate = targetAcc.ownerRenewalDate || "";
    if (dstDate && srcDate && dstDate < srcDate) {
      const ok = await askConfirm({
        title: "El destino vence antes",
        message: `Mover a ${targetAcc.masterEmail} (${formatDatePe(dstDate)}) deja al cliente en una titular que vence antes que ${source.acc.masterEmail} (${formatDatePe(srcDate)}). ¿Mover igual?`,
        confirmLabel: "Mover igual",
        danger: true,
      });
      if (!ok) return;
    }

    await handleTransferMember(source.slot.id || source.slot._id, targetSlot.id || targetSlot._id);
  };

  return (
    <section className="organizer-section animate-fade-in" style={{ marginTop: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ marginBottom: "4px" }}>Organizador y Consolidación de Miembros</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Arrastra un miembro a un cupo libre. El tablero se actualiza al soltar.
          </p>
        </div>
      </div>

      {transferUndo && (
        <p className="organizer-hint text-muted">Último movimiento listo para deshacer desde el aviso superior.</p>
      )}

      <div className="platform-tabs-nav" style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "10px" }}>
        {["tidal", "deezer", "qobuz"].map((plat) => (
          <button
            key={plat}
            type="button"
            onClick={() => setOrganizerPlatform(plat)}
            className={`platform-tab-btn ${organizerPlatform === plat ? "active" : ""}`}
            style={{
              padding: "8px 16px",
              background: organizerPlatform === plat ? "var(--accent-purple, #a855f7)" : "rgba(255,255,255,0.03)",
              color: "#fff",
              border: organizerPlatform === plat ? "none" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              textTransform: "uppercase",
              fontWeight: "bold",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            {plat}
          </button>
        ))}
      </div>

      <div className="organizer-stats-grid">
        <div className="organizer-stat-card glass-panel" style={{ borderLeft: "4px solid var(--accent-purple, #a855f7)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Miembros Activos</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#fff", margin: "4px 0" }}>
            {totalActiveMembers} <span style={{ fontSize: "1rem", fontWeight: "normal", color: "var(--text-muted)" }}>en uso</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan, #00e5ff)" }}>
            {totalFreeSlots} cupos libres disponibles
          </span>
        </div>
        <div className="organizer-stat-card glass-panel" style={{ borderLeft: "4px solid var(--accent-cyan, #00e5ff)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Cuentas Familiares</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#fff", margin: "4px 0" }}>
            {accountsList.length} <span style={{ fontSize: "1rem", fontWeight: "normal", color: "var(--text-muted)" }}>actuales</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Número óptimo teórico: <strong>{optimalAccounts}</strong>
          </span>
        </div>
        <div className={`organizer-stat-card ${excessAccounts > 0 ? "alert-action" : "ok-action"}`}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Análisis de Optimización</span>
          <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#fff", margin: "4px 0" }}>
            {excessAccounts > 0 ? "Consolidación recomendada" : "Cuentas optimizadas"}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, lineHeight: "1.4" }}>
            {excessAccounts > 0
              ? `Puedes vaciar ${excessAccounts} titular(es) moviendo miembros a cuentas con más vigencia.`
              : "No se detectan cuentas excedentes."}
          </p>
        </div>
      </div>

      {isFamiliesLoading && accountsList.length === 0 ? (
        <div className="empty-panel glass-panel text-center" style={{ padding: "40px" }}>
          <p>Cargando cuentas para el tablero…</p>
        </div>
      ) : accountsList.length === 0 ? (
        <div className="empty-panel glass-panel text-center" style={{ padding: "40px" }}>
          <p>No se encontraron cuentas familiares para {organizerPlatform.toUpperCase()}.</p>
        </div>
      ) : (
        <div className="organizer-board">
          {accountsList.map((acc) => {
            const accId = acc._id || acc.id;
            const meta = expiryMeta(acc.daysRemaining, acc.ownerRenewalDate);
            return (
              <article
                key={accId}
                className={`organizer-column glass-panel ${meta.critical ? "organizer-column-critical" : ""}`}
              >
                <header className="organizer-column-head">
                  <span className={`badge-service badge-${acc.service}`}>{acc.service}</span>
                  <span className={`status-badge-mini ${meta.className}`}>{meta.text}</span>
                  <strong className="organizer-column-email">{acc.masterEmail}</strong>
                  <SecretField
                    value={acc.password}
                    copyId={`org-master-${accId}`}
                    copiedId={copiedId}
                    onCopy={handleCopyToClipboard}
                    compact
                  />
                  <span className="organizer-occ">{acc.activeCount}/5 ocupados</span>
                </header>
                <div className="organizer-slots">
                  {(acc.profiles || []).map((p) => {
                    const pId = p._id || p.id;
                    const isActive = p.status !== "free" && p.clientId;
                    const isDrop = dropTargetId === pId;
                    return (
                      <div
                        key={pId}
                        className={`organizer-slot ${isActive ? "occupied" : "free"} ${draggingId === pId ? "dragging" : ""} ${isDrop ? "drop-ok" : ""}`}
                        draggable={Boolean(isActive) && !isTransferring}
                        onDragStart={() => setDraggingId(pId)}
                        onDragEnd={() => {
                          setDraggingId("");
                          setDropTargetId("");
                        }}
                        onDragOver={(e) => {
                          if (!isActive && draggingId) {
                            e.preventDefault();
                            setDropTargetId(pId);
                          }
                        }}
                        onDragLeave={() => {
                          if (dropTargetId === pId) setDropTargetId("");
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          dropOnSlot(p, acc);
                        }}
                      >
                        <div className="organizer-slot-top">
                          <span>Ranura {p.slotNumber}</span>
                          {isActive ? (
                            <button
                              type="button"
                              className="btn-mini-copy"
                              onClick={() => {
                                setTransferSourceSlot(p);
                                setTransferSourceAccount(acc);
                                setShowTransferModal(true);
                              }}
                            >
                              Mover
                            </button>
                          ) : (
                            <span className="text-muted">Libre</span>
                          )}
                        </div>
                        {isActive ? (
                          <>
                            <strong>{p.clientId.nickname || "Cliente"}</strong>
                            <span className="text-muted">{p.clientId.customerCode || ""}</span>
                            {p.clientId.currentWhatsApp && (
                              <a
                                href={`https://wa.me/${p.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="organizer-wa"
                              >
                                {getCountryFlag(p.clientId.currentWhatsApp)} {p.clientId.currentWhatsApp}
                              </a>
                            )}
                            <span className="organizer-mail">{p.memberEmail}</span>
                            {p.renewalDate && (
                              <span className="text-muted">Cliente: {formatDatePe(p.renewalDate)}</span>
                            )}
                          </>
                        ) : (
                          <span className="organizer-drop-hint">Suelta aquí un miembro</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
