"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function PendingOrderBanner() {
  const pathname = usePathname();
  const [pendingOrder, setPendingOrder] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkOrder = () => {
      const saved = localStorage.getItem("pendingCheckoutOrder");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const timeElapsed = Date.now() - parsed.createdAt;
          // Expiry limit: 15 minutes (900,000 ms)
          if (timeElapsed < 900000) {
            setPendingOrder(parsed);
            // Delay slightly for slide-in animation
            setTimeout(() => setVisible(true), 300);
          } else {
            localStorage.removeItem("pendingCheckoutOrder");
            setVisible(false);
            setPendingOrder(null);
          }
        } catch (e) {
          localStorage.removeItem("pendingCheckoutOrder");
          setVisible(false);
          setPendingOrder(null);
        }
      } else {
        setVisible(false);
        setPendingOrder(null);
      }
    };

    checkOrder();

    // Check periodically (every 5 seconds) to handle timer expiration or local storage changes
    const interval = setInterval(checkOrder, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      localStorage.removeItem("pendingCheckoutOrder");
      setPendingOrder(null);
    }, 400); // Wait for transition to end before removing from state
  };

  // Do not render anything if no order exists, if hidden, or if currently on a checkout page
  if (!pendingOrder || !visible || (pathname && pathname.startsWith("/checkout"))) return null;

  return (
    <div className={`pending-order-banner ${visible ? "show" : ""}`}>
      <div className="banner-content">
        <div className="banner-main-info">
          <div className="banner-pulse"></div>
          <span className="banner-text">
            Tienes una orden de <strong>{pendingOrder.serviceName}</strong> ({pendingOrder.planName}) por <strong>{pendingOrder.price}</strong> pendiente de pago.
          </span>
        </div>
        <div className="banner-actions">
          <Link href={`/checkout/${pendingOrder.orderId}`} className="btn-banner-action">
            Continuar al Pago
          </Link>
          <button onClick={handleDismiss} className="btn-banner-dismiss" aria-label="Descartar orden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
