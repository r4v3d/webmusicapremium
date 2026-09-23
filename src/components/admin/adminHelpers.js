"use client";

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

export { COUNTRY_MAP, getCountryFlag, CloseIcon, LogOutIcon, PlusIcon, CopyIcon, TrashIcon, WhatsAppIcon, formatDate, getDaysAgo };
