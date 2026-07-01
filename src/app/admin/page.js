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

function WhatsAppIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.966C16.528 2.01 14.069.986 11.424.986 6.002.986 1.577 5.356 1.574 10.786c-.001 1.745.467 3.447 1.353 4.966l-.982 3.585 3.702-.983zm13.15-7.616c-.3-.15-1.774-.875-2.046-.975-.27-.1-.468-.15-.665.15-.198.3-.765.975-.939 1.176-.172.2-.346.225-.646.075-.3-.15-1.264-.467-2.41-1.485-.892-.797-1.493-1.782-1.668-2.083-.175-.3-.018-.463.13-.612.135-.133.3-.349.45-.523.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.524-.075-.15-.665-1.601-.912-2.195-.24-.579-.485-.501-.665-.51l-.565-.01c-.198 0-.52.074-.792.372-.272.298-1.04 1.018-1.04 2.481 0 1.464 1.063 2.877 1.212 3.076.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.774-.726 2.022-1.429.247-.704.247-1.306.173-1.429-.074-.124-.272-.198-.57-.347z"/>
    </svg>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getDaysAgo(dateStr, todayStr) {
  const d1 = new Date(dateStr + "T00:00:00");
  const d2 = new Date(todayStr + "T00:00:00");
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  
  // Tab control: "orders", "stock", "import", "families", "payments"
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");

  // Customer payments state
  const [payments, setPayments] = useState([]);
  const [actionPaymentId, setActionPaymentId] = useState("");
  const [rejectNotesModal, setRejectNotesModal] = useState({ show: false, paymentId: "" });
  const [rejectNotesInput, setRejectNotesInput] = useState("");

  // WhatsApp billing states
  const [templateToday, setTemplateToday] = useState("");
  const [templatePast, setTemplatePast] = useState("");
  const [editedMessages, setEditedMessages] = useState({}); // { slotId: "mensaje customizado" }
  const [billingSearchQuery, setBillingSearchQuery] = useState("");
  const [showTemplateConfig, setShowTemplateConfig] = useState(false);

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

  // Renewals tab states
  const [exchangeRateUsdToArs, setExchangeRateUsdToArs] = useState(1400.0);
  const [exchangeRateUsdToPen, setExchangeRateUsdToPen] = useState(3.75);
  const [platformCosts, setPlatformCosts] = useState({
    tidal: { cost: 2000, currency: "ARS" },
    deezer: { cost: 1500, currency: "ARS" },
    qobuz: { cost: 5.99, currency: "USD" }
  });
  const [simClientIncrease, setSimClientIncrease] = useState(0);
  const [simTidalCost, setSimTidalCost] = useState(2000);
  const [simUsdArs, setSimUsdArs] = useState(1400);
  const [renewalsSearch, setRenewalsSearch] = useState("");
  const [renewalsPlatform, setRenewalsPlatform] = useState("all");
  const [selectedRenewalDay, setSelectedRenewalDay] = useState(null);
  const [renewalsPage, setRenewalsPage] = useState(1);
  const [savingAccountId, setSavingAccountId] = useState("");
  const [editingRates, setEditingRates] = useState(false);
  const [editingCosts, setEditingCosts] = useState(false);

  // Consolidation / Organizer States
  const [organizerPlatform, setOrganizerPlatform] = useState("tidal");
  const [transferSourceSlot, setTransferSourceSlot] = useState(null);
  const [transferSourceAccount, setTransferSourceAccount] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");

  const handleTransferMember = async (sourceSlotId, targetSlotId) => {
    setIsTransferring(true);
    setTransferError("");
    setTransferSuccess("");
    try {
      const res = await fetch("/api/admin/member-profiles/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSlotId, targetSlotId })
      });
      if (res.ok) {
        setTransferSuccess("¡Miembro transferido con éxito!");
        await loadData();
      } else {
        const errData = await res.json();
        setTransferError(errData.message || "Error al transferir miembro.");
      }
    } catch (err) {
      setTransferError("Fallo de red al transferir miembro.");
    } finally {
      setIsTransferring(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUsdArs = localStorage.getItem("tc_usd_ars");
      const savedUsdPen = localStorage.getItem("tc_usd_pen");
      if (savedUsdArs) {
        setExchangeRateUsdToArs(Number(savedUsdArs));
        setSimUsdArs(Number(savedUsdArs));
      }
      if (savedUsdPen) setExchangeRateUsdToPen(Number(savedUsdPen));

      const savedCosts = localStorage.getItem("platform_costs");
      if (savedCosts) {
        try {
          const parsed = JSON.parse(savedCosts);
          setPlatformCosts(parsed);
          if (parsed.tidal?.cost) setSimTidalCost(Number(parsed.tidal.cost));
        } catch (e) {
          console.error("Error parsing platform costs", e);
        }
      }

      // Load WhatsApp templates
      const savedToday = localStorage.getItem("ws_template_today");
      const savedPast = localStorage.getItem("ws_template_past");
      setTemplateToday(savedToday || "¡Hola {cliente}! Te saludamos de Música Premium Barato. Te recordamos que hoy vence tu cuenta de {servicio} ({perfil}). Para renovar el servicio, el monto es {precio}. Puedes ingresar a tu panel en https://webmusicapremium.vercel.app para subir tu comprobante. ¡Gracias!");
      setTemplatePast(savedPast || "¡Hola {cliente}! Te saludamos de Música Premium Barato. Te recordamos que tu cuenta de {servicio} ({perfil}) venció el {vencimiento}. Para reactivar el servicio, el monto es {precio}. Puedes reportar tu pago en https://webmusicapremium.vercel.app. ¡Muchas gracias!");
    }
  }, []);

  const handleSaveExchangeRates = (usdArs, usdPen) => {
    setExchangeRateUsdToArs(usdArs);
    setExchangeRateUsdToPen(usdPen);
    if (typeof window !== "undefined") {
      localStorage.setItem("tc_usd_ars", usdArs.toString());
      localStorage.setItem("tc_usd_pen", usdPen.toString());
    }
  };

  const handleFamilyAccountChange = (id, field, value) => {
    setFamilyAccounts(prev => prev.map(acc => {
      if (acc.id === id) {
        return { ...acc, [field]: value };
      }
      return acc;
    }));
  };

  const handleSaveRenewalInfo = async (accountId) => {
    const acc = familyAccounts.find(a => a.id === accountId);
    if (!acc) return;
    
    setSavingAccountId(accountId);
    try {
      const res = await fetch("/api/admin/family-accounts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: accountId,
          ownerRenewalDate: acc.ownerRenewalDate || null,
          renewalCost: acc.renewalCost || 0,
          renewalCurrency: acc.renewalCurrency || "PEN",
          notes: acc.notes || ""
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al actualizar la cuenta titular.");
      }
      
      alert("¡Cuenta titular actualizada con éxito!");
      
      // Refresh stats
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error("Save Renewal Info Error:", err);
      alert(err.message);
    } finally {
      setSavingAccountId("");
    }
  };

  const getCostInPen = (cost, currency, platform) => {
    const numericCost = Number(cost) || 0;
    const cur = currency || (platform === 'tidal' || platform === 'deezer' ? 'ARS' : 'USD');
    if (cur === 'ARS') {
      const costInUsd = exchangeRateUsdToArs > 0 ? (numericCost / exchangeRateUsdToArs) : 0;
      return costInUsd * exchangeRateUsdToPen;
    } else if (cur === 'USD') {
      return numericCost * exchangeRateUsdToPen;
    } else {
      return numericCost;
    }
  };

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

      // Fetch customer payments
      const paymentsRes = await fetch("/api/admin/payments");
      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json();
        if (paymentsData.success) {
          setPayments(paymentsData.payments);
        }
      }

    } catch (error) {
      console.error(error);
      setDbError(error.message || "Error al cargar la información.");
    } finally {
      setLoading(false);
      setIsFamiliesLoading(false);
    }
  };

  const handleProcessPayment = async (paymentId, action, notes = "") => {
    setActionPaymentId(paymentId);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          action,
          notes,
          monthsToAdd: 1
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al procesar pago");
      }
      alert(data.message);
      // Reload everything
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionPaymentId("");
      setRejectNotesModal({ show: false, paymentId: "" });
      setRejectNotesInput("");
    }
  };

  const handleSaveTemplates = (todayTemp, pastTemp) => {
    setTemplateToday(todayTemp);
    setTemplatePast(pastTemp);
    if (typeof window !== "undefined") {
      localStorage.setItem("ws_template_today", todayTemp);
      localStorage.setItem("ws_template_past", pastTemp);
    }
    alert("¡Plantillas de WhatsApp guardadas con éxito!");
    setShowTemplateConfig(false);
  };

  const getMessageForSlot = (slot) => {
    if (editedMessages[slot.id] !== undefined) {
      return editedMessages[slot.id];
    }
    // If not edited, compute from template
    const today = new Date();
    const yStr = today.getFullYear();
    const mStr = String(today.getMonth() + 1).padStart(2, '0');
    const dStr = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yStr}-${mStr}-${dStr}`;

    const isToday = slot.renewalDate === todayStr;
    const template = isToday ? templateToday : templatePast;
    
    const clientName = slot.clientId?.nickname || "Cliente";
    const serviceName = slot.service ? slot.service.toUpperCase() : "";
    const profileName = slot.memberEmail || "";
    const expiryDate = formatDate(slot.renewalDate);
    const price = slot.pricePen ? `S/. ${slot.pricePen}` : "S/. 0.00";
    
    let msg = (template || "")
      .replace(/{cliente}/g, clientName)
      .replace(/{servicio}/g, serviceName)
      .replace(/{perfil}/g, profileName)
      .replace(/{vencimiento}/g, expiryDate)
      .replace(/{precio}/g, price);
      
    return msg;
  };

  const handleMessageChange = (slotId, newText) => {
    setEditedMessages(prev => ({
      ...prev,
      [slotId]: newText
    }));
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

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
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
      
      const code = slot.clientId?.customerCode?.toLowerCase() || "";
      const matches = nickname.includes(q) || code.includes(q) || phone.includes(q) || email.includes(q) || masterEmail.includes(q);
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
        <nav className="admin-tabs-nav glass-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
          <button
            onClick={() => setActiveTab("renewals")}
            className={`tab-btn ${activeTab === "renewals" ? "active" : ""}`}
          >
            <span>PAGO RENOVACIONES</span>
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`tab-btn ${activeTab === "payments" ? "active" : ""}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Validar Pagos</span>
            {payments.filter(p => p.status === "pending").length > 0 && (
              <span style={{ 
                background: '#ef4444', 
                color: '#fff', 
                padding: '2.5px 6px', 
                borderRadius: '9999px', 
                fontSize: '10px', 
                fontWeight: 'bold',
                lineHeight: '1',
                display: 'inline-block'
              }}>
                {payments.filter(p => p.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("whatsapp_billing")}
            className={`tab-btn ${activeTab === "whatsapp_billing" ? "active" : ""}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Cobros WhatsApp</span>
            {(() => {
              const today = new Date();
              const yStr = today.getFullYear();
              const mStr = String(today.getMonth() + 1).padStart(2, '0');
              const dStr = String(today.getDate()).padStart(2, '0');
              const tStr = `${yStr}-${mStr}-${dStr}`;
              const count = allSlots.filter(s => s.clientId && s.status !== "free" && s.renewalDate && s.renewalDate <= tStr).length;
              return count > 0 ? (
                <span style={{ 
                  background: 'var(--accent-cyan, #00e5ff)', 
                  color: '#08080a', 
                  padding: '2.5px 6px', 
                  borderRadius: '9999px', 
                  fontSize: '10px', 
                  fontWeight: 'bold',
                  lineHeight: '1',
                  display: 'inline-block'
                }}>
                  {count}
                </span>
              ) : null;
            })()}
          </button>
          <button
            onClick={() => setActiveTab("organizer")}
            className={`tab-btn ${activeTab === "organizer" ? "active" : ""}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Organizador (Consolidar)</span>
          </button>
          <button
            onClick={() => setActiveTab("profitability")}
            className={`tab-btn ${activeTab === "profitability" ? "active" : ""}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Rentabilidad</span>
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                                        <span className="client-name-tag" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                          👤 {p.clientId.customerCode || "CLI-XXXXXX"}{p.clientId.nickname ? ` | ${p.clientId.nickname}` : ""}
                                        </span>
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
                                          S/. {p.pricePen} {p.renewalDate && `| Vence: ${formatDisplayDate(p.renewalDate)}`}
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
                                     <span style={{ fontWeight: '600' }}>
                                       👤 {slot.clientId.customerCode || "CLI-XXXXXX"}{slot.clientId.nickname ? ` | ${slot.clientId.nickname}` : ""}
                                     </span>
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
                                        S/. {m.pricePen} {m.renewalDate && `| Vence: ${formatDisplayDate(m.renewalDate)}`}
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
                    <p style={{ margin: 0, color: '#fff' }}>Pega las columnas en el orden siguiente (separadas por tabulaciones al copiar de Excel o Google Sheets, o comas, puntos y comas, o barras |):</p>
                    <code style={{ display: 'block', padding: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', margin: '8px 0', color: 'var(--accent-gold)' }}>
                      correo_titular [tab] contrasena [tab] fecha_renovacion (DD/MM, DD-MM o YYYY-MM-DD) [tab] notas (opcional)
                    </code>
                    <ul style={{ paddingLeft: '16px', color: 'var(--text-muted)' }}>
                      <li>Crea la cuenta familiar maestra con sus 5 ranuras libres por defecto.</li>
                      <li>Soporta formatos flexibles de fecha para la renovación, como <strong>25/06</strong> (día/mes), <strong>25/06/2026</strong> o simplemente <strong>25</strong> (el día del mes actual).</li>
                      <li>Si no se ingresa fecha de renovación, se calculará <strong>+30 días</strong> automáticamente.</li>
                    </ul>
                  </>
                )}
                 {importMode === "active_members" && (
                  <>
                    <p style={{ margin: 0, color: '#fff' }}>Pega las columnas en el orden siguiente (separadas por tabulaciones al copiar de Excel o Google Sheets, o comas, puntos y comas, o barras |):</p>
                    <code style={{ display: 'block', padding: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', margin: '8px 0', color: 'var(--accent-gold)' }}>
                      titular_plan_familiar [tab] cliente (whatsapp o nombre) [tab] correo_miembro [tab] contrasena_miembro [tab] precio_pen (opcional) [tab] fecha_vencimiento (opcional, DD/MM, DD/MM/YY, YYYY-MM-DD)
                    </code>
                    <ul style={{ paddingLeft: '16px', color: 'var(--text-muted)' }}>
                      <li>Busca o crea la cuenta familiar dueña (maestra).</li>
                      <li>Busca o crea al <strong>Cliente Permanente</strong> usando el nombre o WhatsApp provisto. Si ingresas un nombre, se emparejará por nombre. Si ingresas un número de WhatsApp, se normalizará y guardará como número de contacto directo.</li>
                      <li>Asocia al cliente a una ranura, define la suscripción y registra el pago de manera automática.</li>
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
                      ? "titular@gmail.com\tJuan Gomez\tmiembro1@gmail.com\tpassMember\t15.0\t2026-07-20"
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

        {/* TAB: RENEWALS (PAGO RENOVACIONES) */}
        {activeTab === "renewals" && (() => {
          // Filter family accounts for renewals view
          const filteredForRenewals = familyAccounts.filter(acc => {
            if (renewalsPlatform !== "all" && acc.service !== renewalsPlatform) {
              return false;
            }
            if (renewalsSearch) {
              const q = renewalsSearch.toLowerCase();
              const matchEmail = acc.masterEmail?.toLowerCase().includes(q);
              const matchNotes = acc.notes?.toLowerCase().includes(q);
              if (!matchEmail && !matchNotes) {
                return false;
              }
            }
            return true;
          });

          // Generate 30-day timeline
          const today = new Date();
          today.setHours(0,0,0,0);
          
          const timelineDays = [];
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const dayVal = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayVal}`;
            
            const dayAccounts = filteredForRenewals.filter(acc => acc.ownerRenewalDate === dateStr);
            const count = dayAccounts.length;
            
            const totalCostPen = dayAccounts.reduce((sum, acc) => {
              const pCost = platformCosts[acc.service] || { cost: 0, currency: "PEN" };
              return sum + getCostInPen(pCost.cost, pCost.currency, acc.service);
            }, 0);
            
            timelineDays.push({
              dateStr,
              label: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              isToday: i === 0,
              count,
              totalCostPen
            });
          }

          // Filter by selected timeline day
          const finalRenewalsList = selectedRenewalDay 
            ? filteredForRenewals.filter(acc => acc.ownerRenewalDate === selectedRenewalDay)
            : filteredForRenewals;

          // Stats
          const totalFilteredAccounts = finalRenewalsList.length;
          const totalFilteredCostPen = finalRenewalsList.reduce((sum, acc) => {
            const pCost = platformCosts[acc.service] || { cost: 0, currency: "PEN" };
            return sum + getCostInPen(pCost.cost, pCost.currency, acc.service);
          }, 0);

          // Pagination
          const itemsPerPage = 50;
          const totalRenewalsPages = Math.ceil(finalRenewalsList.length / itemsPerPage) || 1;
          const renewalsStartIdx = (renewalsPage - 1) * itemsPerPage;
          const paginatedRenewals = finalRenewalsList.slice(renewalsStartIdx, renewalsStartIdx + itemsPerPage);

          return (
            <section className="renewals-section animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Pago de Renovaciones</h2>
                  <p className="section-instruction">
                    Administración agrupada de costos mensuales y proyección de pagos de las cuentas titulares maestras.
                  </p>
                </div>
              </div>

              {/* STATS OVERVIEW FOR RENEWALS */}
              <div className="stats-grid animate-fade-in" style={{ marginBottom: '24px' }}>
                <div className="stat-card glass-panel border-cyan">
                  <span className="stat-label">Total Cuentas Filtradas</span>
                  <strong className="stat-value text-cyan">{totalFilteredAccounts}</strong>
                </div>
                <div className="stat-card glass-panel border-purple">
                  <span className="stat-label">Costo Total Estimado (Soles)</span>
                  <strong className="stat-value text-purple">S/. {totalFilteredCostPen.toFixed(2)}</strong>
                </div>
                {/* Exchange Rates Box */}
                <div className="stat-card glass-panel border-gold">
                  <span className="stat-label">Tipos de Cambio (TC)</span>
                  {editingRates ? (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '80px' }}>USD a ARS:</span>
                        <input 
                          type="number" 
                          step="0.1" 
                          style={{ width: '90px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                          defaultValue={exchangeRateUsdToArs}
                          id="newUsdArs"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '80px' }}>USD a PEN:</span>
                        <input 
                          type="number" 
                          step="0.01" 
                          style={{ width: '90px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                          defaultValue={exchangeRateUsdToPen}
                          id="newUsdPen"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                          onClick={() => {
                            const usdArs = parseFloat(document.getElementById("newUsdArs").value) || 1400.0;
                            const usdPen = parseFloat(document.getElementById("newUsdPen").value) || 3.75;
                            handleSaveExchangeRates(usdArs, usdPen);
                            setEditingRates(false);
                          }}
                        >
                          Aplicar
                        </button>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                          onClick={() => setEditingRates(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      <div style={{ fontSize: '0.85rem' }}>1 USD = <strong style={{ color: 'var(--accent-gold)' }}>{exchangeRateUsdToArs} ARS</strong></div>
                      <div style={{ fontSize: '0.85rem' }}>1 USD = <strong style={{ color: 'var(--accent-gold)' }}>{exchangeRateUsdToPen} PEN</strong></div>
                      <button 
                        onClick={() => setEditingRates(true)} 
                        className="btn btn-secondary"
                        style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '4px', alignSelf: 'flex-start' }}
                      >
                        Modificar TC
                      </button>
                    </div>
                  )}
                </div>
                {/* Platform Costs Card */}
                <div className="stat-card glass-panel border-green">
                  <span className="stat-label">Costo por Cuenta Titular</span>
                  {editingCosts ? (
                    <div style={{ marginTop: '10px' }}>
                      {renewalsPlatform === "all" ? (
                        <>
                          {["tidal", "deezer", "qobuz"].map(plat => (
                            <div key={plat} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '60px', textTransform: 'capitalize' }}>{plat}:</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                style={{ width: '80px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                                defaultValue={platformCosts[plat]?.cost || 0}
                                id={`cost_${plat}`}
                              />
                              <select
                                style={{ width: '75px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                                defaultValue={platformCosts[plat]?.currency || "PEN"}
                                id={`curr_${plat}`}
                              >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                                <option value="PEN">PEN</option>
                              </select>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button 
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => {
                                const newCosts = { ...platformCosts };
                                ["tidal", "deezer", "qobuz"].forEach(plat => {
                                  const cost = parseFloat(document.getElementById(`cost_${plat}`).value) || 0;
                                  const currency = document.getElementById(`curr_${plat}`).value;
                                  newCosts[plat] = { cost, currency };
                                });
                                setPlatformCosts(newCosts);
                                localStorage.setItem("platform_costs", JSON.stringify(newCosts));
                                setEditingCosts(false);
                              }}
                            >
                              Aplicar
                            </button>
                            <button 
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => setEditingCosts(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '60px', textTransform: 'capitalize' }}>{renewalsPlatform}:</span>
                            <input 
                              type="number" 
                              step="0.01" 
                              style={{ width: '80px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                              defaultValue={platformCosts[renewalsPlatform]?.cost || 0}
                              id={`cost_${renewalsPlatform}`}
                            />
                            <select
                              style={{ width: '75px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                              defaultValue={platformCosts[renewalsPlatform]?.currency || "PEN"}
                              id={`curr_${renewalsPlatform}`}
                            >
                              <option value="ARS">ARS</option>
                              <option value="USD">USD</option>
                              <option value="PEN">PEN</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => {
                                const cost = parseFloat(document.getElementById(`cost_${renewalsPlatform}`).value) || 0;
                                const currency = document.getElementById(`curr_${renewalsPlatform}`).value;
                                const newCosts = {
                                  ...platformCosts,
                                  [renewalsPlatform]: { cost, currency }
                                };
                                setPlatformCosts(newCosts);
                                localStorage.setItem("platform_costs", JSON.stringify(newCosts));
                                setEditingCosts(false);
                              }}
                            >
                              Aplicar
                            </button>
                            <button 
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                              onClick={() => setEditingCosts(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {renewalsPlatform === "all" ? (
                        <>
                          {["tidal", "deezer", "qobuz"].map(plat => {
                            const pCost = platformCosts[plat] || { cost: 0, currency: "PEN" };
                            const costInPen = getCostInPen(pCost.cost, pCost.currency, plat);
                            return (
                              <div key={plat} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                                <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{plat}:</span>
                                <span>
                                  <strong>{pCost.cost} {pCost.currency}</strong> 
                                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginLeft: '6px' }}>(S/. {costInPen.toFixed(2)})</span>
                                </span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '0.95rem' }}>
                            <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', marginRight: '6px' }}>{renewalsPlatform}:</span>
                            <strong>{platformCosts[renewalsPlatform]?.cost || 0} {platformCosts[renewalsPlatform]?.currency || "PEN"}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                            Equivalente: <strong>S/. {getCostInPen(platformCosts[renewalsPlatform]?.cost || 0, platformCosts[renewalsPlatform]?.currency || "PEN", renewalsPlatform).toFixed(2)}</strong>
                          </div>
                        </>
                      )}
                      <button 
                        onClick={() => setEditingCosts(true)} 
                        className="btn btn-secondary"
                        style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '4px', alignSelf: 'flex-start' }}
                      >
                        Modificar Costo
                      </button>
                    </div>
                  )}
                </div>
              </div>



              {/* TIMELINE */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Línea de Tiempo de Renovaciones (Proyección 30 días)</h3>
                  {selectedRenewalDay && (
                    <button 
                      onClick={() => setSelectedRenewalDay(null)} 
                      className="btn btn-secondary"
                      style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      Mostrar Todos los Días
                    </button>
                  )}
                </div>
                
                <div className="timeline-container" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', WebkitOverflowScrolling: 'touch' }}>
                  {timelineDays.map((day) => {
                    const isSelected = selectedRenewalDay === day.dateStr;
                    const maxCount = Math.max(...timelineDays.map(d => d.count), 1);
                    const percent = (day.count / maxCount) * 100;
                    
                    return (
                      <div 
                        key={day.dateStr}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedRenewalDay(null);
                          } else {
                            setSelectedRenewalDay(day.dateStr);
                            setRenewalsPage(1);
                          }
                        }}
                        style={{
                          flex: '0 0 105px',
                          background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.05)',
                          boxShadow: isSelected ? '0 0 10px rgba(6, 182, 212, 0.2)' : 'none',
                          borderRadius: '8px',
                          padding: '10px 6px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          minHeight: '160px'
                        }}
                        className="timeline-day-card"
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: day.isToday ? 'var(--accent-cyan)' : '#fff' }}>
                          {day.label}
                          {day.isToday && <div style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>HOY</div>}
                        </div>
                        
                        {/* Bar */}
                        <div style={{ height: '60px', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', margin: '8px 0', background: 'rgba(255,255,255,0.01)', borderRadius: '4px' }}>
                          <div 
                            style={{ 
                              height: `${percent}%`, 
                              width: '12px', 
                              background: isSelected ? 'linear-gradient(to top, var(--accent-cyan), #0891b2)' : 'linear-gradient(to top, rgba(255,255,255,0.1), rgba(255,255,255,0.25))', 
                              borderRadius: '6px',
                              transition: 'height 0.2s ease'
                            }} 
                          />
                        </div>
                        
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: day.count > 0 ? '#fff' : 'var(--text-muted)' }}>
                            {day.count} {day.count === 1 ? 'cuenta' : 'cuentas'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: day.totalCostPen > 0 ? 'var(--accent-green, #10b981)' : 'var(--text-muted)' }}>
                            S/. {day.totalCostPen.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* LIST & CONTROLS */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {/* Platform Filters */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {["all", "tidal", "deezer", "qobuz"].map(plat => (
                      <button
                        key={plat}
                        onClick={() => {
                          setRenewalsPlatform(plat);
                          setSelectedRenewalDay(null);
                          setRenewalsPage(1);
                        }}
                        className={`btn ${renewalsPlatform === plat ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', textTransform: 'capitalize', borderRadius: '8px' }}
                      >
                        {plat === "all" ? "Todos" : plat}
                      </button>
                    ))}
                  </div>
                  
                  {/* Search Box */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: '1', maxWidth: '350px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Buscar por correo o notas..."
                      value={renewalsSearch}
                      onChange={(e) => {
                        setRenewalsSearch(e.target.value);
                        setRenewalsPage(1);
                      }}
                      style={{ marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="bulk-table-container">
                  <table className="bulk-table">
                    <thead>
                      <tr>
                        <th>Plataforma</th>
                        <th>Correo Titular</th>
                        <th style={{ width: '160px' }}>Vencimiento Dueño</th>
                        <th>Notas</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRenewals.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            No se encontraron cuentas titulares que coincidan con los filtros.
                          </td>
                        </tr>
                      ) : (
                        paginatedRenewals.map((acc) => (
                          <tr key={acc.id}>
                            <td>
                              <span className={`badge-service badge-${acc.service} family-service-tag`}>
                                {acc.service}
                              </span>
                            </td>
                            <td style={{ fontWeight: '500', fontSize: '0.85rem' }}>
                              {acc.masterEmail}
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '0.85rem', marginBottom: 0, width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                                value={acc.ownerRenewalDate || ""}
                                onChange={(e) => handleFamilyAccountChange(acc.id, "ownerRenewalDate", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '0.85rem', marginBottom: 0, width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                                placeholder="Notas..."
                                value={acc.notes || ""}
                                onChange={(e) => handleFamilyAccountChange(acc.id, "notes", e.target.value)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleSaveRenewalInfo(acc.id)}
                                className={`btn btn-primary ${savingAccountId === acc.id ? "btn-disabled" : ""}`}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '4px', width: '100%', minWidth: '80px' }}
                                disabled={savingAccountId === acc.id}
                              >
                                {savingAccountId === acc.id ? "..." : "Guardar"}
                              </button>
                            </td>
                          </tr>
                        )))
                      }
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalRenewalsPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      type="button"
                      onClick={() => setRenewalsPage(prev => Math.max(1, prev - 1))}
                      className="btn btn-secondary"
                      style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
                      disabled={renewalsPage === 1}
                    >
                      Anterior
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Página <strong>{renewalsPage}</strong> de <strong>{totalRenewalsPages}</strong> ({finalRenewalsList.length} cuentas)
                    </span>
                    <button
                      type="button"
                      onClick={() => setRenewalsPage(prev => Math.min(totalRenewalsPages, prev + 1))}
                      className="btn btn-secondary"
                      style={{ padding: '5px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
                      disabled={renewalsPage === totalRenewalsPages}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            </section>
          )})()}

        {/* TAB 6: CUSTOMER PAYMENTS VALIDATION */}
        {activeTab === "payments" && (() => {
          return (
            <section className="payments-section animate-fade-in" style={{ paddingBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Validar Pagos de Clientes</h2>
                  <p className="section-instruction">
                    Revisa los comprobantes de pago subidos por tus clientes y confirma o rechaza las renovaciones de sus cupos.
                  </p>
                </div>
              </div>

              {payments.length === 0 ? (
                <div className="empty-panel glass-panel text-center" style={{ padding: '40px' }}>
                  <p style={{ color: 'var(--text-muted)' }}>No se han reportado pagos de clientes todavía.</p>
                </div>
              ) : (
                <div className="payments-list-wrapper glass-panel" style={{ overflow: 'hidden', padding: '15px' }}>
                  <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 10px' }}>Cliente</th>
                          <th style={{ padding: '12px 10px' }}>Servicio</th>
                          <th style={{ padding: '12px 10px' }}>Monto</th>
                          <th style={{ padding: '12px 10px' }}>Método</th>
                          <th style={{ padding: '12px 10px' }}>Comprobante</th>
                          <th style={{ padding: '12px 10px' }}>Detalles / Operación</th>
                          <th style={{ padding: '12px 10px' }}>Fecha</th>
                          <th style={{ padding: '12px 10px' }}>Estado</th>
                          <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => {
                          const isPending = p.status === "pending";
                          const isConfirmed = p.status === "confirmed";
                          const isRejected = p.status === "rejected";

                          let statusStyle = { color: '#eab308', background: 'rgba(234, 179, 8, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                          let statusText = "Pendiente";

                          if (isConfirmed) {
                            statusStyle = { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                            statusText = "Confirmado";
                          } else if (isRejected) {
                            statusStyle = { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' };
                            statusText = "Rechazado";
                          }

                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} className="table-row-hover">
                              <td style={{ padding: '12px 10px' }}>
                                <strong style={{ color: '#fff', display: 'block' }}>{p.clientName}</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.clientCode}</span>
                              </td>
                              <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>
                                <span className={`platform-badge ${p.service}`} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                  {p.service}
                                </span>
                              </td>
                              <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#fff' }}>
                                S/. {p.amount.toFixed(2)}
                              </td>
                              <td style={{ padding: '12px 10px', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                                {p.paymentMethod}
                              </td>
                              <td style={{ padding: '12px 10px' }}>
                                {p.proofUrl ? (
                                  <a 
                                    href={p.proofUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                                  >
                                    <img 
                                      src={p.proofUrl} 
                                      alt="Comprobante" 
                                      style={{ width: '35px', height: '35px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} 
                                    />
                                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', textDecoration: 'underline' }}>Ver captura</span>
                                  </a>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Sin captura</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem', color: '#ccc', maxWidth: '180px', wordBreak: 'break-word' }}>
                                {p.notes || "-"}
                              </td>
                              <td style={{ padding: '12px 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {new Date(p.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '12px 10px' }}>
                                <span style={statusStyle}>{statusText}</span>
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                {isPending ? (
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                    <button
                                      onClick={() => handleProcessPayment(p.id, "confirm")}
                                      className="btn btn-primary"
                                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', background: 'var(--green-theme, #10b981)', border: 'none' }}
                                      disabled={actionPaymentId === p.id}
                                    >
                                      {actionPaymentId === p.id ? "..." : "Aprobar"}
                                    </button>
                                    <button
                                      onClick={() => setRejectNotesModal({ show: true, paymentId: p.id })}
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', borderColor: '#ef4444', color: '#ef4444' }}
                                      disabled={actionPaymentId === p.id}
                                    >
                                      Rechazar
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Procesado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Reject Notes Modal */}
              {rejectNotesModal.show && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                  <div className="glass-panel p-6" style={{ maxWidth: '400px', width: '100%', margin: '0 15px', background: '#0f0f13', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                    <h3 style={{ marginBottom: '8px', color: '#fff' }}>Rechazar Pago</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '15px', lineHeight: '1.4' }}>
                      Ingresa el motivo del rechazo. El cliente podrá verlo en su panel para volver a reportarlo con los datos correctos.
                    </p>
                    <textarea
                      style={{ width: '100%', height: '100px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', marginBottom: '15px', resize: 'none' }}
                      placeholder="ej. El monto no coincide con la transferencia / Operación no encontrada en la cuenta."
                      value={rejectNotesInput}
                      onChange={(e) => setRejectNotesInput(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        onClick={() => setRejectNotesModal({ show: false, paymentId: "" })}
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#ef4444', border: 'none' }}
                        onClick={() => handleProcessPayment(rejectNotesModal.paymentId, "reject", rejectNotesInput)}
                      >
                        Confirmar Rechazo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })()}

        {/* TAB 7: WHATSAPP BILLING GESTION */}
        {activeTab === "whatsapp_billing" && (() => {
          // 1. Grouping and filtering logic
          const today = new Date();
          const yStr = today.getFullYear();
          const mStr = String(today.getMonth() + 1).padStart(2, '0');
          const dStr = String(today.getDate()).padStart(2, '0');
          const todayStr = `${yStr}-${mStr}-${dStr}`;

          // Filter: only occupied slots (status !== 'free'), must have a client, renewalDate <= todayStr
          let filteredBillingSlots = allSlots.filter(s => 
            s.clientId && 
            s.status !== "free" && 
            s.renewalDate && 
            s.renewalDate <= todayStr
          );

          // Apply billingSearchQuery if present
          if (billingSearchQuery.trim()) {
            const q = billingSearchQuery.toLowerCase().trim();
            filteredBillingSlots = filteredBillingSlots.filter(s => {
              const nickname = s.clientId?.nickname?.toLowerCase() || "";
              const code = s.clientId?.customerCode?.toLowerCase() || "";
              const phone = s.clientId?.currentWhatsApp || "";
              return nickname.includes(q) || code.includes(q) || phone.includes(q);
            });
          }

          // Group by renewalDate
          const grouped = {};
          filteredBillingSlots.forEach(s => {
            const date = s.renewalDate;
            if (!grouped[date]) {
              grouped[date] = [];
            }
            grouped[date].push(s);
          });

          // Sort dates: today first, then past dates descending (most recent first)
          const sortedDates = Object.keys(grouped).sort((a, b) => {
            if (a === todayStr) return -1;
            if (b === todayStr) return 1;
            return b.localeCompare(a);
          });

          const totalBillingCount = filteredBillingSlots.length;

          // Helper to get formatted title
          const getSectionTitle = (dateStr) => {
            if (dateStr === todayStr) {
              return `Vencen Hoy - ${formatDate(dateStr)}`;
            } else {
              const days = getDaysAgo(dateStr, todayStr);
              return `Vencieron el ${formatDate(dateStr)} (${days} ${days === 1 ? 'día' : 'días'} de retraso)`;
            }
          };

          return (
            <section className="whatsapp-billing-section animate-fade-in" style={{ paddingBottom: '40px' }}>
              
              {/* Header block with statistics and search */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Gestión de Cobranzas por WhatsApp
                    <span style={{ 
                      background: 'var(--accent-cyan, #00e5ff)', 
                      color: '#08080a', 
                      padding: '4px 10px', 
                      borderRadius: '9999px', 
                      fontSize: '0.85rem', 
                      fontWeight: 'bold' 
                    }}>
                      {totalBillingCount} Clientes
                    </span>
                  </h2>
                  <p className="section-instruction">
                    Envía recordatorios personalizados de pago directamente al WhatsApp de los clientes que vencen hoy o que tienen vencimientos pasados.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%', md: 'auto', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Search Input */}
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por apodo, código o celular..."
                    style={{ maxWidth: '280px', height: '40px', margin: 0 }}
                    value={billingSearchQuery}
                    onChange={(e) => setBillingSearchQuery(e.target.value)}
                  />

                  {/* Toggle templates config button */}
                  <button
                    onClick={() => setShowTemplateConfig(!showTemplateConfig)}
                    className="btn btn-secondary"
                    style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}
                  >
                    <span>Configurar Plantillas</span>
                    <span style={{ transition: 'transform 0.2s', transform: showTemplateConfig ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                  </button>
                </div>
              </div>

              {/* Collapsed Template Configuration Area */}
              {showTemplateConfig && (
                <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 style={{ marginBottom: '15px', fontSize: '1.1rem', color: 'var(--accent-cyan, #00e5ff)' }}>Plantillas de Mensajes</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                    Personaliza los mensajes predeterminados usando las siguientes etiquetas variables:
                    <br />
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{cliente}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{servicio}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{perfil}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{vencimiento}`}</code>,{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#ffb74d' }}>{`{precio}`}</code>
                  </p>
                  
                  {/* Template Editor Form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                      <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Mensaje para clientes que vencen hoy:</label>
                      <textarea
                        className="form-input form-textarea"
                        rows={3}
                        defaultValue={templateToday}
                        id="temp-today-input"
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Mensaje para clientes con vencimiento pasado (Deudores):</label>
                      <textarea
                        className="form-input form-textarea"
                        rows={3}
                        defaultValue={templatePast}
                        id="temp-past-input"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowTemplateConfig(false)} 
                        className="btn btn-secondary"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const todayVal = document.getElementById("temp-today-input").value;
                          const pastVal = document.getElementById("temp-past-input").value;
                          handleSaveTemplates(todayVal, pastVal);
                        }} 
                        className="btn btn-primary"
                      >
                        Guardar Plantillas
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main lists */}
              {totalBillingCount === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '12px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
                    {billingSearchQuery ? "No se encontraron clientes que coincidan con la búsqueda." : "No hay clientes pendientes de cobro (vencimientos hoy o pasados) sin registrar pago."}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                  {sortedDates.map(dateKey => {
                    const slots = grouped[dateKey];
                    const isToday = dateKey === todayStr;
                    
                    return (
                      <div 
                        key={dateKey} 
                        className="glass-panel" 
                        style={{ 
                          padding: '20px', 
                          borderRadius: '12px',
                          border: isToday ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        {/* Title block with date */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          marginBottom: '15px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          paddingBottom: '10px'
                        }}>
                          <h3 style={{ 
                            fontSize: '1.1rem', 
                            fontWeight: '600', 
                            color: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              background: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444',
                              display: 'inline-block' 
                            }}></span>
                            {getSectionTitle(dateKey)}
                          </h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {slots.length} {slots.length === 1 ? 'cliente' : 'clientes'}
                          </span>
                        </div>

                        {/* DESKTOP VIEW (TABLE) */}
                        <div className="hidden-mobile-table-wrapper" style={{ overflowX: 'auto' }}>
                          <table className="admin-table whatsapp-billing-table">
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Servicio</th>
                                <th>Correo Perfil</th>
                                <th>Precio</th>
                                <th style={{ width: '45%' }}>Mensaje Personalizado</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map(slot => {
                                const phoneNum = slot.clientId?.currentWhatsApp || "";
                                const cleanPhone = phoneNum.replace(/[^0-9]/g, "");
                                const msgText = getMessageForSlot(slot);
                                
                                return (
                                  <tr key={slot.id}>
                                    <td>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontWeight: 'bold' }}>{slot.clientId?.nickname || "Sin Apodo"}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Código: {slot.clientId?.customerCode || "---"}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan, #00e5ff)' }}>{getCountryFlag(phoneNum)} {phoneNum}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <span className={`service-badge badge-${slot.service}`}>
                                        {slot.service ? slot.service.toUpperCase() : ""}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '0.85rem' }}>{slot.memberEmail}</td>
                                    <td style={{ fontWeight: '600' }}>S/. {slot.pricePen || "0.00"}</td>
                                    <td>
                                      <textarea
                                        className="form-input form-textarea"
                                        rows={2}
                                        style={{ fontSize: '0.8rem', width: '100%', resize: 'vertical', minHeight: '60px' }}
                                        value={msgText}
                                        onChange={(e) => handleMessageChange(slot.id, e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <a
                                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-whatsapp-send"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '6px',
                                          background: '#25D366',
                                          color: '#fff',
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          fontSize: '0.8rem',
                                          fontWeight: 'bold',
                                          textDecoration: 'none',
                                          transition: 'background 0.2s'
                                        }}
                                      >
                                        <WhatsAppIcon size={14} />
                                        <span>Enviar</span>
                                      </a>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* MOBILE VIEW (CARDS) */}
                        <div className="visible-mobile-cards-list" style={{ display: 'none', flexDirection: 'column', gap: '15px' }}>
                          {slots.map(slot => {
                            const phoneNum = slot.clientId?.currentWhatsApp || "";
                            const cleanPhone = phoneNum.replace(/[^0-9]/g, "");
                            const msgText = getMessageForSlot(slot);
                            
                            return (
                              <div 
                                key={slot.id} 
                                className="mobile-billing-card" 
                                style={{
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  borderRadius: '10px',
                                  padding: '15px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px'
                                }}
                              >
                                {/* Card Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <h4 style={{ margin: '0 0 2px 0', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                      {slot.clientId?.nickname || "Sin Apodo"}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Cód: {slot.clientId?.customerCode || "---"} | WhatsApp: {phoneNum}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <span className={`service-badge badge-${slot.service}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                      {slot.service ? slot.service.toUpperCase() : ""}
                                    </span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                                      S/. {slot.pricePen || "0.00"}
                                    </span>
                                  </div>
                                </div>

                                {/* Card body */}
                                <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Perfil:</span>
                                    <span style={{ fontWeight: '500', wordBreak: 'break-all' }}>{slot.memberEmail}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Vence:</span>
                                    <span style={{ fontWeight: '500', color: isToday ? 'var(--accent-cyan, #00e5ff)' : '#ef4444' }}>{formatDate(slot.renewalDate)}</span>
                                  </div>
                                </div>

                                {/* Text editor for customized message */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>Mensaje personalizado:</label>
                                  <textarea
                                    className="form-input form-textarea"
                                    rows={3}
                                    style={{ fontSize: '0.8rem', width: '100%', resize: 'none' }}
                                    value={msgText}
                                    onChange={(e) => handleMessageChange(slot.id, e.target.value)}
                                  />
                                </div>

                                {/* Action button */}
                                <a
                                  href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-whatsapp-send-mobile"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: '#25D366',
                                    color: '#fff',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    textDecoration: 'none',
                                    textAlign: 'center',
                                    boxShadow: '0 4px 10px rgba(37, 211, 102, 0.2)'
                                  }}
                                >
                                  <WhatsAppIcon size={16} />
                                  <span>Enviar WhatsApp</span>
                                </a>

                              </div>
                            );
                          })}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </section>
          );
        })()}

        {/* TAB 8: CONSOLIDATION & ORGANIZER */}
        {activeTab === "organizer" && (() => {
          const getDaysDiff = (expiryDateStr) => {
            if (!expiryDateStr) return null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const parts = expiryDateStr.split("-");
            if (parts.length !== 3) return null;
            const expiry = new Date(parts[0], parts[1] - 1, parts[2]);
            expiry.setHours(0,0,0,0);
            const diffTime = expiry.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
          };

          const selectedServiceAccounts = familyAccounts.filter(acc => acc.service === organizerPlatform);
          
          let totalActiveMembers = 0;
          let totalFreeSlots = 0;
          const accountsList = [];

          selectedServiceAccounts.forEach(acc => {
            const activeSlots = (acc.profiles || []).filter(p => p.status !== "free" && p.clientId);
            const freeSlots = (acc.profiles || []).filter(p => p.status === "free");
            totalActiveMembers += activeSlots.length;
            totalFreeSlots += freeSlots.length;
            
            accountsList.push({
              ...acc,
              activeCount: activeSlots.length,
              freeCount: freeSlots.length,
              daysRemaining: getDaysDiff(acc.ownerRenewalDate)
            });
          });

          // Sort by daysRemaining ascending (earliest expiration first)
          accountsList.sort((a, b) => {
            if (a.daysRemaining === null) return 1;
            if (b.daysRemaining === null) return -1;
            return a.daysRemaining - b.daysRemaining;
          });

          const optimalAccounts = Math.ceil(totalActiveMembers / 5);
          const excessAccounts = Math.max(0, accountsList.length - optimalAccounts);

          return (
            <section className="organizer-section animate-fade-in" style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>Organizador y Consolidación de Miembros</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Reorganiza miembros de planes familiares para liberar y desactivar cuentas titulares próximas a vencer.
                  </p>
                </div>
              </div>

              {/* PLATFORM SELECTOR TABS */}
              <div className="platform-tabs-nav" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                {["tidal", "deezer", "qobuz"].map((plat) => (
                  <button
                    key={plat}
                    onClick={() => setOrganizerPlatform(plat)}
                    className={`platform-tab-btn ${organizerPlatform === plat ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      background: organizerPlatform === plat ? 'var(--accent-purple, #a855f7)' : 'rgba(255,255,255,0.03)',
                      color: '#fff',
                      border: organizerPlatform === plat ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: organizerPlatform === plat ? '0 0 12px rgba(168, 85, 247, 0.4)' : 'none'
                    }}
                  >
                    {plat}
                  </button>
                ))}
              </div>

              {/* OPTIMIZATION DASHBOARD */}
              <div className="organizer-stats-grid">
                <div className="organizer-stat-card glass-panel" style={{ borderLeft: '4px solid var(--accent-purple, #a855f7)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Miembros Activos</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', margin: '4px 0' }}>
                    {totalActiveMembers} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>en uso</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan, #00e5ff)' }}>
                    {totalFreeSlots} cupos libres disponibles
                  </span>
                </div>

                <div className="organizer-stat-card glass-panel" style={{ borderLeft: '4px solid var(--accent-cyan, #00e5ff)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cuentas Familiares</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', margin: '4px 0' }}>
                    {accountsList.length} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>actuales</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Número óptimo teórico: <strong>{optimalAccounts}</strong> {optimalAccounts === 1 ? 'cuenta' : 'cuentas'}
                  </span>
                </div>

                <div className={`organizer-stat-card ${excessAccounts > 0 ? 'alert-action' : 'ok-action'}`}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Análisis de Optimización</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {excessAccounts > 0 ? (
                      <>
                        <span>⚠️ Consolidación Recomendada</span>
                      </>
                    ) : (
                      <>
                        <span>✓ Cuentas Optimizadas</span>
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    {excessAccounts > 0 ? (
                      `Puedes transferir los miembros activos a las cuentas con mayor vigencia para desactivar/dar de baja ${excessAccounts} cuenta(s) titular(es) sin perder clientes.`
                    ) : (
                      `No se detectan cuentas excedentes. Todas las cuentas están siendo aprovechadas eficientemente.`
                    )}
                  </p>
                </div>
              </div>

              {/* LIST OF ACCOUNTS FOR CONSOLIDATION */}
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: '#fff' }}>Ocupación de Cuentas (Ordenadas por Vencimiento Próximo)</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {accountsList.length === 0 ? (
                  <div className="empty-panel glass-panel text-center" style={{ padding: '40px' }}>
                    <p>No se encontraron cuentas familiares registradas para {organizerPlatform.toUpperCase()}.</p>
                  </div>
                ) : (
                  accountsList.map((acc) => {
                    const accId = acc._id || acc.id;
                    const days = acc.daysRemaining;
                    
                    let expiryClass = "";
                    let expiryText = "";
                    let isCritical = false;

                    if (days === null) {
                      expiryText = "Fecha de vencimiento no configurada";
                      expiryClass = "badge-expired";
                    } else if (days < 0) {
                      expiryText = `Vencida hace ${Math.abs(days)} días`;
                      expiryClass = "badge-expired";
                      isCritical = true;
                    } else if (days === 0) {
                      expiryText = "VENCE HOY";
                      expiryClass = "badge-expired pulsing-expiry-badge";
                      isCritical = true;
                    } else if (days === 1) {
                      expiryText = "VENCE MAÑANA";
                      expiryClass = "soon pulsing-expiry-badge";
                      isCritical = true;
                    } else if (days <= 3) {
                      expiryText = `Vence en ${days} días`;
                      expiryClass = "soon";
                      isCritical = true;
                    } else {
                      expiryText = `Vence en ${days} días (${formatDate(acc.ownerRenewalDate)})`;
                      expiryClass = "active";
                    }

                    return (
                      <div
                        key={accId}
                        className="family-card glass-panel"
                        style={{
                          borderColor: isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.05)',
                          boxShadow: isCritical ? '0 0 15px rgba(239, 68, 68, 0.05)' : 'none'
                        }}
                      >
                        {/* LEFT COLUMN: ACCOUNT CREDENTIALS & METRICS */}
                        <div className="family-info-col" style={{ borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span className={`badge-service badge-${acc.service}`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
                              {acc.service}
                            </span>
                            <span className={`status-badge-mini ${expiryClass}`} style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {expiryText}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>CORREO TITULAR:</span>
                              <strong style={{ color: '#fff', wordBreak: 'break-all' }}>{acc.masterEmail}</strong>
                            </div>
                            <div style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>CONTRASEÑA:</span>
                              <strong style={{ color: '#fff' }}>{acc.password}</strong>
                            </div>
                          </div>

                          {/* circular indicators */}
                          <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OCUPACIÓN: {acc.activeCount} / 5 MIEMBROS</span>
                            <div className="slots-indicator-dots">
                              {[1, 2, 3, 4, 5].map((num) => {
                                const isOccupied = num <= acc.activeCount;
                                return (
                                  <span
                                    key={num}
                                    className={`slot-dot ${isOccupied ? 'active' : 'free'}`}
                                    title={isOccupied ? 'Ranura Ocupada' : 'Ranura Disponible'}
                                  />
                                );
                              })}
                            </div>
                            
                            {acc.activeCount === 0 && (
                              <div style={{ marginTop: '12px', padding: '6px 10px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '6px', color: '#4ade80', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                ✓ Cuenta sin miembros activos. Lista para desactivar.
                              </div>
                            )}

                            {isCritical && acc.activeCount > 0 && (
                              <div style={{ marginTop: '12px', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', color: '#f87171', fontSize: '0.75rem' }}>
                                ⚠️ Vence pronto y tiene {acc.activeCount} {acc.activeCount === 1 ? 'miembro' : 'miembros'}. ¡Consolidar!
                              </div>
                            )}
                          </div>
                        </div>

                        {/* RIGHT COLUMN: SLOTS DETAILED LIST */}
                        <div className="family-slots-col" style={{ flex: 1 }}>
                          <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                            Miembros Activados
                          </h4>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {acc.profiles && acc.profiles.map((p) => {
                              const pId = p._id || p.id;
                              const isActive = p.status !== "free" && p.clientId;
                              
                              return (
                                <div
                                  key={pId}
                                  className="slot-item-row"
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    background: isActive ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.002)',
                                    border: isActive ? '1px solid rgba(255,255,255,0.04)' : '1px dotted rgba(255,255,255,0.05)',
                                    borderRadius: '8px'
                                  }}
                                >
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-purple, #a855f7)' }}>
                                        Ranura {p.slotNumber}
                                      </span>
                                      
                                      {isActive ? (
                                        <>
                                          <span className="client-name-tag" style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                            👤 {p.clientId.nickname || "Cliente"} ({p.clientId.customerCode || "CLI"})
                                          </span>
                                          <a
                                            href={`https://wa.me/${p.clientId.currentWhatsApp.replace(/[^0-9]/g, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ fontSize: '0.75rem', textDecoration: 'none', color: '#25D366' }}
                                          >
                                            {getCountryFlag(p.clientId.currentWhatsApp)} {p.clientId.currentWhatsApp}
                                          </a>
                                        </>
                                      ) : (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                          Libre / Disponible
                                        </span>
                                      )}
                                    </div>

                                    {isActive && (
                                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        <span>Correo: <strong style={{ color: 'var(--text-muted-light, #ccc)' }}>{p.memberEmail}</strong></span>
                                        <span>Clave: <strong style={{ color: 'var(--text-muted-light, #ccc)' }}>{p.memberPassword}</strong></span>
                                        {p.renewalDate && (
                                          <span>Vence cliente: <strong style={{ color: 'var(--accent-cyan, #00e5ff)' }}>{formatDate(p.renewalDate)}</strong></span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* MOVE BUTTON */}
                                  {isActive && (
                                    <button
                                      onClick={() => {
                                        setTransferSourceSlot(p);
                                        setTransferSourceAccount(acc);
                                        setShowTransferModal(true);
                                        setTransferError("");
                                        setTransferSuccess("");
                                      }}
                                      className="btn-transfer-member"
                                    >
                                      <span>Mover Miembro</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })()}

        {activeTab === "profitability" && (() => {
          // 1. Helper function to get monthly equivalent value
          const getMonthlyEquivalent = (price, service) => {
            const p = Number(price) || 0;
            if (service === 'qobuz') {
              return p; // Qobuz only has 1 month plan (S/. 9)
            }
            if (p <= 7) return p; // 1 Mes (S/. 6)
            if (p <= 15) return p / 2; // 2 Meses (S/. 9)
            if (p <= 35) return p / 6; // 6 Meses (S/. 25)
            return p / 12; // 12 Meses (S/. 45)
          };

          // 2. Helper to get plan name
          const getPlanDuration = (price, service) => {
            const p = Number(price) || 0;
            if (service === 'qobuz') return "1 Mes";
            if (p <= 7) return "1 Mes";
            if (p <= 15) return "2 Meses";
            if (p <= 35) return "6 Meses";
            return "12 Meses";
          };

          // 3. Calculate metrics for each service
          const getPlatformStats = (serviceName, simulatedCost = null, simulatedTC = null, simClientMult = 1) => {
            const serviceAccounts = familyAccounts.filter(acc => acc.service === serviceName);
            const serviceSlots = allSlots.filter(s => s.service === serviceName);
            const activeServiceSlots = serviceSlots.filter(s => s.status === 'active');

            // Costs calculation
            const totalCost = serviceAccounts.reduce((sum, acc) => {
              if (serviceName === 'tidal' && simulatedCost !== null) {
                const cur = platformCosts[serviceName]?.currency || "ARS";
                const tc = simulatedTC !== null ? simulatedTC : exchangeRateUsdToArs;
                
                if (cur === 'ARS') {
                  const costInUsd = tc > 0 ? (simulatedCost / tc) : 0;
                  return sum + (costInUsd * exchangeRateUsdToPen);
                } else if (cur === 'USD') {
                  return sum + (simulatedCost * exchangeRateUsdToPen);
                } else {
                  return sum + simulatedCost;
                }
              }

              const pCost = platformCosts[serviceName] || { cost: 0, currency: "PEN" };
              return sum + getCostInPen(pCost.cost, pCost.currency, serviceName);
            }, 0);

            // Revenue calculation
            const baseRevenue = activeServiceSlots.reduce((sum, s) => {
              return sum + getMonthlyEquivalent(s.pricePen, serviceName);
            }, 0);
            
            const totalRevenue = baseRevenue * simClientMult;
            const profit = totalRevenue - totalCost;
            const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

            return {
              accountsCount: serviceAccounts.length,
              slotsCount: serviceSlots.length,
              activeSlotsCount: activeServiceSlots.length,
              simulatedActiveSlotsCount: Math.round(activeServiceSlots.length * simClientMult),
              totalCost,
              totalRevenue,
              profit,
              margin
            };
          };

          // Compute actual statistics
          const statsTidal = getPlatformStats('tidal');
          const statsDeezer = getPlatformStats('deezer');
          const statsQobuz = getPlatformStats('qobuz');

          const overallRevenue = statsTidal.totalRevenue + statsDeezer.totalRevenue + statsQobuz.totalRevenue;
          const overallCost = statsTidal.totalCost + statsDeezer.totalCost + statsQobuz.totalCost;
          const overallProfit = overallRevenue - overallCost;
          const overallMargin = overallRevenue > 0 ? (overallProfit / overallRevenue) * 100 : 0;

          // Compute simulated statistics
          const simMult = 1 + (simClientIncrease / 100);
          const simTidal = getPlatformStats('tidal', simTidalCost, simUsdArs, simMult);
          const simDeezer = getPlatformStats('deezer', null, null, simMult);
          const simQobuz = getPlatformStats('qobuz', null, null, simMult);

          const simOverallRevenue = simTidal.totalRevenue + simDeezer.totalRevenue + simQobuz.totalRevenue;
          const simOverallCost = simTidal.totalCost + simDeezer.totalCost + simQobuz.totalCost;
          const simOverallProfit = simOverallRevenue - simOverallCost;
          const simOverallMargin = simOverallRevenue > 0 ? (simOverallProfit / simOverallRevenue) * 100 : 0;

          // Count plan distributions for Tidal and Deezer active slots
          const planCounts = { "1 Mes": 0, "2 Meses": 0, "6 Meses": 0, "12 Meses": 0 };
          allSlots.forEach(s => {
            if (s.status === 'active' && (s.service === 'tidal' || s.service === 'deezer')) {
              const plan = getPlanDuration(s.pricePen, s.service);
              if (planCounts[plan] !== undefined) {
                planCounts[plan]++;
              }
            }
          });

          // Donut Chart Math (angles and offsets)
          const profits = [
            { name: "Tidal", value: Math.max(0, statsTidal.profit), color: "#a855f7" },
            { name: "Deezer", value: Math.max(0, statsDeezer.profit), color: "#eab308" },
            { name: "Qobuz", value: Math.max(0, statsQobuz.profit), color: "#06b6d4" }
          ];
          const totalProfitForDonut = profits.reduce((sum, p) => sum + p.value, 0);

          let accumPercentage = 0;
          const donutSegments = profits.map((p) => {
            const percentage = totalProfitForDonut > 0 ? (p.value / totalProfitForDonut) * 100 : 0;
            const strokeDasharray = `${percentage} ${100 - percentage}`;
            const strokeDashoffset = 100 - accumPercentage + 25; // 25 is rotation adjustment
            accumPercentage += percentage;
            return {
              ...p,
              percentage,
              strokeDasharray,
              strokeDashoffset
            };
          });

          // Maximum value for vertical bar chart scaling
          const maxVal = Math.max(
            statsTidal.totalRevenue, statsTidal.totalCost,
            statsDeezer.totalRevenue, statsDeezer.totalCost,
            statsQobuz.totalRevenue, statsQobuz.totalCost,
            100 // fallback floor
          );

          const getBarHeight = (val) => {
            return `${(val / maxVal) * 100}%`;
          };

          return (
            <section className="profitability-section animate-fade-in">
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '4px' }}>Dashboard de Rentabilidad</h2>
                <p className="section-instruction">
                  Análisis contable de ingresos mensuales proyectados, costos reales de cuentas y márgenes netos de ganancias.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card glass-panel border-cyan">
                  <span className="stat-label">Ingreso Bruto Mensual (PEN)</span>
                  <strong className="stat-value text-cyan">S/. {overallRevenue.toFixed(2)}</strong>
                  <span className="stat-desc">Equivalente de todos los slots activos</span>
                </div>

                <div className="stat-card glass-panel border-purple">
                  <span className="stat-label">Costo Mensual Proveedores (PEN)</span>
                  <strong className="stat-value text-purple">S/. {overallCost.toFixed(2)}</strong>
                  <span className="stat-desc">Costo mensual de las {familyAccounts.length} cuentas titulares</span>
                </div>

                <div className="stat-card glass-panel border-green">
                  <span className="stat-label">Utilidad Neta Mensual</span>
                  <strong className="stat-value text-green">S/. {overallProfit.toFixed(2)}</strong>
                  <span className="stat-desc">Margen neto de retorno financiero</span>
                </div>

                <div className="stat-card glass-panel border-yellow">
                  <span className="stat-label">Margen de Rentabilidad</span>
                  <strong className="stat-value text-yellow">{overallMargin.toFixed(1)}%</strong>
                  <span className="stat-desc">Ganancia neta sobre el volumen de ingresos</span>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="profitability-grid-charts">
                {/* 1. Bar Chart: Revenues vs Costs */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-cyan)' }}>📊</span> Ingresos vs. Costos por Servicio
                  </h3>
                  <div className="bar-chart-vertical">
                    {/* Tidal */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsTidal.totalRevenue) }}>
                          <span className="bar-tooltip-val">Ingreso: S/. {statsTidal.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsTidal.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsTidal.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Tidal</span>
                    </div>

                    {/* Deezer */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsDeezer.totalRevenue) }}>
                          <span className="bar-tooltip-val">Ingreso: S/. {statsDeezer.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsDeezer.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsDeezer.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Deezer</span>
                    </div>

                    {/* Qobuz */}
                    <div className="bar-group-platform">
                      <div className="bars-dual-wrapper">
                        <div className="bar-single-rect income" style={{ height: getBarHeight(statsQobuz.totalRevenue) }}>
                          <span className="bar-tooltip-val">Ingreso: S/. {statsQobuz.totalRevenue.toFixed(0)}</span>
                        </div>
                        <div className="bar-single-rect cost" style={{ height: getBarHeight(statsQobuz.totalCost) }}>
                          <span className="bar-tooltip-val">Costo: S/. {statsQobuz.totalCost.toFixed(0)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>Qobuz</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Ingresos</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ef4444', borderRadius: '2px' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Costos</span>
                    </div>
                  </div>
                </div>

                {/* 2. Donut Chart: Utility Breakdown */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-purple)' }}>🍩</span> Participación de Utilidad Neta
                  </h3>
                  <div className="chart-container-flex">
                    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                      <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut-svg">
                        <circle className="donut-hole" cx="21" cy="21" r="15.915"></circle>
                        <circle className="donut-ring" cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4"></circle>
                        
                        {totalProfitForDonut > 0 ? (
                          donutSegments.map((seg, idx) => (
                            <circle
                              key={idx}
                              className="donut-segment"
                              cx="21"
                              cy="21"
                              r="15.915"
                              fill="transparent"
                              stroke={seg.color}
                              strokeDasharray={seg.strokeDasharray}
                              strokeDashoffset={seg.strokeDashoffset}
                            ></circle>
                          ))
                        ) : (
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="3" strokeDasharray="100 0"></circle>
                        )}
                      </svg>
                      <div className="donut-center-text">
                        <span className="donut-center-val">S/. {overallProfit.toFixed(0)}</span>
                        <span className="donut-center-lbl">Utilidad</span>
                      </div>
                    </div>

                    <div className="donut-legend">
                      {donutSegments.map((seg, idx) => (
                        <div key={idx} className="legend-item">
                          <span className="legend-color-dot" style={{ background: seg.color }}></span>
                          <span style={{ fontWeight: '500' }}>{seg.name}:</span>
                          <span style={{ color: 'var(--text-muted)' }}>{seg.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Horizontal Chart: Plan distribution */}
                <div className="chart-card-wrapper glass-panel">
                  <h3 className="chart-title">
                    <span style={{ color: 'var(--accent-yellow)' }}>📈</span> Distribución de Planes (Tidal/Deezer)
                  </h3>
                  <div className="bar-chart-horizontal" style={{ marginTop: '10px' }}>
                    {Object.keys(planCounts).map((plan) => {
                      const count = planCounts[plan];
                      const totalActiveTidalDeezer = Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
                      const pct = (count / totalActiveTidalDeezer) * 100;
                      return (
                        <div key={plan} className="h-bar-row">
                          <div className="h-bar-info">
                            <span style={{ fontWeight: '600', color: '#fff' }}>{plan}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{count} miembros ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-bar-track">
                            <div className="h-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(to right, rgba(168, 85, 247, 0.4), rgba(0, 229, 255, 0.8))' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Table Platform Breakdown */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#fff' }}>Detalle Económico por Plataforma</h3>
                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Plataforma</th>
                        <th className="text-center">Cuentas Titulares</th>
                        <th className="text-center">Slots Ocupados / Totales</th>
                        <th className="text-right">Ingreso Mensual</th>
                        <th className="text-right">Costo Mensual</th>
                        <th className="text-right">Utilidad Neta</th>
                        <th className="text-right">Margen ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Tidal */}
                      <tr>
                        <td>
                          <span className="badge-service badge-tidal">Tidal</span>
                        </td>
                        <td className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsTidal.accountsCount}</td>
                        <td className="text-center" style={{ color: 'var(--text-muted)' }}>
                          <span style={{ color: '#fff', fontWeight: '600' }}>{statsTidal.activeSlotsCount}</span> / {statsTidal.slotsCount}
                        </td>
                        <td className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsTidal.totalRevenue.toFixed(2)}</td>
                        <td className="text-right" style={{ color: '#f87171' }}>S/. {statsTidal.totalCost.toFixed(2)}</td>
                        <td className="text-right" style={{ color: statsTidal.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                          S/. {statsTidal.profit.toFixed(2)}
                        </td>
                        <td className="text-right" style={{ color: statsTidal.margin >= 40 ? '#4ade80' : statsTidal.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                          {statsTidal.margin.toFixed(1)}%
                        </td>
                      </tr>

                      {/* Deezer */}
                      <tr>
                        <td>
                          <span className="badge-service badge-deezer">Deezer</span>
                        </td>
                        <td className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsDeezer.accountsCount}</td>
                        <td className="text-center" style={{ color: 'var(--text-muted)' }}>
                          <span style={{ color: '#fff', fontWeight: '600' }}>{statsDeezer.activeSlotsCount}</span> / {statsDeezer.slotsCount}
                        </td>
                        <td className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsDeezer.totalRevenue.toFixed(2)}</td>
                        <td className="text-right" style={{ color: '#f87171' }}>S/. {statsDeezer.totalCost.toFixed(2)}</td>
                        <td className="text-right" style={{ color: statsDeezer.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                          S/. {statsDeezer.profit.toFixed(2)}
                        </td>
                        <td className="text-right" style={{ color: statsDeezer.margin >= 40 ? '#4ade80' : statsDeezer.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                          {statsDeezer.margin.toFixed(1)}%
                        </td>
                      </tr>

                      {/* Qobuz */}
                      <tr>
                        <td>
                          <span className="badge-service badge-qobuz">Qobuz</span>
                        </td>
                        <td className="text-center" style={{ fontWeight: 'bold', color: '#fff' }}>{statsQobuz.accountsCount}</td>
                        <td className="text-center" style={{ color: 'var(--text-muted)' }}>
                          <span style={{ color: '#fff', fontWeight: '600' }}>{statsQobuz.activeSlotsCount}</span> / {statsQobuz.slotsCount}
                        </td>
                        <td className="text-right" style={{ color: '#4ade80', fontWeight: 'bold' }}>S/. {statsQobuz.totalRevenue.toFixed(2)}</td>
                        <td className="text-right" style={{ color: '#f87171' }}>S/. {statsQobuz.totalCost.toFixed(2)}</td>
                        <td className="text-right" style={{ color: statsQobuz.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                          S/. {statsQobuz.profit.toFixed(2)}
                        </td>
                        <td className="text-right" style={{ color: statsQobuz.margin >= 40 ? '#4ade80' : statsQobuz.margin >= 15 ? '#eab308' : '#f87171', fontWeight: 'bold' }}>
                          {statsQobuz.margin.toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Simulation projection panel */}
              <div className="simulator-panel glass-panel border-cyan">
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>🚀</span> Simulador de Proyección y Precios
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Modifica las variables en tiempo real para proyectar tus ganancias estimadas ante cambios en el tipo de cambio, costos de cuenta y volumen de clientes.
                </p>

                <div className="simulator-controls-grid">
                  {/* Control 1: T.C. USD -> ARS */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>T.C. Dólar en Argentina (ARS)</span>
                      <strong>{simUsdArs} ARS</strong>
                    </div>
                    <input
                      type="range"
                      min="800"
                      max="2200"
                      step="10"
                      value={simUsdArs}
                      onChange={(e) => setSimUsdArs(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>

                  {/* Control 2: Costo Cuenta Tidal */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>Costo de Cuenta Tidal (ARS)</span>
                      <strong>{simTidalCost} ARS</strong>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="4000"
                      step="50"
                      value={simTidalCost}
                      onChange={(e) => setSimTidalCost(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>

                  {/* Control 3: Incremento de Clientes */}
                  <div className="sim-slider-group">
                    <div className="sim-slider-label-row">
                      <span>Crecimiento de Clientes (%)</span>
                      <strong style={{ color: simClientIncrease >= 0 ? '#4ade80' : '#f87171' }}>
                        {simClientIncrease >= 0 ? `+${simClientIncrease}` : simClientIncrease}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="100"
                      step="5"
                      value={simClientIncrease}
                      onChange={(e) => setSimClientIncrease(Number(e.target.value))}
                      className="sim-slider-input"
                    />
                  </div>
                </div>

                {/* Simulation results comparison */}
                <div style={{ background: 'rgba(0, 229, 255, 0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.15)' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>Resultados Proyectados Simulados</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    
                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ingreso Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                        S/. {simOverallRevenue.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallRevenue >= overallRevenue ? '#4ade80' : '#f87171' }}>
                        {simOverallRevenue >= overallRevenue ? `+S/. ${(simOverallRevenue - overallRevenue).toFixed(0)}` : `-S/. ${(overallRevenue - simOverallRevenue).toFixed(0)}`} respecto al real
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Costo Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                        S/. {simOverallCost.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallCost <= overallCost ? '#4ade80' : '#f87171' }}>
                        {simOverallCost <= overallCost ? `Ahorro: S/. ${(overallCost - simOverallCost).toFixed(0)}` : `Aumento: S/. ${(simOverallCost - overallCost).toFixed(0)}`}
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Utilidad Proyectada:</span>
                      <strong style={{ fontSize: '1.1rem', color: '#4ade80' }}>
                        S/. {simOverallProfit.toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallProfit >= overallProfit ? '#4ade80' : '#f87171' }}>
                        {simOverallProfit >= overallProfit ? `+S/. ${(simOverallProfit - overallProfit).toFixed(0)}` : `-S/. ${(overallProfit - simOverallProfit).toFixed(0)}`} de ganancia
                      </span>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Margen Proyectado:</span>
                      <strong style={{ fontSize: '1.1rem', color: simOverallMargin >= overallMargin ? '#4ade80' : '#eab308' }}>
                        {simOverallMargin.toFixed(1)}%
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: simOverallMargin >= overallMargin ? '#4ade80' : '#f87171' }}>
                        {simOverallMargin >= overallMargin ? `+${(simOverallMargin - overallMargin).toFixed(1)}%` : `${(simOverallMargin - overallMargin).toFixed(1)}%`} de margen
                      </span>
                    </div>

                  </div>
                </div>
              </div>

            </section>
          );
        })()}

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

      {/* MODAL: TRANSFER MEMBER SLOT */}
      {showTransferModal && transferSourceSlot && transferSourceAccount && (() => {
        const candidates = familyAccounts
          .filter(acc => {
            const accId = acc._id || acc.id;
            const srcAccId = transferSourceAccount._id || transferSourceAccount.id;
            
            const freeSlots = (acc.profiles || []).filter(p => p.status === "free");
            return acc.service === organizerPlatform && accId !== srcAccId && freeSlots.length > 0;
          })
          .map(acc => {
            const freeSlots = (acc.profiles || []).filter(p => p.status === "free");
            const getDaysDiff = (expiryDateStr) => {
              if (!expiryDateStr) return null;
              const today = new Date();
              today.setHours(0,0,0,0);
              const parts = expiryDateStr.split("-");
              if (parts.length !== 3) return null;
              const expiry = new Date(parts[0], parts[1] - 1, parts[2]);
              expiry.setHours(0,0,0,0);
              const diffTime = expiry.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return diffDays;
            };
            return {
              ...acc,
              freeSlots,
              daysRemaining: getDaysDiff(acc.ownerRenewalDate)
            };
          });

        candidates.sort((a, b) => {
          if (a.daysRemaining === null) return 1;
          if (b.daysRemaining === null) return -1;
          return b.daysRemaining - a.daysRemaining;
        });

        return (
          <div className="admin-modal-overlay">
            <div className="admin-modal-container glass-panel" style={{ maxWidth: '650px' }}>
              <div className="modal-header-bar">
                <h3>Mover Perfil de Miembro</h3>
                <button
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferSourceSlot(null);
                    setTransferSourceAccount(null);
                  }}
                  className="btn-modal-close"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="modal-body-form" style={{ padding: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--accent-purple, #a855f7)', textTransform: 'uppercase' }}>Miembro Origen</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Cliente:</span>{' '}
                      <strong>{transferSourceSlot.clientId?.nickname || "Cliente"} ({transferSourceSlot.clientId?.currentWhatsApp})</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Correo Perfil:</span>{' '}
                      <strong>{transferSourceSlot.memberEmail}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Cuenta Titular:</span>{' '}
                      <strong style={{ wordBreak: 'break-all' }}>{transferSourceAccount.masterEmail}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Vence Titular:</span>{' '}
                      <strong style={{ color: '#ef4444' }}>{transferSourceAccount.ownerRenewalDate ? formatDate(transferSourceAccount.ownerRenewalDate) : 'N/A'}</strong>
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#fff' }}>Selecciona Cuenta Destino Recomendada:</h4>

                {transferError && (
                  <div className="error-alert" style={{ marginBottom: '16px' }}>
                    {transferError}
                  </div>
                )}

                {transferSuccess && (
                  <div className="success-alert" style={{ marginBottom: '16px' }}>
                    {transferSuccess}
                  </div>
                )}

                <div className="transfer-candidates-list">
                  {candidates.length === 0 ? (
                    <div className="empty-panel glass-panel text-center" style={{ padding: '30px' }}>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No hay otras cuentas familiares de {organizerPlatform.toUpperCase()} con ranuras libres.
                        Deberás registrar una nueva cuenta titular con cupos disponibles para poder mover miembros.
                      </p>
                    </div>
                  ) : (
                    candidates.map((cand) => {
                      const candId = cand._id || cand.id;
                      const activeCount = 5 - cand.freeSlots.length;
                      
                      return (
                        <div key={candId} className="candidate-card">
                          <div style={{ flex: 1, marginRight: '16px' }}>
                            <strong style={{ display: 'block', fontSize: '0.85rem', color: '#fff', wordBreak: 'break-all' }}>{cand.masterEmail}</strong>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span>Ocupación: <strong>{activeCount}/5</strong> ({cand.freeSlots.length} libres)</span>
                              <span style={{ color: cand.daysRemaining && cand.daysRemaining > 7 ? '#4ade80' : '#ef4444' }}>
                                Vence: <strong>{cand.ownerRenewalDate ? formatDate(cand.ownerRenewalDate) : 'N/A'}</strong> ({cand.daysRemaining !== null ? `en ${cand.daysRemaining} días` : 'N/A'})
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            {cand.freeSlots.map((slot) => (
                              <button
                                key={slot.id}
                                disabled={isTransferring}
                                onClick={() => handleTransferMember(transferSourceSlot.id, slot.id)}
                                className="btn-transfer-action"
                                style={{ opacity: isTransferring ? 0.6 : 1 }}
                              >
                                Slot {slot.slotNumber}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferSourceSlot(null);
                    setTransferSourceAccount(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
