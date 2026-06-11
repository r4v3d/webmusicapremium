"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONFIG } from "../../data/config";

// --- COUNTRY MAP & FLAG HELPER ---
const COUNTRY_MAP = {
  "51": { code: "PE", name: "Perú", flag: "🇵🇪" },
  "54": { code: "AR", name: "Argentina", flag: "🇦🇷" },
  "56": { code: "CL", name: "Chile", flag: "🇨🇱" },
  "57": { code: "CO", name: "Colombia", flag: "🇨🇴" },
  "52": { code: "MX", name: "México", flag: "🇲🇽" },
  "34": { code: "ES", name: "España", flag: "🇪🇸" },
  "58": { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  "591": { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  "593": { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  "502": { code: "GT", name: "Guatemala", flag: "🇬🇹" }
};

function getCountryFlag(phoneNumber) {
  if (!phoneNumber) return "🌐";
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const prefix3 = cleanPhone.substring(0, 3);
  if (COUNTRY_MAP[prefix3]) return COUNTRY_MAP[prefix3].flag;
  const prefix2 = cleanPhone.substring(0, 2);
  if (COUNTRY_MAP[prefix2]) return COUNTRY_MAP[prefix2].flag;
  return "🌐";
}

// --- SVG Icons ---
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

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
  
  // Tab control: "orders", "stock", "import", "families"
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");

  // Families & Clients state
  const [familyAccounts, setFamilyAccounts] = useState([]);
  const [isFamiliesLoading, setIsFamiliesLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("familyAccounts"); // "familyAccounts" | "directory"

  // Client search/directory states
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isClientsLoading, setIsClientsLoading] = useState(false);

  // Bulk table states
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [tablePlatformFilter, setTablePlatformFilter] = useState("all");
  const [tableStatusFilter, setTableStatusFilter] = useState("all");
  const [tableExpiryFilter, setTableExpiryFilter] = useState("all");
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("status_active");
  const [bulkPriceValue, setBulkPriceValue] = useState("");
  const [bulkDateValue, setBulkDateValue] = useState("");
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  // Modals state
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [addFamilyForm, setAddFamilyForm] = useState({
    service: "tidal",
    masterEmail: "",
    password: "",
    notes: ""
  });
  const [addFamilyLoading, setAddFamilyLoading] = useState(false);

  const [showEditSlotModal, setShowEditSlotModal] = useState(false);
  const [editSlotForm, setEditSlotForm] = useState({
    profileId: "",
    clientNickname: "",
    clientWhatsApp: "",
    memberEmail: "",
    emailType: "admin",
    memberPassword: "",
    pricePen: 0,
    renewalDate: "",
    status: "free"
  });

  // Import form states
  const [importService, setImportService] = useState("tidal");
  const [importMode, setImportMode] = useState("master_accounts");
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
      if (!statsRes.ok) {
        const errData = await statsRes.json().catch(() => ({}));
        throw new Error(errData.message || "Error de servidor o conexión con base de datos.");
      }
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

      // Fetch family accounts
      setIsFamiliesLoading(true);
      const familiesRes = await fetch("/api/admin/family-accounts");
      if (familiesRes.ok) {
        const familiesData = await familiesRes.json();
        setFamilyAccounts(familiesData);
      }

    } catch (error) {
      console.error(error);
      setDbError(error.message || "Error al cargar la información.");
    } finally {
      setLoading(false);
      setIsFamiliesLoading(false);
    }
  };

  const handleAddFamilySubmit = async (e) => {
    e.preventDefault();
    setAddFamilyLoading(true);
    try {
      const res = await fetch("/api/admin/family-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addFamilyForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear la cuenta familiar");
      
      alert("¡Cuenta familiar creada con éxito! Se han generado 5 ranuras libres.");
      setShowAddFamilyModal(false);
      setAddFamilyForm({ service: "tidal", masterEmail: "", password: "", notes: "" });
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddFamilyLoading(false);
    }
  };

  const handleDeleteFamily = async (id, email) => {
    if (!confirm(`¿Seguro que deseas eliminar la cuenta familiar ${email}? Esto eliminará permanentemente la cuenta y sus 5 ranuras asociadas.`)) return;
    try {
      const res = await fetch("/api/admin/family-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        alert("Cuenta familiar eliminada.");
        await loadData();
      } else {
        const data = await res.json();
        alert(data.message || "Error al eliminar la cuenta.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de red al eliminar la cuenta.");
    }
  };

  const handleOpenEditSlotModal = (slot) => {
    setEditSlotForm({
      profileId: (slot._id || slot.id).toString(),
      clientNickname: slot.clientId?.nickname || "",
      clientWhatsApp: slot.clientId?.currentWhatsApp || "",
      memberEmail: slot.memberEmail || "",
      emailType: slot.emailType || "admin",
      memberPassword: slot.memberPassword || "",
      pricePen: slot.pricePen || 0,
      renewalDate: slot.renewalDate ? new Date(slot.renewalDate).toISOString().substring(0, 10) : "",
      status: slot.status || "free"
    });
    setShowEditSlotModal(true);
  };

  const handleCalculateRenewal = (months) => {
    let baseDate = new Date();
    if (editSlotForm.renewalDate) {
      const [year, month, day] = editSlotForm.renewalDate.split("-").map(Number);
      baseDate = new Date(year, month - 1, day);
    }
    const day = baseDate.getDate();
    if (day === 31) {
      baseDate.setDate(1);
      baseDate.setMonth(baseDate.getMonth() + 1);
    }
    baseDate.setMonth(baseDate.getMonth() + months);
    
    const y = baseDate.getFullYear();
    const m = String(baseDate.getMonth() + 1).padStart(2, '0');
    const d = String(baseDate.getDate()).padStart(2, '0');
    
    setEditSlotForm(prev => ({
      ...prev,
      renewalDate: `${y}-${m}-${d}`
    }));
  };

  const handleEditSlotSubmit = async (e) => {
    e.preventDefault();
    if (editSlotForm.status !== "free" && !editSlotForm.clientWhatsApp) {
      alert("El WhatsApp del cliente es requerido para perfiles ocupados.");
      return;
    }
    try {
      const res = await fetch("/api/admin/member-profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSlotForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al actualizar la ranura.");
      
      alert("¡Ranura actualizada con éxito!");
      setShowEditSlotModal(false);
      await loadData();
      if (activeSubTab === "directory") {
        handleSearchClients(clientSearchQuery);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSearchClients = async (query = "") => {
    setIsClientsLoading(true);
    try {
      const res = await fetch(`/api/admin/clients?query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data);
        if (data.length > 0) {
          const exists = selectedClient && data.find(c => (c._id || c.id).toString() === (selectedClient._id || selectedClient.id).toString());
          if (!exists) {
            setSelectedClient(data[0]);
          } else {
            // update existing selected client ref with new data
            setSelectedClient(data.find(c => (c._id || c.id).toString() === (selectedClient._id || selectedClient.id).toString()));
          }
        } else {
          setSelectedClient(null);
        }
      }
    } catch (e) {
      console.error("Error searching clients:", e);
    } finally {
      setIsClientsLoading(false);
    }
  };

  const getClientMemberships = (clientId) => {
    if (!clientId) return [];
    const memberships = [];
    familyAccounts.forEach(acc => {
      if (acc.profiles) {
        acc.profiles.forEach(p => {
          const pClientId = p.clientId?._id || p.clientId?.id || p.clientId;
          if (pClientId && pClientId.toString() === clientId.toString()) {
            memberships.push({
              id: p._id || p.id,
              service: acc.service,
              masterEmail: acc.masterEmail,
              memberEmail: p.memberEmail,
              pricePen: p.pricePen,
              renewalDate: p.renewalDate,
              status: p.status
            });
          }
        });
      }
    });
    return memberships;
  };

  const handleBulkAction = async () => {
    if (selectedSlotIds.length === 0) return;
    
    let action = "";
    let payload = { profileIds: selectedSlotIds };

    if (bulkAction.startsWith("status_")) {
      action = "update";
      payload.status = bulkAction.replace("status_", "");
    } else if (bulkAction === "extend_1") {
      action = "extend";
      payload.months = 1;
    } else if (bulkAction === "extend_12") {
      action = "extend";
      payload.months = 12;
    } else if (bulkAction === "update_price") {
      if (!bulkPriceValue || isNaN(parseFloat(bulkPriceValue))) {
        alert("Por favor ingresa un precio numérico válido.");
        return;
      }
      action = "update";
      payload.pricePen = parseFloat(bulkPriceValue);
    } else if (bulkAction === "update_expiry") {
      if (!bulkDateValue) {
        alert("Por favor selecciona una fecha de vencimiento.");
        return;
      }
      action = "update";
      payload.renewalDate = bulkDateValue;
    } else if (bulkAction === "clear_slots") {
      if (!confirm(`¿Seguro que deseas liberar los ${selectedSlotIds.length} cupos seleccionados?\nEsta acción es irreversible y desconectará a los clientes de las ranuras.`)) {
        return;
      }
      action = "clear";
    } else {
      alert("Acción en lote no soportada.");
      return;
    }

    payload.action = action;
    setIsBulkLoading(true);

    try {
      const res = await fetch("/api/admin/member-profiles/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al realizar acción masiva.");

      alert(`Operación masiva completada con éxito. Se actualizaron ${data.count || 0} perfiles.`);
      setSelectedSlotIds([]);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const getExpiryTag = (renewalDate) => {
    if (!renewalDate) return { label: "Sin Fecha", className: "normal" };
    const [ry, rm, rd] = renewalDate.split("-").map(Number);
    const renewalTime = new Date(ry, rm - 1, rd).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const diffDays = (renewalTime - today) / oneDay;

    const formattedDate = new Date(ry, rm - 1, rd).toLocaleDateString();

    if (diffDays < 0) {
      return { label: `Vencido (${formattedDate})`, className: "expired" };
    } else if (diffDays === 0) {
      return { label: `Vence Hoy (${formattedDate})`, className: "today" };
    } else if (diffDays <= 7) {
      return { label: `Vence en ${Math.ceil(diffDays)}d (${formattedDate})`, className: "soon" };
    } else {
      return { label: formattedDate, className: "normal" };
    }
  };

  const toggleSelectSlot = (id) => {
    setSelectedSlotIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (activeTab === "families" && activeSubTab === "directory") {
      handleSearchClients(clientSearchQuery);
    }
  }, [activeTab, activeSubTab]);

  useEffect(() => {
    setTimeout(loadData, 0);
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
    try {
      const res = await fetch("/api/admin/stock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      alert(data.message || "Las ranuras de stock derivan de planes familiares y se gestionan desde allí.");
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
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: importService, mode: importMode, rawInput })
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

  // Flatten and filter slots for table list
  const allSlots = familyAccounts.flatMap(acc => 
    (acc.profiles || []).map(p => ({
      ...p,
      id: p._id || p.id,
      service: acc.service,
      masterEmail: acc.masterEmail,
      masterPassword: acc.password,
      familyAccount: acc
    }))
  );

  const filteredSlots = allSlots.filter(slot => {
    if (tableSearchQuery) {
      const q = tableSearchQuery.toLowerCase();
      const nickname = slot.clientId?.nickname?.toLowerCase() || "";
      const phone = slot.clientId?.currentWhatsApp || "";
      const email = slot.memberEmail?.toLowerCase() || "";
      const masterEmail = slot.masterEmail?.toLowerCase() || "";
      
      const matches = nickname.includes(q) || phone.includes(q) || email.includes(q) || masterEmail.includes(q);
      if (!matches) return false;
    }

    if (tablePlatformFilter !== "all" && slot.service !== tablePlatformFilter) {
      return false;
    }

    if (tableStatusFilter !== "all" && slot.status !== tableStatusFilter) {
      return false;
    }

    if (tableExpiryFilter !== "all") {
      if (!slot.renewalDate) return false;
      const [ry, rm, rd] = slot.renewalDate.split("-").map(Number);
      const renewalTime = new Date(ry, rm - 1, rd).getTime();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      const diffDays = (renewalTime - today) / oneDay;

      if (tableExpiryFilter === "expired") {
        if (diffDays >= 0) return false;
      } else if (tableExpiryFilter === "today") {
        if (diffDays !== 0) return false;
      } else if (tableExpiryFilter === "7days") {
        if (diffDays < 0 || diffDays > 7) return false;
      } else if (tableExpiryFilter === "15days") {
        if (diffDays < 0 || diffDays > 15) return false;
      } else if (tableExpiryFilter === "30days") {
        if (diffDays < 0 || diffDays > 30) return false;
      }
    }

    return true;
  });

  const allVisibleSelected = filteredSlots.length > 0 && filteredSlots.every(s => selectedSlotIds.includes(s.id));

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredSlots.map(s => s.id);
    const allSelected = visibleIds.every(id => selectedSlotIds.includes(id));
    if (allSelected) {
      setSelectedSlotIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedSlotIds(prev => {
        const newSelection = [...prev];
        visibleIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

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
            onClick={() => setActiveTab("families")}
            className={`tab-btn ${activeTab === "families" ? "active" : ""}`}
          >
            Clientes y Familias
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

        {/* TAB: FAMILIES & CLIENTS */}
        {activeTab === "families" && (
          <section className="families-section animate-fade-in">
            <div className="section-header-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>Gestión de Clientes y Familias</h2>
                <p className="section-instruction" style={{ margin: 0 }}>
                  Administra las cuentas familiares dueñas y los perfiles de clientes vinculados.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveSubTab("familyAccounts")}
                  className={`btn ${activeSubTab === "familyAccounts" ? "btn-primary" : "btn-secondary"}`}
                >
                  Cuentas Familiares
                </button>
                <button
                  onClick={() => setActiveSubTab("tableList")}
                  className={`btn ${activeSubTab === "tableList" ? "btn-primary" : "btn-secondary"}`}
                >
                  Listado General (Tabla)
                </button>
                <button
                  onClick={() => {
                    setActiveSubTab("directory");
                    handleSearchClients(clientSearchQuery);
                  }}
                  className={`btn ${activeSubTab === "directory" ? "btn-primary" : "btn-secondary"}`}
                >
                  Directorio de Clientes
                </button>
              </div>
            </div>

            {activeSubTab === "familyAccounts" && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                  <button onClick={() => setShowAddFamilyModal(true)} className="btn btn-primary">
                    <PlusIcon /> <span>Añadir Cuenta Familiar</span>
                  </button>
                </div>

                {isFamiliesLoading && familyAccounts.length === 0 ? (
                  <div className="admin-loading-screen" style={{ minHeight: '200px' }}>
                    <span className="admin-spinner"></span>
                    <p>Cargando cuentas familiares...</p>
                  </div>
                ) : familyAccounts.length === 0 ? (
                  <div className="empty-panel glass-panel text-center">
                    <p>No se han registrado cuentas familiares todavía. Haz clic en &ldquo;Añadir Cuenta Familiar&rdquo; para crear una.</p>
                  </div>
                ) : (
                  <div className="families-grid-layout">
                    {familyAccounts.map((acc) => {
                      const accId = acc._id || acc.id;
                      return (
                        <div key={accId} className="family-card glass-panel border-purple">
                          <div className="family-info-col">
                            <div className="family-card-header">
                              <div className="family-brand-info">
                                <span className={`badge-service badge-${acc.service} family-service-tag`}>
                                  {acc.service}
                                </span>
                                <strong style={{ color: '#fff' }}>Familiar</strong>
                              </div>
                              <button
                                onClick={() => handleDeleteFamily(accId, acc.masterEmail)}
                                className="btn-delete-stock"
                                style={{ padding: '4px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                title="Eliminar Cuenta Familiar"
                              >
                                <TrashIcon />
                              </button>
                            </div>

                            <div className="family-master-credentials">
                              <div className="cred-row">
                                <span className="cred-label">Correo Dueño:</span>
                                <div className="cred-value-wrap">
                                  <span className="cred-value">{acc.masterEmail}</span>
                                  <button
                                    onClick={() => handleCopyToClipboard(acc.masterEmail, `master-email-${accId}`)}
                                    className="btn-mini-copy"
                                    title="Copiar correo dueño"
                                  >
                                    <CopyIcon />
                                    <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>
                                      {copiedId === `master-email-${accId}` ? "Copied" : ""}
                                    </span>
                                  </button>
                                </div>
                              </div>
                              <div className="cred-row">
                                <span className="cred-label">Clave Maestro:</span>
                                <div className="cred-value-wrap">
                                  <span className="cred-value">{acc.password}</span>
                                  <button
                                    onClick={() => handleCopyToClipboard(acc.password, `master-pass-${accId}`)}
                                    className="btn-mini-copy"
                                    title="Copiar clave maestro"
                                  >
                                    <CopyIcon />
                                    <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>
                                      {copiedId === `master-pass-${accId}` ? "Copied" : ""}
                                    </span>
                                  </button>
                                </div>
                              </div>
                              {acc.notes && (
                                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                                  <strong>Notas:</strong> {acc.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="family-slots-col">
                            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Ranuras (Max 5 miembros)</h4>
                            <div className="family-slots-row-layout">
                              {acc.profiles && acc.profiles.map((p) => {
                                const pId = p._id || p.id;
                                const statusNames = {
                                  active: "Activo",
                                  expired: "Vencido",
                                  pending_payment: "Falta Pago",
                                  free: "Disponible"
                                };
                                return (
                                  <div key={pId} className="slot-item-row">
                                    <div className="slot-row-header">
                                      <div className="slot-email-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
                                        <span className="slot-email-text" title={p.memberEmail || "Cupo Disponible"} style={{ maxWidth: '75%' }}>
                                          {p.memberEmail ? p.memberEmail : "Cupo Disponible"}
                                        </span>
                                        {p.memberEmail && (
                                          <button
                                            onClick={() => handleCopyToClipboard(p.memberEmail, `slot-email-${pId}`)}
                                            className="btn-mini-copy"
                                            title="Copiar correo ranura"
                                          >
                                            <CopyIcon />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                                      {p.memberEmail && (
                                        <span className={`slot-badge-email-type ${p.emailType}`} style={{ fontSize: '0.55rem' }}>
                                          {p.emailType === "admin" ? "Propio" : "Cliente"}
                                        </span>
                                      )}
                                      <span className={`status-badge-mini ${p.status}`} style={{ fontSize: '0.55rem' }}>{statusNames[p.status] || p.status}</span>
                                    </div>
    
                                    {p.status !== "free" && p.clientId && (
                                      <div className="slot-client-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                        <span className="client-name-tag" style={{ fontSize: '0.75rem' }}>👤 {p.clientId.nickname || "Sin apodo"}</span>
                                        <a
                                          href={`https://wa.me/${p.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="client-phone-link"
                                          style={{ fontSize: '0.75rem' }}
                                        >
                                          {getCountryFlag(p.clientId.currentWhatsApp)} {p.clientId.currentWhatsApp}
                                        </a>
                                      </div>
                                    )}
    
                                    <div className="slot-item-footer" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '4px', marginTop: '4px' }}>
                                      {p.memberPassword ? (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                          <span style={{ fontSize: '0.7rem' }}>Clave: <code>{p.memberPassword}</code></span>
                                          <button
                                            onClick={() => handleCopyToClipboard(p.memberPassword, `slot-pass-${pId}`)}
                                            className="btn-mini-copy"
                                            title="Copiar clave"
                                          >
                                            <CopyIcon />
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Sin clave</span>
                                      )}
                                      {p.status !== "free" && (
                                        <span style={{ fontSize: '0.7rem', alignSelf: 'flex-end', color: 'var(--accent-cyan)' }}>
                                          S/. {p.pricePen} {p.renewalDate && `| Vence: ${new Date(p.renewalDate).toLocaleDateString()}`}
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                      <button
                                        onClick={() => handleOpenEditSlotModal(p)}
                                        className="btn-slot-edit"
                                        style={{ width: '100%', padding: '4px 8px', fontSize: '0.7rem', textAlign: 'center' }}
                                      >
                                        Editar Ranura
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeSubTab === "tableList" && (
              <div className="table-list-subtab animate-fade-in">
                {/* Advanced Filters */}
                <div className="table-filters-bar">
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por apodo, whatsapp, correo ranura o maestro..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <select
                    className="form-input form-select-input"
                    value={tablePlatformFilter}
                    onChange={(e) => setTablePlatformFilter(e.target.value)}
                  >
                    <option value="all">Todas las plataformas</option>
                    <option value="tidal">Tidal</option>
                    <option value="deezer">Deezer</option>
                    <option value="qobuz">Qobuz</option>
                  </select>

                  <select
                    className="form-input form-select-input"
                    value={tableStatusFilter}
                    onChange={(e) => setTableStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    <option value="pending_payment">Falta Pago</option>
                    <option value="expired">Vencido</option>
                    <option value="free">Disponible</option>
                  </select>

                  <select
                    className="form-input form-select-input"
                    value={tableExpiryFilter}
                    onChange={(e) => setTableExpiryFilter(e.target.value)}
                  >
                    <option value="all">Todos los vencimientos</option>
                    <option value="expired">Vencidos (Ya expiró)</option>
                    <option value="today">Vencen hoy</option>
                    <option value="7days">Vencen en 7 días</option>
                    <option value="15days">Vencen en 15 días</option>
                    <option value="30days">Vencen en 30 días</option>
                  </select>
                </div>

                {/* Table list of slots */}
                {filteredSlots.length === 0 ? (
                  <div className="empty-panel glass-panel text-center">
                    <p>No se encontraron cupos/ranuras con los filtros seleccionados.</p>
                  </div>
                ) : (
                  <div className="bulk-table-container">
                    <table className="bulk-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>
                            <label className="custom-checkbox">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleSelectAllVisible}
                              />
                              <span className="checkmark"></span>
                            </label>
                          </th>
                          <th>Plataforma</th>
                          <th>Correo Maestro</th>
                          <th>Correo Ranura</th>
                          <th>Contraseña</th>
                          <th>Cliente / WhatsApp</th>
                          <th>Precio</th>
                          <th>Vencimiento</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSlots.map(slot => {
                          const isSelected = selectedSlotIds.includes(slot.id);
                          const expiryInfo = getExpiryTag(slot.renewalDate);
                          const statusNames = {
                            active: "Activo",
                            expired: "Vencido",
                            pending_payment: "Falta Pago",
                            free: "Disponible"
                          };

                          return (
                            <tr key={slot.id} className={isSelected ? "selected" : ""}>
                              <td>
                                <label className="custom-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectSlot(slot.id)}
                                  />
                                  <span className="checkmark"></span>
                                </label>
                              </td>
                              <td>
                                <span className={`badge-service badge-${slot.service}`} style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                  {slot.service}
                                </span>
                              </td>
                              <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.masterEmail}>
                                {slot.masterEmail}
                              </td>
                              <td style={{ fontWeight: '600', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.memberEmail || "Disponible"}>
                                {slot.memberEmail ? slot.memberEmail : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Disponible</span>}
                              </td>
                              <td>
                                {slot.memberPassword ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <code style={{ fontSize: '0.75rem' }}>{slot.memberPassword}</code>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyToClipboard(slot.memberPassword, `tbl-pass-${slot.id}`)}
                                      className="btn-mini-copy"
                                      title="Copiar contraseña"
                                    >
                                      <CopyIcon />
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>
                              <td>
                                {slot.clientId ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontWeight: '600' }}>👤 {slot.clientId.nickname || "Sin apodo"}</span>
                                    <a
                                      href={`https://wa.me/${slot.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="client-phone-link"
                                      style={{ fontSize: '0.75rem' }}
                                    >
                                      {getCountryFlag(slot.clientId.currentWhatsApp)} {slot.clientId.currentWhatsApp}
                                    </a>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Sin Cliente</span>
                                )}
                              </td>
                              <td>
                                {slot.status !== "free" ? `S/. ${slot.pricePen}` : "-"}
                              </td>
                              <td>
                                {slot.status !== "free" && slot.renewalDate ? (
                                  <span className={`expiry-tag ${expiryInfo.className}`}>
                                    {expiryInfo.label}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>
                              <td>
                                <span className={`status-badge-mini ${slot.status}`}>
                                  {statusNames[slot.status] || slot.status}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSlotModal(slot)}
                                  className="btn-slot-edit"
                                  style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Floating Actions Bar */}
                <div className={`floating-bulk-bar ${selectedSlotIds.length > 0 ? "visible" : ""}`}>
                  <div className="bulk-bar-selection-info">
                    <strong>{selectedSlotIds.length}</strong>
                    <span>perfiles seleccionados</span>
                  </div>

                  <div className="bulk-bar-actions">
                    <div className="bulk-action-group">
                      <select
                        className="bulk-action-select"
                        value={bulkAction}
                        onChange={(e) => setBulkAction(e.target.value)}
                      >
                        <option value="status_active">Marcar como Activo</option>
                        <option value="status_pending_payment">Marcar como Falta Pago</option>
                        <option value="status_expired">Marcar como Vencido</option>
                        <option value="extend_1">Extender +1 Mes</option>
                        <option value="extend_12">Extender +12 Meses</option>
                        <option value="update_price">Actualizar Precio</option>
                        <option value="update_expiry">Actualizar Vencimiento</option>
                      </select>
                    </div>

                    {bulkAction === "update_price" && (
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Precio S/."
                        className="bulk-action-input"
                        value={bulkPriceValue}
                        onChange={(e) => setBulkPriceValue(e.target.value)}
                      />
                    )}

                    {bulkAction === "update_expiry" && (
                      <input
                        type="date"
                        className="bulk-action-input"
                        style={{ width: '130px' }}
                        value={bulkDateValue}
                        onChange={(e) => setBulkDateValue(e.target.value)}
                      />
                    )}

                    <button
                      type="button"
                      onClick={handleBulkAction}
                      className="bulk-action-btn-go"
                      disabled={isBulkLoading}
                    >
                      {isBulkLoading ? "Aplicando..." : "Aplicar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setBulkAction("clear_slots")}
                      className="btn-bulk-danger"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      disabled={isBulkLoading}
                    >
                      Liberar Cupos
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === "directory" && (
              <div className="client-directory-panel glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
                <div className="directory-sidebar">
                  <h3>Directorio</h3>
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por apodo, whatsapp o email..."
                      value={clientSearchQuery}
                      onChange={(e) => {
                        setClientSearchQuery(e.target.value);
                        handleSearchClients(e.target.value);
                      }}
                    />
                  </div>

                  {isClientsLoading && clients.length === 0 ? (
                    <div className="admin-loading-screen" style={{ minHeight: '100px' }}>
                      <span className="admin-spinner"></span>
                    </div>
                  ) : clients.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '12px' }}>
                      No se encontraron clientes.
                    </div>
                  ) : (
                    <div className="search-results-list">
                      {clients.map((c) => {
                        const cId = c._id || c.id;
                        const isSelected = selectedClient && (selectedClient._id || selectedClient.id).toString() === cId.toString();
                        return (
                          <div
                            key={cId}
                            onClick={() => setSelectedClient(c)}
                            className={`client-search-card glass-panel ${isSelected ? "active" : ""}`}
                            style={{ borderRadius: 'var(--radius-sm)' }}
                          >
                            <div className="client-search-name">
                              {getCountryFlag(c.currentWhatsApp)} {c.nickname || "Sin Apodo"}
                            </div>
                            <div className="client-search-phone">
                              {c.currentWhatsApp}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="directory-detail-view">
                  {selectedClient ? (
                    <div className="client-detail-card glass-panel" style={{ height: '100%', borderRadius: 'var(--radius-lg)' }}>
                      <div className="client-detail-header">
                        <div className="client-main-name">
                          {getCountryFlag(selectedClient.currentWhatsApp)} {selectedClient.nickname || "Cliente Sin Apodo"}
                        </div>
                      </div>

                      <div className="client-detail-grid">
                        <div>
                          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}>Datos de Contacto</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>WhatsApp Principal: </span>
                              <a
                                href={`https://wa.me/${selectedClient.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="client-phone-link"
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                              >
                                {selectedClient.currentWhatsApp}
                              </a>
                            </div>

                            {selectedClient.pastWhatsApps && selectedClient.pastWhatsApps.length > 0 && (
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>WhatsApps Anteriores:</span>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {selectedClient.pastWhatsApps.map((phone, i) => (
                                    <li key={i}>
                                      <a
                                        href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="client-phone-link"
                                        style={{ fontSize: '0.8rem' }}
                                      >
                                        {getCountryFlag(phone)} {phone}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {selectedClient.usedEmails && selectedClient.usedEmails.length > 0 && (
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Correos Utilizados:</span>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {selectedClient.usedEmails.map((email, i) => (
                                    <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#fff' }}>
                                      {email}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}>Planes / Membresías Activas e Históricas</h4>
                          {getClientMemberships(selectedClient._id || selectedClient.id).length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Este cliente no tiene ranuras activas o registradas en este momento.
                            </div>
                          ) : (
                            <div className="history-items-list">
                              {getClientMemberships(selectedClient._id || selectedClient.id).map((m) => {
                                const statusNames = {
                                  active: "Activo",
                                  expired: "Vencido",
                                  pending_payment: "Falta Pago",
                                  free: "Disponible"
                                };
                                return (
                                  <div key={m.id} className="history-item-row glass-panel" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div>
                                      <span className={`badge-service badge-${m.service}`} style={{ fontSize: '0.65rem', marginRight: '6px', textTransform: 'uppercase' }}>
                                        {m.service}
                                      </span>
                                      <span style={{ fontWeight: '600' }}>{m.memberEmail}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                      <span className={`status-badge-mini ${m.status}`} style={{ fontSize: '0.6rem' }}>
                                        {statusNames[m.status]}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        S/. {m.pricePen} {m.renewalDate && `| Vence: ${new Date(m.renewalDate).toLocaleDateString()}`}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel text-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', minHeight: '300px' }}>
                      Selecciona un cliente del directorio para ver sus detalles.
                    </div>
                  )}
                </div>
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
                      {item.familyMasterEmail && (
                        <div style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-muted)' }}>
                          Plan Familiar: <strong>{item.familyMasterEmail}</strong>
                        </div>
                      )}
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
            <h2>Carga Masiva e Importador de Datos</h2>
            <p className="section-instruction">
              Permite cargar de manera masiva cuentas familiares maestras, perfiles de miembros activos asociados a clientes permanentes, o perfiles libres en stock desde Excel/Google Sheets.
            </p>

            {importMessage && <div className="success-alert">{importMessage}</div>}
            {importError && <div className="error-alert">{importError}</div>}

            <form onSubmit={handleImportStock} className="import-stock-form glass-panel">
              <div className="form-group">
                <label className="form-label">Tipo de Importación / Acción:</label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="form-input form-select-input"
                  required
                >
                  <option value="master_accounts">1. Cuentas Titulares Maestras (Familiares)</option>
                  <option value="active_members">2. Perfiles de Clientes Activos (Cupos Ocupados)</option>
                  <option value="stock_members">3. Perfiles de Miembros Disponibles (Stock)</option>
                </select>
              </div>

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

              {/* Format guidelines helper */}
              <div className="import-guidelines glass-panel" style={{ padding: '15px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '8px', fontSize: '0.85rem' }}>Instrucciones de Formato:</h4>
                {importMode === "master_accounts" && (
                  <>
                    <p style={{ margin: 0, color: '#fff' }}>Pega las columnas en el orden siguiente (separadas por tabulaciones al copiar de Excel, o comas, puntos y comas, o barras |):</p>
                    <code style={{ display: 'block', padding: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', margin: '8px 0', color: 'var(--accent-gold)' }}>
                      correo_titular [tab] contrasena [tab] notas (opcional) [tab] fecha_vencimiento (opcional, YYYY-MM-DD)
                    </code>
                    <ul style={{ paddingLeft: '16px', color: 'var(--text-muted)' }}>
                      <li>Crea la cuenta familiar maestra con sus 5 ranuras libres por defecto.</li>
                      <li>Si no se ingresa fecha de renovación, se calculará <strong>+30 días</strong> automáticamente.</li>
                    </ul>
                  </>
                )}
                {importMode === "active_members" && (
                  <>
                    <p style={{ margin: 0, color: '#fff' }}>Pega las columnas en el orden siguiente (separadas por tabulaciones al copiar de Excel, o comas, puntos y comas, o barras |):</p>
                    <code style={{ display: 'block', padding: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', margin: '8px 0', color: 'var(--accent-gold)' }}>
                      correo_miembro [tab] contrasena_miembro [tab] correo_titular [tab] apodo_cliente [tab] whatsapp_cliente [tab] precio_pen (opcional) [tab] fecha_vencimiento (opcional, YYYY-MM-DD)
                    </code>
                    <ul style={{ paddingLeft: '16px', color: 'var(--text-muted)' }}>
                      <li>Busca o crea la cuenta familiar dueña (maestra).</li>
                      <li>Busca o crea al <strong>Cliente Permanente</strong> usando su WhatsApp. Si es un WhatsApp nuevo, se asocia automáticamente y los anteriores pasan al historial.</li>
                      <li>Actualiza una ranura libre o crea una nueva, asocia al cliente, define la suscripción y registra el pago.</li>
                    </ul>
                  </>
                )}
                {importMode === "stock_members" && (
                  <>
                    <p style={{ margin: 0, color: '#fff' }}>Pega las columnas en el orden siguiente (separadas por tabulaciones al copiar de Excel, o comas, puntos y comas, o barras |):</p>
                    <code style={{ display: 'block', padding: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', margin: '8px 0', color: 'var(--accent-gold)' }}>
                      correo_miembro [tab] contrasena_miembro [tab] correo_titular
                    </code>
                    <ul style={{ paddingLeft: '16px', color: 'var(--text-muted)' }}>
                      <li>Importa perfiles de miembros listos para ser vendidos en el panel.</li>
                      <li>Busca o crea la cuenta familiar dueña, y asocia el perfil en estado <strong>Disponible (free)</strong> con sus respectivas credenciales de acceso.</li>
                    </ul>
                  </>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Pega las celdas de Excel, Google Sheets o CSV:</label>
                <textarea
                  className="form-input form-textarea"
                  rows={8}
                  placeholder={
                    importMode === "master_accounts"
                      ? "ejemplo_titular@gmail.com\tclave123\tNotas del proveedor\t2026-07-15"
                      : importMode === "active_members"
                      ? "miembro1@gmail.com\tpassMember\ttitular@gmail.com\tJuan Gomez\t+51987654321\t15.0\t2026-07-20"
                      : "miembro_stock@gmail.com\tclaveMiembro\ttitular_maestro@gmail.com"
                  }
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
                {importLoading ? "Procesando importación masiva..." : "Ejecutar Importación"}
              </button>
            </form>
          </section>
        )}

      </div>

      {/* MODAL: ADD FAMILY ACCOUNT */}
      {showAddFamilyModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-container glass-panel">
            <div className="modal-header-bar">
              <h3>Añadir Cuenta Familiar</h3>
              <button onClick={() => setShowAddFamilyModal(false)} className="btn-modal-close">
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleAddFamilySubmit}>
              <div className="modal-body-form">
                <div className="form-group">
                  <label className="form-label">Servicio / Plataforma:</label>
                  <select
                    className="form-input form-select-input"
                    value={addFamilyForm.service}
                    onChange={(e) => setAddFamilyForm(prev => ({ ...prev, service: e.target.value }))}
                    required
                  >
                    <option value="tidal">Tidal</option>
                    <option value="deezer">Deezer</option>
                    <option value="qobuz">Qobuz</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo Dueño Maestro:</label>
                  <input
                    type="email"
                    className="form-input"
                    value={addFamilyForm.masterEmail}
                    onChange={(e) => setAddFamilyForm(prev => ({ ...prev, masterEmail: e.target.value }))}
                    required
                    placeholder="ejemplo@dueño.com"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña Maestro:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={addFamilyForm.password}
                    onChange={(e) => setAddFamilyForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                    placeholder="Clave de la cuenta maestro"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas Adicionales:</label>
                  <textarea
                    className="form-input form-textarea"
                    rows={3}
                    value={addFamilyForm.notes}
                    onChange={(e) => setAddFamilyForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Notas o detalles del proveedor..."
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer-actions">
                <button type="button" onClick={() => setShowAddFamilyModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={addFamilyLoading}>
                  {addFamilyLoading ? "Creando..." : "Crear Familiar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MEMBER SLOT */}
      {showEditSlotModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-container glass-panel">
            <div className="modal-header-bar">
              <h3>Editar Ranura Miembro</h3>
              <button onClick={() => setShowEditSlotModal(false)} className="btn-modal-close">
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleEditSlotSubmit}>
              <div className="modal-body-form">
                
                <div className="form-group">
                  <label className="form-label">Estado de la Ranura:</label>
                  <select
                    className="form-input form-select-input"
                    value={editSlotForm.status}
                    onChange={(e) => setEditSlotForm(prev => ({ ...prev, status: e.target.value }))}
                    required
                  >
                    <option value="free">Disponible (Libre)</option>
                    <option value="active">Activo (Pagado)</option>
                    <option value="pending_payment">Falta Pago (Pendiente)</option>
                    <option value="expired">Vencido</option>
                  </select>
                </div>

                {editSlotForm.status !== "free" && (
                  <>
                    <div className="form-row-double">
                      <div className="form-group">
                        <label className="form-label">Apodo del Cliente:</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editSlotForm.clientNickname}
                          onChange={(e) => setEditSlotForm(prev => ({ ...prev, clientNickname: e.target.value }))}
                          placeholder="Ej. Juan Tidal"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">WhatsApp Contacto:</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editSlotForm.clientWhatsApp}
                          onChange={(e) => setEditSlotForm(prev => ({ ...prev, clientWhatsApp: e.target.value }))}
                          required
                          placeholder="Ej: +51999999999"
                        />
                      </div>
                    </div>

                    <div className="form-row-double">
                      <div className="form-group">
                        <label className="form-label">Precio (S/.):</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-input"
                          value={editSlotForm.pricePen}
                          onChange={(e) => setEditSlotForm(prev => ({ ...prev, pricePen: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fecha de Renovación:</label>
                        <input
                          type="date"
                          className="form-input"
                          value={editSlotForm.renewalDate}
                          onChange={(e) => setEditSlotForm(prev => ({ ...prev, renewalDate: e.target.value }))}
                        />
                        <div className="calc-date-actions">
                          <button
                            type="button"
                            onClick={() => handleCalculateRenewal(1)}
                            className="btn-calc-action"
                          >
                            +1 Mes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCalculateRenewal(12)}
                            className="btn-calc-action"
                          >
                            +12 Meses
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Correo de Activación (Ranura):</label>
                  <input
                    type="email"
                    className="form-input"
                    value={editSlotForm.memberEmail}
                    onChange={(e) => setEditSlotForm(prev => ({ ...prev, memberEmail: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-row-double">
                  <div className="form-group">
                    <label className="form-label">Tipo de Correo:</label>
                    <select
                      className="form-input form-select-input"
                      value={editSlotForm.emailType}
                      onChange={(e) => setEditSlotForm(prev => ({ ...prev, emailType: e.target.value }))}
                      required
                    >
                      <option value="admin">Propio (Mío)</option>
                      <option value="client">Cliente (De él)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña Perfil:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editSlotForm.memberPassword}
                      onChange={(e) => setEditSlotForm(prev => ({ ...prev, memberPassword: e.target.value }))}
                      required
                    />
                  </div>
                </div>

              </div>
              <div className="modal-footer-actions">
                <button type="button" onClick={() => setShowEditSlotModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
