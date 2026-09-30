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
 * Lo que escribas en una celda se guarda en el panel en segundos, y lo que cambie
 * en el panel (ventas, renovaciones, ediciones) aparece aquí solo.
 * Para cambios grandes, pega los datos arreglados (en el orden que quieras) y usa
 * el menú «Aplicar cambios pegados»: la hoja manda y el orden se respeta.
 *
 * La clave secreta vive en las propiedades del script, nunca en este código.
 */

var ETIQUETA = 'MusicaPremium';
var MSG_PEGADO = 'Pegado: cuando termines, usa el menú ' + ETIQUETA + ' → Aplicar cambios pegados.';
var LOTE_FILAS = 500; // filas por llamada al servidor (sin partir titulares)

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
  campoFilas: 'rows',       // dónde vienen sus filas en las respuestas del servidor
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
  campoFilas: 'titulares',
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
    .addItem('Aplicar cambios pegados…', 'aplicarCambiosPegados')
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
        if (shT && msg.titulares) {
          // titularIds (si viene) = todas las cuentas que existen: las demás se quitan de la hoja.
          var borrados = [];
          if (msg.titularIds) {
            var vigentes = {};
            msg.titularIds.forEach(function (id) { vigentes[id] = true; });
            var lastT = shT.getLastRow();
            var idsT = lastT >= 2 ? shT.getRange(2, col_(TITULARES, 'id') + 1, lastT - 1, 1).getValues() : [];
            idsT.forEach(function (r) { var id = String(r[0] || '').trim(); if (/^\d+$/.test(id) && !vigentes[id]) borrados.push(id); });
          }
          aplicarFilas_(TITULARES, shT, msg.titulares, borrados, {});
        }
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

/**
 * Activador instalable de edición.
 * - Una sola fila con ID (escribir en una celda): se guarda en el panel al momento.
 * - Varias filas a la vez (pegar, borrar un bloque): no se aplica fila por fila,
 *   porque lo pegado casi nunca coincide con el ID oculto de cada fila. Esas
 *   filas quedan «Pegado» (sin ID) hasta usar el menú «Aplicar cambios pegados».
 */
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
    var colSync = col_(t, 'sync');
    if (n > 1) { marcarPegado_(t, sh, r0, n); return; }

    var fila = sh.getRange(r0, 1, 1, t.cols.length).getValues()[0];
    var id = idDe_(t, fila);
    if (!id) {
      if (tieneDatos_(t, fila)) sh.getRange(r0, colSync + 1).setValue(MSG_PEGADO);
      return;
    }
    var changes = {};
    editables.forEach(function (ci) { changes[t.cols[ci].key] = paraEnviar_(fila[ci]); });
    var enviados = {};
    enviados[id] = fila;

    var resp;
    try {
      resp = llamar_({ action: t.accionEditar, edits: [{ id: id, changes: changes }] });
    } catch (err) {
      sh.getRange(r0, colSync + 1).setValue('✗ No se guardó: ' + mensaje_(err));
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

/** Filas pegadas: sin ID (ya no representan ese cupo) y con el aviso en Sync. */
function marcarPegado_(t, sh, r0, n) {
  var rango = sh.getRange(r0, 1, n, t.cols.length);
  var data = rango.getValues();
  var colSync = col_(t, 'sync');
  data.forEach(function (fila) {
    // Todo lo que pone el sistema (ID, plataforma, cupo, versión) ya no vale para lo pegado.
    t.cols.forEach(function (c, ci) { if (c.fija) fila[ci] = ''; });
    fila[colSync] = tieneDatos_(t, fila) ? MSG_PEGADO : '';
  });
  var desde = colSync + 1;
  // Solo se escriben las columnas del sistema: lo que pegaste queda tal cual.
  sh.getRange(r0, desde, n, t.cols.length - colSync).setValues(data.map(function (f) { return f.slice(colSync); }));
}

// ---------------------------------------------------------------- Aplicar la hoja completa

/** Nombre viejo del menú. */
function cargarFilasNuevas() { aplicarCambiosPegados(); }

/**
 * Menú «Aplicar cambios pegados»: la hoja manda. Lee las dos pestañas completas,
 * muestra qué va a cambiar y, si confirmas, deja el panel igual a la hoja:
 *   · Clientes: cada cliente es el par (correo titular, correo cliente). Los
 *     clientes que ya no están bajo un titular de la hoja dejan libre su cupo.
 *   · Titulares: fecha de renovación y tarjeta (vacío = no se cambia).
 * Los titulares del panel que no están en la hoja no se tocan. Al terminar, las
 * filas quedan en el orden en que las pusiste, cada una con su ID.
 */
function aplicarCambiosPegados() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var shC = ss.getSheetByName(CLIENTES.nombre);
  var shT = ss.getSheetByName(TITULARES.nombre);
  if (!shC) { ui.alert('Primero usa ' + ETIQUETA + ' → Configurar conexión.'); return; }
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    if (!asegurarFormato_(CLIENTES, shC)) { ui.alert('La pestaña «Clientes» no tiene el formato esperado. Usa Configurar conexión.'); return; }
    var clientes = filasConDatos_(CLIENTES, shC);
    var titulares = shT ? filasConDatos_(TITULARES, shT) : [];
    var fechas = avisoFechas_([{ t: CLIENTES, nuevas: clientes }, { t: TITULARES, nuevas: titulares }]);
    if (fechas) { ui.alert('No se aplicó nada', fechas, ui.ButtonSet.OK); return; }

    ss.toast('Revisando ' + (clientes.length + titulares.length) + ' filas…', ETIQUETA, 60);
    var pre = llamar_({ action: 'bulkPreview', clientes: clientes, titulares: titulares });
    var s = pre.resumen;
    var cambios = s.titularesNuevos + s.clientesNuevos + s.clientesActualizados + s.cuposLiberados + s.titularesActualizados;
    var lineas = [
      'El panel quedará igual a la hoja:',
      '',
      '• Titulares nuevos: ' + s.titularesNuevos,
      '• Clientes nuevos: ' + s.clientesNuevos + ' · actualizados: ' + s.clientesActualizados + ' · sin cambios: ' + s.sinCambios,
      '• Cupos que quedan libres (clientes que ya no están en la hoja): ' + s.cuposLiberados,
      '• Titulares con fecha o tarjeta nueva: ' + s.titularesActualizados,
    ];
    if (pre.errores.length) lineas.push('• Filas con error (no se aplican; el motivo queda en Sync): ' + pre.errores.length);
    if (s.ausentes) lineas.push('• Titulares del panel que no están en la hoja (no se tocan): ' + s.ausentes);
    lineas.push('', cambios ? '¿Aplicar?' : 'No hay cambios. ¿Reordenar la hoja y ponerle los IDs igual?');
    if (ui.alert('Aplicar cambios pegados', lineas.join('\n'), ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    var errores = { Clientes: {}, Titulares: {} };
    pre.errores.forEach(function (e) { errores[e.hoja][e.fila] = e.mensaje; });

    if (cambios) {
      ss.toast('Aplicando cambios…', ETIQUETA, 300);
      var lotes = lotesPorTitular_(clientes, LOTE_FILAS);
      lotes.forEach(function (l) { llamar_({ action: 'bulkLiberar', rows: l }); });
      lotes.forEach(function (l) {
        var r = llamar_({ action: 'bulkAplicar', rows: l });
        (r.results || []).forEach(function (x) { if (!x.ok) errores.Clientes[x.fila] = x.mensaje; });
      });
      for (var i = 0; i < titulares.length; i += LOTE_FILAS) {
        var rt = llamar_({ action: 'bulkTitulares', rows: titulares.slice(i, i + LOTE_FILAS) });
        (rt.results || []).forEach(function (x) { if (!x.ok) errores.Titulares[x.fila] = x.mensaje; });
      }
    }

    var snap = llamar_({ action: 'snapshot' });
    componer_(CLIENTES, shC, snap.rows || [], { errores: errores.Clientes, porContenido: true });
    if (shT) componer_(TITULARES, shT, snap.titulares || [], { errores: errores.Titulares, porContenido: true });
    var nErr = Object.keys(errores.Clientes).length + Object.keys(errores.Titulares).length;
    ss.toast('Listo.' + (nErr ? ' Filas con error: ' + nErr + ' (mira la columna Sync).' : ''), ETIQUETA, 10);
  } finally {
    lock.releaseLock();
  }
}

/** Filas con algo escrito, con su número de fila. */
function filasConDatos_(t, sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var data = sh.getRange(2, 1, last - 1, t.visibles).getValues();
  var out = [];
  data.forEach(function (fila, i) {
    if (!fila.some(function (v) { return v !== ''; })) return;
    var row = { fila: i + 2 };
    for (var c = 0; c < t.visibles; c++) row[t.cols[c].key] = paraEnviar_(fila[c]);
    out.push(row);
  });
  return out;
}

/** Lotes de ~n filas sin partir a ningún titular (liberar necesita ver todas sus filas juntas). */
function lotesPorTitular_(rows, n) {
  var grupos = {};
  var orden = [];
  rows.forEach(function (r) {
    var k = claveTitular_(r.correoTitular);
    if (!grupos[k]) { grupos[k] = []; orden.push(k); }
    grupos[k].push(r);
  });
  var lotes = [];
  var actual = [];
  orden.forEach(function (k) {
    if (actual.length && actual.length + grupos[k].length > n) { lotes.push(actual); actual = []; }
    actual = actual.concat(grupos[k]);
  });
  if (actual.length) lotes.push(actual);
  return lotes;
}

/** Correo del titular en minúsculas (sin etiquetas como « - YO»). */
function claveTitular_(v) {
  var m = String(v || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return (m ? m[0] : String(v || '')).replace(/[.,;]+$/, '').toLowerCase().trim();
}

function idDe_(t, fila) {
  var id = String(fila[col_(t, 'id')] || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

function tieneDatos_(t, fila) {
  return fila.slice(0, t.visibles).some(function (v) { return v !== ''; });
}

/**
 * Con la hoja en formato de EE.UU., «03/10/26» se lee como 10 de marzo. Si hay
 * fechas y el formato no es día/mes, no se aplica nada y se explica cómo cambiarlo.
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
 * Cambios que llegan del panel (o la respuesta a una edición). Solo lee las
 * columnas ID y versión, y solo escribe las filas que cambiaron: rápido aunque
 * la pestaña tenga miles de filas. Los cupos nuevos van al final.
 * Si hay filas pegadas sin aplicar, no se agregan filas (se ordenará todo al aplicar).
 */
function aplicarFilas_(t, sh, rows, deleted, opts) {
  var n = t.cols.length;
  var colSync = col_(t, 'sync');
  var colId = col_(t, 'id');
  var colVersion = col_(t, 'version');
  var last = sh.getLastRow();
  var ids = last >= 2 ? sh.getRange(2, colId + 1, last - 1, 1).getValues() : [];
  var versiones = last >= 2 ? sh.getRange(2, colVersion + 1, last - 1, 1).getValues() : [];
  var syncs = last >= 2 ? sh.getRange(2, colSync + 1, last - 1, 1).getValues() : [];
  var indice = {};
  var pendientes = false;
  ids.forEach(function (r, i) {
    var id = String(r[0] || '').trim();
    if (/^\d+$/.test(id)) indice[id] = i + 2;
    else if (String(syncs[i][0]).indexOf('Pegado') === 0) pendientes = true;
  });

  var hora = hora_();
  var agregadas = [];
  var cambios = [];
  rows.forEach(function (row) {
    var destino = filaDesdeServidor_(t, row);
    var marca = opts.marcas && opts.marcas[row.id];
    var num = indice[row.id];
    if (!num) {
      destino[colSync] = '↻ Nuevo ' + hora;
      agregadas.push(destino);
      return;
    }
    if (!marca && versiones[num - 2][0] === row.version) return;
    cambios.push({ num: num, destino: destino, marca: marca, enviado: opts.enviados && opts.enviados[row.id] });
  });

  function mezclar(actual, ch) {
    var salida = actual.slice();
    for (var c = 0; c < n; c++) {
      if (t.cols[c].local) continue;
      if (ch.enviado && serial_(actual[c]) !== serial_(ch.enviado[c])) continue; // lo cambiaste mientras se guardaba
      salida[c] = ch.destino[c];
    }
    salida[colSync] = ch.marca || '↻ Panel ' + hora;
    return salida;
  }
  if (cambios.length > 50) {
    // Muchos cambios (p. ej. una acción en lote del panel): una lectura y una escritura del bloque.
    var desdeFila = Math.min.apply(null, cambios.map(function (ch) { return ch.num; }));
    var hastaFila = Math.max.apply(null, cambios.map(function (ch) { return ch.num; }));
    var bloque = sh.getRange(desdeFila, 1, hastaFila - desdeFila + 1, n);
    var datos = bloque.getValues();
    cambios.forEach(function (ch) { datos[ch.num - desdeFila] = mezclar(datos[ch.num - desdeFila], ch); });
    bloque.setValues(datos);
  } else {
    cambios.forEach(function (ch) {
      var actual = sh.getRange(ch.num, 1, 1, n).getValues()[0];
      sh.getRange(ch.num, 1, 1, n).setValues([mezclar(actual, ch)]);
    });
  }

  if (agregadas.length && !pendientes) {
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
    escritas += componer_(t, sh, resp[t.campoFilas] || [], {});
  });
  return escritas;
}

/** Alias usado por doPost y versiones anteriores. */
function recargarSinLock_(t, sh, rows) {
  return componer_(t, sh, rows, {});
}

/**
 * Reescribe la pestaña con las filas del panel SIN cambiar el orden que tiene:
 *   · cada fila con ID se reemplaza en su lugar por la del panel;
 *   · con porContenido (al aplicar lo pegado), las filas sin ID se reconocen por
 *     su contenido (titular + correo cliente, o el correo en «Titulares»); las
 *     filas de cupo vacío toman los cupos libres de su titular;
 *   · las filas con error se quedan como están, con el motivo en Sync;
 *   · lo del panel que no estaba en la hoja va debajo de las filas de su
 *     titular, o al final si el titular no estaba.
 * Si no hubo filas pegadas y ya estaba todo al día, no escribe nada.
 */
function componer_(t, sh, rows, opts) {
  var n = t.cols.length;
  var colSync = col_(t, 'sync');
  var colId = col_(t, 'id');
  var colVersion = col_(t, 'version');
  var errores = opts.errores || {};
  var porContenido = !!opts.porContenido;
  var hora = hora_();

  var last = sh.getLastRow();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, n).getValues() : [];

  var byId = {};
  var byKey = {};
  var vaciosPorTitular = {};
  rows.forEach(function (r) {
    byId[r.id] = r;
    var k = claveContenido_(t, r);
    if (k) byKey[k] = r;
    else if (t === CLIENTES) {
      var kt = claveTitular_(r.correoTitular);
      (vaciosPorTitular[kt] = vaciosPorTitular[kt] || []).push(r);
    }
  });

  if (!porContenido) {
    var hayPegadas = data.some(function (f) { return !idDe_(t, f) && tieneDatos_(t, f); });
    var alDia = !hayPegadas && data.filter(function (f) { return idDe_(t, f); }).length === rows.length &&
      data.every(function (f) { var id = idDe_(t, f); return !id || (byId[id] && byId[id].version === f[colVersion]); });
    if (alDia) return 0;
    // Con filas pegadas sin aplicar, solo se actualizan en su lugar las que tienen ID.
    if (hayPegadas) {
      aplicarFilas_(t, sh, rows, [], {});
      return 0;
    }
  }

  var usados = {};
  var salida = [];
  var cuentas = []; // titular de cada fila de salida (para poner debajo lo que falte)
  function emitir(r, previa) {
    usados[r.id] = true;
    var f = filaDesdeServidor_(t, r);
    f[colSync] = porContenido ? '✓ Sincronizado ' + hora
      : previa && previa[colVersion] === r.version ? previa[colSync] : '↻ Panel ' + hora;
    salida.push(f);
    cuentas.push(claveTitular_(r.correoTitular));
  }

  data.forEach(function (f, i) {
    if (!tieneDatos_(t, f) && !idDe_(t, f)) return; // filas vacías: se compactan
    var num = i + 2;
    if (errores[num]) {
      var g = f.slice();
      t.cols.forEach(function (c, ci) { if (c.fija) g[ci] = ''; });
      g[colSync] = '✗ ' + errores[num];
      salida.push(g);
      var ktErr = claveTitular_(f[col_(t, 'correoTitular')]);
      cuentas.push(ktErr);
      // La fila con error ocupa el lugar de lo que representa: el mismo cliente
      // si ya estaba en el panel, o si no un cupo libre de su titular. Así no
      // aparece repetido ni una fila de más (el titular sigue con sus 5 filas).
      var filaErr = {};
      t.cols.forEach(function (c, ci) { filaErr[c.key] = f[ci]; });
      var kErr = claveContenido_(t, filaErr);
      if (kErr && byKey[kErr] && !usados[byKey[kErr].id]) {
        usados[byKey[kErr].id] = true;
      } else if (t === CLIENTES) {
        var libresErr = vaciosPorTitular[ktErr] || [];
        while (libresErr.length && usados[libresErr[0].id]) libresErr.shift();
        if (libresErr.length) usados[libresErr.shift().id] = true;
      }
      return;
    }
    var id = idDe_(t, f);
    if (id && byId[id] && !usados[id]) { emitir(byId[id], f); return; }
    if (id) return; // ya no existe en el panel
    if (!porContenido) { // fila pegada sin aplicar: se queda donde está
      var p = f.slice(); p[colSync] = MSG_PEGADO;
      salida.push(p);
      cuentas.push(claveTitular_(f[col_(t, 'correoTitular')]));
      return;
    }
    var fila = {};
    t.cols.forEach(function (c, ci) { fila[c.key] = f[ci]; });
    var k = claveContenido_(t, fila);
    if (k && byKey[k] && !usados[byKey[k].id]) { emitir(byKey[k], null); return; }
    if (!k && t === CLIENTES) { // cupo vacío: el siguiente cupo libre de su titular
      var libres = vaciosPorTitular[claveTitular_(fila.correoTitular)] || [];
      while (libres.length && usados[libres[0].id]) libres.shift();
      if (libres.length) emitir(libres.shift(), null);
    }
  });

  // Lo que el panel tiene y la hoja no: debajo de su titular, o al final.
  var faltan = {};
  var ordenFaltan = [];
  rows.forEach(function (r) {
    if (usados[r.id]) return;
    var kt = claveTitular_(r.correoTitular);
    if (!faltan[kt]) { faltan[kt] = []; ordenFaltan.push(kt); }
    faltan[kt].push(r);
  });
  var ultimo = {};
  cuentas.forEach(function (kt, i) { ultimo[kt] = i; });
  var final = [];
  salida.forEach(function (f, i) {
    final.push(f);
    var kt = cuentas[i];
    if (ultimo[kt] === i && faltan[kt]) {
      faltan[kt].forEach(function (r) { var g = filaDesdeServidor_(t, r); g[colSync] = '↻ Panel ' + hora; final.push(g); });
      delete faltan[kt];
    }
  });
  ordenFaltan.forEach(function (kt) {
    (faltan[kt] || []).forEach(function (r) { var g = filaDesdeServidor_(t, r); g[colSync] = '↻ Panel ' + hora; final.push(g); });
  });

  if (last >= 2) sh.getRange(2, 1, last - 1, n).clearContent();
  if (final.length) {
    asegurarFilas_(sh, final.length + 1);
    sh.getRange(2, 1, final.length, n).setValues(final);
  }
  return final.length;
}

/** Cómo se reconoce una fila por su contenido. Cupo vacío de «Clientes» → '' (no tiene). */
function claveContenido_(t, r) {
  var kt = claveTitular_(r.correoTitular);
  if (!kt) return '';
  if (t === TITULARES) return kt;
  var cm = String(r.correoMiembro || '').trim().toLowerCase();
  return cm ? kt + '|' + cm : '';
}

function filaDesdeServidor_(t, row) {
  return t.cols.map(function (c) {
    if (c.local) return '';
    var v = row[c.key];
    return v === null || v === undefined ? '' : v;
  });
}

function asegurarFilas_(sh, hasta) {
  var max = sh.getMaxRows();
  if (hasta > max) sh.insertRowsAfter(max, hasta - max + 50);
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
