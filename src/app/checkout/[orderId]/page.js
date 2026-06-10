"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CONFIG } from "../../../data/config";

// --- SVG Icons ---
function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-float">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.437.002 9.861-4.416 9.863-9.864.001-2.639-1.024-5.12-2.887-6.985C16.38 1.892 13.9 .867 11.26.867 5.823.867 1.4 5.285 1.398 10.722c-.001 1.52.397 3.004 1.155 4.3l-.955 3.49 3.57-.936c1.238.677 2.625 1.033 4.073 1.036-.002 0-.002 0 0 0zm11.365-7.616c-.303-.151-1.793-.883-2.072-.985-.278-.102-.48-.152-.68.151-.202.303-.781.985-.957 1.186-.176.202-.353.227-.656.076-.303-.151-1.28-.472-2.438-1.503-.9-.802-1.507-1.793-1.684-2.095-.176-.303-.019-.467.132-.617.136-.135.303-.353.454-.529.151-.176.202-.303.303-.505.102-.202.05-.379-.026-.53-.076-.151-.68-1.638-.93-2.24-.244-.587-.49-.508-.68-.517-.176-.008-.379-.009-.58-.009-.202 0-.53.076-.807.379-.278.303-1.062 1.038-1.062 2.532 0 1.493 1.087 2.932 1.238 3.134.151.202 2.139 3.268 5.183 4.582.724.312 1.29.5 1.731.64.727.231 1.39.198 1.914.12.584-.087 1.794-.733 2.047-1.44.253-.706.253-1.312.176-1.44-.076-.126-.278-.202-.58-.353z" />
    </svg>
  );
}

export default function CheckoutPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Timer state (15 minutes in seconds)
  const [timeLeft, setTimeLeft] = useState(900);
  const [timerActive, setTimerActive] = useState(true);
  
  // Simulation and UI states
  const [simulating, setSimulating] = useState(false);
  const [copiedText, setCopiedText] = useState("");

  const intervalRef = useRef(null);

  // Fetch order details
  const fetchOrder = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        throw new Error("Pedido no encontrado.");
      }
      const data = await response.json();
      setOrder(data);
      
      // If payment is already completed or failed, stop timer
      if (data.status !== "pending") {
        setTimerActive(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  // Countdown timer logic
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setTimerActive(false);
          // Auto-expire order in DB
          updateOrderStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [timerActive, timeLeft]);

  // Helper to format time (MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Update payment status (Mock API request)
  const updateOrderStatus = async (newStatus) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (response.ok) {
        setOrder(data.order);
        if (newStatus !== "pending") {
          setTimerActive(false);
        }
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  // Simulate confirmed Binance payment
  const handleSimulatePayment = () => {
    setSimulating(true);
    setTimeout(() => {
      updateOrderStatus("paid");
      setSimulating(false);
    }, 1500);
  };

  // Copy text to clipboard
  const handleCopyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
  };

  // Send Whatsapp confirmation details
  const getWhatsAppLink = () => {
    if (!order) return "";
    const currency = order.paymentMethod === "binance_pay" ? "USD" : "Soles";
    const amount = order.paymentMethod === "binance_pay" ? order.priceUsd : order.pricePen;
    const paymentLabel = order.paymentMethod === "binance_pay" ? "Binance Pay" : "Yape / Plin";

    const msg = `¡Hola! Acabo de hacer un pedido en Música Premium Barato.

*Detalles del Pedido:*
• *ID de Orden:* ${order.orderId}
• *Servicio:* ${order.service.toUpperCase()} Premium
• *Duración:* ${order.duration}
• *Método de Pago:* ${paymentLabel}
• *Monto:* ${amount}
• *Correo de envío:* ${order.email}
• *WhatsApp de contacto:* ${order.whatsapp}

Adjunto el comprobante de mi pago. Quedo a la espera de la entrega. ¡Muchas gracias!`;

    return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  };

  if (loading) {
    return (
      <div className="checkout-loading">
        <span className="page-spinner"></span>
        <p>Cargando información del pago...</p>
        <style jsx>{`
          .checkout-loading {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #08080a;
            color: #ffffff;
            gap: 20px;
          }
          .page-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: var(--accent-gold);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="checkout-error">
        <div className="error-card glass-panel">
          <h2>Error de Checkout</h2>
          <p>{error || "El pedido no fue encontrado."}</p>
          <Link href="/" className="btn btn-primary">Volver al Inicio</Link>
        </div>
        <style jsx>{`
          .checkout-error {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #08080a;
            padding: 24px;
          }
          .error-card {
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          .error-card h2 { margin-bottom: 16px; color: #ef4444; }
          .error-card p { margin-bottom: 24px; }
        `}</style>
      </div>
    );
  }

  const serviceConfig = CONFIG.services[order.service] || { accentColor: "#d4af37", bgGradient: "" };
  const serviceThemeClass = `theme-${order.service}`;

  return (
    <div className={`checkout-wrapper ${serviceThemeClass}`}>
      <div className="checkout-bg-glow"></div>

      <div className="container">
        {/* CHECKOUT HEADER */}
        <header className="checkout-page-header">
          <Link href="/" className="checkout-brand">
            <span className="brand-dot"></span>
            <span>{CONFIG.appName}</span>
          </Link>
          <div className="order-badge-id">ID de Orden: <strong>#{order.orderId}</strong></div>
        </header>

        {/* MAIN BODY */}
        <main className="checkout-container animate-fade-in">
          {/* SUCCESS SCREEN */}
          {order.status === "paid" ? (
            <div className="success-panel glass-panel text-center">
              <div className="success-icon-wrap">
                <CheckIcon />
              </div>
              <h1 className="success-title">¡Pago Confirmado!</h1>
              <p className="success-subtitle">
                Hemos verificado tu pago correctamente. Tu cuenta premium de <strong>{order.service.toUpperCase()} ({order.duration})</strong> ha sido activada.
              </p>

              {/* ACCOUNT CREDENTIALS BOX (IF ASSIGNED FROM STOCK) */}
              {order.assignedAccount ? (
                <div className="assigned-credentials-card glass-panel text-left">
                  <h3>Tus Datos de Acceso Premium</h3>
                  <p className="credentials-info-hint">Inicia sesión en la app oficial de {order.service.toUpperCase()} con estos datos:</p>
                  
                  <div className="credentials-row">
                    <span className="cred-label">Usuario / Correo:</span>
                    <div className="cred-value-wrap">
                      <code>{order.assignedAccount.split(":")[0]}</code>
                      <button
                        onClick={() => handleCopyToClipboard(order.assignedAccount.split(":")[0], "cred_user")}
                        className="btn-copy-mini"
                      >
                        <CopyIcon />
                        <span>{copiedText === "cred_user" ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                  </div>

                  {order.assignedAccount.includes(":") && (
                    <div className="credentials-row">
                      <span className="cred-label">Contraseña:</span>
                      <div className="cred-value-wrap">
                        <code>{order.assignedAccount.split(":")[1]}</code>
                        <button
                          onClick={() => handleCopyToClipboard(order.assignedAccount.split(":")[1], "cred_pass")}
                          className="btn-copy-mini"
                        >
                          <CopyIcon />
                          <span>{copiedText === "cred_pass" ? "Copiado!" : "Copiar"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-credentials-assigned-card glass-panel">
                  <p>Estamos preparando las credenciales de tu cuenta. Te enviaremos un correo de confirmación de inmediato o puedes contactarnos por WhatsApp para agilizar la entrega.</p>
                </div>
              )}

              <div className="success-details-card">
                <h3>Detalles de la Orden</h3>
                <div className="detail-row">
                  <span>ID de Pedido:</span>
                  <strong>#{order.orderId}</strong>
                </div>
                <div className="detail-row">
                  <span>Plataforma:</span>
                  <strong>{order.service.toUpperCase()} Premium</strong>
                </div>
                <div className="detail-row">
                  <span>Periodo contratado:</span>
                  <strong>{order.duration}</strong>
                </div>
                <div className="detail-row">
                  <span>Monto Recibido:</span>
                  <strong className="success-amount">
                    {order.paymentMethod === "binance_pay" ? `$ ${order.priceUsd}` : order.pricePen}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Correo registrado:</span>
                  <strong>{order.email}</strong>
                </div>
              </div>

              <div className="success-actions">
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp"
                >
                  <WhatsAppIcon />
                  <span>Pedir Soporte / Entrega por WhatsApp</span>
                </a>
                <Link href="/" className="btn btn-secondary">
                  Volver a la Página Principal
                </Link>
              </div>
            </div>
          ) : order.status === "expired" ? (
            <div className="expired-panel glass-panel text-center">
              <h2>Pedido Expirado</h2>
              <p>El tiempo para completar el pago ha terminado. Si deseas continuar, por favor realiza un nuevo pedido.</p>
              <Link href={`/order/${order.service}`} className="btn btn-primary">Crear Nuevo Pedido</Link>
            </div>
          ) : (
            /* ACTIVE PAYMENT INSTRUCTIONS */
            <div className="payment-grid">
              
              {/* LEFT COLUMN: QR & DETAILS */}
              <section className="payment-details-card glass-panel">
                {order.paymentMethod === "binance_pay" ? (
                  /* BINANCE PAY DETAILS */
                  <div className="payment-type-block">
                    <h2>Pago con Binance Pay</h2>
                    <p className="payment-description">Transfiere el monto exacto en USDT mediante Binance Pay o billetera externa para confirmación automática/manual.</p>

                    {/* QR Code Placeholder */}
                    <div className="qr-code-holder">
                      <div className="qr-visual">
                        {/* We use styled SVG to represent QR code box premium */}
                        <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="qr-mesh">
                          <rect x="2" y="2" width="6" height="6" fill="currentColor"></rect>
                          <rect x="16" y="2" width="6" height="6" fill="currentColor"></rect>
                          <rect x="2" y="16" width="6" height="6" fill="currentColor"></rect>
                          <path d="M10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4zM16 10h4v4h-4zM10 16h4v4h-4zM16 16h4v4h-4z"></path>
                        </svg>
                        <span className="qr-logo-brand binance">Binance</span>
                      </div>
                      <span className="qr-hint-text">Escanea para pagar</span>
                    </div>

                    <div className="payment-fields-list">
                      <div className="payment-field-item">
                        <span className="field-label">Binance Pay ID:</span>
                        <div className="field-value-wrap">
                          <code className="field-code">{CONFIG.payments.binancePay.payId}</code>
                          <button
                            onClick={() => handleCopyToClipboard(CONFIG.payments.binancePay.payId, "payid")}
                            className="btn-copy"
                          >
                            <CopyIcon />
                            <span>{copiedText === "payid" ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="payment-field-item">
                        <span className="field-label">Dirección USDT (TRC20):</span>
                        <div className="field-value-wrap">
                          <code className="field-code">{CONFIG.payments.binancePay.usdtAddress}</code>
                          <button
                            onClick={() => handleCopyToClipboard(CONFIG.payments.binancePay.usdtAddress, "usdt")}
                            className="btn-copy"
                          >
                            <CopyIcon />
                            <span>{copiedText === "usdt" ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="payment-field-item">
                        <span className="field-label">Monto a Enviar:</span>
                        <div className="field-value-wrap">
                          <strong className="field-price">$ {order.priceUsd} USDT</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* YAPE / PLIN DETAILS */
                  <div className="payment-type-block">
                    <h2>Pago con Yape o Plin</h2>
                    <p className="payment-description">Realiza la transferencia por celular y comparte tu comprobante por WhatsApp para la entrega de la cuenta.</p>

                    {/* QR Showcase */}
                    <div className="qrs-showcase-grid">
                      <div className="qr-card">
                        <div className="qr-code-holder">
                          <div className="qr-visual purple">
                            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="qr-mesh">
                              <rect x="2" y="2" width="6" height="6" fill="currentColor"></rect>
                              <rect x="16" y="2" width="6" height="6" fill="currentColor"></rect>
                              <rect x="2" y="16" width="6" height="6" fill="currentColor"></rect>
                              <path d="M10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4zM16 10h4v4h-4zM10 16h4v4h-4zM16 16h4v4h-4z"></path>
                            </svg>
                            <span className="qr-logo-brand yape">Yape</span>
                          </div>
                        </div>
                        <span className="qr-name">YAPE</span>
                        <span className="qr-phone-number">{CONFIG.payments.yape.number}</span>
                      </div>

                      <div className="qr-card">
                        <div className="qr-code-holder">
                          <div className="qr-visual blue">
                            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="qr-mesh">
                              <rect x="2" y="2" width="6" height="6" fill="currentColor"></rect>
                              <rect x="16" y="2" width="6" height="6" fill="currentColor"></rect>
                              <rect x="2" y="16" width="6" height="6" fill="currentColor"></rect>
                              <path d="M10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4zM16 10h4v4h-4zM10 16h4v4h-4zM16 16h4v4h-4z"></path>
                            </svg>
                            <span className="qr-logo-brand plin">Plin</span>
                          </div>
                        </div>
                        <span className="qr-name">PLIN</span>
                        <span className="qr-phone-number">{CONFIG.payments.plin.number}</span>
                      </div>
                    </div>

                    <div className="payment-fields-list">
                      <div className="payment-field-item">
                        <span className="field-label">Titular de Cuenta:</span>
                        <div className="field-value-wrap">
                          <strong className="field-text">{CONFIG.payments.yape.name}</strong>
                        </div>
                      </div>

                      <div className="payment-field-item">
                        <span className="field-label">Número celular:</span>
                        <div className="field-value-wrap">
                          <code className="field-code">{CONFIG.payments.yape.number}</code>
                          <button
                            onClick={() => handleCopyToClipboard(CONFIG.payments.yape.number.replace(/\s+/g, ""), "phone")}
                            className="btn-copy"
                          >
                            <CopyIcon />
                            <span>{copiedText === "phone" ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="payment-field-item">
                        <span className="field-label">Total a transferir:</span>
                        <div className="field-value-wrap">
                          <strong className="field-price">{order.pricePen} Soles</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* RIGHT COLUMN: TIMER & STATUS SUMMARY */}
              <section className="checkout-summary-panel">
                {/* TIMER BLOCK */}
                <div className="timer-card glass-panel">
                  <div className="timer-header">
                    <ClockIcon />
                    <span>Tiempo restante para pagar</span>
                  </div>
                  <div className="timer-countdown">{formatTime(timeLeft)}</div>
                  <p className="timer-warning-hint">Realiza el pago antes de que expire el temporizador para asegurar la rápida entrega.</p>
                </div>

                {/* SUMMARY DETAILS */}
                <div className="summary-details-card glass-panel">
                  <h3>Resumen de la Orden</h3>
                  <div className="summary-row">
                    <span>Producto:</span>
                    <strong>{order.service.toUpperCase()} Premium</strong>
                  </div>
                  <div className="summary-row">
                    <span>Duración del plan:</span>
                    <strong>{order.duration}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Método de pago:</span>
                    <strong className="payment-label-value">
                      {order.paymentMethod === "binance_pay" ? "Binance Pay" : "Yape / Plin"}
                    </strong>
                  </div>
                  <div className="summary-row">
                    <span>Correo del usuario:</span>
                    <strong>{order.email}</strong>
                  </div>
                  <div className="summary-total-row">
                    <span>Total:</span>
                    <strong>
                      {order.paymentMethod === "binance_pay" ? `$ ${order.priceUsd}` : order.pricePen}
                    </strong>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="checkout-action-buttons">
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-whatsapp checkout-btn"
                  >
                    <WhatsAppIcon />
                    <span>Enviar Comprobante por WhatsApp</span>
                  </a>

                  {/* BINANCE PAY PAYMENT SIMULATION */}
                  {order.paymentMethod === "binance_pay" && (
                    <div className="simulation-block glass-panel">
                      <span className="simulation-label">¿Deseas simular la pasarela?</span>
                      <p className="simulation-desc">Binance Pay confirmará la transacción automáticamente cuando detecte el pago.</p>
                      
                      <button
                        onClick={handleSimulatePayment}
                        className={`btn btn-secondary simulation-btn ${simulating ? "btn-disabled" : ""}`}
                        disabled={simulating}
                      >
                        {simulating ? (
                          <>
                            <span className="simulation-spinner"></span>
                            <span>Verificando transacción...</span>
                          </>
                        ) : (
                          <span>Simular Confirmación de Pago</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </section>

            </div>
          )}
        </main>
      </div>

      {/* COMPONENT CSS */}
      <style jsx>{`
        .checkout-wrapper {
          min-height: 100vh;
          background-color: var(--bg-primary);
          color: #ffffff;
          position: relative;
          padding-bottom: 80px;
        }

        .checkout-bg-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.06;
          pointer-events: none;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--theme-color);
          z-index: 0;
        }

        /* --- HEADER --- */
        .checkout-page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 0;
          border-bottom: 1px solid var(--glass-border);
          margin-bottom: 40px;
        }
        .checkout-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-title);
          font-weight: 800;
          font-size: 1.15rem;
        }
        .brand-dot {
          width: 8px;
          height: 8px;
          background: var(--theme-color);
          border-radius: 50%;
        }
        .order-badge-id {
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .order-badge-id strong {
          color: #ffffff;
        }

        /* --- LAYOUT GRID --- */
        .payment-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 40px;
          align-items: start;
        }

        /* --- PAYMENT DETAILS CARD --- */
        .payment-details-card {
          padding: 40px;
        }
        .payment-type-block h2 {
          font-size: 1.5rem;
          margin-bottom: 8px;
        }
        .payment-description {
          font-size: 0.9rem;
          color: var(--text-muted);
          margin-bottom: 30px;
        }

        /* QR CODE HOLDER */
        .qr-code-holder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-bottom: 30px;
        }
        .qr-visual {
          width: 220px;
          height: 220px;
          background: #ffffff;
          padding: 20px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          color: #000000;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
        }
        .qr-visual.purple {
          border: 4px solid #8e44ad;
        }
        .qr-visual.blue {
          border: 4px solid #3498db;
        }
        .qr-mesh {
          opacity: 0.95;
          width: 100%;
          height: 100%;
        }
        .qr-logo-brand {
          position: absolute;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 0.75rem;
          color: #ffffff;
          font-family: var(--font-title);
          box-shadow: var(--shadow-sm);
        }
        .qr-logo-brand.binance { background: #f1c40f; color: #000000; }
        .qr-logo-brand.yape { background: #8e44ad; }
        .qr-logo-brand.plin { background: #3498db; }

        .qr-hint-text {
          font-size: 0.8rem;
          color: var(--text-dim);
          margin-top: 10px;
        }

        /* YAPE / PLIN QRS GRID */
        .qrs-showcase-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
        .qr-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-sm);
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .qr-card .qr-visual {
          width: 130px;
          height: 130px;
          padding: 10px;
        }
        .qr-name {
          font-family: var(--font-title);
          font-weight: 700;
          font-size: 0.9rem;
          margin-top: 10px;
        }
        .qr-phone-number {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* FIELDS LIST */
        .payment-fields-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-top: 1px solid var(--glass-border);
          padding-top: 24px;
        }
        .payment-field-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .field-label {
          font-size: 0.85rem;
          color: var(--text-dim);
        }
        .field-value-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .field-code {
          font-family: monospace;
          background: rgba(255, 255, 255, 0.05);
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 0.85rem;
          color: #ffffff;
          border: 1px solid var(--glass-border);
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .field-text {
          font-size: 0.95rem;
          color: #ffffff;
        }
        .field-price {
          font-size: 1.15rem;
          color: var(--theme-color);
          font-family: var(--font-title);
          font-weight: 800;
        }
        .btn-copy {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .btn-copy:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        /* --- SUMMARY PANEL (RIGHT) --- */
        .checkout-summary-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        /* TIMER */
        .timer-card {
          padding: 24px;
          text-align: center;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.02) 0%, rgba(0,0,0,0) 100%);
          border-color: rgba(239, 68, 68, 0.1);
        }
        .timer-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #ef4444;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .timer-countdown {
          font-family: var(--font-title);
          font-weight: 800;
          font-size: 2.5rem;
          color: #ef4444;
          margin: 10px 0;
          line-height: 1;
        }
        .timer-warning-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        /* DETAILS */
        .summary-details-card {
          padding: 30px;
        }
        .summary-details-card h3 {
          font-size: 1.1rem;
          margin-bottom: 20px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          margin-bottom: 12px;
          color: var(--text-muted);
        }
        .summary-row strong {
          color: #ffffff;
        }
        .payment-label-value {
          color: var(--theme-color) !important;
        }
        .summary-total-row {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid var(--glass-border);
          padding-top: 16px;
          margin-top: 16px;
          font-family: var(--font-title);
          font-weight: 700;
          font-size: 1.1rem;
        }
        .summary-total-row strong {
          color: var(--theme-color);
          font-size: 1.25rem;
          font-weight: 800;
        }

        /* ACTIONS */
        .checkout-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .checkout-btn {
          width: 100%;
          padding: 16px;
        }

        /* SIMULATION BLOCK */
        .simulation-block {
          padding: 24px;
          text-align: center;
          border-style: dashed;
        }
        .simulation-label {
          font-family: var(--font-title);
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--accent-gold);
          display: block;
          margin-bottom: 6px;
        }
        .simulation-desc {
          font-size: 0.75rem;
          color: var(--text-dim);
          margin-bottom: 16px;
        }
        .simulation-btn {
          width: 100%;
          font-size: 0.85rem;
          padding: 10px;
          border-color: rgba(212, 175, 55, 0.2);
          color: var(--accent-gold);
        }
        .simulation-btn:hover:not(.btn-disabled) {
          border-color: var(--accent-gold);
          background: rgba(212, 175, 55, 0.05);
        }
        .simulation-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(212, 175, 55, 0.1);
          border-top-color: var(--accent-gold);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
          margin-right: 8px;
        }

        /* --- SUCCESS VIEW PANEL --- */
        .success-panel {
          max-width: 600px;
          margin: 0 auto;
          padding: 60px 40px;
        }
        .success-icon-wrap {
          width: 80px;
          height: 80px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 30px auto;
        }
        .success-title {
          font-size: 2.25rem;
          margin-bottom: 12px;
          color: #10b981;
        }
        .success-subtitle {
          font-size: 0.95rem;
          margin-bottom: 40px;
          color: var(--text-muted);
        }
        .success-details-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-sm);
          padding: 24px;
          margin-bottom: 40px;
          text-align: left;
        }
        .success-details-card h3 {
          font-size: 1rem;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--glass-border);
          padding-bottom: 10px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          margin-bottom: 10px;
          color: var(--text-muted);
        }
        .detail-row:last-child {
          margin-bottom: 0;
        }
        .detail-row strong {
          color: #ffffff;
        }
        .success-amount {
          color: var(--theme-color) !important;
          font-weight: 700;
        }
        .success-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* --- EXPIRED VIEW --- */
        .expired-panel {
          max-width: 500px;
          margin: 40px auto;
          padding: 40px;
        }
        .expired-panel h2 {
          color: #ef4444;
          margin-bottom: 16px;
        }
        .expired-panel p {
          margin-bottom: 24px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* --- RESPONSIVE --- */
        @media (max-width: 900px) {
          .payment-grid {
            grid-template-columns: 1fr;
            gap: 30px;
          }
        }
        @media (max-width: 480px) {
          .qrs-showcase-grid {
            grid-template-columns: 1fr;
          }
          .payment-field-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .field-value-wrap {
            width: 100%;
            justify-content: space-between;
          }
          .success-panel {
            padding: 30px 20px;
          }
        }

        /* --- ASSIGNED CREDENTIALS STYLES --- */
        .assigned-credentials-card {
          padding: 24px;
          margin-bottom: 30px;
          border-left: 4px solid var(--accent-gold);
          background: rgba(255, 255, 255, 0.02);
        }
        .assigned-credentials-card h3 {
          font-size: 1.15rem;
          margin-bottom: 8px;
          color: var(--accent-gold);
        }
        .credentials-info-hint {
          font-size: 0.8rem;
          color: var(--text-dim);
          margin-bottom: 16px;
        }
        .credentials-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 0.9rem;
          gap: 16px;
        }
        .credentials-row:last-child {
          margin-bottom: 0;
        }
        .cred-label {
          color: var(--text-muted);
          font-weight: 500;
        }
        .cred-value-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cred-value-wrap code {
          font-family: monospace;
          background: rgba(0, 0, 0, 0.3);
          padding: 6px 12px;
          border-radius: 4px;
          border: 1px solid var(--glass-border);
          color: #ffffff;
        }
        .no-credentials-assigned-card {
          padding: 24px;
          margin-bottom: 30px;
          background: rgba(255, 255, 255, 0.01);
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
