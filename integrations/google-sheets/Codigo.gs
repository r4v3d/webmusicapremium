/**
 * MusicaPremium ↔ Google Sheets
 *
 * Pega este archivo completo en Extensiones → Apps Script de tu hoja.
 * Instrucciones paso a paso: integrations/google-sheets/README.md
 *
 * Pestañas que crea:
 *   · Clientes   → un cupo por fila, igual que Clientes → Tabla del panel:
 *                  CORREO TITULAR · NOMBRE · CORREO CLIENTE · CONTRASEÑA · PAGÓ · RENOVACIÓN
 *   · Titulares  → una fila por cuenta titular:
 *                  CORREO TITULAR · FECHA RENOVACIÓN · TARJETA
 * Lo que edites se guarda en el panel en segundos, y lo que cambie en el panel
 * (ventas, renovaciones, ediciones) aparece aquí solo. Las filas que pegues
 * abajo sin ID se cargan con el menú «Cargar filas nuevas».
 *
 * La clave secreta vive en las propiedades del script, nunca en este código.
 */

var ETIQUETA = 'MusicaPremium';
var MSG_PENDIENTE = 'Fila nueva: cuando termines de pegar, usa el menú ' + ETIQUETA + ' → Cargar filas nuevas.';
var LOTE = 50; // filas nuevas por llamada al servidor

// Columnas. fija = la pone el sistema; local = solo existe en la hoja; oculta = no se ve.
var CLIENTES = {
  nombre: 'Clientes',
  cols: [
    { key: 'correoTitular', titulo: 'CORREO TITULAR', ancho: 230, texto: true },
    { key: 'nombre', titulo: 'NOMBRE', ancho: 150, texto: true },
    { key: 'correoMiembro', titulo: 'CORREO CLIENTE', ancho: 240, texto: true },
    { key: 'claveMiembro', titulo: 'CONTRASEÑA', ancho: 140, texto: true },
    { key: 'precio', titulo: 'PAGÓ', ancho: 70, numero: true },
    { key: 'vence', titulo: 'RENOVACIÓN', ancho: 110, fecha: true },
    { key: 'sync', titulo: 'Sync', ancho: 230, fija: true, local: true, texto: true },
    { key: 'id', titulo: 'ID', ancho: 60, fija: true, oculta: true, texto: true },
    { key: 'plataforma', titulo: 'Plataforma', ancho: 80, fija: true, oculta: true },
    { key: 'cupo', titulo: 'Cupo', ancho: 50, fija: true, oculta: true },
    { key: 'version', titulo: 'versión', ancho: 60, fija: true, oculta: true, texto: true },
  ],
  visibles: 6,              // CORREO TITULAR … RENOVACIÓN
  accionEditar: 'edit',
  accionCargar: 'import',
  campoFilas: 'rows',       // dónde vienen sus filas en las respuestas del servidor
  orden: ['plataforma', 'correoTitular', 'cupo'],
  notas: {
    correoTitular: 'Para renombrar un titular, cámbialo en sus 5 filas a la vez. Para crear uno nuevo: menú ' + ETIQUETA + ' → Agregar titular.',
    nombre: 'WhatsApp (número) o usuario (@…) del cliente. Escribirlo ocupa el cupo; borrarlo lo libera (se borran PAGÓ y RENOVACIÓN).',
  },
};

var TITULARES = {
  nombre: 'Titulares',
  cols: [
    { key: 'correoTitular', titulo: 'CORREO TITULAR', ancho: 260, texto: true },
    { key: 'renuevaTitular', titulo: 'FECHA RENOVACIÓN', ancho: 140, fecha: true },
    { key: 'tarjetaTitular', titulo: 'TARJETA', ancho: 90, texto: true },
    { key: 'sync', titulo: 'Sync', ancho: 230, fija: true, local: true, texto: true },
    { key: 'id', titulo: 'ID', ancho: 60, fija: true, oculta: true, texto: true },
    { key: 'plataforma', titulo: 'Plataforma', ancho: 80, fija: true, oculta: true },
    { key: 'version', titulo: 'versión', ancho: 60, fija: true, oculta: true, texto: true },
  ],
  visibles: 3,
  accionEditar: 'titularEdit',
  accionCargar: 'titularImport',
  campoFilas: 'titulares',
  orden: ['plataforma', 'correoTitular'],
  notas: {
    correoTitular: 'Una fila por titular. Cambiar el correo renombra el titular. Los titulares nuevos se crean en «Clientes» (o menú ' + ETIQUETA + ' → Agregar titular).',
    renuevaTitular: 'Día/mes/año. En rojo si ya venció, en naranja si vence en 3 días o menos.',
    tarjetaTitular: 'Con qué tarjeta pagas la renovación (p. ej. 4642).',
  },
};

var TABLAS = [CLIENTES, TITULARES];

function col_(t, key) {
  for (var i = 0; i < t.cols.length; i++) if (t.cols[i].key === key) return i;
  return -1;
}

function tablaDe_(nombre) {
  for (var i = 0; i < TABLAS.length; i++) if (TABLAS[i].nombre === nombre) return TABLAS[i];
  return null;
}

// ---------------------------------------------------------------- Menú

function onOpen() {
  try { asegurarFormato_(CLIENTES, SpreadsheetApp.getActive().getSheetByName(CLIENTES.nombre)); } catch (e) { console.error(mensaje_(e)); }
  SpreadsheetApp.getUi()
    .createMenu(ETIQUETA)
    .addItem('Cargar filas nuevas', 'cargarFilasNuevas')
    .addItem('Agregar titular…', 'agregarTitular')
    .addItem('Recargar todo desde el panel', 'recargarInventarioManual')
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
  var previa = ss.getSheetByName(CLIENTES.nombre);
  if (previa) asegurarFormato_(CLIENTES, previa); // hoja de una versión anterior: primero se ajustan las columnas
  prepararHoja_(TITULARES);
  prepararHoja_(CLIENTES);
  instalarActivadores_();
  recargarInventario();

  ui.alert('¡Conectado!',
    'Las pestañas «' + CLIENTES.nombre + '» y «' + TITULARES.nombre + '» están listas.\n\n' +
    (info.envioAutomatico
      ? 'Los cambios del panel llegan a la hoja en segundos.'
      : 'OJO: el servidor todavía no tiene GOOGLE_SHEETS_WEBAPP_URL. Lo que edites aquí sí llega al panel, pero los cambios del panel solo aparecerán cada 15 minutos hasta que lo configures.'),
    ui.ButtonSet.OK);
}

function agregarTitular() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Agregar titular (Tidal)',
    'Correo del titular nuevo. Se crea con 5 cupos libres y la clave de siempre.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var email = (r.getResponseText() || '').trim();
  if (!email) return;
  try {
    llamar_({ action: 'addTitular', email: email, service: 'tidal' });
    recargarInventario(true);
    SpreadsheetApp.getActive().toast('Titular ' + email + ' creado con 5 cupos.', ETIQUETA, 6);
  } catch (err) {
    ui.alert('No se creó el titular', mensaje_(err), ui.ButtonSet.OK);
  }
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
      var ss = SpreadsheetApp.openById(props.getProperty('SS_ID'));
      var sh = ss.getSheetByName(CLIENTES.nombre);
      if (sh && !formatoAlDia_(CLIENTES, sh)) {
        return salida_({ ok: false, error: 'La hoja tiene el formato anterior: ábrela una vez para actualizarla.' });
      }
      if (msg.type === 'rows') {
        if (sh) aplicarFilas_(CLIENTES, sh, msg.rows || [], msg.deleted || [], {});
        var shT = ss.getSheetByName(TITULARES.nombre);
        if (shT && msg.titulares) recargarSinLock_(TITULARES, shT, msg.titulares);
      }
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

// ---------------------------------------------------------------- Edición

/** Activador instalable de edición: manda al panel lo que cambiaste en filas que ya existen. */
function alEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var t = tablaDe_(sh.getName());
  if (!t) return;
  if (!asegurarFormato_(t, sh)) return;

  var r0 = Math.max(e.range.getRow(), 2);
  var r1 = e.range.getLastRow();
  if (r1 < r0) return;
  var editables = [];
  for (var c = e.range.getColumn(); c <= e.range.getLastColumn(); c++) {
    if (t.cols[c - 1] && !t.cols[c - 1].fija) editables.push(c - 1);
  }
  if (!editables.length) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var n = r1 - r0 + 1;
    var valores = sh.getRange(r0, 1, n, t.cols.length).getValues();
    var edits = [];
    var enviados = {};
    // Filas nuevas (sin ID): no se cargan solas. Si se cargaran al completarse,
    // la hoja se reordenaría mientras pegas columna por columna y lo siguiente
    // caería en otras filas. Se cargan todas juntas con el menú.
    var syncCol = sh.getRange(r0, col_(t, 'sync') + 1, n, 1);
    var syncVals = syncCol.getValues();
    var hayNuevas = false;
    for (var i = 0; i < n; i++) {
      var fila = valores[i];
      var id = idDe_(t, fila);
      if (!id) {
        if (tieneDatos_(t, fila)) { syncVals[i][0] = MSG_PENDIENTE; hayNuevas = true; }
        continue;
      }
      var changes = {};
      editables.forEach(function (ci) { changes[t.cols[ci].key] = paraEnviar_(fila[ci]); });
      edits.push({ id: id, changes: changes });
      enviados[id] = fila;
    }
    if (hayNuevas) syncCol.setValues(syncVals);
    if (!edits.length) return;

    var resp;
    try {
      resp = llamar_({ action: t.accionEditar, edits: edits });
    } catch (err) {
      marcarFilas_(t, sh, Object.keys(enviados), '✗ No se guardó: ' + mensaje_(err));
      return;
    }
    var hora = hora_();
    var marcas = {};
    (resp.results || []).forEach(function (r) {
      marcas[r.id] = r.ok ? '✓ Guardado ' + hora + (r.nota ? ' · ' + r.nota : '') : '✗ ' + r.error;
    });
    aplicarFilas_(t, sh, resp[t.campoFilas] || [], resp.deleted || [], { enviados: enviados, marcas: marcas });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- Filas nuevas

/** Menú: carga al panel las filas sin ID de las dos pestañas (primero «Clientes», que crea titulares). */
function cargarFilasNuevas() {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(CLIENTES.nombre)) { SpreadsheetApp.getUi().alert('Primero usa ' + ETIQUETA + ' → Configurar conexión.'); return; }
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var porTabla = [];
    var total = 0;
    TABLAS.forEach(function (t) {
      var sh = ss.getSheetByName(t.nombre);
      if (!sh) return;
      var last = sh.getLastRow();
      var data = last >= 2 ? sh.getRange(2, 1, last - 1, t.cols.length).getValues() : [];
      var nuevas = [];
      data.forEach(function (fila, i) {
        if (!idDe_(t, fila) && String(fila[col_(t, 'correoTitular')]).trim() !== '') nuevas.push(filaParaCargar_(t, fila, i + 2));
      });
      porTabla.push({ t: t, sh: sh, nuevas: nuevas });
      total += nuevas.length;
    });
    if (!total) { ss.toast('No hay filas nuevas: todas tienen ID.', ETIQUETA, 6); return; }
    var fechas = avisoFechas_(porTabla);
    if (fechas) {
      var ui = SpreadsheetApp.getUi();
      ui.alert('No se cargó nada', fechas, ui.ButtonSet.OK);
      return;
    }
    ss.toast('Cargando ' + total + ' filas al panel…', ETIQUETA, 120);
    var ok = 0, mal = 0;
    porTabla.forEach(function (p) {
      if (!p.nuevas.length) return;
      var r = cargarNuevas_(p.t, p.sh, p.nuevas);
      ok += r.ok;
      mal += r.mal;
    });
    recargarTodo_(ss); // las cargadas vuelven con su ID y en orden, en las dos pestañas
    ss.toast('Cargadas: ' + ok + (mal ? ' · Con error: ' + mal + ' (mira la columna Sync)' : ''), ETIQUETA, 10);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manda las filas nuevas en lotes. Las que entraron se borran de su lugar (vuelven
 * con su ID en la recarga de después). Las que no, se quedan con el motivo en Sync.
 */
function cargarNuevas_(t, sh, nuevas) {
  var resultados = {};
  var ok = 0, mal = 0;
  for (var i = 0; i < nuevas.length; i += LOTE) {
    var lote = nuevas.slice(i, i + LOTE);
    try {
      var resp = llamar_({ action: t.accionCargar, rows: lote });
      (resp.results || []).forEach(function (r) {
        resultados[r.fila] = r;
        if (r.ok) ok++; else mal++;
      });
    } catch (err) {
      lote.forEach(function (f) { resultados[f.fila] = { ok: false, mensaje: 'No se cargó: ' + mensaje_(err) }; mal++; });
    }
  }
  var last = sh.getLastRow();
  if (last >= 2) {
    var rango = sh.getRange(2, 1, last - 1, t.cols.length);
    var data = rango.getValues();
    var colSync = col_(t, 'sync');
    data.forEach(function (fila, k) {
      var r = resultados[k + 2];
      if (!r) return;
      if (r.ok) data[k] = t.cols.map(function () { return ''; });
      else fila[colSync] = '✗ ' + r.mensaje;
    });
    rango.setValues(data);
  }
  return { ok: ok, mal: mal };
}

function idDe_(t, fila) {
  var id = String(fila[col_(t, 'id')] || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

function tieneDatos_(t, fila) {
  return fila.slice(0, t.visibles).some(function (v) { return v !== ''; });
}

function filaParaCargar_(t, fila, num) {
  var row = { fila: num };
  for (var c = 0; c < t.visibles; c++) row[t.cols[c].key] = paraEnviar_(fila[c]);
  return row;
}

/**
 * Con la hoja en formato de EE.UU., «03/10/26» se lee como 10 de marzo. Si hay
 * fechas y el formato no es día/mes, no se carga nada y se explica cómo cambiarlo.
 */
function avisoFechas_(porTabla) {
  var locale = SpreadsheetApp.getActive().getSpreadsheetLocale() || '';
  if (!/^en/i.test(locale)) return '';
  var hayFechas = porTabla.some(function (p) {
    var claves = p.t.cols.filter(function (c) { return c.fecha; }).map(function (c) { return c.key; });
    return p.nuevas.some(function (f) { return claves.some(function (k) { return f[k] !== ''; }); });
  });
  if (!hayFechas) return '';
  return 'La hoja lee las fechas como mes/día (configuración regional ' + locale + '). ' +
    'Cámbiala en File → Settings → Locale → Peru, guarda y vuelve a pegar las filas.';
}

// ---------------------------------------------------------------- Escribir lo que manda el panel

/**
 * Escribe en la hoja las filas que manda el servidor. Solo toca las que
 * cambiaron (versión distinta) y, si es la respuesta a una edición, no pisa
 * las celdas que editaste mientras se guardaba.
 */
function aplicarFilas_(t, sh, rows, deleted, opts) {
  var n = t.cols.length;
  var colSync = col_(t, 'sync');
  var colVersion = col_(t, 'version');
  var last = sh.getLastRow();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var indice = {};
  data.forEach(function (r, i) { var id = idDe_(t, r); if (id) indice[id] = i + 2; });

  var hora = hora_();
  var agregadas = [];
  rows.forEach(function (row) {
    var destino = filaDesdeServidor_(t, row);
    var marca = opts.marcas && opts.marcas[row.id];
    var num = indice[row.id];
    if (!num) {
      destino[colSync] = '↻ Nuevo ' + hora;
      agregadas.push(destino);
      return;
    }
    var actual = data[num - 2];
    if (!marca && actual[colVersion] === row.version) return;
    var enviado = opts.enviados && opts.enviados[row.id];
    var salida = actual.slice();
    for (var c = 0; c < n; c++) {
      if (t.cols[c].local) continue;
      if (enviado && serial_(actual[c]) !== serial_(enviado[c])) continue; // lo cambiaste mientras se guardaba
      salida[c] = destino[c];
    }
    salida[colSync] = marca || '↻ Panel ' + hora;
    sh.getRange(num, 1, 1, n).setValues([salida]);
  });

  if (agregadas.length) {
    var desde = Math.max(sh.getLastRow(), 1) + 1;
    asegurarFilas_(sh, desde + agregadas.length - 1);
    sh.getRange(desde, 1, agregadas.length, n).setValues(agregadas);
  }

  var borrar = (deleted || []).map(function (id) { return indice[String(id)]; }).filter(Boolean).sort(function (a, b) { return b - a; });
  borrar.forEach(function (num) { sh.deleteRow(num); });

  if (opts.marcas) {
    // Filas con error que no volvieron (p. ej. ya no existen): igual se marca el motivo.
    var vueltas = {};
    rows.forEach(function (r) { vueltas[r.id] = true; });
    Object.keys(opts.marcas).forEach(function (id) {
      if (!vueltas[id] && indice[id] && borrar.indexOf(indice[id]) < 0) sh.getRange(indice[id], colSync + 1).setValue(opts.marcas[id]);
    });
  }
  if (agregadas.length) ordenar_(t, sh);
}

function recargarInventarioManual() {
  var n = recargarInventario(true);
  SpreadsheetApp.getActive().toast(n === 0 ? 'La hoja ya estaba al día.' : 'Hoja recargada desde el panel.', ETIQUETA, 5);
}

/**
 * Trae todo del panel. La corre un activador cada 15 minutos como red de
 * seguridad; si todo coincide, no escribe nada. Devuelve cuántas filas escribió.
 */
function recargarInventario(lanzarErrores) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return -1;
  try {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_ID') || SpreadsheetApp.getActive().getId());
    return recargarTodo_(ss);
  } catch (err) {
    // El activador de 15 min pasa un objeto de evento: solo el menú (true) muestra el error.
    if (lanzarErrores === true) throw err;
    console.error('recargarInventario: ' + mensaje_(err));
    return -1;
  } finally {
    lock.releaseLock();
  }
}

function recargarTodo_(ss) {
  var resp = llamar_({ action: 'snapshot' });
  var escritas = 0;
  TABLAS.forEach(function (t) {
    var sh = ss.getSheetByName(t.nombre);
    if (!sh) return;
    if (!asegurarFormato_(t, sh)) throw new Error('La pestaña «' + t.nombre + '» tiene el formato anterior: abre la hoja para actualizarla.');
    escritas += recargarSinLock_(t, sh, resp[t.campoFilas] || []);
  });
  return escritas;
}

/** Reescribe la pestaña con las filas del panel. Las filas nuevas pendientes quedan al final, con su motivo. */
function recargarSinLock_(t, sh, rows) {
  var n = t.cols.length;
  var colSync = col_(t, 'sync');
  var colVersion = col_(t, 'version');
  var last = sh.getLastRow();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var actuales = {};
  var sinId = [];
  data.forEach(function (r) {
    var id = idDe_(t, r);
    if (id) actuales[id] = r;
    else if (tieneDatos_(t, r)) sinId.push(r);
  });

  var alDia = Object.keys(actuales).length === rows.length && data.length === rows.length + sinId.length &&
    rows.every(function (row) { return actuales[row.id] && actuales[row.id][colVersion] === row.version; });
  if (alDia) return 0;

  var hora = hora_();
  var salida = rows.map(function (row) {
    var previa = actuales[row.id];
    var f = filaDesdeServidor_(t, row);
    f[colSync] = previa && previa[colVersion] === row.version ? previa[colSync] : '↻ Panel ' + hora;
    return f;
  });
  sinId.forEach(function (r) {
    if (String(r[colSync]).indexOf('✗') !== 0) r[colSync] = MSG_PENDIENTE;
    salida.push(r);
  });

  if (last >= 2) sh.getRange(2, 1, last - 1, n).clearContent();
  if (salida.length) {
    asegurarFilas_(sh, salida.length + 1);
    sh.getRange(2, 1, salida.length, n).setValues(salida);
  }
  return salida.length;
}

function filaDesdeServidor_(t, row) {
  return t.cols.map(function (c) {
    if (c.local) return '';
    var v = row[c.key];
    return v === null || v === undefined ? '' : v;
  });
}

function marcarFilas_(t, sh, ids, texto) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var col = sh.getRange(2, col_(t, 'id') + 1, last - 1, 1).getValues();
  col.forEach(function (r, i) {
    if (ids.indexOf(String(r[0])) >= 0) sh.getRange(i + 2, col_(t, 'sync') + 1).setValue(texto);
  });
}

function asegurarFilas_(sh, hasta) {
  var max = sh.getMaxRows();
  if (hasta > max) sh.insertRowsAfter(max, hasta - max + 50);
}

function ordenar_(t, sh) {
  var last = sh.getLastRow();
  if (last < 3) return;
  sh.getRange(2, 1, last - 1, t.cols.length).sort(t.orden.map(function (k) {
    return { column: col_(t, k) + 1, ascending: true };
  }));
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
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (['alEditar', 'recargarInventario'].indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('recargarInventario').timeBased().everyMinutes(15).create();
}

/** true si la fila de títulos coincide con las columnas de la pestaña. */
function formatoAlDia_(t, sh) {
  var titulos = sh.getRange(1, 1, 1, t.cols.length).getValues()[0];
  return t.cols.every(function (c, i) { return titulos[i] === c.titulo; });
}

/**
 * Ajusta hojas de versiones anteriores. «Clientes» tuvo un tiempo RENOVACIÓN
 * TITULAR y TARJETA en G y H: ahora viven en «Titulares» (y en el panel), así
 * que se quitan esas dos columnas y lo demás vuelve a su lugar. Si falta la
 * pestaña «Titulares», se crea. Devuelve si la pestaña quedó al día.
 */
function asegurarFormato_(t, sh) {
  if (!sh) return false;
  if (formatoAlDia_(t, sh)) {
    if (t === CLIENTES) crearTitularesSiFalta_();
    return true;
  }
  if (t === CLIENTES && sh.getRange(1, 7).getValue() === 'RENOVACIÓN TITULAR' && sh.getRange(1, 8).getValue() === 'TARJETA') {
    sh.deleteColumns(7, 2);
    prepararHoja_(CLIENTES, sh);
    crearTitularesSiFalta_();
    return formatoAlDia_(t, sh);
  }
  return false;
}

function crearTitularesSiFalta_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss || ss.getSheetByName(TITULARES.nombre)) return;
  prepararHoja_(TITULARES);
  try { recargarTodo_(ss); } catch (e) { console.error('Titulares: ' + mensaje_(e)); }
}

function prepararHoja_(t, hoja) {
  var ss = SpreadsheetApp.getActive();
  var sh = hoja || ss.getSheetByName(t.nombre) || ss.insertSheet(t.nombre, t === CLIENTES ? 0 : 1);
  var n = t.cols.length;

  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  sh.getRange(1, 1, 1, n)
    .setValues([t.cols.map(function (c) { return c.titulo; })])
    .setFontWeight('bold').setFontSize(11).setBackground('#0000ff').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);

  var filas = sh.getMaxRows() - 1;
  sh.getRange(2, 1, filas, t.visibles).setHorizontalAlignment('center');
  t.cols.forEach(function (c, i) {
    sh.setColumnWidth(i + 1, c.ancho || 100);
    var rango = sh.getRange(2, i + 1, filas, 1);
    if (c.fecha) rango.setNumberFormat('dd/mm/yy');
    else if (c.texto) rango.setNumberFormat('@');
    if (c.fija) rango.setBackground('#f3f4f6').setFontColor('#6b7280');
    if (c.oculta) sh.hideColumns(i + 1);
  });
  sh.getRange(2, col_(t, 'correoTitular') + 1, filas, 1).setHorizontalAlignment('left');
  Object.keys(t.notas).forEach(function (k) { sh.getRange(1, col_(t, k) + 1).setNote(t.notas[k]); });
  sh.getRange(1, col_(t, 'sync') + 1).setNote('✓ guardado en el panel · ↻ cambió en el panel · ✗ no se guardó (motivo). Si hay ✗, la celda vuelve al valor del panel.');

  // Aviso (no bloqueo) al tocar lo que pone el sistema.
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === ETIQUETA) p.remove();
  });
  t.cols.forEach(function (c, i) {
    if (c.fija) sh.getRange(1, i + 1, sh.getMaxRows(), 1).protect().setDescription(ETIQUETA).setWarningOnly(true);
  });
  sh.getRange(1, 1, 1, n).protect().setDescription(ETIQUETA).setWarningOnly(true);

  sh.setConditionalFormatRules(t === CLIENTES ? reglasClientes_(sh) : reglasTitulares_(sh));
  if (t === CLIENTES) ss.setActiveSheet(sh);
}

function letra_(t, key) {
  return String.fromCharCode(65 + col_(t, key));
}

function reglasSync_(t, sh) {
  var s = letra_(t, 'sync');
  var sync = sh.getRange(s + '2:' + s);
  var n = SpreadsheetApp.newConditionalFormatRule;
  return [
    n().whenTextStartsWith('✗').setBackground('#fde2e1').setFontColor('#b42318').setRanges([sync]).build(),
    n().whenTextStartsWith('✓').setFontColor('#067647').setRanges([sync]).build(),
    n().whenTextStartsWith('↻').setFontColor('#175cd3').setRanges([sync]).build(),
  ];
}

/** Colores de «Clientes»: bandas por titular, cupos libres y renovaciones vencidas o próximas. */
function reglasClientes_(sh) {
  var t = CLIENTES;
  var tit = letra_(t, 'correoTitular'), nom = letra_(t, 'nombre'), ren = letra_(t, 'vence');
  var datos = sh.getRange('A2:' + ren);
  var nombre = sh.getRange(nom + '2:' + nom);
  var renueva = sh.getRange(ren + '2:' + ren);
  var n = SpreadsheetApp.newConditionalFormatRule;
  return [
    n().whenFormulaSatisfied('=AND($' + ren + '2<>"",$' + nom + '2<>"",$' + ren + '2<TODAY())').setFontColor('#d32f2f').setBold(true).setRanges([renueva]).build(),
    n().whenFormulaSatisfied('=AND($' + ren + '2<>"",$' + nom + '2<>"",$' + ren + '2-TODAY()<=3)').setFontColor('#e65100').setBold(true).setRanges([renueva]).build(),
    n().whenFormulaSatisfied('=AND($' + tit + '2<>"",$' + nom + '2="")').setBackground('#e8f5e9').setRanges([nombre]).build(),
    n().whenFormulaSatisfied('=AND($' + tit + '2<>"",ISODD(COUNTUNIQUE($' + tit + '$2:$' + tit + '2)))').setBackground('#eef2ff').setRanges([datos]).build(),
  ].concat(reglasSync_(t, sh));
}

/** Colores de «Titulares»: renovación vencida (rojo) o en 3 días o menos (naranja, como en tu hoja). */
function reglasTitulares_(sh) {
  var t = TITULARES;
  var f = letra_(t, 'renuevaTitular');
  var fecha = sh.getRange(f + '2:' + f);
  var n = SpreadsheetApp.newConditionalFormatRule;
  return [
    n().whenFormulaSatisfied('=AND($' + f + '2<>"",$' + f + '2<TODAY())').setBackground('#fde2e1').setFontColor('#b42318').setBold(true).setRanges([fecha]).build(),
    n().whenFormulaSatisfied('=AND($' + f + '2<>"",$' + f + '2-TODAY()<=3)').setBackground('#ff9900').setFontColor('#ffffff').setBold(true).setRanges([fecha]).build(),
  ].concat(reglasSync_(t, sh));
}
