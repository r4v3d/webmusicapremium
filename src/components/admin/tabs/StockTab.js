"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { TrashIcon } from "../adminHelpers";
import { SecretField } from "../adminUi";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    setPage(1);
  }, [search, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="stock-section animate-fade-in">
      <div className="section-header-filters">
        <h2>Inventario de Cuentas</h2>
        <div className="admin-filter-row">
          <input
            type="search"
            className="form-input"
            placeholder="Buscar correo u orden"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="stock-filter-tabs">
            <button onClick={() => setStockFilter("all")} className={`filter-btn ${stockFilter === "all" ? "active" : ""}`}>Todas</button>
            <button onClick={() => setStockFilter("available")} className={`filter-btn ${stockFilter === "available" ? "active" : ""}`}>Disponibles</button>
            <button onClick={() => setStockFilter("used")} className={`filter-btn ${stockFilter === "used" ? "active" : ""}`}>Reservadas</button>
            <button onClick={() => setStockFilter("tidal")} className={`filter-btn ${stockFilter === "tidal" ? "active" : ""}`}>Tidal</button>
            <button onClick={() => setStockFilter("deezer")} className={`filter-btn ${stockFilter === "deezer" ? "active" : ""}`}>Deezer</button>
            <button onClick={() => setStockFilter("qobuz")} className={`filter-btn ${stockFilter === "qobuz" ? "active" : ""}`}>Qobuz</button>
          </div>
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
            <table className="admin-table">
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
                {pageRows.map((item) => (
                  <tr key={item.id}>
                    <td><span className={`badge-service badge-${item.service}`}>{item.service.toUpperCase()}</span></td>
                    <td>{item.reserved ? reservedLabel(item) : "Disponible"}</td>
                    <td>
                      <SecretField
                        value={item.accountData}
                        copyId={`stock-${item.id}`}
                        copiedId={copiedId}
                        onCopy={handleCopyToClipboard}
                        compact
                      />
                    </td>
                    <td>{item.familyMasterEmail || "-"}</td>
                    <td>{item.reservedForOrder ? `#${item.reservedForOrder}` : "-"}</td>
                    <td>
                      <button onClick={() => handleDeleteStock(item.id)} className="btn-delete-stock" title="Eliminar cuenta">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-pager">
            <span>{rows.length} cuentas · página {currentPage} de {totalPages}</span>
            <div className="admin-pager-actions">
              <button type="button" className="btn btn-secondary btn-sm-mobile" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <button type="button" className="btn btn-secondary btn-sm-mobile" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
