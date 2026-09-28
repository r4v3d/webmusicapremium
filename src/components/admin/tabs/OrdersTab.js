"use client";

import { useEffect } from "react";
import { useAdmin } from "../AdminContext";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  RelativeTime,
  SecretField,
  buildDeliveryMessage,
  formatDatePe,
  formatMoney,
  readUrlParam,
  setUrlParam,
  whatsappUrl,
} from "../adminUi";

// Filtros agrupados: "Abiertos" incluye los que esperan pago o están incompletos.
const FILTERS = {
  pending: ["pending", "awaiting_payment", "underpaid"],
  paid: ["paid", "delivered"],
  expired: ["expired", "cancelled", "refunded"],
};
const FILTER_LABELS = { pending: "Abiertos", paid: "Pagados", expired: "Cerrados", all: "Todos" };

export default function OrdersTab() {
  const {
    actionLoadingId,
    copiedId,
    handleCopyToClipboard,
    handleUpdateOrderStatus,
    handleResendCredentials,
    handleRefundOrder,
    orderSearchQuery,
    orderStatusFilter,
    orders,
    setOrderSearchQuery,
    setOrderStatusFilter,
    isOrdersLoading,
  } = useAdmin();

  // Búsqueda y filtro viven también en la URL (?q=&estado=) para recargar o compartir la vista.
  useEffect(() => {
    const q = readUrlParam("q");
    const estado = readUrlParam("estado");
    if (q) setOrderSearchQuery(q);
    if (estado && (FILTERS[estado] || estado === "all")) setOrderStatusFilter(estado);
    // Solo al montar: después manda lo que escribe el usuario.
  }, []);
  const changeSearch = (value) => {
    setOrderSearchQuery(value);
    setUrlParam("q", value);
  };
  const changeFilter = (value) => {
    setOrderStatusFilter(value);
    setUrlParam("estado", value === "pending" ? "" : value);
  };

  const query = (orderSearchQuery || "").toLowerCase().trim();
  const filtered = orders.filter((o) => {
    if (orderStatusFilter !== "all" && !(FILTERS[orderStatusFilter] || [orderStatusFilter]).includes(o.status)) return false;
    if (!query) return true;
    return [o.orderId, o.fullName, o.whatsapp, o.email, o.service]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query));
  });

  const amountOf = (o) => {
    if (o.payCurrency === "USDT" && o.amountUsdt != null) return formatMoney(o.amountUsdt, "USDT");
    if (o.amountPen != null) return formatMoney(o.amountPen, "PEN");
    return o.paymentMethod === "binance_pay" ? `$ ${o.priceUsd}` : o.pricePen; // pedidos antiguos
  };

  return (
    <section className="orders-section animate-fade-in">
      <h2>Gestión de Pedidos</h2>
      <div className="admin-filter-row">
        <input
          type="search"
          className="form-input"
          placeholder="Buscar nombre, WhatsApp o MPB-"
          value={orderSearchQuery}
          onChange={(e) => changeSearch(e.target.value)}
        />
        <div className="stock-filter-tabs">
          {["pending", "paid", "expired", "all"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => changeFilter(status)}
              className={`filter-btn ${orderStatusFilter === status ? "active" : ""}`}
            >
              {FILTER_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>
            {isOrdersLoading
              ? "Cargando pedidos…"
              : orders.length === 0
              ? "No se han registrado pedidos todavía."
              : "Ningún pedido coincide con el filtro."}
          </p>
        </div>
      ) : (
        <div className="orders-list-wrapper">
          {filtered.map((o) => {
            const open = FILTERS.pending.includes(o.status);
            const settled = FILTERS.paid.includes(o.status);
            const noStock = o.status === "paid" && !o.assignedAccount;
            return (
              <div key={o.orderId} className={`order-admin-card glass-panel status-${o.status}`}>
                <div className="order-card-header">
                  <div>
                    <span className="order-id">#{o.orderId}</span>
                    <span className="order-date"><RelativeTime value={o.createdAt} /></span>
                  </div>
                  <span className={`status-badge badge-${o.status}`}>
                    {noStock ? "Pagado sin stock" : o.status === "paid" ? "Pagado, sin entregar" : STATUS_LABELS[o.status] || o.status}
                  </span>
                </div>

                <div className="order-card-body">
                  <div className="detail-line"><span>Cliente:</span><strong>{o.fullName}</strong></div>
                  {o.whatsapp && (
                    <div className="detail-line">
                      <span>WhatsApp:</span>
                      <a href={`https://wa.me/${(o.whatsapp || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="whatsapp-client-link">{o.whatsapp}</a>
                    </div>
                  )}
                  <div className="detail-line"><span>Correo:</span><strong>{o.email || "—"}</strong></div>
                  <div className="detail-line">
                    <span>Servicio:</span>
                    <span className={`badge-service badge-${o.service}`}>{String(o.service || "").toUpperCase()} ({o.duration}){o.renewSubscriptionId ? " · renovación" : ""}</span>
                  </div>
                  <div className="detail-line">
                    <span>Pago:</span>
                    <strong>{amountOf(o)}{o.paymentMethod ? ` · ${PROVIDER_LABELS[o.paymentMethod] || o.paymentMethod}` : ""}</strong>
                  </div>
                  {o.salesChannel && o.salesChannel !== "web" && (
                    <div className="detail-line"><span>Canal:</span><strong>{o.salesChannel}</strong></div>
                  )}
                  {o.paidAt && <div className="detail-line"><span>Pagado:</span><strong>{formatDatePe(o.paidAt)}</strong></div>}
                  {o.lastDeliveryError && o.status === "paid" && (
                    <div className="detail-line"><span>Entrega:</span><strong style={{ color: "#f87171" }}>{o.lastDeliveryError}</strong></div>
                  )}

                  {o.assignedAccount && (
                    <div className="assigned-account-box">
                      <span>Cuenta entregada:</span>
                      <SecretField value={o.assignedAccount} copyId={o.orderId} copiedId={copiedId} onCopy={handleCopyToClipboard} />
                      {o.whatsapp && (
                        <a
                          href={whatsappUrl(o.whatsapp, buildDeliveryMessage(o, o.assignedAccount))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="order-wa-delivery"
                        >
                          Enviar credenciales por WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {(open || settled) && (
                  <div className="order-card-actions">
                    {open && (
                      <>
                        <button
                          onClick={() => handleUpdateOrderStatus(o.orderId, "paid")}
                          className={`btn-action btn-approve ${actionLoadingId === o.orderId + "paid" ? "loading" : ""}`}
                          disabled={!!actionLoadingId}
                        >
                          Confirmar pago
                        </button>
                        {o.status !== "underpaid" && (
                          <button onClick={() => handleUpdateOrderStatus(o.orderId, "expired")} className="btn-action btn-expire" disabled={!!actionLoadingId}>
                            Expirar
                          </button>
                        )}
                      </>
                    )}
                    {settled && (
                      <>
                        <button onClick={() => handleResendCredentials(o.orderId)} className="btn-action btn-approve" disabled={!!actionLoadingId}>
                          {noStock ? "Completar entrega" : "Reenviar credenciales"}
                        </button>
                        <button onClick={() => handleRefundOrder(o.orderId)} className="btn-action btn-expire" disabled={!!actionLoadingId}>
                          Reembolsar al saldo
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
