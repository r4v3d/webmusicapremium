// Worker de conciliación (§6, §16). Proceso Node independiente de la web:
// sobrevive a los despliegues y sus fallos no tumban el sitio.
// `npm run build:worker` lo empaqueta en .worker/worker.mjs, que es lo que
// ejecuta musicapremium-worker.service.
import { runReconciliation, createWorkerState } from "./src/lib/reconcile.js";
import { closePool, withLeaderLock } from "./src/lib/workerLock.js";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 20_000);
const state = createWorkerState();
let running = false;
let stopping = false;

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
  console.log(`[worker] iniciado, ciclo cada ${INTERVAL_MS} ms`);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log("[worker] apagando");
    stopping = true;
    clearInterval(timer);
    const deadline = Date.now() + 20_000;
    while (running && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    await closePool().catch(() => {});
    process.exit(0);
  });
}
