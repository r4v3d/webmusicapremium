// Registro de proveedores (§11.2). El checkout no conoce proveedores concretos:
// dibuja según `ui`. Activar TAYPI es poner TAYPI_ENABLED=true y MANUAL_YAPE_ENABLED=false.
// Yape automático con Mercado Pago: MERCADOPAGO_ENABLED=true (+ MP_PUBLIC_KEY y MP_ACCESS_TOKEN).
// Al estar activo pasa a ser el Yape por defecto; el Yape manual queda como alternativa
// (sirve para Plin) salvo que se apague con MANUAL_YAPE_ENABLED=false.
// QR interoperable de Flow (Yape, Plin y bancos): FLOW_ENABLED=true (+ FLOW_API_KEY y FLOW_SECRET_KEY).
// Cada uno se enciende o apaga solo con su variable: se pueden tener ambos o uno.

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
    mercadopago_yape: {
      currency: "PEN",
      // Sin claves no se ofrece aunque esté encendido: el checkout no podría crear el token.
      enabled: on("MERCADOPAGO_ENABLED", false) && Boolean(env.MP_PUBLIC_KEY && env.MP_ACCESS_TOKEN),
      autoConfirm: true,
      label: "Yape (confirmación automática)",
      ui: "mp_yape",
      intentTtlMinutes: 15,
    },
    flow_qr: {
      currency: "PEN",
      enabled: on("FLOW_ENABLED", false) && Boolean(env.FLOW_API_KEY && env.FLOW_SECRET_KEY),
      autoConfirm: true,
      label: "QR · Yape, Plin y bancos",
      ui: "redirect",
      intentTtlMinutes: 15,
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
