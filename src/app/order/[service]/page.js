"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CONFIG } from "../../../data/config";

// --- SVG Icons ---
function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
  );
}

function TidalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5.376l3.312 3.312-3.312 3.312-3.312-3.312zM6.624 10.752l3.312 3.312-3.312 3.312-3.312-3.312zM17.376 10.752l3.312 3.312-3.312 3.312-3.312-3.312zM12 16.128l3.312 3.312-3.312 3.312-3.312-3.312z" />
    </svg>
  );
}

function DeezerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="18" width="3" height="3" />
      <rect x="7" y="15" width="3" height="6" />
      <rect x="12" y="12" width="3" height="9" />
      <rect x="17" y="9" width="3" height="12" />
      <rect x="22" y="6" width="3" height="15" />
    </svg>
  );
}

function QobuzIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  );
}

export default function OrderPage() {
  const { service } = useParams();
  const router = useRouter();
  
  // Find current service configuration
  const serviceData = CONFIG.services[service];

  // Form states
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("yape_plin"); // yape_plin or binance_pay
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Select default plan on mount
  useEffect(() => {
    if (serviceData && serviceData.plans.length > 0) {
      // Pick popular plan, or first plan
      const popular = serviceData.plans.find(p => p.popular) || serviceData.plans[0];
      setSelectedPlan(popular);
    }
  }, [serviceData]);

  if (!serviceData) {
    return (
      <div className="error-wrapper">
        <div className="error-card glass-panel">
          <h2>Servicio No Encontrado</h2>
          <p>La plataforma solicitada no está disponible o no existe.</p>
          <Link href="/" className="btn btn-primary">Volver al Inicio</Link>
        </div>
        <style jsx>{`
          .error-wrapper {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #08080a;
            color: #ffffff;
            padding: 24px;
          }
          .error-card {
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          .error-card h2 { margin-bottom: 16px; }
          .error-card p { margin-bottom: 24px; }
        `}</style>
      </div>
    );
  }

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!fullName.trim()) return setError("El nombre completo es requerido.");
    if (!email.trim() || !email.includes("@")) return setError("Ingresa un correo electrónico válido.");
    if (!whatsapp.trim()) return setError("El número de WhatsApp es requerido.");
    if (!selectedPlan) return setError("Por favor selecciona un plan.");

    setLoading(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service: serviceData.id,
          planId: selectedPlan.id,
          duration: selectedPlan.duration,
          pricePen: selectedPlan.pricePen,
          priceUsd: selectedPlan.priceUsd,
          fullName,
          email,
          whatsapp,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al procesar el pedido.");
      }

      // Redirect to checkout page
      router.push(`/checkout/${data.orderId}`);
    } catch (err) {
      setError(err.message || "Hubo un error de red. Intenta nuevamente.");
      setLoading(false);
    }
  };

  const getServiceIcon = () => {
    switch (serviceData.id) {
      case "tidal": return <TidalIcon />;
      case "deezer": return <DeezerIcon />;
      case "qobuz": return <QobuzIcon />;
      default: return null;
    }
  };

  const serviceThemeClass = `theme-${serviceData.id}`;

  return (
    <div className={`order-wrapper ${serviceThemeClass}`}>
      {/* BACKGROUND GLOW */}
      <div className="order-bg-glow"></div>

      <div className="container">
        {/* BACK LINK */}
        <Link href="/" className="back-link">
          <ArrowLeftIcon />
          <span>Volver al Inicio</span>
        </Link>

        <main className="order-grid animate-fade-in">
          {/* LEFT COLUMN: SERVICE DETAILS */}
          <section className="service-details-panel glass-panel">
            <div className="service-detail-header">
              <div className="service-logo-box">
                {getServiceIcon()}
              </div>
              <h1 className="service-detail-title">{serviceData.name} Premium</h1>
            </div>
            
            <p className="service-tagline-text">{serviceData.tagline}</p>
            <p className="service-desc-text">{serviceData.description}</p>
            
            <div className="features-block">
              <h3>¿Qué incluye esta cuenta?</h3>
              <ul className="details-features-list">
                {serviceData.features.map((feat, index) => (
                  <li key={index}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* RIGHT COLUMN: ORDER FORM */}
          <section className="order-form-panel glass-panel">
            <h2 className="form-title">Completa tu Pedido</h2>
            <p className="form-subtitle">Ingresa tus datos y selecciona tu método de pago preferido.</p>

            {error && <div className="error-alert">{error}</div>}

            <form onSubmit={handleSubmit} className="order-form">
              {/* STEP 1: SELECT PLAN */}
              <div className="form-section">
                <span className="section-step-label">Paso 1: Elige la duración</span>
                <div className="plans-selection-grid">
                  {serviceData.plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={`plan-select-card ${selectedPlan?.id === plan.id ? "active" : ""}`}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      {plan.popular && <span className="popular-badge">Recomendado</span>}
                      <span className="plan-card-duration">{plan.duration}</span>
                      <span className="plan-card-price">
                        {paymentMethod === "binance_pay" ? `$ ${plan.priceUsd}` : plan.pricePen}
                      </span>
                      <span className="plan-card-rate-hint">
                        {paymentMethod === "binance_pay" ? `${plan.pricePen} aprox` : `$ ${plan.priceUsd} aprox`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* STEP 2: USER DETAILS */}
              <div className="form-section">
                <span className="section-step-label">Paso 2: Datos del cliente</span>
                
                <div className="form-group">
                  <label htmlFor="fullName" className="form-label">Nombre Completo</label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    placeholder="Ej. Juan Pérez"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email" className="form-label">Correo Electrónico</label>
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <p className="field-hint">Aquí te enviaremos los accesos de la cuenta premium.</p>
                </div>

                <div className="form-group">
                  <label htmlFor="whatsapp" className="form-label">Número de WhatsApp</label>
                  <input
                    id="whatsapp"
                    type="tel"
                    className="form-input"
                    placeholder="Ej. +51 900 000 000"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <p className="field-hint">Para soporte directo y confirmación del comprobante.</p>
                </div>
              </div>

              {/* STEP 3: PAYMENT METHOD */}
              <div className="form-section">
                <span className="section-step-label">Paso 3: Medio de Pago</span>
                <div className="payment-options-group">
                  {/* LOCAL */}
                  <label className={`payment-radio-card ${paymentMethod === "yape_plin" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="payment_method"
                      value="yape_plin"
                      checked={paymentMethod === "yape_plin"}
                      onChange={() => setPaymentMethod("yape_plin")}
                      disabled={loading}
                    />
                    <div className="payment-card-content">
                      <div className="payment-card-header">
                        <span className="payment-card-title">Yape / Plin</span>
                        <span className="badge-local-hint">Soles (Perú)</span>
                      </div>
                      <p className="payment-card-desc">Transferencia instantánea en Soles peruanos.</p>
                    </div>
                  </label>

                  {/* BINANCE PAY */}
                  <label className={`payment-radio-card ${paymentMethod === "binance_pay" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="payment_method"
                      value="binance_pay"
                      checked={paymentMethod === "binance_pay"}
                      onChange={() => setPaymentMethod("binance_pay")}
                      disabled={loading}
                    />
                    <div className="payment-card-content">
                      <div className="payment-card-header">
                        <span className="payment-card-title">Binance Pay</span>
                        <span className="badge-crypto-hint">Crypto / USDT</span>
                      </div>
                      <p className="payment-card-desc">Pagos internacionales descentralizados sin comisiones.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                className={`btn btn-submit-order ${loading ? "btn-disabled" : ""}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    <span>Procesando pedido...</span>
                  </>
                ) : (
                  <>
                    <span>Generar Pedido • {paymentMethod === "binance_pay" ? `$ ${selectedPlan?.priceUsd || "0.00"}` : selectedPlan?.pricePen || "S/. 0.00"}</span>
                  </>
                )}
              </button>
            </form>
          </section>
        </main>
      </div>

      {/* STYLES FOR THE ORDER PAGE */}
      <style jsx>{`
        .order-wrapper {
          min-height: 100vh;
          background-color: var(--bg-primary);
          position: relative;
          padding: 40px 0 80px 0;
        }

        .order-bg-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.08;
          pointer-events: none;
          top: -100px;
          right: -100px;
          background: var(--theme-color);
          z-index: 0;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-family: var(--font-title);
          font-weight: 500;
          margin-bottom: 30px;
          transition: var(--transition-fast);
        }
        .back-link:hover {
          color: #ffffff;
          transform: translateX(-4px);
        }

        .order-grid {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 40px;
          align-items: start;
        }

        /* --- SERVICE DETAILS PANEL --- */
        .service-details-panel {
          padding: 40px;
          position: sticky;
          top: 40px;
        }
        .service-detail-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        .service-logo-box {
          color: var(--theme-color);
          width: 54px;
          height: 54px;
          border-radius: var(--radius-sm);
          background: var(--theme-glow);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .service-detail-title {
          font-size: 2.25rem;
        }
        .service-tagline-text {
          font-size: 1.1rem;
          color: #ffffff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        .service-desc-text {
          font-size: 0.95rem;
          line-height: 1.7;
          margin-bottom: 40px;
        }
        .features-block h3 {
          font-size: 1.2rem;
          margin-bottom: 20px;
        }
        .details-features-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .details-features-list li {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          font-size: 0.95rem;
        }
        .details-features-list li span {
          color: var(--text-muted);
        }
        .check-icon {
          color: var(--theme-color);
          flex-shrink: 0;
          margin-top: 3px;
        }

        /* --- ORDER FORM PANEL --- */
        .order-form-panel {
          padding: 40px;
        }
        .form-title {
          font-size: 1.75rem;
          margin-bottom: 6px;
        }
        .form-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-bottom: 30px;
        }

        .error-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          margin-bottom: 24px;
        }

        .form-section {
          margin-bottom: 30px;
          border-top: 1px solid var(--glass-border);
          padding-top: 24px;
        }
        .form-section:first-of-type {
          border-top: none;
          padding-top: 0;
        }
        
        .section-step-label {
          display: block;
          font-family: var(--font-title);
          font-weight: 700;
          font-size: 1rem;
          color: #ffffff;
          margin-bottom: 16px;
        }

        /* PLANS SELECTION */
        .plans-selection-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .plan-select-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-sm);
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: var(--transition-normal);
          position: relative;
          color: inherit;
        }
        .plan-select-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .plan-select-card.active {
          border-color: var(--theme-color);
          background: var(--theme-glow);
          box-shadow: 0 4px 20px var(--theme-glow);
        }
        .popular-badge {
          position: absolute;
          top: -8px;
          font-size: 0.65rem;
          background: var(--theme-color);
          color: #000000;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-weight: 700;
          text-transform: uppercase;
        }
        .plan-card-duration {
          font-family: var(--font-title);
          font-weight: 600;
          font-size: 0.9rem;
          color: #ffffff;
          margin-bottom: 6px;
        }
        .plan-card-price {
          font-family: var(--font-title);
          font-weight: 800;
          font-size: 1.25rem;
          color: var(--theme-color);
        }
        .plan-card-rate-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          margin-top: 4px;
        }

        .field-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          margin-top: 4px;
        }

        /* PAYMENT OPTIONS */
        .payment-options-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .payment-radio-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-sm);
          padding: 16px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          cursor: pointer;
          transition: var(--transition-normal);
        }
        .payment-radio-card:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .payment-radio-card.active {
          border-color: var(--theme-color);
          background: rgba(255, 255, 255, 0.02);
        }
        .payment-radio-card input {
          margin-top: 4px;
          accent-color: var(--theme-color);
        }
        .payment-card-content {
          flex-grow: 1;
        }
        .payment-card-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          align-items: center;
        }
        .payment-card-title {
          font-family: var(--font-title);
          font-weight: 600;
          color: #ffffff;
          font-size: 0.95rem;
        }
        .badge-local-hint {
          font-size: 0.7rem;
          padding: 2px 8px;
          background: rgba(142, 68, 173, 0.1);
          color: #9b59b6;
          border: 1px solid rgba(142, 68, 173, 0.2);
          border-radius: var(--radius-full);
          font-weight: 700;
        }
        .badge-crypto-hint {
          font-size: 0.7rem;
          padding: 2px 8px;
          background: rgba(241, 196, 15, 0.1);
          color: #f1c40f;
          border: 1px solid rgba(241, 196, 15, 0.2);
          border-radius: var(--radius-full);
          font-weight: 700;
        }
        .payment-card-desc {
          font-size: 0.85rem;
          color: var(--text-dim);
        }

        /* SUBMIT BUTTON */
        .btn-submit-order {
          width: 100%;
          background: var(--theme-color);
          color: #000000;
          padding: 16px;
          font-size: 1.1rem;
          box-shadow: 0 4px 20px var(--theme-glow);
          margin-top: 10px;
        }
        .btn-submit-order:hover:not(.btn-disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px var(--theme-glow);
        }

        /* SPINNER */
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #000000;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* --- RESPONSIVE --- */
        @media (max-width: 960px) {
          .order-grid {
            grid-template-columns: 1fr;
            gap: 30px;
          }
          .service-details-panel {
            position: relative;
            top: 0;
          }
        }

        @media (max-width: 480px) {
          .plans-selection-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}
