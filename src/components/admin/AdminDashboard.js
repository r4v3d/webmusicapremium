"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CONFIG } from "../../data/config";
import { AdminContext } from "./AdminContext";
import { CloseIcon, PlusIcon, CopyIcon, TrashIcon, WhatsAppIcon, formatDate, getDaysAgo, getCountryFlag } from "./adminHelpers";
import {
  AdminSkeleton,
  ConfirmDialog,
  SecretField,
  ToastHost,
  WORKSPACES,
  formatDatePe,
  isBillingInWindow,
  parseAdminRoute,
  todayIso,
  writeAdminRoute,
} from "./adminUi";
import HoyTab from "./tabs/HoyTab";
import OrdersTab from "./tabs/OrdersTab";
import FamiliesTab from "./tabs/FamiliesTab";
import StockTab from "./tabs/StockTab";
import ImportTab from "./tabs/ImportTab";
import RenewalsTab from "./tabs/RenewalsTab";
import PaymentsTab from "./tabs/PaymentsTab";
import WhatsAppBillingTab from "./tabs/WhatsAppBillingTab";
import OrganizerTab from "./tabs/OrganizerTab";
import ProfitabilityTab from "./tabs/ProfitabilityTab";
import VerifyQueueTab from "./tabs/VerifyQueueTab";
import ReconciliationTab from "./tabs/ReconciliationTab";
import WalletsTab from "./tabs/WalletsTab";
import CommandPalette from "./CommandPalette";
import { AdminHeader, AdminKpis, AdminNav } from "./AdminShell";
import { moveSlotInAccounts } from "../../lib/moveSlot";


export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);

  const [activeTab, setActiveTab] = useState("hoy");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolver = useRef(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  // Confirmar el pago de un pedido: exige monto recibido y Nº de operación (§11.1).
  const [confirmPaymentModal, setConfirmPaymentModal] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState("pending");
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [billingWindow, setBillingWindow] = useState("week");

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
  const [activeSubTab, setActiveSubTabState] = useState("cola");

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
  const [importPreview, setImportPreview] = useState(null);
  const [todayQueue, setTodayQueue] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);
  const loadedRef = useRef({ orders: false, stock: false, families: false, payments: false });
  const workspaceRef = useRef({ tab: "hoy", sub: "cola" });

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
  const [selectedReportMonth, setSelectedReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
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
  const [transferUndo, setTransferUndo] = useState(null);
  const [settingsFromServer, setSettingsFromServer] = useState(false);
  const prevPendingPayments = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const askConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({
        title: options.title || "Confirmar",
        message: options.message,
        confirmLabel: options.confirmLabel || "Confirmar",
        danger: !!options.danger,
      });
    });
  }, []);

  const closeConfirm = (ok) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmState(null);
    if (resolve) resolve(ok);
  };

  const handleTransferMember = async (sourceSlotId, targetSlotId, { isUndo = false } = {}) => {
    let snapshot = familyAccounts;
    setFamilyAccounts((prev) => {
      snapshot = prev;
      return moveSlotInAccounts(prev, sourceSlotId, targetSlotId);
    });
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
        setTransferSuccess("Miembro transferido.");
        setShowTransferModal(false);
        setTransferSourceSlot(null);
        setTransferSourceAccount(null);
        if (isUndo) {
          setTransferUndo(null);
          showToast("Movimiento deshecho.");
        } else {
          setTransferUndo({ sourceSlotId: targetSlotId, targetSlotId: sourceSlotId });
          showToast("Miembro movido. Puedes deshacer.");
        }
      } else {
        const errData = await res.json();
        setFamilyAccounts(snapshot);
        setTransferError(errData.message || "Error al transferir miembro.");
        showToast(errData.message || "Error al transferir miembro.", "error");
      }
    } catch (err) {
      setFamilyAccounts(snapshot);
      setTransferError("Fallo de red al transferir miembro.");
      showToast("Fallo de red al transferir miembro.", "error");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleUndoTransfer = async () => {
    if (!transferUndo || isTransferring) return;
    await handleTransferMember(transferUndo.sourceSlotId, transferUndo.targetSlotId, { isUndo: true });
  };

  const persistBusinessSettings = async (nextRates, nextCosts) => {
    const usdArs = nextRates?.usdArs ?? exchangeRateUsdToArs;
    const usdPen = nextRates?.usdPen ?? exchangeRateUsdToPen;
    const costs = nextCosts || platformCosts;
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdArs, usdPen, platformCosts: costs }),
      });
      if (res.ok) {
        setSettingsFromServer(true);
        if (typeof window !== "undefined") {
          localStorage.setItem("tc_usd_ars", String(usdArs));
          localStorage.setItem("tc_usd_pen", String(usdPen));
          localStorage.setItem("platform_costs", JSON.stringify(costs));
        }
      }
    } catch (error) {
      console.error("Persist settings:", error);
    }
  };

  const setWorkspace = (tab, sub) => {
    const nextTab = WORKSPACES[tab] ? tab : "hoy";
    const nextSub = sub ?? WORKSPACES[nextTab].defaultSub;
    setActiveTab(nextTab);
    setActiveSubTabState(nextSub);
    writeAdminRoute(nextTab, nextSub);
  };

  const setActiveSubTab = (sub) => {
    setActiveSubTabState(sub);
    writeAdminRoute(activeTab, sub);
  };

  workspaceRef.current = { tab: activeTab, sub: activeSubTab };

  useEffect(() => {
    const apply = () => {
      const parsed = parseAdminRoute(window.location.search);
      setActiveTab(parsed.tab);
      setActiveSubTabState(parsed.sub);
      if (!window.location.search) writeAdminRoute(parsed.tab, parsed.sub);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

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
    persistBusinessSettings({ usdArs, usdPen }, platformCosts);
  };

  const handleSavePlatformCosts = (newCosts) => {
    setPlatformCosts(newCosts);
    persistBusinessSettings({ usdArs: exchangeRateUsdToArs, usdPen: exchangeRateUsdToPen }, newCosts);
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

      showToast("Cuenta titular actualizada.");

      // Refresh stats
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error("Save Renewal Info Error:", err);
      showToast(err.message, "error");
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

  const workspaceNeeds = (tab, sub) => ({
    orders: tab === "hoy" && sub === "pedidos",
    stock: tab === "inventario" && sub === "stock",
    payments: tab === "cobros" && sub === "pagos",
    families:
      tab === "clientes" ||
      tab === "numeros" ||
      (tab === "inventario" && sub === "organizer") ||
      (tab === "cobros" && (sub === "whatsapp" || sub === "renovaciones")),
  });

  const redirectedIf401 = (res) => {
    if (res.status === 401) {
      router.replace("/admin/login");
      return true;
    }
    return false;
  };

  const loadCore = async ({ initial = false } = {}) => {
    let redirectedToLogin = false;
    try {
      if (initial) setLoading(true);
      setDbError("");
      const [statsRes, todayRes] = await Promise.all([
        fetch("/api/admin/stats", { signal: AbortSignal.timeout(20000) }),
        fetch("/api/admin/today", { signal: AbortSignal.timeout(20000) }),
      ]);
      if (redirectedIf401(statsRes) || redirectedIf401(todayRes)) {
        redirectedToLogin = true;
        return;
      }
      if (!statsRes.ok) {
        const errData = await statsRes.json().catch(() => ({}));
        throw new Error(errData.message || "Error de servidor o conexión con base de datos.");
      }
      setStats(await statsRes.json());
      setAuthorized(true);
      if (todayRes.ok) {
        setTodayQueue(await todayRes.json());
      } else {
        setTodayQueue({
          pendingOrders: { count: 0, items: [] },
          pendingPayments: { count: 0, items: [] },
          dueToday: { count: 0, items: [] },
          overdueWeek: { count: 0, items: [] },
          ownerRenewals: { count: 0, items: [] },
          activeStock: {},
        });
      }
    } catch (error) {
      console.error(error);
      const aborted = error?.name === "AbortError" || error?.name === "TimeoutError";
      setDbError(
        aborted
          ? "La conexión con el servidor tardó demasiado. Revisa que PostgreSQL y el servicio web estén activos y vuelve a intentar."
          : (error.message || "Error al cargar la información.")
      );
    } finally {
      if (!redirectedToLogin && initial) setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setIsOrdersLoading(true);
    try {
      const res = await fetch("/api/admin/orders", { signal: AbortSignal.timeout(20000) });
      if (redirectedIf401(res)) return;
      if (res.ok) {
        setOrders(await res.json());
        loadedRef.current.orders = true;
      } else {
        showToast("No se pudieron cargar los pedidos.", "error");
      }
    } catch (error) {
      showToast(error.message || "Error al cargar pedidos.", "error");
    } finally {
      setIsOrdersLoading(false);
    }
  };

  const fetchStock = async () => {
    setIsStockLoading(true);
    try {
      const res = await fetch("/api/admin/stock", { signal: AbortSignal.timeout(20000) });
      if (redirectedIf401(res)) return;
      if (res.ok) {
        setStock(await res.json());
        loadedRef.current.stock = true;
      } else {
        showToast("No se pudo cargar el inventario.", "error");
      }
    } catch (error) {
      showToast(error.message || "Error al cargar inventario.", "error");
    } finally {
      setIsStockLoading(false);
    }
  };

  const fetchFamilies = async () => {
    setIsFamiliesLoading(true);
    try {
      const res = await fetch("/api/admin/family-accounts", { signal: AbortSignal.timeout(30000) });
      if (redirectedIf401(res)) return;
      if (res.ok) {
        setFamilyAccounts(await res.json());
        loadedRef.current.families = true;
      } else {
        showToast("No se pudieron cargar las cuentas familiares.", "error");
      }
    } catch (error) {
      showToast(error.message || "Error al cargar clientes.", "error");
    } finally {
      setIsFamiliesLoading(false);
    }
  };

  const fetchPayments = async () => {
    setIsPaymentsLoading(true);
    try {
      const res = await fetch("/api/admin/payments", { signal: AbortSignal.timeout(20000) });
      if (redirectedIf401(res)) return;
      if (res.ok) {
        const paymentsData = await res.json();
        if (paymentsData.success) setPayments(paymentsData.payments);
        loadedRef.current.payments = true;
      } else {
        showToast("No se pudieron cargar los pagos.", "error");
      }
    } catch (error) {
      showToast(error.message || "Error al cargar pagos.", "error");
    } finally {
      setIsPaymentsLoading(false);
    }
  };

  const ensureWorkspaceData = async (force = false) => {
    const needs = workspaceNeeds(workspaceRef.current.tab, workspaceRef.current.sub);
    const jobs = [];
    if (needs.orders && (force || !loadedRef.current.orders)) jobs.push(fetchOrders());
    if (needs.stock && (force || !loadedRef.current.stock)) jobs.push(fetchStock());
    if (needs.families && (force || !loadedRef.current.families)) jobs.push(fetchFamilies());
    if (needs.payments && (force || !loadedRef.current.payments)) jobs.push(fetchPayments());
    if (jobs.length) await Promise.all(jobs);
  };

  const loadData = async () => {
    await loadCore({ initial: false });
    const needs = workspaceNeeds(workspaceRef.current.tab, workspaceRef.current.sub);
    const jobs = [];
    if (loadedRef.current.orders || needs.orders) jobs.push(fetchOrders());
    if (loadedRef.current.stock || needs.stock) jobs.push(fetchStock());
    if (loadedRef.current.families || needs.families) jobs.push(fetchFamilies());
    if (loadedRef.current.payments || needs.payments) jobs.push(fetchPayments());
    if (jobs.length) await Promise.all(jobs);
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
      showToast(data.message);
      // Reload everything
      await loadData();
    } catch (err) {
      showToast(err.message, "error");
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
    showToast("Plantillas de WhatsApp guardadas.");
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

      showToast("Cuenta familiar creada. Se generaron 5 ranuras libres.");
      setShowAddFamilyModal(false);
      setAddFamilyForm({ service: "tidal", masterEmail: "", password: "", notes: "" });
      await loadData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAddFamilyLoading(false);
    }
  };

  const handleDeleteFamily = async (id, email) => {
    const ok = await askConfirm({
      title: "Eliminar cuenta familiar",
      message: `Se eliminará ${email} y sus 5 ranuras. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/family-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        showToast("Cuenta familiar eliminada.");
        await loadData();
      } else {
        const data = await res.json();
        showToast(data.message || "Error al eliminar la cuenta.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error de red al eliminar la cuenta.", "error");
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
      showToast("El WhatsApp del cliente es requerido para perfiles ocupados.", "error");
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

      showToast("Ranura actualizada.");
      setShowEditSlotModal(false);
      await loadData();
      if (activeSubTab === "directory") {
        handleSearchClients(clientSearchQuery);
      }
    } catch (err) {
      showToast(err.message, "error");
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
            // En móvil el directorio es maestro-detalle: preseleccionar ocultaría la lista.
            const isMobile = window.matchMedia("(max-width: 768px)").matches;
            setSelectedClient(isMobile ? null : data[0]);
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
        showToast("Ingresa un precio numérico válido.", "error");
        return;
      }
      action = "update";
      payload.pricePen = parseFloat(bulkPriceValue);
    } else if (bulkAction === "update_expiry") {
      if (!bulkDateValue) {
        showToast("Selecciona una fecha de vencimiento.", "error");
        return;
      }
      action = "update";
      payload.renewalDate = bulkDateValue;
    } else if (bulkAction === "clear_slots") {
      const ok = await askConfirm({
        title: "Liberar cupos",
        message: `Se desconectarán ${selectedSlotIds.length} clientes de las ranuras. No se puede deshacer.`,
        confirmLabel: "Liberar",
        danger: true,
      });
      if (!ok) {
        return;
      }
      action = "clear";
    } else {
      showToast("Acción en lote no soportada.", "error");
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

      showToast(`Se actualizaron ${data.count || 0} perfiles.`);
      setSelectedSlotIds([]);
      await loadData();
    } catch (err) {
      showToast(err.message, "error");
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

    const formattedDate = formatDatePe(new Date(ry, rm - 1, rd));

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
    if (activeTab === "clientes" && activeSubTab === "directory") {
      handleSearchClients(clientSearchQuery);
    }
  }, [activeTab, activeSubTab]);

  useEffect(() => {
    loadCore({ initial: true });
  }, []);

  useEffect(() => {
    if (!authorized) return;
    ensureWorkspaceData();
  }, [authorized, activeTab, activeSubTab]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.exists || !data.settings) return;
        const { usdArs, usdPen, platformCosts: costs } = data.settings;
        if (usdArs) {
          setExchangeRateUsdToArs(usdArs);
          setSimUsdArs(usdArs);
        }
        if (usdPen) setExchangeRateUsdToPen(usdPen);
        if (costs) {
          setPlatformCosts(costs);
          if (costs.tidal?.cost) setSimTidalCost(Number(costs.tidal.cost));
        }
        setSettingsFromServer(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return undefined;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (confirmState || rejectNotesModal.show || deliveryModal || confirmPaymentModal || actionPaymentId) return;
      const onHoy = activeTab === "hoy";
      const onPagos = activeTab === "cobros" && activeSubTab === "pagos";
      const onPedidos = activeTab === "hoy" && activeSubTab === "pedidos";
      if (onHoy) loadCore({ initial: false });
      if (onPagos) fetchPayments();
      if (onPedidos) fetchOrders();
    };
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [authorized, activeTab, activeSubTab, confirmState, rejectNotesModal.show, deliveryModal, confirmPaymentModal, actionPaymentId]);

  useEffect(() => {
    const count = todayQueue?.manualQueue?.count;
    if (typeof count !== "number") return;
    if (prevPendingPayments.current != null && count > prevPendingPayments.current) {
      const extra = count - prevPendingPayments.current;
      showToast(extra === 1 ? "1 Yape nuevo por verificar." : `${extra} Yape nuevos por verificar.`);
    }
    prevPendingPayments.current = count;
  }, [todayQueue, showToast]);

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
  };

  // Acciones sobre pedidos. "Pagado" ya no se escribe a mano: pasa por la
  // misma liquidación que un webhook (confirm-manual), con monto y Nº de operación.
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    if (newStatus === "paid") {
      const order = orders.find((o) => o.orderId === orderId);
      const currency = order?.payCurrency || "PEN";
      const amount = currency === "USDT" ? order?.amountUsdt : order?.amountPen;
      setConfirmPaymentModal({ orderId, currency, amount: amount != null ? String(amount) : "", reference: "" });
      return;
    }

    setActionLoadingId(orderId + newStatus);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: newStatus === "expired" ? "expire" : "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al actualizar pedido.");
      await loadData();
      showToast("Pedido actualizado.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleSubmitConfirmPayment = async (e) => {
    e.preventDefault();
    const modal = confirmPaymentModal;
    if (!modal) return;
    setActionLoadingId(modal.orderId + "paid");
    try {
      const res = await fetch("/api/admin/payments/confirm-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: modal.orderId, amountReceived: Number(modal.amount), reference: modal.reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "No se pudo confirmar.");
      setConfirmPaymentModal(null);
      await loadData();
      if (data.status === "settled" || data.status === "needs_manual") {
        const credentials = data.credentials ? `${data.credentials.email}:${data.credentials.password}` : "";
        setDeliveryModal({ orderId: modal.orderId, assignedAccount: credentials, missingStock: !credentials, message: data.message });
      } else {
        showToast(data.message, data.success === false ? "error" : "success");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleResendCredentials = async (orderId) => {
    setActionLoadingId(orderId + "resend");
    try {
      const res = await fetch("/api/admin/payments/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) await loadData();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleRefundOrder = async (orderId) => {
    const ok = await askConfirm({
      title: "Reembolsar al saldo",
      message: `El monto pagado de ${orderId} vuelve al saldo del cliente en la misma moneda, el cupo queda libre y la suscripción se cancela.`,
      confirmLabel: "Reembolsar",
      danger: true,
    });
    if (!ok) return;
    setActionLoadingId(orderId + "refund");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) await loadData();
    } catch (error) {
      showToast(error.message, "error");
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
      showToast(data.message || "Las ranuras de stock se gestionan desde Inventario.");
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreviewImport = async (e) => {
    e.preventDefault();
    setImportError("");
    setImportMessage("");
    setImportPreview(null);
    if (!rawInput.trim()) return setImportError("El campo de texto no puede estar vacío.");

    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: importService, mode: importMode, rawInput, dryRun: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al previsualizar la importación.");
      setImportPreview(data.preview || []);
      if ((data.validCount || 0) === 0) {
        setImportError("Ninguna fila es válida. Corrige el formato y vuelve a previsualizar.");
      }
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    const validCount = (importPreview || []).filter((row) => row.ok).length;
    if (!validCount) return setImportError("No hay filas válidas para importar.");
    setImportError("");
    setImportMessage("");
    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: importService, mode: importMode, rawInput, dryRun: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al importar stock.");
      setImportMessage(data.message);
      setRawInput("");
      setImportPreview(null);
      loadedRef.current.families = false;
      loadedRef.current.stock = false;
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
    if (stockFilter === "available") return !item.reserved;
    if (stockFilter === "used") return item.reserved;
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
    return <AdminSkeleton />;
  }

  if (!authorized) {
    if (dbError) {
      return (
        <div className="admin-error-screen">
          <div className="error-card glass-panel">
            <h2>Error del Servidor</h2>
            <p>{dbError}</p>
            <button onClick={() => loadCore({ initial: true })} className="btn btn-primary" style={{ width: "100%" }}>Reintentar</button>
          </div>
        </div>
      );
    }
    return null;
  }

  const adminValue = {
    CONFIG,
    askConfirm,
    actionLoadingId,
    actionPaymentId,
    activeSubTab,
    activeTab,
    setWorkspace,
    addFamilyForm,
    addFamilyLoading,
    allSlots,
    allVisibleSelected,
    authorized,
    billingSearchQuery,
    billingWindow,
    bulkAction,
    bulkDateValue,
    bulkPriceValue,
    clientSearchQuery,
    clients,
    copiedId,
    dbError,
    editSlotForm,
    editedMessages,
    editingCosts,
    editingRates,
    exchangeRateUsdToArs,
    exchangeRateUsdToPen,
    familyAccounts,
    filteredSlots,
    filteredStock,
    formatDisplayDate,
    getClientMemberships,
    getCostInPen,
    getExpiryTag,
    getMessageForSlot,
    handleAddFamilySubmit,
    handleBulkAction,
    handleCalculateRenewal,
    handleCopyToClipboard,
    handleDeleteFamily,
    handleDeleteStock,
    handleEditSlotSubmit,
    handleFamilyAccountChange,
    handlePreviewImport,
    handleConfirmImport,
    handleLogout,
    handleMessageChange,
    handleOpenEditSlotModal,
    handleProcessPayment,
    handleSaveExchangeRates,
    handleSavePlatformCosts,
    handleUndoTransfer,
    handleSaveRenewalInfo,
    handleSaveTemplates,
    handleSearchClients,
    handleTransferMember,
    handleUpdateOrderStatus,
    handleResendCredentials,
    handleRefundOrder,
    importError,
    importLoading,
    importMessage,
    importMode,
    importPreview,
    importService,
    isBulkLoading,
    isClientsLoading,
    isFamiliesLoading,
    isOrdersLoading,
    isPaymentsLoading,
    isStockLoading,
    isTransferring,
    loadData,
    loading,
    orders,
    orderSearchQuery,
    orderStatusFilter,
    organizerPlatform,
    payments,
    platformCosts,
    rawInput,
    rejectNotesInput,
    rejectNotesModal,
    renewalsPage,
    renewalsPlatform,
    renewalsSearch,
    router,
    savingAccountId,
    selectedClient,
    selectedRenewalDay,
    selectedReportMonth,
    selectedSlotIds,
    settingsFromServer,
    setActiveSubTab,
    setActiveTab: (tab) => setWorkspace(tab),
    setAddFamilyForm,
    setBillingSearchQuery,
    setBillingWindow,
    setBulkAction,
    setBulkDateValue,
    setBulkPriceValue,
    setClientSearchQuery,
    setEditSlotForm,
    setEditingCosts,
    setEditingRates,
    setExchangeRateUsdToArs,
    setExchangeRateUsdToPen,
    setImportMode,
    setImportPreview,
    setImportService,
    setOrganizerPlatform,
    setOrderSearchQuery,
    setOrderStatusFilter,
    setPlatformCosts,
    setRawInput,
    setRejectNotesInput,
    setRejectNotesModal,
    setRenewalsPage,
    setRenewalsPlatform,
    setRenewalsSearch,
    setSelectedClient,
    setSelectedRenewalDay,
    setSelectedReportMonth,
    setSelectedSlotIds,
    setShowAddFamilyModal,
    setShowEditSlotModal,
    setShowTemplateConfig,
    setShowTransferModal,
    setSimClientIncrease,
    setSimTidalCost,
    setSimUsdArs,
    setStats,
    setStockFilter,
    setTableExpiryFilter,
    setTablePlatformFilter,
    setTableSearchQuery,
    setTableStatusFilter,
    setTransferSourceAccount,
    setTransferSourceSlot,
    showAddFamilyModal,
    showEditSlotModal,
    showTemplateConfig,
    showToast,
    showTransferModal,
    simClientIncrease,
    simTidalCost,
    simUsdArs,
    stats,
    stock,
    stockFilter,
    tableExpiryFilter,
    tablePlatformFilter,
    tableSearchQuery,
    tableStatusFilter,
    templatePast,
    templateToday,
    todayQueue,
    toggleSelectAllVisible,
    toggleSelectSlot,
    transferError,
    transferSourceAccount,
    transferSourceSlot,
    transferSuccess,
    transferUndo,
    CONFIG,
  };

  const pendingPaymentCount = (todayQueue?.manualQueue?.count || 0) + (todayQueue?.pendingPayments?.count ?? payments.filter((p) => p.status === "pending" && p.isLegacy).length);
  const billingWeekCount = todayQueue
    ? (todayQueue.dueToday?.count || 0) + (todayQueue.overdueWeek?.count || 0)
    : allSlots.filter((s) => (
      s.clientId && s.status !== "free" && isBillingInWindow(s.renewalDate, "week", todayIso())
    )).length;
  const cobrosBadge = pendingPaymentCount + billingWeekCount;
  const hoyBadge = (todayQueue?.undelivered?.count || 0) + pendingPaymentCount;

  return (
    <AdminContext.Provider value={adminValue}>
    <div className="admin-dashboard-wrapper">
      <ToastHost toasts={toasts} />
      {transferUndo && (
        <div className="admin-undo-bar">
          <span>Miembro movido.</span>
          <button type="button" className="btn btn-secondary btn-sm-mobile" onClick={handleUndoTransfer} disabled={isTransferring}>
            Deshacer
          </button>
        </div>
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onGo={setWorkspace}
        orders={orders}
        familyAccounts={familyAccounts}
      />
      <ConfirmDialog
        state={confirmState}
        onCancel={() => closeConfirm(false)}
        onConfirm={() => closeConfirm(true)}
      />
      {confirmPaymentModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <form className="admin-modal-container glass-panel" onSubmit={handleSubmitConfirmPayment}>
            <div className="modal-header-bar">
              <h3>Confirmar pago de {confirmPaymentModal.orderId}</h3>
              <button type="button" className="btn-modal-close" onClick={() => setConfirmPaymentModal(null)}>Cerrar</button>
            </div>
            <p className="section-instruction">
              Verifica el ingreso en tu app ({confirmPaymentModal.currency === "USDT" ? "historial de Binance Pay" : "Yape/Plin"}) antes de confirmar.
              El número de operación evita que el mismo pago confirme dos pedidos.
            </p>
            <label className="form-label">Monto recibido ({confirmPaymentModal.currency === "USDT" ? "USDT" : "S/"})</label>
            <input className="form-input" type="number" inputMode="decimal" step="0.001" min="0" required value={confirmPaymentModal.amount}
              onChange={(e) => setConfirmPaymentModal((m) => ({ ...m, amount: e.target.value }))} />
            <label className="form-label">{confirmPaymentModal.currency === "USDT" ? "Order ID de Binance" : "Nº de operación"}</label>
            <input className="form-input" required minLength={4} value={confirmPaymentModal.reference}
              onChange={(e) => setConfirmPaymentModal((m) => ({ ...m, reference: e.target.value }))} />
            <div className="modal-footer-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmPaymentModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={!!actionLoadingId}>
                {actionLoadingId ? "Confirmando…" : "Confirmar y entregar"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deliveryModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal-container glass-panel">
            <div className="modal-header-bar">
              <h3>Pedido {deliveryModal.orderId} aprobado</h3>
              <button type="button" className="btn-modal-close" onClick={() => setDeliveryModal(null)}>Cerrar</button>
            </div>
            {deliveryModal.message && <p>{deliveryModal.message}</p>}
            {deliveryModal.missingStock ? (
              <p>No había stock libre. El cobro quedó registrado: importa cupos y usa «Completar entrega» en el pedido.</p>
            ) : (
              <div className="assigned-account-box">
                <span>Cuenta para entregar</span>
                <SecretField
                  value={deliveryModal.assignedAccount}
                  copyId="delivery-account"
                  copiedId={copiedId}
                  onCopy={handleCopyToClipboard}
                />
              </div>
            )}
            <div className="modal-footer-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDeliveryModal(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
      <AdminHeader onSearch={() => setPaletteOpen(true)} onLogout={handleLogout} />

      <div className="container admin-content-layout">
        <AdminKpis stats={stats} />

        <AdminNav
          activeTab={activeTab}
          activeSubTab={activeSubTab}
          badges={{ hoy: hoyBadge, cobros: cobrosBadge }}
          onWorkspace={(id) => setWorkspace(id)}
          onSubTab={setActiveSubTab}
        />

        {activeTab === "hoy" && activeSubTab === "cola" && <HoyTab />}
        {activeTab === "hoy" && activeSubTab === "pedidos" && <OrdersTab />}
        {activeTab === "hoy" && activeSubTab === "conciliacion" && <ReconciliationTab />}
        {activeTab === "clientes" && <FamiliesTab />}
        {activeTab === "inventario" && activeSubTab === "stock" && <StockTab />}
        {activeTab === "inventario" && activeSubTab === "import" && <ImportTab />}
        {activeTab === "inventario" && activeSubTab === "organizer" && <OrganizerTab />}
        {activeTab === "cobros" && activeSubTab === "verificar" && <VerifyQueueTab />}
        {activeTab === "cobros" && activeSubTab === "pagos" && <PaymentsTab />}
        {activeTab === "cobros" && activeSubTab === "saldos" && <WalletsTab />}
        {activeTab === "cobros" && activeSubTab === "whatsapp" && <WhatsAppBillingTab />}
        {activeTab === "cobros" && activeSubTab === "renovaciones" && <RenewalsTab />}
        {activeTab === "numeros" && <ProfitabilityTab />}
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
    </AdminContext.Provider>
  );
}

