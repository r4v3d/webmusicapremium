"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONFIG } from "../data/config";
import ReferencesGallery from "../components/ReferencesGallery";

// --- SVG Icons Components ---
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

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.437.002 9.861-4.416 9.863-9.864.001-2.639-1.024-5.12-2.887-6.985C16.38 1.892 13.9 .867 11.26.867 5.823.867 1.4 5.285 1.398 10.722c-.001 1.52.397 3.004 1.155 4.3l-.955 3.49 3.57-.936c1.238.677 2.625 1.033 4.073 1.036-.002 0-.002 0 0 0zm11.365-7.616c-.303-.151-1.793-.883-2.072-.985-.278-.102-.48-.152-.68.151-.202.303-.781.985-.957 1.186-.176.202-.353.227-.656.076-.303-.151-1.28-.472-2.438-1.503-.9-.802-1.507-1.793-1.684-2.095-.176-.303-.019-.467.132-.617.136-.135.303-.353.454-.529.151-.176.202-.303.303-.505.102-.202.05-.379-.026-.53-.076-.151-.68-1.638-.93-2.24-.244-.587-.49-.508-.68-.517-.176-.008-.379-.009-.58-.009-.202 0-.53.076-.807.379-.278.303-1.062 1.038-1.062 2.532 0 1.493 1.087 2.932 1.238 3.134.151.202 2.139 3.268 5.183 4.582.724.312 1.29.5 1.731.64.727.231 1.39.198 1.914.12.584-.087 1.794-.733 2.047-1.44.253-.706.253-1.312.176-1.44-.076-.126-.278-.202-.58-.353z" />
    </svg>
  );
}

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

export default function Home() {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const heroRef = useRef(null);
  const videoRef = useRef(null);

  // Defer video loading to ensure initial page speed remains ultra-fast
  useEffect(() => {
    const checkVideoSrc = () => {
      const isPC = window.innerWidth > 1024;
      const src = isPC ? "/video/video-1.mp4" : "/video_celular/video_celular1.mp4";
      setVideoSrc(src);
    };

    checkVideoSrc();
    window.addEventListener("resize", checkVideoSrc);

    const timer = setTimeout(() => {
      setVideoLoaded(true);
    }, 500);

    return () => {
      window.removeEventListener("resize", checkVideoSrc);
      clearTimeout(timer);
    };
  }, []);

  // IntersectionObserver to pause/play the video based on visibility
  useEffect(() => {
    if (!videoLoaded || !videoSrc) return;
    const videoElement = videoRef.current;
    const heroElement = heroRef.current;
    if (!videoElement || !heroElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoElement.play().catch((err) => {
              console.log("Video playback was interrupted or blocked:", err);
            });
          } else {
            videoElement.pause();
          }
        });
      },
      {
        threshold: 0.05,
      }
    );

    observer.observe(heroElement);
    return () => {
      observer.disconnect();
    };
  }, [videoLoaded, videoSrc]);

  // Handle smooth scroll to top when clicking logo
  const handleLogoClick = (e) => {
    if (window.location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (window.location.hash) {
        window.history.pushState(null, "", "/");
      }
    }
  };

  // Immediate pause of the video when a section navigation button is clicked
  const handleSectionLinkClick = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  // Get prices dynamically to display starting values
  const getStartingPrice = (serviceKey) => {
    const service = CONFIG.services[serviceKey];
    if (service && service.plans.length > 0) {
      return service.plans[0].pricePen;
    }
    return "S/. 0.00";
  };

  return (
    <div className="landing-wrapper">
      {/* BACKGROUND ELEMENTS */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {/* HEADER / NAVBAR */}
      <header className="site-header">
        <div className="container header-container">
          <Link href="/" className="logo-area" onClick={handleLogoClick}>
            <WaveLogo />
            <span className="logo-text">{CONFIG.appName}</span>
          </Link>
          <nav className="main-nav">
            <a href="#servicios" className="nav-link" onClick={handleSectionLinkClick}>Servicios</a>
            <a href="#opiniones" className="nav-link" onClick={handleSectionLinkClick}>Referencias</a>
            <a href="#pagos" className="nav-link" onClick={handleSectionLinkClick}>Métodos de Pago</a>
            <Link href="/login" className="nav-link">Mi Cuenta</Link>
          </nav>
          <a
            href={`https://wa.me/${CONFIG.whatsappNumber}?text=Hola!%20Me%20gustaría%20saber%20más%20sobre%20las%20cuentas%20premium.`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary nav-btn"
          >
            <WhatsAppIcon />
            <span className="nav-btn-text">Chatear por WhatsApp</span>
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <section ref={heroRef} className="hero-section section-padding">
        {videoLoaded && videoSrc && (
          <div className="hero-video-bg-wrap">
            <video
              key={videoSrc}
              ref={videoRef}
              src={videoSrc}
              loop
              muted
              playsInline
              autoPlay
              className="hero-video-bg"
            />
            <div className="hero-video-overlay"></div>
          </div>
        )}
        <div className="container hero-container">
          <div className="hero-content">
            <span className="badge badge-gold hero-badge">Premium a Bajo Costo</span>
            <h1 className="hero-title">
              Tu música favorita en la <span>máxima calidad</span> y sin interrupciones.
            </h1>
            <p className="hero-subtitle">
              Ofrecemos cuentas 100% estables de <strong>Tidal</strong>, <strong>Deezer</strong> y <strong>Qobuz</strong> con garantía total. Activa tu cuenta hoy mismo de forma fácil y segura.
            </p>
            <div className="hero-actions">
              <a href="#servicios" className="btn btn-primary" onClick={handleSectionLinkClick}>Ver Planes Disponibles</a>
              <Link href="/login" className="btn btn-secondary flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2 inline-block animate-pulse"></span>
                <span>Mi Cuenta (Ver Credenciales)</span>
              </Link>
            </div>
          </div>
          <div className="hero-visual animate-float">
            <div className="visual-card-wrapper glass-panel">
              <div className="visual-header">
                <div className="dot red"></div>
                <div className="dot yellow"></div>
                <div className="dot green"></div>
              </div>
              <div className="visual-body">
                <div className="streaming-track-bar">
                  <div className="service-icon-wrap cyan"><TidalIcon /></div>
                  <div className="track-details">
                    <span className="track-name">Calidad de Audio Master</span>
                    <span className="track-desc">Tidal HiFi Plus - 24-bit 192kHz</span>
                  </div>
                </div>
                <div className="streaming-track-bar">
                  <div className="service-icon-wrap magenta"><DeezerIcon /></div>
                  <div className="track-details">
                    <span className="track-name">Flow Personalizado</span>
                    <span className="track-desc">Deezer HiFi - FLAC 16-bit</span>
                  </div>
                </div>
                <div className="streaming-track-bar">
                  <div className="service-icon-wrap gold"><QobuzIcon /></div>
                  <div className="track-details">
                    <span className="track-name">Estudio de Grabación</span>
                    <span className="track-desc">Qobuz Hi-Res - Sonido Puro</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <a href="#servicios" className="hero-scroll-down" onClick={handleSectionLinkClick} aria-label="Desplazarse a Servicios">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="scroll-arrow-icon">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </a>
      </section>

      {/* SERVICES SECTION */}
      <section id="servicios" className="services-section section-padding">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Elige Tu Plataforma</h2>
            <p className="section-subtitle">
              Soporte de alta fidelidad, descargas y reproducción ilimitada sin anuncios.
            </p>
          </div>

          <div className="services-grid">
            {/* TIDAL */}
            <div className="service-card glass-panel theme-tidal">
              <div className="card-accent-line"></div>
              <div className="service-card-header">
                <div className="service-logo-box">
                  <TidalIcon />
                </div>
                <span className="badge badge-cyan">Audio HiFi</span>
              </div>
              <h3 className="service-name">{CONFIG.services.tidal.name}</h3>
              <p className="service-card-tagline">{CONFIG.services.tidal.tagline}</p>
              <p className="service-card-desc">{CONFIG.services.tidal.description}</p>
              
              <div className="service-price-info">
                <span className="price-label">Desde</span>
                <span className="price-amount">{getStartingPrice("tidal")}</span>
                <span className="price-period">/ mes</span>
              </div>

              <ul className="service-features-list">
                {CONFIG.services.tidal.features.slice(0, 4).map((feat, index) => (
                  <li key={index}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link href="/order/tidal" className="btn btn-service-action">
                Realizar Pedido Tidal
              </Link>
            </div>

            {/* DEEZER */}
            <div className="service-card glass-panel theme-deezer">
              <div className="card-accent-line"></div>
              <div className="service-card-header">
                <div className="service-logo-box">
                  <DeezerIcon />
                </div>
                <span className="badge badge-magenta">Flow & HiFi</span>
              </div>
              <h3 className="service-name">{CONFIG.services.deezer.name}</h3>
              <p className="service-card-tagline">{CONFIG.services.deezer.tagline}</p>
              <p className="service-card-desc">{CONFIG.services.deezer.description}</p>
              
              <div className="service-price-info">
                <span className="price-label">Desde</span>
                <span className="price-amount">{getStartingPrice("deezer")}</span>
                <span className="price-period">/ mes</span>
              </div>

              <ul className="service-features-list">
                {CONFIG.services.deezer.features.slice(0, 4).map((feat, index) => (
                  <li key={index}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link href="/order/deezer" className="btn btn-service-action">
                Realizar Pedido Deezer
              </Link>
            </div>

            {/* QOBUZ */}
            <div className="service-card glass-panel theme-qobuz">
              <div className="card-accent-line"></div>
              <div className="service-card-header">
                <div className="service-logo-box">
                  <QobuzIcon />
                </div>
                <span className="badge badge-gold">Studio Hi-Res</span>
              </div>
              <h3 className="service-name">{CONFIG.services.qobuz.name}</h3>
              <p className="service-card-tagline">{CONFIG.services.qobuz.tagline}</p>
              <p className="service-card-desc">{CONFIG.services.qobuz.description}</p>
              
              <div className="service-price-info">
                <span className="price-label">Desde</span>
                <span className="price-amount">{getStartingPrice("qobuz")}</span>
                <span className="price-period">/ mes</span>
              </div>

              <ul className="service-features-list">
                {CONFIG.services.qobuz.features.slice(0, 4).map((feat, index) => (
                  <li key={index}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link href="/order/qobuz" className="btn btn-service-action">
                Realizar Pedido Qobuz
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CLIENT TESTIMONIALS SECTION */}
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
                    {[...Array(t.rating)].map((_, i) => (
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

          {/* Helper indicator to scroll to image references */}
          <div className="gallery-scroll-indicator-wrap">
            <a href="#referencias" className="gallery-scroll-indicator" onClick={handleSectionLinkClick}>
              <span>Capturas de pantalla y comentarios de clientes</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="indicator-arrow">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* REFERENCE IMAGES SECTION */}
      <section id="referencias" className="reference-images-section section-padding">
        <div className="container">
          <ReferencesGallery images={CONFIG.referenceImages} />
        </div>
      </section>

      {/* PAYMENT METHODS SECTION */}
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

      {/* FOOTER */}
      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <Link href="/" className="logo-area" onClick={handleLogoClick}>
              <WaveLogo />
              <span className="logo-text">{CONFIG.appName}</span>
            </Link>
            <p className="brand-tagline">{CONFIG.tagline}</p>
          </div>
          
          <div className="footer-links-group">
            <h4>Enlaces Rápidos</h4>
            <a href="#servicios" onClick={handleSectionLinkClick}>Servicios</a>
            <a href="#opiniones" onClick={handleSectionLinkClick}>Referencias</a>
            <a href="#pagos" onClick={handleSectionLinkClick}>Métodos de Pago</a>
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
