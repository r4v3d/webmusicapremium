"use client";

import { useAdmin } from "../AdminContext";

export default function ImportTab() {
  const {
    handleConfirmImport,
    handlePreviewImport,
    importError,
    importLoading,
    importMessage,
    importMode,
    importPreview,
    importService,
    rawInput,
    setImportMode,
    setImportPreview,
    setImportService,
    setRawInput,
  } = useAdmin();

  const validCount = (importPreview || []).filter((row) => row.ok).length;
  const errorCount = (importPreview || []).filter((row) => !row.ok).length;

  return (
    <section className="import-section animate-fade-in">
            <h2>Carga Masiva e Importador de Datos</h2>
            <p className="section-instruction">
              Permite cargar de manera masiva cuentas familiares maestras, perfiles de miembros activos asociados a clientes permanentes, o perfiles libres en stock desde Excel/Google Sheets.
            </p>

            {importMessage && <div className="success-alert">{importMessage}</div>}
            {importError && <div className="error-alert">{importError}</div>}

            <form onSubmit={handlePreviewImport} className="import-stock-form glass-panel">
              <div className="form-group">
                <label className="form-label">Tipo de Importación / Acción:</label>
                <select
                  value={importMode}
                  onChange={(e) => {
                    setImportMode(e.target.value);
                    setImportPreview(null);
                  }}
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
                  onChange={(e) => {
                    setImportService(e.target.value);
                    setImportPreview(null);
                  }}
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

              <div className="import-actions">
                <button
                  type="submit"
                  className={`btn btn-secondary import-submit-btn ${importLoading ? "btn-disabled" : ""}`}
                  disabled={importLoading}
                >
                  {importLoading ? "Revisando filas..." : "Vista previa"}
                </button>
                <button
                  type="button"
                  className={`btn btn-primary import-submit-btn ${importLoading || !validCount ? "btn-disabled" : ""}`}
                  disabled={importLoading || !validCount}
                  onClick={handleConfirmImport}
                >
                  {importLoading ? "Importando..." : validCount === 1 ? "Importar 1 fila válida" : `Importar ${validCount} filas válidas`}
                </button>
              </div>
              {importPreview && (
                <div className="import-preview">
                  <p className="import-preview-summary">
                    {validCount} válidas · {errorCount} con error
                  </p>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Línea</th>
                          <th>Estado</th>
                          <th>Resumen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row) => (
                          <tr key={row.line} className={row.ok ? "" : "row-error"}>
                            <td>{row.line}</td>
                            <td>{row.ok ? "OK" : "Error"}</td>
                            <td>{row.ok ? row.summary : row.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </form>
          </section>
  );
}
