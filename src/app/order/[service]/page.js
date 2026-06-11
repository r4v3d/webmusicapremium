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

  const defaultPlan = serviceData && serviceData.plans.length > 0
    ? (serviceData.plans.find(p => p.popular) || serviceData.plans[0])
    : null;

  // Form states
  const [selectedPlan, setSelectedPlan] = useState(defaultPlan);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("yape_plin"); // yape_plin or binance_pay
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!serviceData) {
    return (
      <div className="error-wrapper">
        <div className="error-card glass-panel">
          <h2>Servicio No Encontrado</h2>
          <p>La plataforma solicitada no está disponible o no existe.</p>
          <Link href="/" className="btn btn-primary">Volver al Inicio</Link>
        </div>
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

      // Save order details to localStorage to allow recovery if they close/go back by accident
      localStorage.setItem("pendingCheckoutOrder", JSON.stringify({
        orderId: data.orderId,
        serviceName: serviceData.name,
        planName: selectedPlan.duration,
        price: paymentMethod === "binance_pay" ? `$ ${selectedPlan.priceUsd} USDT` : selectedPlan.pricePen,
        createdAt: Date.now()
      }));

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

    </div>
  );
}
