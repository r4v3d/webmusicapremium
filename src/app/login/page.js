"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function WaveLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="logo-icon" style={{ color: "var(--accent-cyan)" }}>
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  
  // Step: 'id' (enter email/whatsapp), 'pin' (enter pin), 'otp' (enter otp), 'create-pin' (setup pin)
  const [step, setStep] = useState("id");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  // Session details from API response
  const [customerId, setCustomerId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [hasPin, setHasPin] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [timer, setTimer] = useState(0); // Cooldown for resending OTP

  // Countdown timer for OTP resend
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Step 1: Request OTP or Check PIN
  const handleIdentify = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Por favor ingresa tu correo o WhatsApp.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/client/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || data.error || "Ocurrió un error");
        setLoading(false);
        return;
      }
      
      // Save info
      setCustomerId(data.customerId);
      setMaskedEmail(data.maskedEmail);
      setHasPin(data.hasPin);
      
      if (data.hasPin) {
        // If client already has a PIN, show PIN entry step
        setStep("pin");
        if (data.debugOtp) {
          setSuccessMsg(`[Pruebas] Código OTP generado: ${data.debugOtp} (Usa este código si olvidas tu PIN)`);
        }
      } else {
        // If client has no PIN (first login), show OTP verification
        setStep("otp");
        let msg = `Código de seguridad enviado al correo registrado: ${data.maskedEmail}`;
        if (data.debugOtp) {
          msg += ` (Código simulado: ${data.debugOtp})`;
        }
        setSuccessMsg(msg);
        setTimer(60);
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2A: Verify PIN
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError("El PIN debe tener 6 dígitos numéricos.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/client/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, pin })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "PIN incorrecto");
        setLoading(false);
        return;
      }
      
      // Login successful, redirect to dashboard
      setLoading(false);
      router.push("/client/dashboard");
    } catch (err) {
      setError("Error de conexión. Inténtalo de nuevo.");
      setLoading(false);
    }
  };

  // Switch from PIN entry to OTP (when user forgets their PIN)
  const handleSwitchToOtp = async () => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    
    try {
      const res = await fetch("/api/client/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || data.error || "Error al enviar código");
        setLoading(false);
        return;
      }
      
      setStep("otp");
      let msg = `Código de verificación enviado a ${data.maskedEmail}`;
      if (data.debugOtp) {
        msg += ` (Código simulado: ${data.debugOtp})`;
      }
      setSuccessMsg(msg);
      setTimer(60);
    } catch (err) {
      setError("Error al enviar el código. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2B: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError("El código OTP debe ser de 6 dígitos numéricos.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/client/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, otpCode: otp })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Código incorrecto o vencido");
        setLoading(false);
        return;
      }
      
      // If the client doesn't have a PIN, force them to create it now.
      setLoading(false);
      if (!hasPin) {
        setStep("create-pin");
        setSuccessMsg("Código verificado. Por favor crea un PIN de acceso de 6 dígitos para tus futuros ingresos.");
      } else {
        router.push("/client/dashboard");
      }
    } catch (err) {
      setError("Error de conexión. Inténtalo de nuevo.");
      setLoading(false);
    }
  };

  // Step 3: Create PIN (forced on first login or after OTP recovery)
  const handleCreatePin = async (e) => {
    e.preventDefault();
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      setError("El PIN debe tener exactamente 6 dígitos numéricos.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("Los PINs ingresados no coinciden.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/client/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el PIN");
        setLoading(false);
        return;
      }
      
      setLoading(false);
      router.push("/client/dashboard");
    } catch (err) {
      setError("Error de conexión al guardar el PIN.");
      setLoading(false);
    }
  };

  return (
    <div className="landing-wrapper" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* BACKGROUND ELEMENTS */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {/* HEADER / NAVBAR */}
      <header className="site-header" style={{ position: "relative", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
        <div className="container header-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" className="logo-area">
            <WaveLogo />
            <span className="logo-text" style={{ fontFamily: "var(--font-title)" }}>Música Premium</span>
          </Link>
          <Link href="/" className="btn btn-secondary nav-btn" style={{ padding: "8px 20px", borderRadius: "9999px", fontSize: "0.85rem" }}>
            Volver al Inicio
          </Link>
        </div>
      </header>

      {/* LOGIN CARD MAIN AREA */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }} className="login-main-container">
        <div className="glass-panel login-card-custom" style={{ maxWidth: "420px", width: "100%", borderRadius: "24px", boxShadow: "var(--shadow-lg)", border: "1px solid rgba(255,255,255,0.06)" }}>
          
          {/* Form Header */}
          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <span className="badge badge-gold" style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: "9999px", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px", marginBottom: "12px", display: "inline-block" }}>
              Portal de Autoservicio
            </span>
            <h2 style={{ fontFamily: "var(--font-title)", fontSize: "1.75rem", fontWeight: "800", color: "#fff", margin: "5px 0" }}>
              Iniciar Sesión
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Consulta las claves y fechas de tus cuentas premium
            </p>
          </div>

          {/* Messages Panel */}
          {error && (
            <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", color: "#f87171", fontSize: "0.8rem", marginBottom: "20px", lineHeight: "1.4", fontFamily: "var(--font-body)" }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ padding: "12px 16px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", color: "#34d399", fontSize: "0.8rem", marginBottom: "20px", lineHeight: "1.4", fontFamily: "var(--font-body)" }}>
              {successMsg}
            </div>
          )}

          {/* STEP 1: Enter email or whatsapp */}
          {step === "id" && (
            <form onSubmit={handleIdentify} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ display: "block", color: "var(--text-main)", fontSize: "0.85rem", fontWeight: "600", marginBottom: "8px", fontFamily: "var(--font-body)" }} htmlFor="identifier">
                  Correo Electrónico o WhatsApp
                </label>
                <input
                  id="identifier"
                  type="text"
                  placeholder="ejemplo@gmail.com o 51923282640"
                  className="form-input"
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px", color: "#fff" }}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                />
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "6px", lineHeight: "1.4", fontFamily: "var(--font-body)" }}>
                  Ingresa los mismos datos con los que registraste tu compra.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !identifier.trim()}
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", borderRadius: "9999px", fontSize: "0.95rem", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "48px" }}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Continuar"
                )}
              </button>
            </form>
          )}

          {/* STEP 2A: PIN Entry */}
          {step === "pin" && (
            <form onSubmit={handleVerifyPin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  Ingresa tu PIN numérico de 6 dígitos.
                </p>
              </div>

              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  style={{ width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "16px 0", color: "#fff", textAlign: "center", fontSize: "2rem", fontWeight: "bold", letterSpacing: "0.5em" }}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || pin.length !== 6}
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", borderRadius: "9999px", fontSize: "0.95rem", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Ingresar"
                )}
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "center", fontSize: "0.8rem", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={handleSwitchToOtp}
                  disabled={loading}
                  style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontWeight: "600", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)" }}
                >
                  Ingresar con código temporal (OTP) por Correo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("id");
                    setPin("");
                    setError("");
                    setSuccessMsg("");
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Cambiar Correo/WhatsApp
                </button>
              </div>
            </form>
          )}

          {/* STEP 2B: OTP Verification */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: "1.4" }}>
                  Ingresa el código OTP de 6 dígitos que enviamos a tu correo verificado.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  style={{ width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "16px 0", color: "#fff", textAlign: "center", fontSize: "2rem", fontWeight: "bold", letterSpacing: "0.5em" }}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", borderRadius: "9999px", fontSize: "0.95rem", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Verificar Código"
                )}
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "center", fontSize: "0.8rem", marginTop: "10px" }}>
                <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-body)" }}>
                  {timer > 0 ? (
                    `Reenviar código en ${timer}s`
                  ) : (
                    <button
                      type="button"
                      onClick={handleSwitchToOtp}
                      style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Reenviar Código por Correo
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("id");
                    setOtp("");
                    setError("");
                    setSuccessMsg("");
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Volver a ingresar datos
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Create PIN */}
          {step === "create-pin" && (
            <form onSubmit={handleCreatePin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: "1.4" }}>
                  Crea un PIN numérico de 6 dígitos para acceder rápidamente en tus próximos ingresos.
                </p>
              </div>

              <div>
                <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: "600", marginBottom: "5px", fontFamily: "var(--font-body)" }} htmlFor="newPin">
                  Nuevo PIN (6 números)
                </label>
                <input
                  id="newPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  style={{ width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "10px 0", color: "#fff", textAlign: "center", fontSize: "1.5rem", fontWeight: "bold", letterSpacing: "0.3em" }}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: "600", marginBottom: "5px", fontFamily: "var(--font-body)" }} htmlFor="confirmPin">
                  Confirmar PIN
                </label>
                <input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  style={{ width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "10px 0", color: "#fff", textAlign: "center", fontSize: "1.5rem", fontWeight: "bold", letterSpacing: "0.3em" }}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || newPin.length !== 6 || confirmPin.length !== 6}
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", borderRadius: "9999px", fontSize: "0.95rem", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "10px", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", borderColor: "transparent" }}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Guardar PIN e Ingresar"
                )}
              </button>
            </form>
          )}

        </div>
      </main>

      {/* FOOTER SUPPORT */}
      <footer style={{ textAlign: "center", padding: "20px", position: "relative", zIndex: 10 }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-body)" }}>
          ¿Tienes problemas para ingresar?{" "}
          <a
            href="https://wa.me/51923282640?text=Hola!%20Tengo%20problemas%20para%20iniciar%20sesión%20en%20el%20portal%20de%20clientes."
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-cyan)", fontWeight: "600", textDecoration: "none" }}
          >
            Contáctanos por WhatsApp
          </a>
        </p>
      </footer>
    </div>
  );
}
