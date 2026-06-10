"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONFIG } from "../../data/config";

// --- SVG Icons ---
function LogOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  
  // Tab control: "orders", "stock", "import"
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);

  // Import form states
  const [importService, setImportService] = useState("tidal");
  const [rawInput, setRawInput] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  // UI state
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch stats
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!statsRes.ok) throw new Error("Error fetching stats.");
      const statsData = await statsRes.json();
      setStats(statsData);
      setAuthorized(true);

      // Fetch orders
      const ordersRes = await fetch("/api/admin/orders");
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData);
      }

      // Fetch stock
      const stockRes = await fetch("/api/admin/stock");
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        setStock(stockData);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    if (confirm("¿Seguro que deseas cerrar sesión?")) {
      await fetch("/api/admin/login", { method: "DELETE" });
      router.push("/admin/login");
    }
  };

  // Update order status (Paid, Expired, Failed)
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    if (newStatus === "paid" && !confirm("¿Confirmar que recibiste el pago para aprobar la orden?")) return;

    setActionLoadingId(orderId + newStatus);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || "Error al actualizar pedido.");

      // Refresh data
      await loadData();
      
      if (newStatus === "paid") {
        if (data.order.assignedAccount) {
          alert(`¡Pedido Aprobado! Cuenta asignada automáticamente: ${data.order.assignedAccount}`);
        } else {
          alert("¡Pedido Aprobado! (No hay cuentas disponibles en stock, deberás entregarla manualmente o cargar stock).");
        }
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setActionLoadingId("");
    }
  };

  // Delete account from stock
  const handleDeleteStock = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar esta cuenta del inventario?")) return;

    try {
      const res = await fetch("/api/admin/stock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        setStock(prev => prev.filter(item => item.id !== id));
        // Refresh stats
        const statsRes = await fetch("/api/admin/stats");
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } else {
        alert("Error al eliminar la cuenta.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Import stock (Google Sheets parsing)
  const handleImportStock = async (e) => {
    e.preventDefault();
    setImportError("");
    setImportMessage("");

    if (!rawInput.trim()) return setImportError("El campo de texto no puede estar vacío.");

    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: importService, rawInput })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Error al importar stock.");

      setImportMessage(data.message);
      setRawInput("");
      
      // Refresh stock data & stats
      await loadData();
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleCopyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  // Filter stock display
  const filteredStock = stock.filter(item => {
    if (stockFilter === "all") return true;
    if (stockFilter === "available") return !item.isUsed;
    if (stockFilter === "used") return item.isUsed;
    return item.service === stockFilter;
  });

  if (loading && !authorized) {
    return (
      <div className="admin-loading-screen">
        <span className="admin-spinner"></span>
        <p>Cargando panel de administrador...</p>
        <style jsx>{`
          .admin-loading-screen {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #08080a;
            color: #ffffff;
            gap: 16px;
          }
          .admin-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--accent-gold);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="admin-dashboard-wrapper">
      {/* HEADER */}
      <header className="admin-header glass-panel">
        <div className="container admin-header-inner">
          <div className="admin-brand">
            <span className="admin-brand-dot"></span>
            <h1>Panel Administrativo</h1>
          </div>
          
          <div className="admin-header-actions">
            <Link href="/" className="btn btn-secondary btn-sm-mobile">Ver Web</Link>
            <button onClick={handleLogout} className="btn btn-logout">
              <LogOutIcon />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="container admin-content-layout">
        
        {/* STATS OVERVIEW CARDS (Responsive Grid) */}
        {stats && (
          <section className="stats-grid animate-fade-in">
            {/* SOLS SALES */}
            <div className="stat-card glass-panel border-purple">
              <span className="stat-label">Ventas Yape/Plin</span>
              <strong className="stat-value text-purple">S/. {stats.totalRevenuePen}</strong>
            </div>

            {/* USD SALES */}
            <div className="stat-card glass-panel border-yellow">
              <span className="stat-label">Ventas Binance Pay</span>
              <strong className="stat-value text-yellow">$ {stats.totalRevenueUsd}</strong>
            </div>

            {/* PENDING ORDERS */}
            <div className="stat-card glass-panel border-cyan">
              <span className="stat-label">Pedidos Pendientes</span>
              <strong className="stat-value text-cyan">{stats.pendingOrders}</strong>
            </div>

            {/* STOCK SUMMARY */}
            <div className="stat-card glass-panel border-gold">
              <span className="stat-label">Cuentas Disponibles</span>
              <div className="stat-sub-grid">
                <div><span>Tidal:</span> <strong>{stats.activeStock.tidal}</strong></div>
                <div><span>Deezer:</span> <strong>{stats.activeStock.deezer}</strong></div>
                <div><span>Qobuz:</span> <strong>{stats.activeStock.qobuz}</strong></div>
              </div>
            </div>
          </section>
        )}

        {/* TAB CONTROLS */}
        <nav className="admin-tabs-nav glass-panel">
          <button
            onClick={() => setActiveTab("orders")}
            className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
          >
            Pedidos ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab("stock")}
            className={`tab-btn ${activeTab === "stock" ? "active" : ""}`}
          >
            Inventario Stock ({stock.length})
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`tab-btn ${activeTab === "import" ? "active" : ""}`}
          >
            <PlusIcon />
            <span>Cargar Stock</span>
          </button>
        </nav>

        {/* TAB 1: ORDERS LIST (MOBILE CARD VIEW FIRST) */}
        {activeTab === "orders" && (
          <section className="orders-section animate-fade-in">
            <h2>Gestión de Pedidos</h2>
            
            {orders.length === 0 ? (
              <div className="empty-panel glass-panel text-center">
                <p>No se han registrado pedidos todavía.</p>
              </div>
            ) : (
              <div className="orders-list-wrapper">
                {orders.map((o) => (
                  <div key={o.orderId} className={`order-admin-card glass-panel status-${o.status}`}>
                    <div className="order-card-header">
                      <div>
                        <span className="order-id">#{o.orderId}</span>
                        <span className="order-date">{new Date(o.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className={`status-badge badge-${o.status}`}>{o.status}</span>
                    </div>

                    <div className="order-card-body">
                      <div className="detail-line">
                        <span>Cliente:</span>
                        <strong>{o.fullName}</strong>
                      </div>
                      <div className="detail-line">
                        <span>WhatsApp:</span>
                        <a href={`https://wa.me/${o.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="whatsapp-client-link">
                          {o.whatsapp}
                        </a>
                      </div>
                      <div className="detail-line">
                        <span>Correo:</span>
                        <strong>{o.email}</strong>
                      </div>
                      <div className="detail-line">
                        <span>Servicio:</span>
                        <span className={`badge-service badge-${o.service}`}>{o.service.toUpperCase()} ({o.duration})</span>
                      </div>
                      <div className="detail-line">
                        <span>Pago:</span>
                        <strong>
                          {o.paymentMethod === "binance_pay" ? `Binance Pay ($ ${o.priceUsd})` : `Yape/Plin (${o.pricePen})`}
                        </strong>
                      </div>

                      {o.assignedAccount && (
                        <div className="assigned-account-box">
                          <span>Cuenta Entregada:</span>
                          <div className="account-text-copy">
                            <code>{o.assignedAccount}</code>
                            <button
                              onClick={() => handleCopyToClipboard(o.assignedAccount, o.orderId)}
                              className="btn-copy-mini"
                            >
                              <CopyIcon />
                              <span>{copiedId === o.orderId ? "Copiado!" : "Copiar"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {o.status === "pending" && (
                      <div className="order-card-actions">
                        <button
                          onClick={() => handleUpdateOrderStatus(o.orderId, "paid")}
                          className={`btn-action btn-approve ${actionLoadingId === o.orderId + "paid" ? "loading" : ""}`}
                          disabled={!!actionLoadingId}
                        >
                          Aprobar Pago
                        </button>
                        <button
                          onClick={() => handleUpdateOrderStatus(o.orderId, "expired")}
                          className="btn-action btn-expire"
                          disabled={!!actionLoadingId}
                        >
                          Expirar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: INVENTORY STOCK */}
        {activeTab === "stock" && (
          <section className="stock-section animate-fade-in">
            <div className="section-header-filters">
              <h2>Inventario de Cuentas</h2>
              
              <div className="stock-filter-tabs">
                <button onClick={() => setStockFilter("all")} className={`filter-btn ${stockFilter === "all" ? "active" : ""}`}>Todas</button>
                <button onClick={() => setStockFilter("available")} className={`filter-btn ${stockFilter === "available" ? "active" : ""}`}>Disponibles</button>
                <button onClick={() => setStockFilter("used")} className={`filter-btn ${stockFilter === "used" ? "active" : ""}`}>Entregadas</button>
                <button onClick={() => setStockFilter("tidal")} className={`filter-btn ${stockFilter === "tidal" ? "active" : ""}`}>Tidal</button>
                <button onClick={() => setStockFilter("deezer")} className={`filter-btn ${stockFilter === "deezer" ? "active" : ""}`}>Deezer</button>
                <button onClick={() => setStockFilter("qobuz")} className={`filter-btn ${stockFilter === "qobuz" ? "active" : ""}`}>Qobuz</button>
              </div>
            </div>

            {filteredStock.length === 0 ? (
              <div className="empty-panel glass-panel text-center">
                <p>No hay cuentas cargadas que coincidan con el filtro.</p>
              </div>
            ) : (
              <div className="stock-list-grid">
                {filteredStock.map((item) => (
                  <div key={item.id} className={`stock-item-card glass-panel ${item.isUsed ? "used" : "available"}`}>
                    <div className="stock-card-top">
                      <span className={`badge-service badge-${item.service}`}>{item.service.toUpperCase()}</span>
                      <span className={`stock-status-label ${item.isUsed ? "used" : "available"}`}>
                        {item.isUsed ? "Entregada" : "Disponible"}
                      </span>
                    </div>

                    <div className="stock-card-content">
                      <code>{item.accountData}</code>
                      {item.assignedToOrder && (
                        <span className="assigned-order-tag">Orden: #{item.assignedToOrder}</span>
                      )}
                    </div>

                    <div className="stock-card-actions">
                      <button
                        onClick={() => handleDeleteStock(item.id)}
                        className="btn-delete-stock"
                        title="Eliminar cuenta"
                      >
                        <TrashIcon />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: LOAD STOCK VIA GOOGLE SHEETS */}
        {activeTab === "import" && (
          <section className="import-section animate-fade-in">
            <h2>Carga Masiva de Stock (Google Sheets)</h2>
            <p className="section-instruction">
              Puedes copiar directamente la columna de tus cuentas desde Google Sheets (ej: columna de correo y contraseña) y pegarlas en el cuadro. El sistema extraerá y guardará el stock automáticamente.
            </p>

            {importMessage && <div className="success-alert">{importMessage}</div>}
            {importError && <div className="error-alert">{importError}</div>}

            <form onSubmit={handleImportStock} className="import-stock-form glass-panel">
              <div className="form-group">
                <label className="form-label">Selecciona la plataforma:</label>
                <select
                  value={importService}
                  onChange={(e) => setImportService(e.target.value)}
                  className="form-input form-select-input"
                  required
                >
                  <option value="tidal">Tidal</option>
                  <option value="deezer">Deezer</option>
                  <option value="qobuz">Qobuz</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Pega las celdas de Google Sheets o CSV:</label>
                <textarea
                  className="form-input form-textarea"
                  rows={8}
                  placeholder={`Ejemplo al pegar desde Google Sheets:\ncorreo1@gmail.com\tpassword123\ncorreo2@gmail.com\tpassword456\n\n(También se admite separar por dos puntos: correo@test.com:pass123)`}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  required
                  disabled={importLoading}
                ></textarea>
              </div>

              <button
                type="submit"
                className={`btn btn-primary import-submit-btn ${importLoading ? "btn-disabled" : ""}`}
                disabled={importLoading}
              >
                {importLoading ? "Procesando importación..." : "Importar y Cargar Stock"}
              </button>
            </form>
          </section>
        )}

      </div>

      <style jsx>{`
        .admin-dashboard-wrapper {
          min-height: 100vh;
          background: var(--bg-primary);
          color: #ffffff;
          padding-bottom: 60px;
        }

        /* --- HEADER --- */
        .admin-header {
          padding: 16px 0;
          border-radius: 0 0 var(--radius-md) var(--radius-md);
          border-top: none;
          margin-bottom: 40px;
        }
        .admin-header-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .admin-brand h1 {
          font-size: 1.25rem;
          margin: 0;
        }
        .admin-brand-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-gold);
          border-radius: 50%;
        }
        .admin-header-actions {
          display: flex;
          gap: 12px;
        }
        .btn-logout {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          font-size: 0.875rem;
          padding: 8px 16px;
        }
        .btn-logout:hover {
          background: #ef4444;
          color: #ffffff;
          transform: translateY(-1px);
        }

        /* --- STATS GRID --- */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .stat-label {
          font-size: 0.8rem;
          color: var(--text-dim);
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .stat-value {
          font-family: var(--font-title);
          font-size: 1.75rem;
          font-weight: 800;
        }
        .stat-sub-grid {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .stat-sub-grid div {
          display: flex;
          justify-content: space-between;
        }
        .stat-sub-grid strong {
          color: #ffffff;
        }

        /* Border highlights */
        .border-purple { border-left: 4px solid #8e44ad; }
        .border-yellow { border-left: 4px solid #f1c40f; }
        .border-cyan { border-left: 4px solid var(--accent-cyan); }
        .border-gold { border-left: 4px solid var(--accent-gold); }
        .text-purple { color: #9b59b6; }
        .text-yellow { color: #f1c40f; }
        .text-cyan { color: var(--accent-cyan); }

        /* --- TABS NAV --- */
        .admin-tabs-nav {
          display: flex;
          padding: 6px;
          gap: 8px;
          margin-bottom: 30px;
        }
        .tab-btn {
          flex: 1;
          padding: 12px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-title);
          font-weight: 600;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .tab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.02);
        }
        .tab-btn.active {
          background: var(--glass-bg-hover);
          color: var(--accent-gold);
          border: 1px solid var(--glass-border);
        }

        /* --- CONTENT GENERALS --- */
        h2 {
          font-size: 1.5rem;
          margin-bottom: 24px;
          font-family: var(--font-title);
        }

        .empty-panel {
          padding: 60px 40px;
          color: var(--text-dim);
        }

        /* --- TAB 1: ORDERS CARDS --- */
        .orders-list-wrapper {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        .order-admin-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
        }
        .order-admin-card.status-paid { border-left: 3px solid #10b981; }
        .order-admin-card.status-pending { border-left: 3px solid var(--accent-cyan); }
        .order-admin-card.status-expired { border-left: 3px solid var(--text-dim); }

        .order-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--glass-border);
          padding-bottom: 12px;
        }
        .order-id {
          font-family: var(--font-title);
          font-weight: 800;
          color: #ffffff;
          font-size: 1.05rem;
          margin-right: 10px;
        }
        .order-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }
        .status-badge {
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          text-transform: uppercase;
          font-weight: 700;
        }
        .status-badge.badge-paid { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
        .status-badge.badge-pending { background: rgba(0, 229, 255, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 229, 255, 0.2); }
        .status-badge.badge-expired { background: rgba(255, 255, 255, 0.05); color: var(--text-dim); border: 1px solid var(--glass-border); }

        .order-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-grow: 1;
        }
        .detail-line {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .detail-line strong {
          color: #ffffff;
        }
        .whatsapp-client-link {
          color: #25d366 !important;
          font-weight: 600;
        }
        .whatsapp-client-link:hover {
          text-decoration: underline;
        }
        .badge-service {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 700;
          color: #000000;
        }
        .badge-service.badge-tidal { background: var(--accent-cyan); }
        .badge-service.badge-deezer { background: var(--accent-magenta); color: #ffffff; }
        .badge-service.badge-qobuz { background: var(--accent-gold); }

        .assigned-account-box {
          margin-top: 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--glass-border);
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
        }
        .assigned-account-box span {
          color: var(--text-dim);
          display: block;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .account-text-copy {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .account-text-copy code {
          font-family: monospace;
          color: var(--accent-gold);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .btn-copy-mini {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.7rem;
        }
        .btn-copy-mini:hover {
          color: #ffffff;
        }

        .order-card-actions {
          display: flex;
          gap: 10px;
          margin-top: 20px;
          border-top: 1px solid var(--glass-border);
          padding-top: 16px;
        }
        .btn-action {
          flex: 1;
          padding: 10px;
          border-radius: var(--radius-sm);
          border: none;
          font-family: var(--font-title);
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: var(--transition-fast);
          text-align: center;
        }
        .btn-approve {
          background: #10b981;
          color: #ffffff;
        }
        .btn-approve:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-1px);
        }
        .btn-expire {
          background: var(--bg-tertiary);
          border: 1px solid var(--glass-border);
          color: var(--text-muted);
        }
        .btn-expire:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        /* --- TAB 2: INVENTORY STOCK --- */
        .section-header-filters {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }
        .stock-filter-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .filter-btn {
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-full);
          color: var(--text-muted);
          font-size: 0.8rem;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .filter-btn:hover {
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }
        .filter-btn.active {
          background: #ffffff;
          color: #000000;
          border-color: #ffffff;
        }

        .stock-list-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .stock-item-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-top: 3px solid var(--glass-border);
        }
        .stock-item-card.available { border-top-color: #10b981; }
        .stock-item-card.used { border-top-color: var(--text-dim); opacity: 0.7; }

        .stock-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .stock-status-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .stock-status-label.available { color: #10b981; }
        .stock-status-label.used { color: var(--text-dim); }

        .stock-card-content {
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .stock-card-content code {
          font-family: monospace;
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 4px;
          font-size: 0.85rem;
          word-break: break-all;
        }
        .assigned-order-tag {
          font-size: 0.75rem;
          color: var(--text-dim);
          font-weight: 600;
        }

        .btn-delete-stock {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #ef4444;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: var(--transition-fast);
          width: 100%;
          justify-content: center;
        }
        .btn-delete-stock:hover {
          background: #ef4444;
          color: #ffffff;
        }

        /* --- TAB 3: IMPORT --- */
        .section-instruction {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 24px;
          max-width: 600px;
        }
        .import-stock-form {
          padding: 30px;
          max-width: 600px;
        }
        .form-select-input {
          cursor: pointer;
          background-color: var(--bg-secondary);
        }
        .form-select-input option {
          background-color: var(--bg-secondary);
        }
        .form-textarea {
          resize: vertical;
          font-family: monospace;
          font-size: 0.875rem;
        }
        .import-submit-btn {
          width: 100%;
          margin-top: 10px;
          padding: 14px;
        }

        .success-alert {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #10b981;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          margin-bottom: 24px;
          max-width: 600px;
        }
        .error-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          margin-bottom: 24px;
          max-width: 600px;
        }

        /* --- RESPONSIVE LAYOUT (MOBILE OPTIMIZED) --- */
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .stock-list-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .admin-header {
            margin-bottom: 24px;
          }
          .admin-brand h1 {
            font-size: 1.1rem;
          }
          .btn-logout span {
            display: none; /* Icon only on mobile log out */
          }
          .btn-logout {
            padding: 8px 12px;
          }
          .btn-sm-mobile {
            padding: 8px 12px;
            font-size: 0.8rem;
          }
          .stats-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .admin-tabs-nav {
            flex-direction: column;
            gap: 4px;
            padding: 4px;
          }
          .tab-btn {
            padding: 10px;
            font-size: 0.85rem;
          }
          .orders-list-wrapper {
            grid-template-columns: 1fr;
          }
          .stock-list-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .import-stock-form {
            padding: 20px 16px;
          }
        }
      `}</style>
    </div>
  );
}
