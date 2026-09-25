/**
 * MusicaPremium ↔ Google Sheets
 *
 * Pega este archivo completo en Extensiones → Apps Script de tu hoja.
 * Instrucciones paso a paso: integrations/google-sheets/README.md
 *
 * Hojas que crea:
 *   · Cargar      → alta masiva de cuentas: pegas filas y usas el menú
 *                   «MusicaPremium → Subir filas de Cargar».
 *   · Inventario  → un cupo por fila, siempre igual al panel. Lo que edites aquí
 *                   se guarda en el panel en segundos, y lo que cambie en el
 *                   panel (ventas, renovaciones, ediciones) aparece aquí solo.
 *
 * La clave secreta vive en las propiedades del script, nunca en este código.
 */

var HOJA_INV = 'Inventario';
var HOJA_CARGA = 'Cargar';
var ETIQUETA = 'MusicaPremium';

// Columnas de «Inventario». fija = la pone el sistema; local = solo existe en la hoja.
var COLS = [
  { key: 'id', titulo: 'ID', ancho: 55, fija: true },
  { key: 'plataforma', titulo: 'Plataforma', ancho: 85, fija: true },
  { key: 'correoTitular', titulo: 'Correo titular', ancho: 210, texto: true },
  { key: 'claveTitular', titulo: 'Clave titular', ancho: 120, texto: true },
  { key: 'renuevaTitular', titulo: 'Renueva titular', ancho: 105, fecha: true },
  { key: 'costoTitular', titulo: 'Costo titular', ancho: 90, numero: true },
  { key: 'monedaTitular', titulo: 'Moneda', ancho: 70, lista: ['PEN', 'USD', 'ARS'] },
  { key: 'cupo', titulo: 'Cupo', ancho: 50, fija: true },
  { key: 'estado', titulo: 'Estado', ancho: 95, lista: ['Libre', 'Activo', 'Falta pago', 'Vencido', 'Reservado'] },
  { key: 'correoMiembro', titulo: 'Correo miembro', ancho: 210, texto: true },
  { key: 'claveMiembro', titulo: 'Clave miembro', ancho: 120, texto: true },
  { key: 'tipoCorreo', titulo: 'Tipo correo', ancho: 85, lista: ['Propio', 'Cliente'] },
  { key: 'cliente', titulo: 'Cliente', ancho: 140, texto: true },
  { key: 'whatsapp', titulo: 'WhatsApp', ancho: 120, texto: true },
  { key: 'precio', titulo: 'Precio S/', ancho: 75, numero: true },
  { key: 'vence', titulo: 'Vence', ancho: 95, fecha: true },
  { key: 'notasTitular', titulo: 'Notas titular', ancho: 180, texto: true },
  { key: 'actualizado', titulo: 'Actualizado', ancho: 120, fija: true, texto: true },
  { key: 'sync', titulo: 'Sync', ancho: 230, fija: true, local: true, texto: true },
  { key: 'version', titulo: 'versión', ancho: 60, fija: true, oculta: true, texto: true },
];
var COL_SYNC = indice_('sync');
var COL_VERSION = indice_('version');

// Columnas de «Cargar».
var CARGA = [
  { key: 'plataforma', titulo: 'Plataforma', ancho: 95, nota: 'Tidal, Deezer o Qobuz.' },
  { key: 'correoTitular', titulo: 'Correo titular', ancho: 210, texto: true, nota: 'Obligatorio. Si no existe, se crea la cuenta con 5 cupos.' },
  { key: 'claveTitular', titulo: 'Clave titular', ancho: 120, texto: true, nota: 'Obligatoria solo si la cuenta es nueva. Si la cuenta existe y pones otra, se actualiza.' },
  { key: 'renuevaTitular', titulo: 'Renueva titular', ancho: 105, fecha: true, nota: 'Opcional. Día/mes/año. Si la cuenta es nueva y lo dejas vacío: hoy + 30 días.' },
  { key: 'costoTitular', titulo: 'Costo titular', ancho: 90, numero: true, nota: 'Opcional.' },
  { key: 'correoMiembro', titulo: 'Correo miembro', ancho: 210, texto: true, nota: 'Opcional. Ocupa el primer cupo vacío de esa cuenta y queda listo para vender.' },
  { key: 'claveMiembro', titulo: 'Clave miembro', ancho: 120, texto: true, nota: 'Obligatoria si pones correo miembro.' },
  { key: 'resultado', titulo: 'Resultado', ancho: 330, texto: true, nota: 'Lo escribe el sistema. ✓ = subida; ✗ = no se subió (lee el motivo, corrige y vuelve a subir).' },
];
var CARGA_RESULTADO = CARGA.length - 1;

function indice_(key) {
  for (var i = 0; i < COLS.length; i++) if (COLS[i].key === key) return i;
  return -1;
}

// ---------------------------------------------------------------- Menú

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(ETIQUETA)
    .addItem('Subir filas de «Cargar»', 'subirCarga')
    .addItem('Recargar inventario completo', 'recargarInventarioManual')
    .addSeparator()
    .addItem('Probar conexión', 'probarConexion')
    .addItem('Configurar conexión…', 'configurar')
    .addToUi();
}

function configurar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var r1 = ui.prompt('Conexión con el panel (1 de 2)',
    'Dirección de tu tienda. Déjalo vacío para usar https://cheapmusic.best',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var base = (r1.getResponseText() || '').trim().replace(/\/+$/, '') || 'https://cheapmusic.best';
  if (!/^https:\/\//.test(base)) { ui.alert('La dirección debe empezar con https://'); return; }

  var r2 = ui.prompt('Conexión con el panel (2 de 2)',
    'Pega la clave secreta (el valor de GOOGLE_SHEETS_SECRET del servidor).',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var secret = (r2.getResponseText() || '').trim();
  if (secret.length < 32) { ui.alert('Esa clave es muy corta. Copia el valor completo de GOOGLE_SHEETS_SECRET.'); return; }

  var ss = SpreadsheetApp.getActive();
  props.setProperties({ API_BASE: base, SECRET: secret, SS_ID: ss.getId() });
  ss.setSpreadsheetTimeZone('America/Lima');

  var info;
  try {
    info = llamar_({ action: 'ping' });
  } catch (err) {
    ui.alert('No se pudo conectar', mensaje_(err), ui.ButtonSet.OK);
    return;
  }
  prepararHojas_(info.servicios || []);
  instalarActivadores_();
  recargarInventario();

  ui.alert('¡Conectado!',
    'Las hojas «' + HOJA_CARGA + '» e «' + HOJA_INV + '» están listas.\n\n' +
    (info.envioAutomatico
      ? 'Los cambios del panel llegan a la hoja en segundos.'
      : 'OJO: el servidor todavía no tiene GOOGLE_SHEETS_WEBAPP_URL. Lo que edites aquí sí llega al panel, pero los cambios del panel solo aparecerán cada 15 minutos hasta que lo configures.'),
    ui.ButtonSet.OK);
}

function probarConexion() {
  var ui = SpreadsheetApp.getUi();
  try {
    var info = llamar_({ action: 'ping' });
    ui.alert('Conexión correcta',
      'Servidor: ' + PropertiesService.getScriptProperties().getProperty('API_BASE') + '\n' +
      'Cambios del panel → hoja: ' + (info.envioAutomatico ? 'automáticos (segundos)' : 'cada 15 min (falta GOOGLE_SHEETS_WEBAPP_URL en el servidor)'),
      ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Sin conexión', mensaje_(err), ui.ButtonSet.OK);
  }
}

// ---------------------------------------------------------------- Comunicación

/** Llama a /api/sheets con la firma HMAC que exige el servidor. */
function llamar_(msg) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('API_BASE');
  var secret = props.getProperty('SECRET');
  if (!base || !secret) throw new Error('Falta configurar: menú ' + ETIQUETA + ' → Configurar conexión.');

  var body = jsonAscii_(msg);
  var ts = String(Date.now());
  var res = UrlFetchApp.fetch(base + '/api/sheets', {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-MPB-Timestamp': ts, 'X-MPB-Signature': hmacHex_(ts + '.' + body, secret) },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  var code = res.getResponseCode();
  var json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) { /* no era JSON */ }
  if (!json) throw new Error('El servidor respondió ' + code + ' sin datos. ¿La dirección de la tienda es correcta?');
  if (!json.ok) throw new Error(json.error || ('Error ' + code));
  return json;
}

/** Recibe los cambios del panel (lo llama el worker del servidor). */
function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SECRET');
    if (!secret) return salida_({ ok: false, error: 'La hoja todavía no está configurada (menú ' + ETIQUETA + ' → Configurar conexión).' });

    var sobre = JSON.parse(e.postData.contents);
    if (!sobre || typeof sobre.payload !== 'string' || hmacHex_(sobre.ts + '.' + sobre.payload, secret) !== sobre.sig) {
      return salida_({ ok: false, error: 'Firma inválida: la clave del script no coincide con GOOGLE_SHEETS_SECRET.' });
    }
    if (Math.abs(Date.now() - Number(sobre.ts)) > 5 * 60 * 1000) return salida_({ ok: false, error: 'Mensaje vencido.' });

    var msg = JSON.parse(sobre.payload);
    var lock = LockService.getScriptLock();
    lock.waitLock(120000);
    try {
      var sh = SpreadsheetApp.openById(props.getProperty('SS_ID')).getSheetByName(HOJA_INV);
      if (sh && msg.type === 'rows') aplicarFilas_(sh, msg.rows || [], msg.deleted || [], {});
    } finally {
      lock.releaseLock();
    }
    return salida_({ ok: true });
  } catch (err) {
    return salida_({ ok: false, error: mensaje_(err) });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hmacHex_(message, secret) {
  var bytes = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/** JSON solo con caracteres ASCII: tildes y ñ viajan como \uXXXX y la firma no depende del charset. */
function jsonAscii_(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

function mensaje_(err) {
  return String((err && err.message) || err);
}

// ---------------------------------------------------------------- Inventario

/** Activador instalable de edición: manda al panel lo que cambiaste. */
function alEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var nombre = sh.getName();
  if (nombre === HOJA_CARGA) return limpiarResultadoCarga_(e);
  if (nombre !== HOJA_INV) return;

  var r0 = Math.max(e.range.getRow(), 2);
  var r1 = e.range.getLastRow();
  if (r1 < r0) return;
  var editables = [];
  for (var c = e.range.getColumn(); c <= e.range.getLastColumn(); c++) {
    if (COLS[c - 1] && !COLS[c - 1].fija) editables.push(c - 1);
  }
  if (!editables.length) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var n = r1 - r0 + 1;
    var valores = sh.getRange(r0, 1, n, COLS.length).getValues();
    var edits = [];
    var enviados = {};
    var sinId = [];
    for (var i = 0; i < n; i++) {
      var fila = valores[i];
      var id = String(fila[0] || '').trim();
      if (!id) {
        if (fila.some(function (v) { return v !== ''; })) sinId.push(r0 + i);
        continue;
      }
      var changes = {};
      editables.forEach(function (ci) { changes[COLS[ci].key] = paraEnviar_(fila[ci]); });
      edits.push({ id: id, changes: changes });
      enviados[id] = fila;
    }
    sinId.forEach(function (row) {
      sh.getRange(row, COL_SYNC + 1).setValue('✗ Fila sin ID: para agregar cuentas usa la hoja «' + HOJA_CARGA + '»');
    });
    if (!edits.length) return;

    var resp;
    try {
      resp = llamar_({ action: 'edit', edits: edits });
    } catch (err) {
      marcarFilas_(sh, Object.keys(enviados), '✗ No se guardó: ' + mensaje_(err));
      return;
    }
    var hora = hora_();
    var marcas = {};
    (resp.results || []).forEach(function (r) { marcas[r.id] = r.ok ? '✓ Guardado ' + hora : '✗ ' + r.error; });
    aplicarFilas_(sh, resp.rows || [], resp.deleted || [], { enviados: enviados, marcas: marcas });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Escribe en la hoja las filas que manda el servidor. Solo toca las que
 * cambiaron (versión distinta) y, si es la respuesta a una edición, no pisa
 * las celdas que editaste mientras se guardaba.
 */
function aplicarFilas_(sh, rows, deleted, opts) {
  var last = sh.getLastRow();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, COLS.length).getValues() : [];
  var indice = {};
  data.forEach(function (r, i) { if (r[0] !== '') indice[String(r[0])] = i + 2; });

  var hora = hora_();
  var agregadas = [];
  rows.forEach(function (row) {
    var destino = filaDesdeServidor_(row);
    var marca = opts.marcas && opts.marcas[row.id];
    var num = indice[row.id];
    if (!num) {
      destino[COL_SYNC] = '↻ Nuevo ' + hora;
      agregadas.push(destino);
      return;
    }
    var actual = data[num - 2];
    if (!marca && actual[COL_VERSION] === row.version) return;
    var enviado = opts.enviados && opts.enviados[row.id];
    var salida = actual.slice();
    for (var c = 0; c < COLS.length; c++) {
      if (COLS[c].local) continue;
      if (enviado && serial_(actual[c]) !== serial_(enviado[c])) continue; // lo cambiaste mientras se guardaba
      salida[c] = destino[c];
    }
    salida[COL_SYNC] = marca || '↻ Panel ' + hora;
    sh.getRange(num, 1, 1, COLS.length).setValues([salida]);
  });

  if (agregadas.length) {
    var desde = Math.max(sh.getLastRow(), 1) + 1;
    asegurarFilas_(sh, desde + agregadas.length - 1);
    sh.getRange(desde, 1, agregadas.length, COLS.length).setValues(agregadas);
  }

  var borrar = (deleted || []).map(function (id) { return indice[String(id)]; }).filter(Boolean).sort(function (a, b) { return b - a; });
  borrar.forEach(function (num) { sh.deleteRow(num); });

  if (opts.marcas) {
    // Filas con error cuyo cupo no volvió (p. ej. ya no existe): igual se marca el motivo.
    var vueltas = {};
    rows.forEach(function (r) { vueltas[r.id] = true; });
    Object.keys(opts.marcas).forEach(function (id) {
      if (!vueltas[id] && indice[id] && borrar.indexOf(indice[id]) < 0) sh.getRange(indice[id], COL_SYNC + 1).setValue(opts.marcas[id]);
    });
  }
  if (agregadas.length) ordenar_(sh);
}

function recargarInventarioManual() {
  var n = recargarInventario(true);
  SpreadsheetApp.getActive().toast(n === 0 ? 'El inventario ya estaba al día.' : 'Inventario recargado.', ETIQUETA, 5);
}

/**
 * Trae el inventario completo del panel. La corre un activador cada 15 minutos
 * como red de seguridad; si todo coincide, no escribe nada.
 */
function recargarInventario(lanzarErrores) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return -1;
  try {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_ID') || SpreadsheetApp.getActive().getId());
    var sh = ss.getSheetByName(HOJA_INV);
    if (!sh) return -1;
    var resp = llamar_({ action: 'snapshot' });
    var rows = resp.rows || [];

    var last = sh.getLastRow();
    var data = last >= 2 ? sh.getRange(2, 1, last - 1, COLS.length).getValues() : [];
    var actuales = {};
    var sinId = [];
    data.forEach(function (r) {
      if (r[0] === '') { if (r.some(function (v) { return v !== ''; })) sinId.push(r); }
      else actuales[String(r[0])] = r;
    });

    var alDia = Object.keys(actuales).length === rows.length && data.length === rows.length + sinId.length &&
      rows.every(function (row) { return actuales[row.id] && actuales[row.id][COL_VERSION] === row.version; });
    if (alDia) return 0;

    var hora = hora_();
    var salida = rows.map(function (row) {
      var previa = actuales[row.id];
      var f = filaDesdeServidor_(row);
      f[COL_SYNC] = previa && previa[COL_VERSION] === row.version ? previa[COL_SYNC] : '↻ Panel ' + hora;
      return f;
    });
    sinId.forEach(function (r) {
      r[COL_SYNC] = '✗ Fila sin ID: para agregar cuentas usa la hoja «' + HOJA_CARGA + '»';
      salida.push(r);
    });

    if (last >= 2) sh.getRange(2, 1, last - 1, COLS.length).clearContent();
    if (salida.length) {
      asegurarFilas_(sh, salida.length + 1);
      sh.getRange(2, 1, salida.length, COLS.length).setValues(salida);
    }
    return salida.length;
  } catch (err) {
    // El activador de 15 min pasa un objeto de evento: solo el menú (true) muestra el error.
    if (lanzarErrores === true) throw err;
    console.error('recargarInventario: ' + mensaje_(err));
    return -1;
  } finally {
    lock.releaseLock();
  }
}

function filaDesdeServidor_(row) {
  return COLS.map(function (c) {
    if (c.local) return '';
    var v = row[c.key];
    return v === null || v === undefined ? '' : v;
  });
}

function marcarFilas_(sh, ids, texto) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  col.forEach(function (r, i) {
    if (ids.indexOf(String(r[0])) >= 0) sh.getRange(i + 2, COL_SYNC + 1).setValue(texto);
  });
}

/** Las filas nuevas heredan formato y validaciones de la fila de arriba. */
function asegurarFilas_(sh, hasta) {
  var max = sh.getMaxRows();
  if (hasta > max) sh.insertRowsAfter(max, hasta - max + 50);
}

function ordenar_(sh) {
  var last = sh.getLastRow();
  if (last < 3) return;
  sh.getRange(2, 1, last - 1, COLS.length).sort([
    { column: indice_('plataforma') + 1, ascending: true },
    { column: indice_('correoTitular') + 1, ascending: true },
    { column: indice_('cupo') + 1, ascending: true },
  ]);
}

// ---------------------------------------------------------------- Cargar

function subirCarga() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(HOJA_CARGA);
  if (!sh) { SpreadsheetApp.getUi().alert('Primero usa ' + ETIQUETA + ' → Configurar conexión.'); return; }
  var last = sh.getLastRow();
  if (last < 2) { ss.toast('La hoja «' + HOJA_CARGA + '» está vacía.', ETIQUETA, 5); return; }

  var valores = sh.getRange(2, 1, last - 1, CARGA.length).getValues();
  var pendientes = [];
  valores.forEach(function (fila, i) {
    var datos = fila.slice(0, CARGA_RESULTADO);
    if (datos.every(function (v) { return v === ''; })) return;
    if (String(fila[CARGA_RESULTADO]).indexOf('✓') === 0) return;
    var row = { fila: i + 2 };
    for (var c = 0; c < CARGA_RESULTADO; c++) row[CARGA[c].key] = paraEnviar_(fila[c]);
    pendientes.push(row);
  });
  if (!pendientes.length) { ss.toast('No hay filas pendientes (las marcadas con ✓ ya se subieron).', ETIQUETA, 6); return; }

  var resultados = valores.map(function (f) { return [f[CARGA_RESULTADO]]; });
  var ok = 0, error = 0;
  ss.toast('Subiendo ' + pendientes.length + ' filas…', ETIQUETA, 30);
  for (var i = 0; i < pendientes.length; i += 100) {
    var lote = pendientes.slice(i, i + 100);
    try {
      var resp = llamar_({ action: 'load', rows: lote });
      (resp.results || []).forEach(function (r) {
        resultados[r.fila - 2][0] = (r.ok ? '✓ ' : '✗ ') + r.mensaje;
        if (r.ok) ok++; else error++;
      });
    } catch (err) {
      lote.forEach(function (r) { resultados[r.fila - 2][0] = '✗ No se subió: ' + mensaje_(err); error++; });
      break;
    }
  }
  sh.getRange(2, CARGA_RESULTADO + 1, resultados.length, 1).setValues(resultados);
  SpreadsheetApp.flush();
  if (ok) recargarInventario();
  ss.toast('Subidas: ' + ok + (error ? ' · Con error: ' + error + ' (mira la columna Resultado)' : ''), ETIQUETA, 10);
}

/** Si corriges una fila ya procesada de «Cargar», se borra su resultado para poder subirla otra vez. */
function limpiarResultadoCarga_(e) {
  if (e.range.getLastRow() < 2 || e.range.getColumn() > CARGA_RESULTADO) return;
  var sh = e.range.getSheet();
  var r0 = Math.max(e.range.getRow(), 2);
  var n = e.range.getLastRow() - r0 + 1;
  var rango = sh.getRange(r0, CARGA_RESULTADO + 1, n, 1);
  var vals = rango.getValues();
  var cambio = false;
  vals.forEach(function (v) {
    if (String(v[0]).indexOf('✗') === 0) { v[0] = ''; cambio = true; }
  });
  if (cambio) rango.setValues(vals);
}

// ---------------------------------------------------------------- Utilidades

function paraEnviar_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, zona_(), 'yyyy-MM-dd');
  if (typeof v === 'string') return v.trim();
  return v;
}

function serial_(v) {
  return v instanceof Date ? 'D' + v.getTime() : String(v);
}

function zona_() {
  return SpreadsheetApp.getActive() ? SpreadsheetApp.getActive().getSpreadsheetTimeZone() : 'America/Lima';
}

function hora_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM HH:mm');
}

// ---------------------------------------------------------------- Preparación

function instalarActivadores_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['alEditar', 'recargarInventario'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('recargarInventario').timeBased().everyMinutes(15).create();
}

function prepararHojas_(servicios) {
  var ss = SpreadsheetApp.getActive();
  var carga = ss.getSheetByName(HOJA_CARGA) || ss.insertSheet(HOJA_CARGA, 0);
  var inv = ss.getSheetByName(HOJA_INV) || ss.insertSheet(HOJA_INV, 1);

  // --- Inventario
  formatearHoja_(inv, COLS);
  inv.setFrozenColumns(3);
  COLS.forEach(function (c, i) {
    if (c.oculta) inv.hideColumns(i + 1);
    if (c.lista) {
      inv.getRange(2, i + 1, inv.getMaxRows() - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(c.lista, true).setAllowInvalid(false).build());
    }
  });
  inv.getRange(1, indice_('id') + 1).setNote('Identificador del cupo en el panel. No lo cambies.');
  inv.getRange(1, indice_('estado') + 1).setNote('Libre = en stock. Activo / Falta pago / Vencido necesitan WhatsApp del cliente. «Reservado» lo pone el sistema durante una compra.');
  inv.getRange(1, COL_SYNC + 1).setNote('✓ guardado en el panel · ↻ cambió en el panel · ✗ no se guardó (motivo). Si hay ✗, la celda vuelve al valor del panel.');

  // Aviso (no bloqueo) al tocar columnas que pone el sistema.
  inv.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === ETIQUETA) p.remove();
  });
  COLS.forEach(function (c, i) {
    if (!c.fija) return;
    var p = inv.getRange(1, i + 1, inv.getMaxRows(), 1).protect().setDescription(ETIQUETA);
    p.setWarningOnly(true);
  });
  var cab = inv.getRange(1, 1, 1, COLS.length).protect().setDescription(ETIQUETA);
  cab.setWarningOnly(true);
  reglasSync_(inv, COL_SYNC + 1);

  // --- Cargar
  formatearHoja_(carga, CARGA);
  var nombres = servicios.map(function (s) { return s.name; });
  if (nombres.length) {
    carga.getRange(2, 1, carga.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(nombres, true).setAllowInvalid(false).build());
  }
  CARGA.forEach(function (c, i) { if (c.nota) carga.getRange(1, i + 1).setNote(c.nota); });
  carga.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === ETIQUETA) p.remove();
  });
  carga.getRange(1, 1, 1, CARGA.length).protect().setDescription(ETIQUETA).setWarningOnly(true);
  reglasSync_(carga, CARGA_RESULTADO + 1);

  ss.setActiveSheet(carga);
}

function formatearHoja_(sh, cols) {
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, cols.length)
    .setValues([cols.map(function (c) { return c.titulo; })])
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff').setWrap(true);
  sh.setFrozenRows(1);
  var filas = sh.getMaxRows() - 1;
  cols.forEach(function (c, i) {
    sh.setColumnWidth(i + 1, c.ancho || 100);
    var rango = sh.getRange(2, i + 1, filas, 1);
    if (c.fecha) rango.setNumberFormat('dd/mm/yyyy');
    else if (c.numero) rango.setNumberFormat('0.00');
    else if (c.texto) rango.setNumberFormat('@');
    if (c.fija) rango.setBackground('#f3f4f6');
  });
}

function reglasSync_(sh, columna) {
  var rango = sh.getRange(2, columna, sh.getMaxRows() - 1, 1);
  var otras = sh.getConditionalFormatRules().filter(function (r) {
    return !r.getRanges().some(function (x) { return x.getColumn() === columna; });
  });
  otras.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('✗').setBackground('#fde2e1').setFontColor('#b42318').setRanges([rango]).build());
  otras.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('✓').setFontColor('#067647').setRanges([rango]).build());
  otras.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('↻').setFontColor('#175cd3').setRanges([rango]).build());
  sh.setConditionalFormatRules(otras);
}
