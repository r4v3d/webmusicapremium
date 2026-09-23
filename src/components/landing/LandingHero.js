"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONFIG } from "../../data/config";

function WaveLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-icon">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
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

export default function LandingHero() {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const heroRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const checkVideoSrc = () => {
      const isPC = window.innerWidth > 1024;
      setVideoSrc(isPC ? "/video/video-1.mp4" : "/video_celular/video_celular1.mp4");
    };
    checkVideoSrc();
    window.addEventListener("resize", checkVideoSrc);
    const timer = setTimeout(() => setVideoLoaded(true), 500);
    return () => {
      window.removeEventListener("resize", checkVideoSrc);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!videoLoaded || !videoSrc) return undefined;
    const videoElement = videoRef.current;
    const heroElement = heroRef.current;
    if (!videoElement || !heroElement) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoElement.play().catch(() => {});
          } else {
            videoElement.pause();
          }
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(heroElement);
    return () => observer.disconnect();
  }, [videoLoaded, videoSrc]);

  const pauseVideo = () => {
    if (videoRef.current) videoRef.current.pause();
  };

  return (
    <>
      <header className="site-header">
        <div className="container header-container">
          <Link href="/" className="logo-area">
            <WaveLogo />
            <span className="logo-text">{CONFIG.appName}</span>
          </Link>
          <nav className="main-nav">
            <a href="#servicios" className="nav-link" onClick={pauseVideo}>Servicios</a>
            <a href="#opiniones" className="nav-link" onClick={pauseVideo}>Referencias</a>
            <a href="#pagos" className="nav-link" onClick={pauseVideo}>Métodos de Pago</a>
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
              <a href="#servicios" className="btn btn-primary" onClick={pauseVideo}>Ver Planes Disponibles</a>
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
        <a href="#servicios" className="hero-scroll-down" onClick={pauseVideo} aria-label="Desplazarse a Servicios">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="scroll-arrow-icon">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </a>
      </section>
    </>
  );
}
