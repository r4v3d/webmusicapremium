"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// --- SVG Icons ---
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-cyan)" }}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

export default function ClientDashboard() {
  const router = useRouter();
  
  // Dashboard state
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [activeSubs, setActiveSubs] = useState([]);
  const [expiredSubs, setExpiredSubs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState(null);
  
  // Modals & forms state
  const [renewSub, setRenewSub] = useState(null); // Subscription object selected for renewal
  const [selectedMethod, setSelectedMethod] = useState("yape");
  const [opNumber, setOpNumber] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  
  // PIN change state
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPinForm, setShowPinForm] = useState(false);
  
  // Clipboard copied tooltips state
  const [copiedId, setCopiedId] = useState("");
  
  // Global message states
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Fetch client data
  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/client/dashboard");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al obtener los datos");
        return;
      }
      
      setClient(data.client);
      setActiveSubs(data.activeSubscriptions);
      setExpiredSubs(data.expiredSubscriptions);
      setPayments(data.payments);
      setPaymentMethods(data.paymentMethods);
    } catch (err) {
      console.error(err);
      setError("Error de red al cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Handle Clipboard Copy
  const copyToClipboard = (text, fieldId) => {
    navigator.clipboard.writeText(text);
    setCopiedId(fieldId);
    setTimeout(() => setCopiedId(""), 2000);
  };

  // Open Renew Modal
  const openRenewModal = (sub) => {
    setRenewSub(sub);
    setPayAmount(sub.pricePen);
    setSelectedMethod("yape");
    setOpNumber("");
    setReceiptFile(null);
    setReceiptPreview("");
    setError("");
    setSuccessMsg("");
  };

  // Handle file select for receipt upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Renewal Payment Report
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setError("Monto de pago inválido.");
      return;
    }

    setActionLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("subscriptionId", renewSub.id);
      formData.append("paymentMethod", selectedMethod);
      formData.append("operationNumber", opNumber.trim());
      formData.append("amount", payAmount);
      if (receiptFile) {
        formData.append("file", receiptFile);
      }

      const res = await fetch("/api/client/renew", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || "Error al reportar pago");
        setActionLoading(false);
        return;
      }

      setSuccessMsg("¡Comprobante enviado con éxito! El administrador verificará tu pago pronto.");
      
      setTimeout(() => {
        setRenewSub(null);
        fetchDashboardData();
      }, 2500);
    } catch (err) {
      setError("Error al enviar el formulario. Verifica tu conexión.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Change PIN
  const handleChangePin = async (e) => {
    e.preventDefault();
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      setError("El PIN debe tener 6 dígitos numéricos.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("Los PINs no coinciden.");
      return;
    }

    setActionLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/client/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "No se pudo actualizar el PIN");
        setActionLoading(false);
        return;
      }

      setSuccessMsg("¡PIN de 6 dígitos actualizado con éxito!");
      setNewPin("");
      setConfirmPin("");
      setTimeout(() => {
        setShowPinForm(false);
        setSuccessMsg("");
      }, 2000);
    } catch (err) {
      setError("Error al actualizar el PIN.");
    } finally {
      setActionLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/client/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error(err);
      router.push("/login");
    }
  };

  // Helper for platform tag border glows
  const getPlatformBorderClass = (service) => {
    switch (service.toLowerCase()) {
      case "tidal":
        return "border-cyan";
      case "deezer":
        return "border-purple";
      case "qobuz":
        return "border-gold";
      default:
        return "border-purple";
    }
  };

  const getPlatformBadgeColor = (service) => {
    switch (service.toLowerCase()) {
      case "tidal":
        return "#00e5ff";
      case "deezer":
        return "#ff007f";
      case "qobuz":
        return "#d4af37";
      default:
        return "#a855f7";
    }
  };

  // Date formatter DD/MM/YYYY
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateStr).toLocaleDateString("es-ES");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080a] flex flex-col justify-center items-center text-gray-400">
        <span className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4"></span>
        <p className="text-sm">Cargando tu panel de cuentas...</p>
      </div>
    );
  }

  return (
    <div className="landing-wrapper" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* BACKGROUND ELEMENTS */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {/* HEADER NAVBAR */}
      <header className="site-header" style={{ position: "relative", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", zIndex: 40 }}>
        <div className="container header-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="logo-area">
            <span className="logo-text" style={{ fontFamily: "var(--font-title)", fontSize: "1.25rem" }}>Mi Cuenta</span>
          </div>

          <div style={{ display: "flex", itemsCenter: "center", gap: "10px" }}>
            <button
              onClick={() => setShowPinForm(!showPinForm)}
              className="btn btn-secondary"
              style={{ padding: "8px 12px", borderRadius: "9999px", display: "flex", alignItems: "center", fontSize: "0.8rem", cursor: "pointer" }}
              title="Ajustes de PIN"
            >
              <ShieldIcon />
              <span>PIN</span>
            </button>
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ padding: "8px 16px", borderRadius: "9999px", display: "flex", alignItems: "center", fontSize: "0.8rem", cursor: "pointer", background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}
            >
              <LogoutIcon />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main style={{ flex: 1, padding: "30px 20px" }}>
        <div className="container" style={{ maxWidth: "768px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "25px" }}>
          
          {/* Welcome Banner */}
          <div className="glass-panel" style={{ padding: "20px 25px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(0, 229, 255, 0.05) 0%, rgba(255, 0, 127, 0.02) 100%)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <h2 style={{ fontFamily: "var(--font-title)", fontSize: "1.5rem", fontWeight: "800", color: "#fff", margin: 0 }}>
              ¡Hola, {client?.nickname}!
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: "1.4" }}>
              Aquí tienes el acceso directo a las credenciales de tus cuentas premium activas. Puedes copiarlas y usarlas en tus aplicaciones de streaming.
            </p>
          </div>

          {/* Global message states */}
          {error && !renewSub && (
            <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", color: "#f87171", fontSize: "0.8rem", lineHeight: "1.4" }}>
              {error}
            </div>
          )}
          {successMsg && !renewSub && !showPinForm && (
            <div style={{ padding: "12px 16px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", color: "#34d399", fontSize: "0.8rem", lineHeight: "1.4" }}>
              {successMsg}
            </div>
          )}

          {/* CHANGE PIN CARD SECTION */}
          {showPinForm && (
            <div className="glass-panel border-cyan" style={{ padding: "20px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "15px", animation: "fadeIn 0.2s" }}>
              <h3 style={{ fontFamily: "var(--font-title)", fontSize: "1rem", fontWeight: "700", color: "#fff", margin: 0, display: "flex", alignItems: "center" }}>
                <ShieldIcon /> Configurar PIN de Seguridad (6 dígitos)
              </h3>
              {error && (
                <div style={{ fontSize: "0.75rem", color: "#f87171", background: "rgba(239,68,68,0.05)", padding: "8px 12px", border: "1px solid rgba(239,68,68,0.1)", borderRadius: "8px" }}>{error}</div>
              )}
              {successMsg && (
                <div style={{ fontSize: "0.75rem", color: "#34d399", background: "rgba(16,185,129,0.05)", padding: "8px 12px", border: "1px solid rgba(16,185,129,0.1)", borderRadius: "8px" }}>{successMsg}</div>
              )}
              <form onSubmit={handleChangePin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "4px" }}>Nuevo PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      className="form-input"
                      style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: "bold", letterSpacing: "0.2em", padding: "8px" }}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").substring(0, 6))}
                      disabled={actionLoading}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "4px" }}>Confirmar PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      className="form-input"
                      style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: "bold", letterSpacing: "0.2em", padding: "8px" }}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").substring(0, 6))}
                      disabled={actionLoading}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "5px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinForm(false);
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="btn btn-secondary"
                    style={{ padding: "6px 14px", borderRadius: "9999px", fontSize: "0.75rem" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || newPin.length !== 6}
                    className="btn btn-primary"
                    style={{ padding: "6px 16px", borderRadius: "9999px", fontSize: "0.75rem" }}
                  >
                    {actionLoading ? "Guardando..." : "Actualizar PIN"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ACTIVE SERVICES */}
          <section style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <h3 style={{ fontFamily: "var(--font-title)", fontSize: "0.85rem", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "1px" }}>
              Servicios Contratados
            </h3>
            
            {activeSubs.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: "40px", borderRadius: "16px", color: "var(--text-muted)" }}>
                No tienes ninguna suscripción activa registrada en este momento.
              </div>
            ) : (
              activeSubs.map((sub) => {
                const borderClass = getPlatformBorderClass(sub.service);
                const accentColor = getPlatformBadgeColor(sub.service);
                
                let badgeStyle = { color: "#34d399", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.15)", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold" };
                let timeLabel = `${sub.daysRemaining} días restantes`;
                
                if (sub.daysRemaining <= 5) {
                  badgeStyle = { color: "#fbbf24", background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.15)", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold" };
                }
                if (sub.status === "pending_payment") {
                  badgeStyle = { color: "#60a5fa", background: "rgba(96, 165, 250, 0.08)", border: "1px solid rgba(96, 165, 250, 0.15)", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold" };
                  timeLabel = "Validando renovación";
                }

                return (
                  <div key={sub.id} className={`glass-panel ${borderClass}`} style={{ borderRadius: "16px", padding: "24px" }}>
                    
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px" }}>
                      <div>
                        <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: "800", textTransform: "uppercase", background: accentColor, color: "#08080a", padding: "2px 8px", borderRadius: "4px", marginBottom: "6px" }}>
                          {sub.serviceName}
                        </span>
                        <h4 style={{ fontFamily: "var(--font-title)", fontSize: "1.2rem", fontWeight: "800", color: "#fff", margin: 0 }}>
                          {sub.profile}
                        </h4>
                      </div>
                      <span style={badgeStyle}>
                        {timeLabel}
                      </span>
                    </div>

                    {/* Credentials */}
                    <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", padding: "15px", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ display: "block", fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: "bold" }}>CORREO DE INGRESO</span>
                          <code style={{ fontSize: "0.85rem", color: "#fff", fontFamily: "monospace", fontWeight: "bold" }}>{sub.email}</code>
                        </div>
                        <button
                          onClick={() => copyToClipboard(sub.email, `${sub.id}-email`)}
                          className="btn btn-secondary"
                          style={{ padding: "6px 8px", borderRadius: "8px", border: "none", cursor: "pointer" }}
                        >
                          {copiedId === `${sub.id}-email` ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      </div>
                      
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", margin: "4px 0" }}></div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ display: "block", fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: "bold" }}>CONTRASEÑA</span>
                          <code style={{ fontSize: "0.85rem", color: "#fff", fontFamily: "monospace", fontWeight: "bold" }}>{sub.password}</code>
                        </div>
                        <button
                          onClick={() => copyToClipboard(sub.password, `${sub.id}-pass`)}
                          className="btn btn-secondary"
                          style={{ padding: "6px 8px", borderRadius: "8px", border: "none", cursor: "pointer" }}
                        >
                          {copiedId === `${sub.id}-pass` ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      </div>
                    </div>

                    {/* Footer / Renovations */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "14px" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Vence: <strong style={{ color: "var(--text-main)" }}>{formatDisplayDate(sub.renewalDate)}</strong>
                      </span>

                      {sub.status === "pending_payment" ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: "bold", background: "rgba(0, 229, 255, 0.05)", border: "1px solid rgba(0, 229, 255, 0.1)", padding: "6px 12px", borderRadius: "8px" }}>
                          Comprobante en validación
                        </span>
                      ) : (
                        <button
                          onClick={() => openRenewModal(sub)}
                          className="btn btn-primary"
                          style={{ padding: "8px 18px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold" }}
                        >
                          Renovar Cupo
                        </button>
                      )}
                    </div>

                  </div>
                );
              })
            )}
          </section>

          {/* EXPIRED SERVICES */}
          {expiredSubs.length > 0 && (
            <section>
              <details className="glass-panel" style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <summary style={{ padding: "15px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
                  <span style={{ fontFamily: "var(--font-title)", fontSize: "0.8rem", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Historial de Cuentas Vencidas ({expiredSubs.length})
                  </span>
                </summary>
                <div style={{ padding: "10px 20px 20px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {expiredSubs.map((sub) => (
                    <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "12px 15px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.02)" }}>
                      <div>
                        <strong style={{ color: "#fff", fontSize: "0.85rem" }}>{sub.serviceName}</strong>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>{sub.profile} ({sub.email})</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: "#ef4444", fontSize: "0.8rem", fontWeight: "bold", display: "block" }}>Vencido</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Expiró el {formatDisplayDate(sub.renewalDate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </section>
          )}

          {/* PAYMENT HISTORY */}
          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h3 style={{ fontFamily: "var(--font-title)", fontSize: "0.85rem", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "1px" }}>
              Historial de Transacciones
            </h3>
            
            {payments.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: "20px", borderRadius: "16px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                No tienes registros de renovaciones reportadas todavía.
              </div>
            ) : (
              <div className="glass-panel" style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", padding: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: "bold" }}>
                      <th style={{ padding: "10px" }}>Fecha</th>
                      <th style={{ padding: "10px" }}>Monto</th>
                      <th style={{ padding: "10px" }}>Método</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      let statusStyle = { color: "#fbbf24", fontWeight: "bold" };
                      let statusText = "Pendiente";
                      if (p.payment_status === "confirmed") {
                        statusStyle = { color: "#34d399", fontWeight: "bold" };
                        statusText = "Confirmado";
                      } else if (p.payment_status === "rejected") {
                        statusStyle = { color: "#f87171", fontWeight: "bold" };
                        statusText = "Rechazado";
                      }

                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "10px", color: "var(--text-muted)" }}>
                            {new Date(p.created_at).toLocaleDateString("es-ES")}
                          </td>
                          <td style={{ padding: "10px", fontWeight: "bold", color: "#fff" }}>
                            S/. {p.amount.toFixed(2)}
                          </td>
                          <td style={{ padding: "10px", textTransform: "capitalize", color: "#ccc" }}>
                            {p.payment_method}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right" }}>
                            <span style={statusStyle}>{statusText}</span>
                            {p.notes && p.payment_status === "rejected" && (
                              <span style={{ display: "block", fontSize: "0.7rem", color: "#f87171", marginTop: "2px", maxWidth: "160px", marginLeft: "auto", lineHeight: "1.2" }}>
                                {p.notes.split("\n[RECHAZADO]:")[1] || p.notes}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </main>

      {/* RENEW PAYMENT REPORT MODAL */}
      {renewSub && (
        <div className="admin-modal-overlay" style={{ background: "rgba(0,0,0,0.85)", zIndex: 100 }}>
          <div className="admin-modal-container glass-panel" style={{ maxWidth: "460px", padding: "30px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
            
            {/* Close */}
            <button
              onClick={() => setRenewSub(null)}
              className="btn-modal-close"
              style={{ position: "absolute", top: "20px", right: "20px", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}
            >
              <CloseIcon />
            </button>

            <h3 style={{ fontFamily: "var(--font-title)", fontSize: "1.35rem", fontWeight: "800", color: "#fff", marginBottom: "5px" }}>
              Renovar {renewSub.serviceName}
            </h3>
            <p className="section-instruction" style={{ marginBottom: "20px" }}>
              Sigue las instrucciones de transferencia e ingresa los datos de tu comprobante.
            </p>

            {error && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "10px", color: "#f87171", fontSize: "0.75rem", marginBottom: "15px" }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "10px", color: "#34d399", fontSize: "0.75rem", marginBottom: "15px" }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmitPayment} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              
              {/* Payment Info Box */}
              <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "15px" }}>
                <label style={{ display: "block", color: "#fff", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "8px" }}>
                  1. Método de Pago Utilizado
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {Object.entries(paymentMethods || {}).map(([key, method]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMethod(key)}
                      style={{
                        padding: "8px 5px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        border: selectedMethod === key ? "1px solid var(--accent-cyan)" : "1px solid rgba(255,255,255,0.06)",
                        background: selectedMethod === key ? "rgba(0, 229, 255, 0.08)" : "rgba(0,0,0,0.3)",
                        color: selectedMethod === key ? "var(--accent-cyan)" : "var(--text-muted)",
                        borderRadius: "10px",
                        cursor: "pointer",
                        textTransform: "capitalize"
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>

                {/* Account Details & QR */}
                {paymentMethods && paymentMethods[selectedMethod] && (
                  <div style={{ marginTop: "15px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                      <span style={{ color: "var(--text-dim)" }}>Titular:</span>
                      <strong style={{ color: "#fff" }}>{paymentMethods[selectedMethod].name}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
                      <div>
                        <span style={{ color: "var(--text-dim)" }}>
                          {selectedMethod === "binancePay" ? "Binance Pay ID:" : "Número de cuenta:"}
                        </span>
                        <code style={{ color: "var(--accent-cyan)", fontWeight: "bold", marginLeft: "4px", fontSize: "0.85rem" }}>
                          {paymentMethods[selectedMethod].number || paymentMethods[selectedMethod].payId}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(paymentMethods[selectedMethod].number || paymentMethods[selectedMethod].payId, "modal-pay-detail")}
                        className="btn btn-secondary"
                        style={{ padding: "4px 8px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                      >
                        {copiedId === "modal-pay-detail" ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    </div>

                    {paymentMethods[selectedMethod].qrImage && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "10px" }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "6px" }}>Código QR de transferencia</span>
                        <img
                          src={paymentMethods[selectedMethod].qrImage}
                          alt={`QR ${selectedMethod}`}
                          style={{ width: "110px", height: "110px", objectFit: "contain", background: "#fff", borderRadius: "8px", padding: "4px" }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form Input fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "block", color: "#fff", fontSize: "0.8rem", fontWeight: "bold" }}>
                  2. Datos de Transferencia
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "4px" }} htmlFor="modal-amount">Monto Depositado (S/.)</label>
                    <input
                      id="modal-amount"
                      type="number"
                      step="0.01"
                      className="form-input"
                      style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      disabled={actionLoading}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "4px" }} htmlFor="modal-op">Número de Operación</label>
                    <input
                      id="modal-op"
                      type="text"
                      className="form-input"
                      style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                      placeholder="Referencia o Nro."
                      value={opNumber}
                      onChange={(e) => setOpNumber(e.target.value)}
                      disabled={actionLoading}
                    />
                  </div>
                </div>

                {/* File Upload Capture */}
                <div>
                  <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "4px" }}>Captura del Comprobante (Opcional)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <label style={{ flex: 1, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.2)", borderRadius: "12px", padding: "10px 0", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", marginBottom: "4px" }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "bold" }}>Subir Imagen</span>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                        disabled={actionLoading}
                      />
                    </label>

                    {receiptPreview && (
                      <div style={{ width: "55px", height: "55px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img src={receiptPreview} alt="Receipt preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                  </div>
                  {receiptFile && (
                    <span style={{ display: "block", fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "4px", truncate: "true", maxWidth: "250px" }}>
                      Archivo: {receiptFile.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setRenewSub(null)}
                  disabled={actionLoading}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "12px", borderRadius: "9999px", fontSize: "0.85rem" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: "12px", borderRadius: "9999px", fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {actionLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    "Reportar Pago"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer style={{ textAlign: "center", padding: "20px", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-body)", margin: 0 }}>
          {new Date().getFullYear()} Música Premium Barato. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
