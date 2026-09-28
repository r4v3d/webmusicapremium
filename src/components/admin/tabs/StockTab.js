"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { TrashIcon } from "../adminHelpers";
import { SecretField, readUrlParam, setUrlParam, useIsMobile, useUrlParam } from "../adminUi";

const PAGE_SIZE = 50;

export default function StockTab() {
  const {
    filteredStock,
    handleCopyToClipboard,
    handleDeleteStock,
    copiedId,
    isStockLoading,
    setStockFilter,
    stockFilter
  } = useAdmin();
  const [search, setSearchParam] = useUrlParam("q");
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();

  // El filtro vive en el contexto; la URL (?filtro=) solo lo restaura al entrar.
  useEffect(() => {
    const saved = readUrlParam("filtro");
    if (saved) setStockFilter(saved);
  }, []);

  const changeSearch = (value) => {
    setSearchParam(value);
    setPage(1);
  };
  const changeFilter = (id) => {
    setStockFilter(id);
    setUrlParam("filtro", id === "all" ? "" : id);
    setPage(1);
  };
  const [now, setNow] = useState(() => Date.now());

  // Cuenta atrás de las reservas (§15.3).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reservedLabel = (item) => {
    const left = Math.max(0, Math.floor((new Date(item.reservedUntil).getTime() - now) / 1000));
    if (left === 0) return "Disponible";
    return `Reservado ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  };

  const rows = filteredStock.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [item.accountData, item.familyMasterEmail, item.reservedForOrder, item.service]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // En móvil se acumulan filas con «Cargar más»; en escritorio, páginas.
  const pageRows = isMobile
    ? rows.slice(0, currentPage * PAGE_SIZE)
    : rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const remaining = rows.length - pageRows.length;

  const filters = [
    ["all", "Todas"],
    ["available", "Disponibles"],
    ["used", "Reservadas"],
    ["tidal", "Tidal"],
    ["deezer", "Deezer"],
    ["qobuz", "Qobuz"],
  ];

  return (
    <section className="admin-section animate-fade-in">
      <h2>Inventario de Cuentas</h2>
      <div className="admin-toolbar">
        <input
          type="search"
          className="form-input"
          placeholder="Buscar correo u orden"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
        <div className="admin-pills">
          {filters.map(([id, label]) => (
            <button key={id} type="button" onClick={() => changeFilter(id)} className={`filter-btn ${stockFilter === id ? "active" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isStockLoading && rows.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>Cargando inventario…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-panel glass-panel text-center">
          <p>No hay cuentas cargadas que coincidan con el filtro.</p>
        </div>
      ) : (
        <>
          <div className="table-responsive glass-panel">
            <table className="admin-table admin-table--stack stock-table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th>Cuenta</th>
                  <th>Familiar</th>
                  <th>Orden</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => {
                  const label = item.reserved ? reservedLabel(item) : "Disponible";
                  return (
                    <tr key={item.id}>
                      <td className="cell-primary stock-cell-head">
                        <span className={`badge-service badge-${item.service}`}>{item.service.toUpperCase()}</span>
                        <span className={`stock-state ${label === "Disponible" ? "is-free" : "is-reserved"}`}>{label}</span>
                      </td>
                      <td data-label="Estado" className="nowrap hide-mobile">
                        <span className={`stock-state ${label === "Disponible" ? "is-free" : "is-reserved"}`}>{label}</span>
                      </td>
                      <td data-label="Cuenta" className="nowrap">
                        <SecretField
                          value={item.accountData}
                          copyId={`stock-${item.id}`}
                          copiedId={copiedId}
                          onCopy={handleCopyToClipboard}
                          compact
                        />
                      </td>
                      <td data-label="Familiar" className="cell-email">{item.familyMasterEmail || "-"}</td>
                      <td data-label="Orden" className="nowrap">{item.reservedForOrder ? `#${item.reservedForOrder}` : "-"}</td>
                      <td className="cell-actions stock-cell-delete">
                        <div className="cell-actions-inner">
                          <button type="button" onClick={() => handleDeleteStock(item.id)} className="btn-delete-stock btn-icon" title="Eliminar cuenta" aria-label="Eliminar cuenta">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isMobile ? (
            <div className="admin-pager">
              <span>{pageRows.length} de {rows.length} cuentas</span>
              {remaining > 0 && (
                <button type="button" className="btn btn-secondary admin-load-more" onClick={() => setPage((p) => p + 1)}>
                  Cargar {Math.min(PAGE_SIZE, remaining)} más
                </button>
              )}
            </div>
          ) : (
            <div className="admin-pager">
              <span>{rows.length} cuentas · página {currentPage} de {totalPages}</span>
              <div className="admin-pager-actions">
                <button type="button" className="btn btn-secondary admin-btn-compact" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </button>
                <button type="button" className="btn btn-secondary admin-btn-compact" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
