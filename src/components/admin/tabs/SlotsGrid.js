"use client";

// Clientes → Tabla: una hoja de cálculo sobre los cupos. Se edita en la celda
// (clic/tap, o escribir directo), se pega desde Excel/Sheets y se guarda solo.
// Usa /api/admin/grid: mismas filas y validación que Google Sheets.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "../AdminContext";
import { CONFIG } from "../../../data/config";

const COLS = [
  { key: "correoTitular", label: "Correo titular", cls: "col-titular" },
  { key: "nombre", label: "Nombre", cls: "col-nombre" },
  { key: "correoMiembro", label: "Correo cliente", cls: "col-correo" },
  { key: "claveMiembro", label: "Contraseña", cls: "col-clave" },
  { key: "precio", label: "Pagó", cls: "col-pago", kind: "money" },
  { key: "vence", label: "Renovación", cls: "col-renueva", kind: "date" },
];
const DATE_KEYS = new Set(COLS.filter((c) => c.kind === "date").map((c) => c.key));
// Datos de la cuenta: se repiten en sus 5 filas y se atenúan fuera de la primera.
const ACCOUNT_KEYS = new Set(["correoTitular", ...COLS.filter((c) => c.account).map((c) => c.key)]);
const NCOLS = COLS.length;
const STATUS_LABEL = { free: "Libre", active: "Activo", pending_payment: "Falta pago", expired: "Vencido" };
const POLL_MS = 4000;
const PAGE = 200;

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso || "";
}

function addMonths(iso, months) {
  const [y, m, d] = (iso || todayIso()).split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d, last));
  return isoOf(date);
}

/** Lo que escribió el usuario → 'YYYY-MM-DD'. «+1» suma un mes a la fecha actual. Sin reconocer: tal cual (el servidor avisa). */
function parseDate(input, currentIso) {
  const v = input.trim();
  if (!v) return "";
  const plus = /^\+\s*(\d{1,2})$/.exec(v);
  if (plus) return addMonths(currentIso || todayIso(), Number(plus[1]));
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(v);
  if (!m) return v;
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return `${year}-${pad(m[2])}-${pad(m[1])}`;
}

function displayOf(row, key) {
  const v = row[key];
  if (DATE_KEYS.has(key)) return fmtDate(v);
  return v == null ? "" : String(v);
}

/** Valor a enviar al servidor y cómo se verá mientras se guarda. */
function toServer(row, key, typed) {
  if (DATE_KEYS.has(key)) {
    const iso = parseDate(typed, row[key]);
    return { value: iso, shown: /^\d{4}-/.test(iso) ? iso : typed };
  }
  if (key === "precio") {
    const v = typed.trim().replace(",", ".").replace(/^s\/\.?\s*/i, "");
    return { value: v, shown: v === "" ? "" : Number.isFinite(Number(v)) ? Number(v) : v };
  }
  return { value: typed.trim(), shown: typed.trim() };
}

function dueClass(row, key) {
  // La renovación del cliente solo cuenta si el cupo está ocupado; la del titular, siempre.
  if (!row[key] || (key === "vence" && !row.nombre)) return "";
  const days = Math.round((new Date(`${row[key]}T00:00:00`) - new Date(`${todayIso()}T00:00:00`)) / 86400000);
  if (days < 0) return "due-past";
  if (days <= 3) return "due-soon";
  return "";
}

function matchesExpiry(row, filter) {
  if (filter === "all") return true;
  if (!row.vence) return false;
  const diff = Math.round((new Date(`${row.vence}T00:00:00`) - new Date(`${todayIso()}T00:00:00`)) / 86400000);
  if (filter === "expired") return diff < 0;
  if (filter === "today") return diff === 0;
  const max = { "7days": 7, "15days": 15, "30days": 30 }[filter];
  return max == null || (diff >= 0 && diff <= max);
}

const GridRow = memo(function GridRow({ row, r, first, activeC, editor, selected, busy, errorKeys }) {
  const reserved = row.estado === "Reservado";
  return (
    <tr className={`${first ? "grp-start" : ""}${selected ? " is-selected" : ""}${reserved ? " is-reserved" : ""}`}>
      <td className="col-num" data-r={r} data-c={-1} title="Seleccionar para acciones en lote">
        {row.cupo}
      </td>
      {COLS.map((col, c) => {
        const active = activeC === c;
        const shown = displayOf(row, col.key);
        let cls = `gcell ${col.cls}`;
        if (active) cls += " is-active";
        if (busy?.[col.key]) cls += " is-saving";
        if (errorKeys?.includes(col.key)) cls += " is-error";
        if (ACCOUNT_KEYS.has(col.key) && !first) cls += " is-repeat";
        if (col.kind === "date") cls += ` ${dueClass(row, col.key)}`;
        return (
          <td key={col.key} className={cls} data-r={r} data-c={c} title={col.key === "nombre" && row.cliente && row.cliente !== shown ? row.cliente : undefined}>
            {active && editor ? (
              editor
            ) : col.key === "nombre" && !shown ? (
              <span className="gcell-ph">{reserved ? "🔒 Reservado" : "libre"}</span>
            ) : (
              <span className="gcell-txt">{shown}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
});

export default function SlotsGrid() {
  const {
    askConfirm,
    selectedSlotIds,
    setSelectedSlotIds,
    showToast,
    tableExpiryFilter,
    tablePlatformFilter,
    tableSearchQuery,
    tableStatusFilter,
    toggleSelectSlot,
  } = useAdmin();

  const [rows, setRows] = useState(null);
  const [overrides, setOverrides] = useState({}); // id → {key: valor mostrado mientras se guarda}
  const [errors, setErrors] = useState({}); // id → [keys]
  const [activeCell, setActive] = useState({ r: 0, c: 1 });
  const [editing, setEditingState] = useState(null); // { draft, replace }
  const editingRef = useRef(null);
  // El ref evita guardar dos veces cuando Enter/clic y el blur del input llegan juntos.
  const setEditing = useCallback((next) => {
    if (typeof next !== "function") editingRef.current = next;
    setEditingState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      editingRef.current = value;
      return value;
    });
  }, []);
  // Al cambiar los filtros se vuelve a la primera página.
  const filterKey = [tableSearchQuery, tablePlatformFilter, tableStatusFilter, tableExpiryFilter].join("|");
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE });
  const limit = paging.key === filterKey ? paging.limit : PAGE;
  const [conn, setConn] = useState("live"); // live | saving | offline
  const [showAdd, setShowAdd] = useState(false);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const sentinelRef = useRef(null);
  // Marcas de cambios: se pide «desde la penúltima» para no perder un cambio que
  // todavía se estaba guardando cuando llegó la última respuesta.
  const lastStampRef = useRef(null);
  const sinceRef = useRef(null);
  const needFullRef = useRef(true);
  const savingRef = useRef(0);
  const genRef = useRef(0); // sube con cada guardado: una lectura que empezó antes llega vieja
  const touchRef = useRef(false);
  const editSeq = useRef(0);

  // --- Datos

  const mergeRows = useCallback((fresh, deleted = []) => {
    const byId = new Map(fresh.map((r) => [r.id, r]));
    const gone = new Set(deleted.map(String));
    setRows((prev) => {
      if (!prev) return fresh;
      const known = new Set(prev.map((r) => r.id));
      // Cupos nuevos (p. ej. un titular recién creado): la próxima lectura trae todo, en orden.
      if (fresh.some((r) => !known.has(r.id))) needFullRef.current = true;
      const out = prev.filter((r) => !gone.has(r.id)).map((r) => byId.get(r.id) || r);
      return [...out, ...fresh.filter((r) => !known.has(r.id))];
    });
  }, []);

  const load = useCallback(async ({ force = false } = {}) => {
    if (savingRef.current > 0 && !force) return;
    const full = force || needFullRef.current || !sinceRef.current;
    const since = full ? null : sinceRef.current;
    const gen = genRef.current;
    try {
      const res = await fetch(`/api/admin/grid${since ? `?since=${since}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return;
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConn((c) => (c === "offline" ? "live" : c));
      // Se guardó algo mientras tanto: esta respuesta puede ser vieja; la próxima vuelta pide lo mismo.
      if (gen !== genRef.current || savingRef.current > 0) return;
      if (data.rows) {
        needFullRef.current = false;
        setRows(data.rows);
      } else if (data.changes) {
        mergeRows(data.changes.rows, data.changes.deleted);
      }
      sinceRef.current = full ? data.stamp : lastStampRef.current || data.stamp;
      lastStampRef.current = data.stamp;
    } catch {
      setConn("offline");
    }
  }, [mergeRows]);

  useEffect(() => {
    const first = window.setTimeout(() => load({ force: true }), 0);
    const tick = () => {
      if (!document.hidden) load();
    };
    const id = window.setInterval(tick, POLL_MS);
    const onRefresh = () => load({ force: true });
    const onVisible = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("admin:refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("admin:refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // --- Filtros (los mismos de la barra de arriba)

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = tableSearchQuery.trim().toLowerCase();
    const statusLabel = STATUS_LABEL[tableStatusFilter];
    return rows
      .map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r))
      .filter((r) => {
        if (tablePlatformFilter !== "all" && r.plataforma.toLowerCase() !== tablePlatformFilter) return false;
        if (tableStatusFilter !== "all" && r.estado !== statusLabel) return false;
        if (!matchesExpiry(r, tableExpiryFilter)) return false;
        if (!q) return true;
        return [r.correoTitular, r.nombre, r.cliente, r.whatsapp, r.correoMiembro].some((v) => String(v || "").toLowerCase().includes(q));
      });
  }, [rows, overrides, tableSearchQuery, tablePlatformFilter, tableStatusFilter, tableExpiryFilter]);

  const shownRows = visible.slice(0, limit);
  // La celda activa no puede quedar fuera de la tabla cuando cambian los filtros.
  const active = activeCell.r < visible.length ? activeCell : { r: Math.max(visible.length - 1, 0), c: activeCell.c };
  const stats = useMemo(() => {
    let libres = 0;
    for (const r of visible) if (!r.nombre && r.estado !== "Reservado") libres++;
    return { total: visible.length, libres };
  }, [visible]);

  // Más filas al llegar al final (en Android, montar mil filas de golpe se nota).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setPaging((p) => ({ key: filterKey, limit: (p.key === filterKey ? p.limit : PAGE) + PAGE }));
    }, { root: wrapRef.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible.length, limit, filterKey]);


  // --- Guardar

  const save = useCallback(async (cells) => {
    // cells: [{ row, key, typed }]
    const edits = new Map();
    const shown = {};
    let freeing = null;
    for (const { row, key, typed } of cells) {
      if (row.estado === "Reservado") continue;
      const { value, shown: s } = toServer(row, key, String(typed ?? ""));
      if (String(s) === String(row[key] ?? "")) continue;
      if (key === "nombre" && !value && row.nombre) freeing = row;
      if (!edits.has(row.id)) edits.set(row.id, {});
      edits.get(row.id)[key] = value;
      (shown[row.id] ||= {})[key] = s;
    }
    if (!edits.size) return;

    if (freeing && cells.length === 1) {
      const ok = await askConfirm({
        title: "Liberar cupo",
        message: `El cupo ${freeing.cupo} de ${freeing.correoTitular} queda libre: se borran su cliente, lo que pagó y la renovación.`,
        confirmLabel: "Liberar",
        danger: true,
      });
      if (!ok) return;
    }

    const seq = ++editSeq.current;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const [id, o] of Object.entries(shown)) next[id] = { ...next[id], ...o, _seq: seq };
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const id of edits.keys()) delete next[id];
      return next;
    });

    savingRef.current++;
    genRef.current++;
    setConn("saving");
    let data = null;
    try {
      const res = await fetch("/api/admin/grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: [...edits].map(([id, changes]) => ({ id, changes })) }),
      });
      data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.message || "No se pudo guardar.");
    } catch (err) {
      showToast(err.message || "Sin conexión: no se guardó.", "error");
      data = null;
    } finally {
      genRef.current++;
      savingRef.current--;
      setConn(savingRef.current > 0 ? "saving" : "live");
    }

    if (data) {
      mergeRows(data.rows || [], data.deleted || []);
      const nota = (data.results || []).find((r) => r.ok && r.nota)?.nota;
      if (nota) showToast(nota.charAt(0).toUpperCase() + nota.slice(1) + ".");
      const failed = (data.results || []).filter((r) => !r.ok);
      if (failed.length) {
        showToast(failed.length === 1 ? failed[0].error : `${failed.length} filas no se guardaron: ${failed[0].error}`, "error");
        setErrors((prev) => {
          const next = { ...prev };
          for (const f of failed) next[f.id] = Object.keys(edits.get(f.id) || {});
          return next;
        });
        window.setTimeout(() => {
          setErrors((prev) => {
            const next = { ...prev };
            for (const f of failed) delete next[f.id];
            return next;
          });
        }, 5000);
      }
    }
    setOverrides((prev) => {
      const next = { ...prev };
      for (const id of edits.keys()) if (next[id]?._seq === seq) delete next[id];
      return next;
    });
  }, [askConfirm, mergeRows, showToast]);

  // --- Edición y teclado

  const focusGrid = () => {
    if (!touchRef.current) wrapRef.current?.focus({ preventScroll: true });
  };

  const startEdit = (initial) => {
    const row = visible[active.r];
    if (!row || row.estado === "Reservado") return;
    setEditing({ draft: initial ?? displayOf(row, COLS[active.c].key), replace: initial != null });
  };

  const move = useCallback((dr, dc) => {
    setActive((a) => ({
      r: Math.min(Math.max(a.r + dr, 0), Math.max(visible.length - 1, 0)),
      c: Math.min(Math.max(a.c + dc, 0), NCOLS - 1),
    }));
  }, [visible.length]);

  const commit = (dr = 0, dc = 0) => {
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    const row = visible[active.r];
    const key = COLS[active.c].key;
    const draft = current.draft;
    setEditing(null);
    if (row) save([{ row, key, typed: draft }]);
    if (dr || dc) move(dr, dc);
    focusGrid();
  };

  const cancel = () => {
    editingRef.current = null;
    setEditing(null);
    focusGrid();
  };

  // Layout effect: el foco llega dentro del toque y Android abre el teclado.
  useLayoutEffect(() => {
    if (!editing || !inputRef.current) return;
    const el = inputRef.current;
    el.focus({ preventScroll: true });
    if (editing.replace) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
    // Solo al abrir el editor.
  }, [editing != null]);

  // La celda activa siempre a la vista.
  useEffect(() => {
    const td = wrapRef.current?.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
    td?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active.r, active.c]);

  const onGridKeyDown = (e) => {
    if (editing || e.target !== wrapRef.current) return;
    const row = visible[active.r];
    const k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); move(1, 0); }
    else if (k === "ArrowUp") { e.preventDefault(); move(-1, 0); }
    else if (k === "ArrowRight" || (k === "Tab" && !e.shiftKey)) { e.preventDefault(); move(0, 1); }
    else if (k === "ArrowLeft" || (k === "Tab" && e.shiftKey)) { e.preventDefault(); move(0, -1); }
    else if (k === "PageDown") { e.preventDefault(); move(15, 0); }
    else if (k === "PageUp") { e.preventDefault(); move(-15, 0); }
    else if (k === "Enter" || k === "F2") { e.preventDefault(); startEdit(); }
    else if ((k === "Delete" || k === "Backspace") && row) { e.preventDefault(); save([{ row, key: COLS[active.c].key, typed: "" }]); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(k); }
  };

  const onEditorKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(1, 0); }
    else if (e.key === "Tab") { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  const cellFromEvent = (e) => {
    const td = e.target.closest?.("td[data-r]");
    if (!td) return null;
    return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  };

  const onPointerDown = (e) => {
    touchRef.current = e.pointerType === "touch" || e.pointerType === "pen";
  };

  const onClick = (e) => {
    const cell = cellFromEvent(e);
    if (!cell) return;
    const row = visible[cell.r];
    if (cell.c === -1) {
      if (row) toggleSelectSlot(row.id);
      return;
    }
    if (editingRef.current && cell.r === active.r && cell.c === active.c) return;
    if (editingRef.current) commit();
    setActive(cell);
    // En el celular un toque ya edita; en PC, doble clic o escribir encima.
    if (touchRef.current && row && row.estado !== "Reservado") {
      setEditing({ draft: displayOf(row, COLS[cell.c].key), replace: false });
    } else {
      wrapRef.current?.focus({ preventScroll: true });
    }
  };

  const onDoubleClick = (e) => {
    const cell = cellFromEvent(e);
    if (!cell || cell.c === -1) return;
    setActive(cell);
    const row = visible[cell.r];
    if (row && row.estado !== "Reservado") setEditing({ draft: displayOf(row, COLS[cell.c].key), replace: false });
  };

  // Copiar / pegar como en una hoja de cálculo (varias celdas separadas por tabulador).
  const onCopy = (e) => {
    if (editing) return;
    const row = visible[active.r];
    if (!row) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", displayOf(row, COLS[active.c].key));
  };

  const onPaste = (e) => {
    if (editing) return;
    const textData = e.clipboardData.getData("text/plain");
    if (!textData) return;
    e.preventDefault();
    const lines = textData.replace(/\r/g, "").split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const cells = [];
    lines.forEach((line, i) => {
      const row = visible[active.r + i];
      if (!row) return;
      line.split("\t").forEach((value, j) => {
        const c = active.c + j;
        if (c < NCOLS) cells.push({ row, key: COLS[c].key, typed: value });
      });
    });
    if (cells.length) save(cells);
  };

  // --- Borrar titular (el de la fila activa)

  const activeRow = visible[active.r] || null;
  const deleteTitular = async () => {
    const row = activeRow;
    if (!row) return;
    const hermanos = (rows || []).filter((r) => r.cuenta === row.cuenta);
    const ocupados = hermanos.filter((r) => r.nombre).length;
    const ok = await askConfirm({
      title: "Borrar titular",
      message: `Se borra ${row.correoTitular} con sus ${hermanos.length} cupos` +
        (ocupados ? `, incluidos ${ocupados} con cliente.` : ".") +
        " El historial de pagos se conserva. No se puede deshacer.",
      confirmLabel: "Borrar titular",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/family-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.cuenta }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "No se pudo borrar el titular.");
      showToast(`Titular ${row.correoTitular} borrado.`);
      await load({ force: true });
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // --- Titular nuevo

  const [addForm, setAddForm] = useState({ email: "", service: "tidal", password: "" });
  const [adding, setAdding] = useState(false);
  const submitAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch("/api/admin/grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addTitular", ...addForm }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "No se pudo crear el titular.");
      showToast(`Titular ${addForm.email} creado con 5 cupos.`);
      setAddForm({ email: "", service: addForm.service, password: "" });
      setShowAdd(false);
      await load({ force: true });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAdding(false);
    }
  };

  // --- Selección para acciones en lote

  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const selectedSet = useMemo(() => new Set(selectedSlotIds.map(String)), [selectedSlotIds]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const toggleAll = () => {
    setSelectedSlotIds((prev) => {
      const ids = new Set(visibleIds);
      if (allSelected) return prev.filter((id) => !ids.has(String(id)));
      const next = new Set(prev.map(String));
      visibleIds.forEach((id) => next.add(id));
      return [...next];
    });
  };

  if (rows === null) {
    return (
      <div className="admin-loading-screen" style={{ minHeight: "200px" }}>
        <span className="admin-spinner"></span>
        <p>Cargando tabla…</p>
      </div>
    );
  }

  const editorFor = (row, c) => {
    const col = COLS[c];
    return (
      <input
        ref={inputRef}
        className="gcell-input"
        value={editing.draft}
        onChange={(e) => setEditing((ed) => ({ ...ed, draft: e.target.value }))}
        onKeyDown={onEditorKeyDown}
        onBlur={() => commit()}
        inputMode={col.kind === "money" ? "decimal" : col.key === "correoTitular" || col.key === "correoMiembro" ? "email" : undefined}
        enterKeyHint="done"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={col.kind === "date" ? "dd/mm/aa o +1" : undefined}
        aria-label={`${col.label} de ${row.correoTitular}, cupo ${row.cupo}`}
      />
    );
  };

  return (
    <div className="slots-grid">
      <div className="slots-grid-bar">
        <span className={`grid-conn grid-conn--${conn}`}>
          {conn === "saving" ? "Guardando…" : conn === "offline" ? "Sin conexión" : "En vivo"}
        </span>
        <span className="grid-stats">
          {stats.total} cupos · <strong>{stats.libres}</strong> libres
          {selectedSlotIds.length > 0 && <> · {selectedSlotIds.length} seleccionados</>}
        </span>
        <div className="grid-bar-actions">
          {activeRow && (
            <button
              type="button"
              className="btn btn-secondary admin-btn-compact grid-del-titular"
              onClick={deleteTitular}
              title={`Borrar el titular ${activeRow.correoTitular} y sus cupos`}
            >
              Borrar titular
            </button>
          )}
          <button type="button" className="btn btn-secondary admin-btn-compact" onClick={() => setShowAdd((v) => !v)}>
            + Titular
          </button>
        </div>
      </div>

      {showAdd && (
        <form className="grid-add-titular glass-panel" onSubmit={submitAdd}>
          <input
            type="email"
            required
            className="form-input"
            placeholder="Correo del titular"
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
            autoFocus
          />
          <select className="form-input form-select-input" value={addForm.service} onChange={(e) => setAddForm((f) => ({ ...f, service: e.target.value }))}>
            {Object.values(CONFIG.services).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="text"
            className="form-input"
            placeholder="Clave (vacío = la de siempre)"
            value={addForm.password}
            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary admin-btn-compact" disabled={adding}>
            {adding ? "Creando…" : "Crear con 5 cupos"}
          </button>
        </form>
      )}

      {visible.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>No hay cupos con los filtros seleccionados.</p>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="slots-grid-wrap"
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onCopy={onCopy}
          onPaste={onPaste}
          role="grid"
          aria-label="Cupos: correo titular, nombre, correo cliente, contraseña, pagó y renovación"
        >
          <table className="slots-grid-table">
            <thead>
              <tr>
                <th className="col-num">
                  <button type="button" className="grid-selall" onClick={toggleAll} title={allSelected ? "Quitar selección" : "Seleccionar todos los visibles"}>
                    {allSelected ? "☑" : "☐"}
                  </button>
                </th>
                {COLS.map((col) => (
                  <th key={col.key} className={col.cls}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row, r) => {
                const isActiveRow = r === active.r;
                return (
                  <GridRow
                    key={row.id}
                    row={row}
                    r={r}
                    first={r === 0 || shownRows[r - 1].cuenta !== row.cuenta}
                    activeC={isActiveRow ? active.c : -1}
                    editor={isActiveRow && editing ? editorFor(row, active.c) : null}
                    selected={selectedSet.has(row.id)}
                    busy={overrides[row.id]}
                    errorKeys={errors[row.id]}
                  />
                );
              })}
            </tbody>
          </table>
          {shownRows.length < visible.length && <div ref={sentinelRef} className="grid-sentinel">Cargando más…</div>}
        </div>
      )}
      <p className="grid-help">
        <span className="only-desktop">Clic para elegir una celda y escribe encima · doble clic o Enter para corregir · Supr para borrar · Ctrl+V pega varias celdas desde Excel/Sheets.</span>
        <span className="only-touch">Toca una celda para editarla.</span>
        {" "}Fechas: <code>dd/mm/aa</code> o <code>+1</code> (un mes más). Nombre vacío = cupo libre. La renovación y la tarjeta de cada titular están en Cobros → Renovaciones. El número del cupo selecciona la fila para acciones en lote.
      </p>
    </div>
  );
}
