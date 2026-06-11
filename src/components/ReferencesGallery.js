"use client";

import { useState, useEffect } from "react";

export default function ReferencesGallery({ images = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [brokenImages, setBrokenImages] = useState({});

  const handleImageError = (index) => {
    setBrokenImages((prev) => ({ ...prev, [index]: true }));
  };

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function navigateLeft() {
    setLightboxIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }

  function navigateRight() {
    setLightboxIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") navigateRight();
      if (e.key === "ArrowLeft") navigateLeft();
    };

    window.addEventListener("keydown", handleKeyDown);
    // Prevent body scrolling when lightbox is open
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [lightboxIndex]);

  // Swipe gestures for mobile devices
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      navigateRight();
    } else if (isRightSwipe) {
      navigateLeft();
    }
  };

  // Determine which images to show based on expansion state
  const visibleImages = expanded ? images : images.slice(0, 6);
  const hasMore = images.length > 6;

  // Generic descriptions based on naming convention
  const getReferenceLabel = (path, index) => {
    if (path.includes("yape")) return "Captura Cliente Yape";
    if (path.includes("tidal")) return "Captura Activación Tidal";
    if (path.includes("binance")) return "Pago Binance Confirmado";
    return `Captura de Chat #${index + 1}`;
  };

  return (
    <div className="reference-images-block">
      <h3 className="reference-block-title">Capturas de Chat y Comprobantes</h3>
      <p className="reference-block-subtitle">
        Evidencia de atención rápida, activaciones y clientes conformes (coloca tus capturas en <code>/public/images/</code>):
      </p>

      {/* Grid of Images */}
      <div className="image-references-grid">
        {visibleImages.map((path, index) => {
          const isBroken = brokenImages[index];

          return (
            <div key={index} className="reference-gallery-card glass-panel">
              {!isBroken ? (
                <div className="card-image-wrapper" onClick={() => setLightboxIndex(index)}>
                  <img
                    src={path}
                    alt={getReferenceLabel(path, index)}
                    className="reference-screenshot-img"
                    onError={() => handleImageError(index)}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    loading="lazy"
                  />
                  <div className="image-hover-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      <line x1="11" y1="8" x2="11" y2="14"></line>
                      <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                    <span>Ampliar</span>
                  </div>
                </div>
              ) : (
                <div className="image-placeholder-card-inner">
                  <div className="placeholder-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </div>
                  <span className="placeholder-label">{getReferenceLabel(path, index)}</span>
                  <p className="placeholder-desc">Carga tu captura en: <code>/public{path}</code></p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More / Less button */}
      {hasMore && (
        <div className="gallery-actions-wrapper">
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-secondary load-more-btn"
          >
            <span>{expanded ? "Ver Menos" : `Ver Más Referencias (+${images.length - 6})`}</span>
          </button>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
        <div
          className="lightbox-overlay"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close-btn" onClick={closeLightbox} aria-label="Cerrar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <button className="lightbox-nav-btn prev-btn" onClick={navigateLeft} aria-label="Anterior">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            <div className="lightbox-image-container">
              <div className="lightbox-hint-label">
                Toca la derecha o desliza para ver más referencias
              </div>
              <div className="lightbox-image-wrapper">
                <img
                  src={images[lightboxIndex]}
                  alt={getReferenceLabel(images[lightboxIndex], lightboxIndex)}
                  className="lightbox-main-img"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                />
                <div className="lightbox-watermark-overlay" onContextMenu={(e) => e.preventDefault()}></div>
              </div>
              <span className="lightbox-counter-label">
                {lightboxIndex + 1} de {images.length}
              </span>
            </div>

            <button className="lightbox-nav-btn next-btn" onClick={navigateRight} aria-label="Siguiente">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
