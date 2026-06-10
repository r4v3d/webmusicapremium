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
  const [dbError, setDbError] = useState("");

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
      setDbError("");
      // Fetch stats
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!statsRes.ok) throw new Error("Error de servidor o conexión con base de datos.");
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
      setDbError("Error al cargar la información. Si estás en Vercel, asegúrate de configurar tu variable MONGODB_URI en la configuración del proyecto.");
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
      </div>
    );
  }

  if (!authorized) {
    if (dbError) {
      return (
        <div className="admin-error-screen">
          <div className="error-card glass-panel">
            <h2>Error del Servidor</h2>
            <p>{dbError}</p>
            <button onClick={loadData} className="btn btn-primary" style={{ width: "100%" }}>Reintentar</button>
          </div>
        </div>
      );
    }
    return null;
  }

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

        {/* TAB 1: ORDERS LIST */}
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

        {/* TAB 3: LOAD STOCK */}
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
    </div>
  );
}
