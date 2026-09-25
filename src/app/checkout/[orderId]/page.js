"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
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

const OPEN_STATUSES = ["pending", "awaiting_payment", "underpaid"];
const CLOSED_INTENT = ["expired", "cancelled", "failed"];

function money(amount, currency) {
  const n = Number(amount) || 0;
  return currency === "USDT" ? `${n.toFixed(2)} USDT` : `S/ ${n.toFixed(2)}`;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function clearPendingBanner(orderId) {
  try {
    const saved = JSON.parse(localStorage.getItem("pendingCheckoutOrder") || "null");
    if (saved?.orderId === orderId) localStorage.removeItem("pendingCheckoutOrder");
  } catch {}
}

function CopyField({ label, value, copyValue, id, copied, onCopy, big = false }) {
  return (
    <div className="payment-field-item">
      <span className="field-label">{label}</span>
      <div className="field-value-wrap">
        <code className={big ? "field-code checkout-note-code" : "field-code"}>{value}</code>
        <button type="button" onClick={() => onCopy(copyValue ?? value, id)} className="btn-copy">
          <CopyIcon />
          <span>{copied === id ? "¡Copiado!" : "Copiar"}</span>
        </button>
      </div>
    </div>
  );
}

function QrBox({ src, alt, variant = "" }) {
  return (
    <div className="qr-code-holder">
      <div className={`qr-visual ${variant}`}>
        {src ? <img src={src} alt={alt} className="qr-image-display" /> : <span className="qr-logo-brand">{alt}</span>}
      </div>
    </div>
  );
}

function CheckoutLoading() {
  return (
    <div className="checkout-loading">
      <span className="page-spinner"></span>
      <p>Cargando información del pago...</p>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const { orderId } = useParams();
  // El token de acceso del pedido viaja en la URL (?t=...), §14.4.
  const token = useSearchParams().get("t") || "";
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [reference, setReference] = useState("");
  const [binanceOrderId, setBinanceOrderId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const autoStarted = useRef(false);

  const applyView = useCallback((data) => {
    setView(data);
    if (data?.order && !OPEN_STATUSES.includes(data.order.status)) clearPendingBanner(orderId);
  }, [orderId]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}?t=${encodeURIComponent(token || "")}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 404 ? "Pedido no encontrado. Abre el enlace completo que recibiste al crear el pedido." : "No se pudo cargar el pedido.");
    const data = await res.json();
    applyView(data);
    return data;
  }, [orderId, token, applyView]);

  const startIntent = useCallback(async (provider) => {
    setBusy(`intent:${provider}`);
    setNotice("");
    try {
      const res = await fetch("/api/payments/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token, provider, customerReference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.message || "No se pudo iniciar el pago.");
        if (data.code === "no_stock") await load().catch(() => {});
        return;
      }
      applyView(data);
    } catch {
      setNotice("Error de red. Intenta de nuevo.");
    } finally {
      setBusy("");
    }
  }, [orderId, token, reference, load, applyView]);

  // Carga inicial y arranque automático del intento con el proveedor por defecto.
  useEffect(() => {
    (async () => {
      try {
        const data = await load();
        const needsIntent = data.order.status === "pending" && (!data.intent || CLOSED_INTENT.includes(data.intent.status));
        if (needsIntent && data.defaultProviderId && !autoStarted.current) {
          autoStarted.current = true;
          await startIntent(data.defaultProviderId);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Polling cada 5 s mientras el pago esté abierto (§11.6 punto 4).
  const status = view?.order?.status;
  const waitingCredentials = ["paid", "delivered"].includes(status) && !view?.credentials && !view?.limited;
  useEffect(() => {
    if (!view || !(OPEN_STATUSES.includes(status) || waitingCredentials)) return undefined;
    const id = setInterval(() => { load().catch(() => {}); }, 5000);
    return () => clearInterval(id);
  }, [view, status, waitingCredentials, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const copy = (text, id) => {
    navigator.clipboard.writeText(String(text));
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  const refresh = async () => {
    if (!view?.intent) return;
    setBusy("refresh");
    setNotice("");
    try {
      const res = await fetch(`/api/payments/intents/${view.intent.id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, customerReference: reference || undefined }),
      });
      const data = await res.json();
      if (data.order) applyView(data);
      setNotice(data.message || "");
    } catch {
      setNotice("Error de red. Intenta de nuevo.");
    } finally {
      setBusy("");
    }
  };

  const claimBinance = async (e) => {
    e.preventDefault();
    setBusy("claim");
    setNotice("");
    try {
      const res = await fetch("/api/payments/binance/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token, binanceOrderId }),
      });
      const data = await res.json();
      if (data.order) applyView(data);
      setNotice(data.message || "");
    } catch {
      setNotice("Error de red. Intenta de nuevo.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <CheckoutLoading />;

  if (error || !view) {
    return (
      <div className="checkout-error">
        <div className="error-card glass-panel">
          <h2>Error de Checkout</h2>
          <p>{error || "El pedido no fue encontrado."}</p>
          <Link href="/" className="btn btn-primary">Volver al Inicio</Link>
        </div>
      </div>
    );
  }

  const { order, intent, credentials, providers, wallet } = view;
  const currency = order.currency;
  const amount = currency === "USDT" ? order.amountUsdt : order.amountPen;
  const serviceName = CONFIG.services[order.service]?.name || String(order.service || "").toUpperCase();
  const secondsLeft = intent?.expiresAt ? (new Date(intent.expiresAt).getTime() - now) / 1000 : null;
  const intentOpen = intent && !CLOSED_INTENT.includes(intent.status) && !["paid", "overpaid"].includes(intent.status);
  const supportLink = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(`Hola, necesito ayuda con mi pedido ${order.orderId} (${serviceName} ${order.duration}).`)}`;

  const renderPaid = () => (
    <div className="success-panel glass-panel text-center">
      <div className="success-icon-wrap"><CheckIcon /></div>
      <h1 className="success-title">¡Pago Confirmado!</h1>
      <p className="success-subtitle">
        {order.isRenewal
          ? <>Tu suscripción de <strong>{serviceName}</strong> quedó renovada{order.renewalDate ? <> hasta el <strong>{order.renewalDate}</strong></> : null}.</>
          : <>Tu cuenta premium de <strong>{serviceName} ({order.duration})</strong> está activa.</>}
      </p>

      {credentials ? (
        <div className="assigned-credentials-card glass-panel text-left">
          <h3>Tus Datos de Acceso Premium</h3>
          <p className="credentials-info-hint">Inicia sesión en la app oficial de {serviceName} con estos datos. También te los enviamos por correo.</p>
          <div className="credentials-row">
            <span className="cred-label">Usuario / Correo:</span>
            <div className="cred-value-wrap">
              <code>{credentials.email}</code>
              <button onClick={() => copy(credentials.email, "cred_user")} className="btn-copy-mini"><CopyIcon /><span>{copied === "cred_user" ? "¡Copiado!" : "Copiar"}</span></button>
            </div>
          </div>
          {credentials.password && (
            <div className="credentials-row">
              <span className="cred-label">Contraseña:</span>
              <div className="cred-value-wrap">
                <code>{credentials.password}</code>
                <button onClick={() => copy(credentials.password, "cred_pass")} className="btn-copy-mini"><CopyIcon /><span>{copied === "cred_pass" ? "¡Copiado!" : "Copiar"}</span></button>
              </div>
            </div>
          )}
          {order.renewalDate && <p className="credentials-info-hint">Vence el <strong>{order.renewalDate}</strong>.</p>}
        </div>
      ) : (
        <div className="no-credentials-assigned-card glass-panel">
          <p>
            {view.limited
              ? "Tu pago está confirmado. Por seguridad, las credenciales de este pedido se muestran en el enlace original o en tu correo."
              : order.awaitingStock
              ? "Tu pago está confirmado y estamos preparando tu cuenta. Te la enviamos por correo en cuanto esté lista; no necesitas hacer nada más."
              : "Estamos preparando tus credenciales…"}
          </p>
        </div>
      )}

      <div className="success-details-card">
        <h3>Detalles de la Orden</h3>
        <div className="detail-row"><span>ID de Pedido:</span><strong>#{order.orderId}</strong></div>
        <div className="detail-row"><span>Plataforma:</span><strong>{serviceName} Premium</strong></div>
        <div className="detail-row"><span>Periodo contratado:</span><strong>{order.duration}</strong></div>
        <div className="detail-row"><span>Monto:</span><strong className="success-amount">{money(amount, currency)}</strong></div>
        <div className="detail-row"><span>Correo registrado:</span><strong>{order.email}</strong></div>
      </div>

      <div className="success-actions">
        <a href={supportLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp"><WhatsAppIcon /><span>Soporte por WhatsApp</span></a>
        <Link href="/client/dashboard" className="btn btn-secondary">Ir a mi panel</Link>
      </div>
    </div>
  );

  const renderClosed = (title, text, retry = false) => (
    <div className="expired-panel glass-panel text-center">
      <h2>{title}</h2>
      <p>{text}</p>
      {notice && <p className="checkout-notice">{notice}</p>}
      <div className="success-actions">
        {retry && view.defaultProviderId && (
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => startIntent(view.defaultProviderId)}>
            {busy ? "Reservando…" : "Reintentar el pago"}
          </button>
        )}
        <Link href={`/order/${order.service}`} className="btn btn-secondary">Crear Nuevo Pedido</Link>
      </div>
    </div>
  );

  const renderInstructions = () => {
    if (!intentOpen) {
      return (
        <div className="payment-type-block">
          <h2>Preparando tu pago…</h2>
          <p className="payment-description">Estamos reservando tu cupo.</p>
        </div>
      );
    }
    const missing = intent.status === "underpaid" ? intent.missing : null;
    const toPay = missing ?? intent.amountExpected;

    if (intent.ui === "pay_id_note") {
      const ins = intent.instructions || {};
      return (
        <div className="payment-type-block">
          <h2>Pago con USDT · Binance Pay</h2>
          <p className="payment-description">
            <strong>1.</strong> Envía <strong>{money(toPay, "USDT")}</strong> por Binance Pay al Pay ID de abajo. No necesitas escribir ninguna nota.
          </p>
          <QrBox src={ins.qrImage} alt="Binance Pay" />
          <div className="payment-fields-list">
            <CopyField label="Binance Pay ID:" value={ins.payId} id="payid" copied={copied} onCopy={copy} />
            {ins.nickname && <div className="payment-field-item"><span className="field-label">Titular:</span><div className="field-value-wrap"><strong className="field-text">{ins.nickname}</strong></div></div>}
            <CopyField label="Monto exacto:" value={money(toPay, "USDT")} copyValue={Number(toPay).toFixed(2)} id="amount" copied={copied} onCopy={copy} />
          </div>
          <p className="payment-description">
            <strong>2.</strong> Al terminar, Binance te muestra el <strong>Order ID</strong> (un número largo). Cópialo, pégalo aquí y pulsa <strong>Verificar pago</strong>. Tus credenciales aparecen al instante.
          </p>
          <form className="checkout-inline-form" onSubmit={claimBinance}>
            <input className="form-input" inputMode="numeric" autoComplete="off" placeholder="Order ID de Binance, ej. 453229155575029760" value={binanceOrderId} onChange={(e) => setBinanceOrderId(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!!busy || binanceOrderId.replace(/\D/g, "").length < 8}>
              {busy === "claim" ? "Verificando…" : "Verificar pago"}
            </button>
          </form>
          <p className="credentials-info-hint">
            ¿No encuentras el Order ID? En Binance ve a <strong>Pay → Historial</strong> y abre el pago. Se acreditan hasta 3 decimales; si el monto llega por debajo, te mostramos cuánto falta.
          </p>
        </div>
      );
    }

    if (intent.ui === "dynamic_qr") {
      return (
        <div className="payment-type-block">
          <h2>Pago con Yape o Plin</h2>
          <p className="payment-description">Escanea el QR con Yape o Plin y paga <strong>{money(toPay, "PEN")}</strong>. La confirmación es automática.</p>
          <QrBox src={intent.qrImage} alt="QR de pago" variant="purple" />
          {intent.checkoutUrl && <a href={intent.checkoutUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Abrir en el móvil</a>}
        </div>
      );
    }

    // static_qr: Yape/Plin con verificación de un clic en el panel (§11.1).
    const ins = intent.instructions || {};
    return (
      <div className="payment-type-block">
        <h2>Pago con Yape o Plin</h2>
        <p className="payment-description">
          Transfiere <strong>exactamente {money(toPay, "PEN")}</strong>. No necesitas enviar capturas: verificamos el ingreso directamente en nuestra cuenta.
        </p>
        <div className="qrs-showcase-grid">
          <div className="qr-card">
            <QrBox src={ins.yape?.qrImage} alt="Yape" variant="purple" />
            <span className="qr-name">YAPE</span>
            <span className="qr-phone-number">{ins.yape?.number}</span>
          </div>
          <div className="qr-card">
            <QrBox src={ins.plin?.qrImage} alt="Plin" variant="blue" />
            <span className="qr-name">PLIN</span>
            <span className="qr-phone-number">{ins.plin?.number}</span>
          </div>
        </div>
        <div className="payment-fields-list">
          <div className="payment-field-item"><span className="field-label">Titular:</span><div className="field-value-wrap"><strong className="field-text">{ins.yape?.name}</strong></div></div>
          <CopyField label="Número celular:" value={ins.yape?.number} copyValue={String(ins.yape?.number || "").replace(/\s+/g, "")} id="phone" copied={copied} onCopy={copy} />
          <div className="payment-field-item"><span className="field-label">Total a transferir:</span><div className="field-value-wrap"><strong className="field-price">{money(toPay, "PEN")}</strong></div></div>
        </div>
        <label className="form-label" htmlFor="yape-ref">Para encontrar tu pago más rápido (opcional)</label>
        <input
          id="yape-ref"
          className="form-input"
          placeholder="Últimos 3 dígitos del Nº de operación o el nombre con el que yapeaste"
          value={reference}
          maxLength={80}
          onChange={(e) => setReference(e.target.value)}
        />
        <p className="credentials-info-hint">
          Tu pedido queda en verificación; normalmente tarda pocos minutos. {ins.reviewHours ? `Horario de verificación: ${ins.reviewHours}.` : ""}
        </p>
      </div>
    );
  };

  const renderPayment = () => (
    <div className="payment-grid">
      <section className="payment-details-card glass-panel">
        {(providers.length > 1 || wallet) && (
          <div className="checkout-provider-switch">
            {wallet && (
              <button
                type="button"
                className={`btn ${wallet.enough ? "btn-primary" : "btn-secondary"}`}
                disabled={!wallet.enough || !!busy}
                onClick={() => startIntent(wallet.providerId)}
                title={wallet.enough ? "" : "Tu saldo no alcanza"}
              >
                {busy === `intent:${wallet.providerId}` ? "Pagando…" : `Pagar con mi saldo (${money(wallet.balance, currency)})${wallet.enough ? " · inmediato" : " · insuficiente"}`}
              </button>
            )}
            {providers.length > 1 && providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn ${intent?.provider === p.id ? "btn-primary" : "btn-secondary"}`}
                disabled={!!busy || intent?.provider === p.id}
                onClick={() => startIntent(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {intent?.status === "underpaid" && (
          <div className="error-alert">
            Recibimos {money(intent.amountReceived, currency)}; faltan <strong>{money(intent.missing, currency)}</strong>. Envía la diferencia de la misma forma y se completa solo.
          </div>
        )}
        {renderInstructions()}
      </section>

      <section className="checkout-summary-panel">
        {secondsLeft !== null && intentOpen && intent.status !== "underpaid" && (
          <div className="timer-card glass-panel">
            <div className="timer-header"><ClockIcon /><span>Tu cupo está reservado por</span></div>
            <div className="timer-countdown">{formatTime(secondsLeft)}</div>
            <p className="timer-warning-hint">Paga antes de que termine la reserva para asegurar tu cupo.</p>
          </div>
        )}

        <div className="summary-details-card glass-panel">
          <h3>Resumen de la Orden</h3>
          <div className="summary-row"><span>Producto:</span><strong>{serviceName} Premium{order.isRenewal ? " (renovación)" : ""}</strong></div>
          <div className="summary-row"><span>Duración del plan:</span><strong>{order.duration}</strong></div>
          <div className="summary-row"><span>Método de pago:</span><strong className="payment-label-value">{intent?.label || "—"}</strong></div>
          <div className="summary-row"><span>Correo:</span><strong>{order.email}</strong></div>
          <div className="summary-total-row"><span>Total:</span><strong>{money(amount, currency)}</strong></div>
        </div>

        <div className="checkout-action-buttons">
          {intentOpen && (
            <button type="button" className="btn btn-primary checkout-btn" disabled={!!busy} onClick={refresh}>
              {busy === "refresh" ? "Revisando…" : "Ya pagué y no aparece"}
            </button>
          )}
          {notice && <p className="checkout-notice">{notice}</p>}
          <p className="credentials-info-hint">Cuando confirmemos tu pago, esta página se actualizará sola con tus credenciales.</p>
          <a href={supportLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp checkout-btn"><WhatsAppIcon /><span>¿Dudas? Soporte por WhatsApp</span></a>
        </div>
      </section>
    </div>
  );

  let body;
  if (["paid", "delivered"].includes(status)) body = renderPaid();
  else if (status === "expired") body = renderClosed("Pedido Expirado", "La reserva de tu cupo venció. Si ya pagaste, no te preocupes: lo verificamos igual. Si no, puedes reintentar el pago.", true);
  else if (status === "cancelled") body = renderClosed("Pedido cancelado", "No había stock disponible al momento del pago. No se te cobró nada.");
  else if (status === "refunded") body = renderClosed("Pedido reembolsado", "El monto de este pedido se devolvió a tu saldo. Puedes usarlo en tu próxima compra.");
  else body = renderPayment();

  return (
    <div className={`checkout-wrapper theme-${order.service}`}>
      <div className="checkout-bg-glow"></div>
      <div className="container">
        <header className="checkout-page-header">
          <Link href="/" className="checkout-brand">
            <span className="brand-dot"></span>
            <span>{CONFIG.appName}</span>
          </Link>
          <div className="order-badge-id">ID de Orden: <strong>#{order.orderId}</strong></div>
        </header>
        <main className="checkout-container animate-fade-in">
          {body}
        </main>
      </div>
    </div>
  );
}
