// Registro de proveedores (§11.2). El checkout no conoce proveedores concretos:
// dibuja según `ui`. Activar TAYPI es poner TAYPI_ENABLED=true y MANUAL_YAPE_ENABLED=false.

function flag(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

export function getProviders(env = process.env) {
  const on = (name, def) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return def;
    return raw === "true" || raw === "1";
  };
  const walletOn = on("WALLET_ENABLED", true);
  return {
    manual_yape: {
      currency: "PEN",
      enabled: on("MANUAL_YAPE_ENABLED", true),
      autoConfirm: false,                      // requiere verificación humana
      label: "Yape / Plin",
      ui: "static_qr",
      intentTtlMinutes: 30,
    },
    taypi: {
      currency: "PEN",
      enabled: on("TAYPI_ENABLED", false),     // apagado hasta tener la API
      autoConfirm: true,
      label: "Yape / Plin",
      ui: "dynamic_qr",
      intentTtlMinutes: 15,
    },
    binance_account: {
      currency: "USDT",
      enabled: on("BINANCE_ENABLED", true),
      autoConfirm: true,
      label: "USDT · Binance Pay",
      ui: "pay_id_note",
      intentTtlMinutes: 60,
    },
    wallet_pen: { currency: "PEN", enabled: walletOn, autoConfirm: true, label: "Mi saldo en soles", ui: "wallet", intentTtlMinutes: 15 },
    wallet_usdt: { currency: "USDT", enabled: walletOn, autoConfirm: true, label: "Mi saldo en USDT", ui: "wallet", intentTtlMinutes: 15 },
  };
}

export const WALLET_PROVIDERS = { PEN: "wallet_pen", USDT: "wallet_usdt" };

export function getProvider(id, env = process.env) {
  const p = getProviders(env)[id];
  return p ? { id, ...p } : null;
}

export function availableProviders(currency, env = process.env) {
  return Object.entries(getProviders(env))
    .filter(([, p]) => p.enabled && (!currency || p.currency === currency))
    .map(([id, p]) => ({ id, ...p }));
}

/** Proveedor externo (no saldo) por defecto para una moneda. Con TAYPI activo, gana TAYPI. */
export function defaultProvider(currency, env = process.env) {
  const list = availableProviders(currency, env).filter((p) => p.ui !== "wallet");
  return list.find((p) => p.autoConfirm) || list[0] || null;
}

export function isWalletProvider(id) {
  return id === "wallet_pen" || id === "wallet_usdt";
}

export function walletEnabled() {
  return flag("WALLET_ENABLED", true);
}
