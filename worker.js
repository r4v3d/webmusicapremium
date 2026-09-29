// Worker de conciliación (§6, §16). Proceso Node independiente de la web:
// sobrevive a los despliegues y sus fallos no tumban el sitio.
// `npm run build:worker` lo empaqueta en .worker/worker.mjs, que es lo que
// ejecuta musicapremium-worker.service.
import { runReconciliation, createWorkerState } from "./src/lib/reconcile.js";
import { closePool, withLeaderLock } from "./src/lib/workerLock.js";
import { flushSheetOutbox, listenSheetOutbox } from "./src/lib/sheetsPush.js";
import { sheetsPushConfigured } from "./src/lib/sheetsAuth.js";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 20_000);
const state = createWorkerState();
let running = false;
let stopping = false;

// Google Sheets: los cambios del inventario salen hacia la hoja en segundos.
// El aviso (NOTIFY) se agrupa 1 s para mandar una ráfaga de cambios de una vez.
let sheetsBusy = false;
let sheetsAgain = false;
let sheetsTimer = null;
let stopSheetsListen = null;

async function pushSheets() {
  if (sheetsBusy) { sheetsAgain = true; return; }
  sheetsBusy = true;
  try {
    do {
      sheetsAgain = false;
      const r = await flushSheetOutbox();
      if (r.pushed || r.deleted) console.log("[worker] hoja actualizada", JSON.stringify(r));
      if (r.more) sheetsAgain = true;
    } while (sheetsAgain && !stopping);
  } catch (error) {
    console.error("[worker] Google Sheets:", error.message);
  } finally {
    sheetsBusy = false;
  }
}

function kickSheets() {
  if (stopping || sheetsTimer) return;
  sheetsTimer = setTimeout(() => { sheetsTimer = null; pushSheets(); }, 1_000);
}

async function tick() {
  if (running || stopping) return;          // nunca dos ciclos solapados
  running = true;
  try {
    const ran = await withLeaderLock(async () => {
      const summary = await runReconciliation({ state });
      if (summary.changed) console.log("[worker]", JSON.stringify(summary));
    });
    if (!ran) console.log("[worker] otro worker tiene el cerrojo; este ciclo se salta");
  } catch (error) {
    console.error("[worker] error:", error);
  } finally {
    running = false;
  }
  // Respaldo del aviso instantáneo: cada ciclo revisa la cola de la hoja.
  await pushSheets();
}

// `node worker.cjs --once`: un solo ciclo con su resumen, para diagnosticar a mano.
if (process.argv.includes("--once")) {
  const started = Date.now();
  withLeaderLock(async () => {
    const summary = await runReconciliation({ state });
    console.log("[worker] ciclo único", JSON.stringify(summary), `${Date.now() - started} ms`);
  })
    .then((ran) => { if (!ran) console.log("[worker] otro worker tiene el cerrojo"); })
    .catch((error) => { console.error("[worker] error:", error); process.exitCode = 1; })
    .finally(() => closePool().then(() => process.exit()));
} else {
  startLoop();
}

let timer = null;
function startLoop() {
  timer = setInterval(tick, INTERVAL_MS);
  tick();
  if (sheetsPushConfigured()) {
    stopSheetsListen = listenSheetOutbox(kickSheets);
    console.log("[worker] Google Sheets activo: los cambios del panel se envían a la hoja");
  }
  console.log(`[worker] iniciado, ciclo cada ${INTERVAL_MS} ms`);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log("[worker] apagando");
    stopping = true;
    clearInterval(timer);
    clearTimeout(sheetsTimer);
    await stopSheetsListen?.();
    const deadline = Date.now() + 20_000;
    while ((running || sheetsBusy) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    await closePool().catch(() => {});
    process.exit(0);
  });
}
