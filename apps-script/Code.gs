const TAB_ACTIVITIES = 'Actividades';
const TAB_RESULTS = 'Resultados';

function setupMigration() {
  const props = PropertiesService.getScriptProperties();
  const currentSheetId = props.getProperty('SPREADSHEET_ID');
  const sheetFile = currentSheetId ? SpreadsheetApp.openById(currentSheetId) : SpreadsheetApp.create('Resultados del juego Diagrama con etiquetas');
  props.setProperty('SPREADSHEET_ID', sheetFile.getId());
  const activitySheet = getOrCreateSheet_(sheetFile, TAB_ACTIVITIES, ['ID', 'Título', 'Configuración JSON', 'Imagen URL', 'Actualizada']);
  getOrCreateSheet_(sheetFile, TAB_RESULTS, ['ID', 'Actividad ID', 'Apellido paterno', 'Apellido materno', 'Nombre(s)', 'Aciertos', 'Total', 'Calificación', 'Tiempo realizado (s)', 'Tiempo restante (s)', 'Tiempo agotado', 'Respuestas JSON', 'Fecha']);

  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    const folder = DriveApp.createFolder('Imágenes de actividades Une las partes');
    folderId = folder.getId();
    props.setProperty('DRIVE_FOLDER_ID', folderId);
  }

  let pin = props.getProperty('TEACHER_PIN');
  if (!pin) {
    pin = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TEACHER_PIN', pin);
  }

  if (activitySheet.getLastRow() < 2) {
    const seed = defaultActivity_();
    activitySheet.appendRow([seed.id, seed.title, JSON.stringify(seed), seed.imageUrl, new Date()]);
  }

  Logger.log('Panel de resultados: ' + sheetFile.getUrl());
  Logger.log('Clave inicial del maestro (guárdala): ' + pin);
  Logger.log('Carpeta de imágenes creada. ID: ' + folderId);
  Logger.log('Después, implementa el proyecto como Aplicación web y copia la URL /exec en config.js.');
}

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const callback = String(p.callback || '');
  const result = routeGet_(p);
  if (callback) {
    if (!/^[A-Za-z_$][\w.$]{0,100}$/.test(callback)) return output_({ error: 'Callback inválido.' }, 'json');
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return output_(result, 'json');
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let result;
    if (body.action === 'submit') result = saveResult_(body);
    else if (body.action === 'saveActivity') result = saveActivity_(body);
    else result = { error: 'Operación no reconocida.' };
    return output_(result, 'json');
  } catch (err) {
    return output_({ error: String(err && err.message || 'No se pudo completar la operación.') }, 'json');
  }
}

function routeGet_(p) {
  const action = String(p.action || 'activity');
  if (action === 'activity') return getActivity_(String(p.id || 'digestivo-inicial'));
  if (action === 'attempts') return attemptInfo_(String(p.activityId || 'digestivo-inicial'), p.paternalSurname, p.maternalSurname, p.givenNames);
  if (action === 'leaderboard') return leaderboard_(String(p.activityId || 'digestivo-inicial'));
  if (!authorized_(p.key)) return { error: 'Clave del maestro incorrecta.' };
  if (action === 'activities') return listActivities_();
  if (action === 'results') return listResults_();
  return { error: 'Operación no reconocida.' };
}

function saveActivity_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.id || ('actividad-' + Utilities.getUuid())).slice(0, 100);
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Escribe el título de la actividad.');
  if (!Array.isArray(body.labels) || body.labels.length < 1 || body.labels.length > 10) throw new Error('La actividad requiere de 1 a 10 etiquetas.');

  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const old = findActivityRow_(sheet, id);
  let imageUrl = String(body.imageUrl || (old ? old.config.imageUrl : './sistema-digestivo.png'));
  if (body.imageData) imageUrl = saveImage_(String(body.imageData), id);

  const ids = {};
  const labels = body.labels.map(function(label, index) {
    const labelId = String(label.id || ('etiqueta-' + (index + 1))).slice(0, 100);
    if (ids[labelId]) throw new Error('Cada etiqueta debe tener un identificador distinto.');
    ids[labelId] = true;
    const text = String(label.text || '').trim().slice(0, 100);
    if (!text) throw new Error('Completa el texto de cada etiqueta.');
    return {
      id: labelId,
      text: text,
      color: /^#[0-9a-fA-F]{6}$/.test(label.color) ? label.color : '#2789e8',
      x: clamp_(label.x, 0, 100),
      y: clamp_(label.y, 0, 100)
    };
  });

  const mode = ['none', 'up', 'down'].includes(body.timerMode) ? body.timerMode : 'none';
  const activity = {
    id: id,
    title: title,
    instructions: 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.',
    timerMode: mode,
    timeLimitSeconds: clamp_(body.timeLimitSeconds || 180, 15, 3600),
    maxAttempts: body.maxAttempts === null ? null : clamp_(body.maxAttempts || 3, 1, 35),
    imageUrl: imageUrl,
    labels: labels
  };
  const now = new Date();
  const row = [id, title, JSON.stringify(activity), imageUrl, now];
  if (old) sheet.getRange(old.row, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return activity;
}

function saveResult_(body) {
  const id = String(body.activityId || 'digestivo-inicial').slice(0, 100);
  const activity = getActivity_(id);
  if (activity.error) throw new Error('No se encontró la actividad.');
  const paternal = clean_(body.paternalSurname, 70);
  const maternal = clean_(body.maternalSurname, 70);
  const names = clean_(body.givenNames, 100);
  if (!paternal || !maternal || !names) return { error: 'Escribe los dos apellidos y tu nombre.' };
  const placements = body.placements && typeof body.placements === 'object' ? body.placements : {};
  const safe = {};
  let correct = 0;
  activity.labels.forEach(function(label) {
    const target = String(placements[label.id] || '').slice(0, 100);
    if (activity.labels.some(function(other) { return other.id === target; })) safe[label.id] = target;
    if (target === label.id) correct++;
  });
  const total = activity.labels.length;
  const grade = Math.round((correct / Math.max(total, 1)) * 100) / 10;
  const elapsed = clamp_(body.elapsedSeconds || 0, 0, 86400);
  const remaining = body.remainingSeconds === null || body.remainingSeconds === undefined ? '' : clamp_(body.remainingSeconds, 0, 86400);
  const timedOut = body.timedOut ? 'Sí' : 'No';
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const availability = attemptInfo_(id, paternal, maternal, names);
    if (!availability.canStart) throw new Error('Ya utilizaste todos tus intentos para esta actividad.');
    spreadsheet_().getSheetByName(TAB_RESULTS).appendRow([
      Utilities.getUuid(), id, paternal, maternal, names, correct, total, grade, elapsed, remaining,
      timedOut, JSON.stringify(safe), new Date()
    ]);
    const attemptsUsed = availability.used + 1;
    return { correct: correct, total: total, grade: grade, elapsedSeconds: elapsed, remainingSeconds: remaining === '' ? null : remaining, timedOut: timedOut === 'Sí', attemptsUsed: attemptsUsed, attemptsRemaining: availability.maxAttempts === null ? null : Math.max(0, availability.maxAttempts - attemptsUsed), maxAttempts: availability.maxAttempts };
  } finally {
    lock.releaseLock();
  }
}

function attemptInfo_(activityId, paternalValue, maternalValue, namesValue) {
  const paternal = clean_(paternalValue, 70);
  const maternal = clean_(maternalValue, 70);
  const names = clean_(namesValue, 100);
  if (!paternal || !maternal || !names) return { error: 'Escribe los dos apellidos y tu nombre.' };
  const activity = getActivity_(activityId);
  if (activity.error) return { error: 'No se encontró la actividad.' };
  const sheet = spreadsheet_().getSheetByName(TAB_RESULTS);
  let used = 0;
  if (sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 2, sheet.getLastRow() - 1, 4).getValues();
    rows.forEach(function(row) {
      if (String(row[0]) === activityId && normalizeStudent_(row[1]) === normalizeStudent_(paternal) && normalizeStudent_(row[2]) === normalizeStudent_(maternal) && normalizeStudent_(row[3]) === normalizeStudent_(names)) used++;
    });
  }
  const maxAttempts = activity.maxAttempts === undefined ? 3 : activity.maxAttempts;
  return { used: used, maxAttempts: maxAttempts, remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - used), canStart: maxAttempts === null || used < maxAttempts };
}

function leaderboard_(activityId) {
  const activity = getActivity_(activityId);
  if (activity.error) return { error: 'No se encontró la actividad.' };
  const best = {};
  listResults_().filter(function(row) { return row.activity_id === activityId; }).forEach(function(row) {
    const key = [normalizeStudent_(row.paternal_surname), normalizeStudent_(row.maternal_surname), normalizeStudent_(row.given_names)].join('|');
    const previous = best[key];
    if (!previous || Number(row.correct) > Number(previous.correct) || (Number(row.correct) === Number(previous.correct) && Number(row.elapsed_seconds) < Number(previous.elapsed_seconds))) best[key] = row;
  });
  return Object.keys(best).map(function(key) { return best[key]; })
    .sort(function(a, b) { return Number(b.correct) - Number(a.correct) || Number(a.elapsed_seconds) - Number(b.elapsed_seconds) || String(a.paternal_surname).localeCompare(String(b.paternal_surname), 'es-MX'); })
    .slice(0, 35)
    .map(function(row, index) {
      return { rank: index + 1, name: String(row.given_names).trim().split(/\s+/)[0], paternalSurname: row.paternal_surname, correct: Number(row.correct), total: Number(row.total), grade: Number(row.grade), elapsedSeconds: Number(row.elapsed_seconds) };
    });
}

function normalizeStudent_(value) {
  return String(value || '').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function saveImage_(dataUrl, activityId) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Usa una imagen PNG, JPG o WebP.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 5 MB.');
  const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(bytes, match[1], activityId + '-' + Date.now() + '.' + ext);
  const file = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID')).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getActivity_(id) {
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const row = findActivityRow_(sheet, id);
  if (!row) return { error: 'No se encontró la actividad.' };
  try {
    const activity = JSON.parse(row.config);
    if (activity.maxAttempts === undefined) activity.maxAttempts = 3;
    activity.instructions = 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.';
    return activity;
  }
  catch (_) { return { error: 'La actividad guardada está dañada.' }; }
}

function listActivities_() {
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().map(function(row) {
    try {
      const activity = JSON.parse(row[2]);
      if (activity.maxAttempts === undefined) activity.maxAttempts = 3;
      activity.instructions = 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.';
      return activity;
    } catch (_) { return null; }
  }).filter(Boolean).reverse();
}

function listResults_() {
  const sheet = spreadsheet_().getSheetByName(TAB_RESULTS);
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues().slice(-1000).reverse();
  return rows.map(function(r) {
    return {
      id: String(r[0]), activity_id: String(r[1]), paternal_surname: String(r[2]), maternal_surname: String(r[3]),
      given_names: String(r[4]), correct: Number(r[5]), total: Number(r[6]), grade: Number(r[7]),
      elapsed_seconds: Number(r[8]), remaining_seconds: r[9] === '' ? null : Number(r[9]),
      timed_out: r[10] === 'Sí' ? 1 : 0, answers_json: String(r[11]),
      submitted_at: r[12] instanceof Date ? r[12].toISOString() : String(r[12])
    };
  });
}

function defaultActivity_() {
  return {
    id: 'digestivo-inicial', title: 'Partes del sistema digestivo',
    instructions: 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.',
    timerMode: 'down', timeLimitSeconds: 180, maxAttempts: 3, imageUrl: './sistema-digestivo.png',
    labels: [
      { id: 'boca', text: 'Boca', color: '#2789e8', x: 42, y: 13 },
      { id: 'glandulas-salivales', text: 'Glándulas salivales', color: '#d849cc', x: 57, y: 12 },
      { id: 'esofago', text: 'Esófago', color: '#fa7a16', x: 48, y: 35 },
      { id: 'higado', text: 'Hígado', color: '#18884a', x: 39, y: 45 },
      { id: 'estomago', text: 'Estómago', color: '#a739cc', x: 54, y: 47 },
      { id: 'pancreas', text: 'Páncreas', color: '#ef563f', x: 54, y: 53 },
      { id: 'intestino-delgado', text: 'Intestino delgado', color: '#2548d8', x: 51, y: 66 },
      { id: 'intestino-grueso', text: 'Intestino grueso', color: '#13a783', x: 69, y: 65 },
      { id: 'apendice', text: 'Apéndice', color: '#d17b18', x: 38, y: 74 },
      { id: 'ano', text: 'Ano', color: '#e52e45', x: 50, y: 87 }
    ]
  };
}

function findActivityRow_(sheet, id) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      let config = {};
      try { config = JSON.parse(values[i][2]); } catch (_) {}
      return { row: i + 2, config: config };
    }
  }
  return null;
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Primero ejecuta setupMigration en Apps Script.');
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf4fb');
  }
  return sheet;
}

function authorized_(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty('TEACHER_PIN');
  return Boolean(expected && String(pin || '') === expected);
}

function clean_(value, max) {
  const text = String(value || '').trim().slice(0, max);
  return /^[=+@-]/.test(text) ? "'" + text : text;
}
function clamp_(value, min, max) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}
function output_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
