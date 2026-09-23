import Link from "next/link";
import { CONFIG } from "../data/config";
import ReferencesGallery from "../components/ReferencesGallery";
import LandingHero from "../components/landing/LandingHero";

function TidalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="service-logo-svg">
      <path d="M12 5.376l3.312 3.312-3.312 3.312-3.312-3.312zM6.624 10.752l3.312 3.312-3.312 3.312-3.312-3.312zM17.376 10.752l3.312 3.312-3.312 3.312-3.312-3.312zM12 16.128l3.312 3.312-3.312 3.312-3.312-3.312z" />
    </svg>
  );
}

function DeezerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="service-logo-svg">
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="service-logo-svg">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  );
}

function WaveLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-icon">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  );
}

const SERVICE_ICONS = {
  tidal: TidalIcon,
  deezer: DeezerIcon,
  qobuz: QobuzIcon,
};

const SERVICE_BADGES = {
  tidal: { className: "badge badge-cyan", label: "Audio HiFi" },
  deezer: { className: "badge badge-magenta", label: "Flow & HiFi" },
  qobuz: { className: "badge badge-gold", label: "Studio Hi-Res" },
};

function getStartingPrice(serviceKey) {
  const service = CONFIG.services[serviceKey];
  if (service && service.plans.length > 0) {
    return `S/ ${Math.min(...service.plans.map((p) => p.pricePen)).toFixed(2)}`;
  }
  return "S/ 0.00";
}

export default function Home() {
  return (
    <div className="landing-wrapper">
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      <LandingHero />

      <section id="servicios" className="services-section section-padding">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Elige Tu Plataforma</h2>
            <p className="section-subtitle">
              Soporte de alta fidelidad, descargas y reproducción ilimitada sin anuncios.
            </p>
          </div>

          <div className="services-grid">
            {Object.keys(CONFIG.services).map((key) => {
              const service = CONFIG.services[key];
              const Icon = SERVICE_ICONS[key];
              const badge = SERVICE_BADGES[key];
              return (
                <div key={key} className={`service-card glass-panel theme-${key}`}>
                  <div className="card-accent-line"></div>
                  <div className="service-card-header">
                    <div className="service-logo-box">
                      <Icon />
                    </div>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <h3 className="service-name">{service.name}</h3>
                  <p className="service-card-tagline">{service.tagline}</p>
                  <p className="service-card-desc">{service.description}</p>
                  <div className="service-price-info">
                    <span className="price-label">Desde</span>
                    <span className="price-amount">{getStartingPrice(key)}</span>
                    <span className="price-period">/ mes</span>
                  </div>
                  <ul className="service-features-list">
                    {service.features.slice(0, 4).map((feat) => (
                      <li key={feat}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/order/${key}`} className="btn btn-service-action">
                    Realizar Pedido {service.name}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="opiniones" className="testimonials-section section-padding">
        <div className="container">
          <div className="section-header">
            <span className="badge badge-gold">Referencias</span>
            <h2 className="section-title">Clientes Satisfechos</h2>
            <p className="section-subtitle">
              La confianza de nuestros clientes es nuestra mayor garantía. Capturas reales de opiniones.
            </p>
          </div>

          <div className="testimonials-grid">
            {CONFIG.testimonials.map((t) => (
              <div key={t.id} className="testimonial-card glass-panel">
                <div className="testimonial-header">
                  <div className="user-avatar-placeholder">
                    {t.name.charAt(0)}
                  </div>
                  <div className="user-meta">
                    <h4 className="user-name">{t.name}</h4>
                    <span className="user-service-tag">{t.service} Premium</span>
                  </div>
                  <div className="testimonial-stars">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <StarIcon key={i} />
                    ))}
                  </div>
                </div>
                <p className="testimonial-comment">&ldquo;{t.comment}&rdquo;</p>
                <div className="testimonial-footer">
                  <span className="testimonial-date">{t.date}</span>
                  <span className="verified-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Compra Verificada
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="gallery-scroll-indicator-wrap">
            <a href="#referencias" className="gallery-scroll-indicator">
              <span>Capturas de pantalla y comentarios de clientes</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="indicator-arrow">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            </a>
          </div>
        </div>
      </section>

      <section id="referencias" className="reference-images-section section-padding">
        <div className="container">
          <ReferencesGallery images={CONFIG.referenceImages} />
        </div>
      </section>

      <section id="pagos" className="payments-section section-padding">
        <div className="container">
          <div className="payments-box glass-panel">
            <div className="payments-content">
              <span className="badge badge-cyan">Seguridad y Flexibilidad</span>
              <h2 className="payments-title">Múltiples Medios de Pago</h2>
              <p className="payments-desc">
                Facilitamos tu compra mediante métodos de transferencia nacional inmediata y pagos internacionales descentralizados en criptomonedas (Binance Pay).
              </p>
              <div className="methods-showcase">
                <div className="method-item">
                  <div className="method-logo-placeholder yape">Yape</div>
                  <span>Pago móvil nacional</span>
                </div>
                <div className="method-item">
                  <div className="method-logo-placeholder plin">Plin</div>
                  <span>Transferencia interbancaria</span>
                </div>
                <div className="method-item">
                  <div className="method-logo-placeholder binance">Binance Pay</div>
                  <span>Criptomonedas / USDT</span>
                </div>
              </div>
            </div>
            <div className="payment-steps-list">
              <h3>¿Cómo comprar tu cuenta?</h3>
              <div className="step-row">
                <div className="step-num">1</div>
                <div className="step-txt">
                  <strong>Elige tu cuenta:</strong> Escoge Tidal, Deezer o Qobuz y haz clic en &ldquo;Realizar Pedido&rdquo;.
                </div>
              </div>
              <div className="step-row">
                <div className="step-num">2</div>
                <div className="step-txt">
                  <strong>Ingresa tus datos:</strong> Coloca tu correo, nombre y número de WhatsApp en el formulario.
                </div>
              </div>
              <div className="step-row">
                <div className="step-num">3</div>
                <div className="step-txt">
                  <strong>Paga y Confirma:</strong> Escanea el QR (Yape/Plin/Binance) y envía tu comprobante para la activación inmediata.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <Link href="/" className="logo-area">
              <WaveLogo />
              <span className="logo-text">{CONFIG.appName}</span>
            </Link>
            <p className="brand-tagline">{CONFIG.tagline}</p>
          </div>
          <div className="footer-links-group">
            <h4>Enlaces Rápidos</h4>
            <a href="#servicios">Servicios</a>
            <a href="#opiniones">Referencias</a>
            <a href="#pagos">Métodos de Pago</a>
          </div>
          <div className="footer-links-group">
            <h4>Nuestras Redes</h4>
            <a href={CONFIG.socials.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href={CONFIG.socials.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href={CONFIG.socials.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>
            <a href={CONFIG.whatsappChannelUrl} target="_blank" rel="noopener noreferrer" className="highlight-link">
              Canal de WhatsApp
            </a>
          </div>
        </div>
        <div className="container footer-bottom">
          <p>&copy; {new Date().getFullYear()} {CONFIG.appName}. Todos los derechos reservados.</p>
          <p className="footer-note">Cuentas premium estables con soporte y garantía activa.</p>
        </div>
      </footer>
    </div>
  );
}
