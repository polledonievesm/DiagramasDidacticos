const TAB_ACTIVITIES = 'Actividades';
const TAB_RESULTS = 'Resultados';
const TAB_STUDENTS = 'Alumnos';
const TAB_DEADLINES = 'Fechas límite';
const STUDENT_HEADERS = ['ID', 'Apellido paterno', 'Apellido materno', 'Nombre(s)', 'Usuario', 'Sal', 'Hash de contraseña', 'Activo', 'Creada', 'Versión de contraseña', 'Contraseña cifrada'];
const RESULT_HEADERS = ['ID', 'Actividad ID', 'Apellido paterno', 'Apellido materno', 'Nombre(s)', 'Aciertos', 'Total', 'Calificación', 'Tiempo realizado (s)', 'Tiempo restante (s)', 'Tiempo agotado', 'Respuestas JSON', 'Fecha', 'Alumno ID'];

function setupMigration() {
  const props = PropertiesService.getScriptProperties();
  const currentSheetId = props.getProperty('SPREADSHEET_ID');
  const sheetFile = currentSheetId ? SpreadsheetApp.openById(currentSheetId) : SpreadsheetApp.create('Resultados del juego Diagrama con etiquetas');
  props.setProperty('SPREADSHEET_ID', sheetFile.getId());
  const activitySheet = getOrCreateSheet_(sheetFile, TAB_ACTIVITIES, ['ID', 'Título', 'Configuración JSON', 'Imagen URL', 'Actualizada']);
  getOrCreateSheet_(sheetFile, TAB_RESULTS, RESULT_HEADERS);
  getOrCreateSheet_(sheetFile, TAB_STUDENTS, STUDENT_HEADERS);
  ensureDeadlineSheet_(sheetFile);
  ensureTokenSecret_();
  const firstTeacherPassword = ensureTeacherLogin_();

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
  if (firstTeacherPassword) {
    Logger.log('Acceso docente nuevo — usuario: maestra');
    Logger.log('Contraseña temporal del maestro (guárdala; no volverá a mostrarse): ' + firstTeacherPassword);
  }
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
    else if (body.action === 'archiveActivity') result = archiveActivity_(body);
    else if (body.action === 'saveStudents') result = saveStudents_(body);
    else if (body.action === 'studentLogin') result = studentLogin_(body);
    else if (body.action === 'teacherLogin') result = teacherLogin_(body);
    else if (body.action === 'teacherLogout') result = teacherLogout_(body);
    else if (body.action === 'resetStudentPassword') result = resetStudentPassword_(body);
    else if (body.action === 'manageStudents') result = manageStudents_(body);
    else if (body.action === 'setStudentActive') result = setStudentActive_(body);
    else if (body.action === 'deleteStudent') result = deleteStudent_(body);
    else if (body.action === 'setActivityDeadline') result = setActivityDeadline_(body);
    else if (body.action === 'setActivityDesign') result = setActivityDesign_(body);
    else if (body.action === 'setActivityStudents') result = setActivityStudents_(body);
    else result = { error: 'Operación no reconocida.' };
    return output_(result, 'json');
  } catch (err) {
    return output_({ error: String(err && err.message || 'No se pudo completar la operación.') }, 'json');
  }
}

function routeGet_(p) {
  const action = String(p.action || 'activity');
  if (action === 'activity') return getActivity_(String(p.id || 'digestivo-inicial'));
  if (action === 'pairActivities') return listPairActivities_();
  if (action === 'loginResult') return loginResult_(String(p.requestId || ''));
  if (action === 'teacherLoginResult') return teacherLoginResult_(String(p.requestId || ''));
  if (action === 'attempts') return attemptInfo_(String(p.activityId || 'digestivo-inicial'), p.paternalSurname, p.maternalSurname, p.givenNames, p.studentToken);
  if (action === 'leaderboard') return leaderboard_(String(p.activityId || 'digestivo-inicial'));
  if (action === 'studentPortal') return studentPortal_(String(p.studentToken || ''));
  if (action === 'capabilities') return { apiVersion: 5, kinds: ['diagram', 'pairs', 'quiz', 'quiz-show', 'true-false', 'group-sort', 'sequence', 'flashcards', 'memory', 'complete-sentence', 'complete-phrase', 'word-order', 'roulette', 'word-search', 'crossword'] };
  if (!authorized_(p.key)) return { error: 'Clave del maestro incorrecta.' };
  if (action === 'activities') return listActivities_();
  if (action === 'results') return listResults_();
  if (action === 'students') return listStudents_();
  if (action === 'activityDeadline') return getDeadlineMap_()[String(p.id || '')] || { availableFrom: null, availableUntil: null };
  return { error: 'Operación no reconocida.' };
}

function saveActivity_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.id || ('actividad-' + Utilities.getUuid())).slice(0, 100);
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Escribe el título de la actividad.');
  if (body.kind === 'pairs') return savePairActivity_(body, id, title);
  if (['quiz', 'quiz-show', 'true-false', 'group-sort', 'sequence', 'flashcards', 'memory', 'complete-sentence', 'complete-phrase', 'word-order', 'roulette', 'word-search', 'crossword'].includes(body.kind)) return saveTemplateActivity_(body, id, title);
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
    coverImageUrl: String(body.coverImageUrl || (old && old.config.coverImageUrl) || ''),
    cardTheme: ['mint', 'sky', 'lilac', 'peach'].indexOf(String(body.cardTheme || (old && old.config.cardTheme) || 'mint')) >= 0 ? String(body.cardTheme || (old && old.config.cardTheme) || 'mint') : 'mint',
    labels: labels,
    assignedStudentIds: Array.isArray(body.assignedStudentIds) ? body.assignedStudentIds.map(String) : old ? old.config.assignedStudentIds : []
  };
  applySharedActivitySettings_(activity, body);
  const now = new Date();
  const row = [id, title, JSON.stringify(activity), imageUrl, now];
  if (old) sheet.getRange(old.row, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return activity;
}

function saveTemplateActivity_(body, id, title) {
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const old = findActivityRow_(sheet, id);
  const kind = String(body.kind || '');
  const seen = {};
  function unique_(value, fallback) {
    const itemId = String(value || fallback).slice(0, 100);
    if (!itemId || seen[itemId]) throw new Error('Cada elemento debe tener un identificador distinto.');
    seen[itemId] = true;
    return itemId;
  }
  function image_(item, suffix) {
    let imageUrl = String(item.imageUrl || '');
    if (item.imageData) imageUrl = saveImage_(String(item.imageData), id + '-' + suffix);
    return imageUrl || null;
  }
  const content = {};
  if (kind === 'roulette') {
    if (!Array.isArray(body.wheelEntries) || body.wheelEntries.length < 2 || body.wheelEntries.length > 40) throw new Error('Agrega entre 2 y 40 opciones a la ruleta.');
    content.wheelEntries = body.wheelEntries.map(function(entry, i) { const entryId = unique_(entry.id, 'opcion-' + (i + 1)); const text = String(entry.text || '').trim().slice(0, 180); const imageUrl = image_(entry, entryId); if (!text && !imageUrl) throw new Error('Cada opción necesita texto o imagen.'); return { id: entryId, text: text, imageUrl: imageUrl }; });
  } else if (kind === 'word-search') {
    if (!Array.isArray(body.wordSearchWords) || body.wordSearchWords.length < 3 || body.wordSearchWords.length > 20) throw new Error('Agrega entre 3 y 20 palabras.');
    const size = clamp_(body.wordSearchGridSize || 10, 10, 15), seenWords = {};
    content.wordSearchWords = body.wordSearchWords.map(function(word) { const text = String(word || '').trim().slice(0, 30), normalized = normalizeWord_(text); if (!normalized || normalized.length > size) throw new Error('Cada palabra debe caber en la cuadrícula de ' + size + ' letras.'); if (seenWords[normalized]) throw new Error('No repitas palabras en la sopa de letras.'); seenWords[normalized] = true; return text; });
    content.wordSearchGridSize = size; content.wordSearchDirections = ['horizontal', 'vertical', 'diagonal'];
    content.wordSearchShowClues = body.wordSearchShowClues === true;
    content.wordSearchClues = {};
    content.wordSearchWords.forEach(function(word) { const clue = String((body.wordSearchClues || {})[word] || '').trim().slice(0, 160); if (content.wordSearchShowClues && !clue) throw new Error('Escribe una pista para cada palabra o elige “Mostrar palabras”.'); if (clue) content.wordSearchClues[word] = clue; });
  } else if (kind === 'crossword') {
    if (!Array.isArray(body.crosswordClues) || body.crosswordClues.length < 3 || body.crosswordClues.length > 25) throw new Error('Agrega entre 3 y 25 pistas para el crucigrama.');
    content.crosswordClues = body.crosswordClues.map(function(item, i) {
      const clueId = unique_(item.id, 'pista-' + (i + 1));
      const clue = String(item.clue || '').trim().slice(0, 240), answer = String(item.answer || '').trim().slice(0, 24);
      if (!clue || normalizeWord_(answer).length < 2) throw new Error('Cada pista necesita una pregunta y una respuesta de al menos 2 letras.');
      return { id: clueId, clue: clue, answer: answer, direction: item.direction === 'down' ? 'down' : 'across' };
    });
  } else if (kind === 'quiz' || kind === 'quiz-show' || kind === 'true-false') {
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 50) throw new Error('Agrega entre 1 y 50 preguntas.');
    content.questions = body.questions.map(function(question, qi) {
      const questionId = unique_(question.id, 'pregunta-' + (qi + 1));
      const prompt = String(question.prompt || '').trim().slice(0, 500);
      if (!prompt) throw new Error('Escribe el texto de cada pregunta.');
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > (kind === 'true-false' ? 2 : 5) || (kind === 'true-false' && question.options.length !== 2)) throw new Error('Cada pregunta requiere opciones válidas.');
      const optionIds = {};
      const options = question.options.map(function(option, oi) {
        const optionId = String(option.id || ('opcion-' + (oi + 1))).slice(0, 100);
        if (optionIds[optionId]) throw new Error('Las opciones de cada pregunta deben tener identificadores distintos.');
        optionIds[optionId] = true;
        const text = String(option.text || '').trim().slice(0, 240);
        if (!text) throw new Error('Completa todas las opciones.');
        return { id: optionId, text: text };
      });
      const correctOptionId = String(question.correctOptionId || '');
      if (!optionIds[correctOptionId]) throw new Error('Marca una respuesta correcta para cada pregunta.');
      return { id: questionId, prompt: prompt, imageUrl: image_(question, questionId), options: options, correctOptionId: correctOptionId };
    });
  } else if (kind === 'group-sort') {
    if (!Array.isArray(body.groups) || body.groups.length < 2 || body.groups.length > 8) throw new Error('Agrega entre 2 y 8 grupos.');
    const groupIds = {};
    content.groups = body.groups.map(function(group, i) {
      const groupId = unique_(group.id, 'grupo-' + (i + 1));
      groupIds[groupId] = true;
      return { id: groupId, title: String(group.title || '').trim().slice(0, 80), color: /^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : '#43866e' };
    });
    if (content.groups.some(function(group) { return !group.title; })) throw new Error('Escribe el nombre de cada grupo.');
    if (!Array.isArray(body.items) || body.items.length < 2 || body.items.length > 50) throw new Error('Agrega entre 2 y 50 elementos.');
    content.items = body.items.map(function(item, i) {
      const itemId = unique_(item.id, 'elemento-' + (i + 1));
      const text = String(item.text || '').trim().slice(0, 240);
      const groupId = String(item.groupId || '');
      if (!text || !groupIds[groupId]) throw new Error('Cada elemento necesita texto y un grupo correcto.');
      return { id: itemId, text: text, imageUrl: image_(item, itemId), groupId: groupId };
    });
  } else if (kind === 'complete-sentence' || kind === 'complete-phrase') {
    if (!Array.isArray(body.sentences) || body.sentences.length < 1 || body.sentences.length > 50) throw new Error('Agrega entre 1 y 50 oraciones.');
    content.sentences = body.sentences.map(function(sentence, i) {
      const sentenceId = unique_(sentence.id, 'oracion-' + (i + 1));
      const before = String(sentence.before || '').trim().slice(0, 500);
      const answer = String(sentence.answer || '').trim().slice(0, 120);
      const after = String(sentence.after || '').trim().slice(0, 500);
      if (!before || !answer) throw new Error('Cada oración requiere texto y una respuesta correcta.');
      if (kind === 'complete-phrase' && normalizeWord_(answer).length > clamp_(body.phraseGridSize || 10, 10, 15)) throw new Error('Una respuesta no cabe en la cuadrícula elegida.');
      return { id: sentenceId, before: before, answer: answer, after: after, imageUrl: image_(sentence, sentenceId) };
    });
    if (kind === 'complete-phrase') content.phraseGridSize = clamp_(body.phraseGridSize || 10, 10, 15);
  } else if (kind === 'word-order') {
    if (!Array.isArray(body.wordSentences) || body.wordSentences.length < 1 || body.wordSentences.length > 30) throw new Error('Agrega entre 1 y 30 oraciones.');
    content.wordSentences = body.wordSentences.map(function(sentence, i) {
      const sentenceId = unique_(sentence.id, 'oracion-' + (i + 1));
      const text = String(sentence.text || '').trim().slice(0, 500);
      const words = text.split(/\\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 50) throw new Error('Cada oración debe contener entre 2 y 50 palabras.');
      const wordStyles = Array.isArray(sentence.wordStyles) ? sentence.wordStyles : [];
      return { id: sentenceId, text: text, wordStyles: words.map(function(word, index) { const style = wordStyles[index] || {}; return { bold: style.bold === true, italic: style.italic === true, underline: style.underline === true }; }), words: words.map(function(word, index) { const style = wordStyles[index] || {}; return { id: sentenceId + '-palabra-' + index, text: word, order: index, bold: style.bold === true, italic: style.italic === true, underline: style.underline === true }; }) };
    });
  } else if (kind === 'flashcards' || kind === 'memory') {
    if (!Array.isArray(body.pairs) || body.pairs.length < 2 || body.pairs.length > 30) throw new Error('Agrega entre 2 y 30 tarjetas.');
    content.pairs = body.pairs.map(function(pair, i) {
      const pairId = unique_(pair.id, 'tarjeta-' + (i + 1));
      function side_(value, suffix) {
        value = value || {};
        const text = String(value.text || '').trim().slice(0, 240);
        const imageUrl = image_(value, pairId + '-' + suffix);
        if (!text && !imageUrl) throw new Error('Cada lado de la tarjeta necesita texto o imagen.');
        return { text: text, imageUrl: imageUrl };
      }
      return { id: pairId, left: side_(pair.left, 'a'), right: side_(pair.right, 'b') };
    });
  } else {
    if (!Array.isArray(body.steps) || body.steps.length < 2 || body.steps.length > 30) throw new Error('Agrega entre 2 y 30 pasos.');
    content.steps = body.steps.map(function(step, i) {
      const stepId = unique_(step.id, 'paso-' + (i + 1));
      const text = String(step.text || '').trim().slice(0, 240);
      if (!text) throw new Error('Escribe el texto de cada paso.');
      return { id: stepId, text: text, imageUrl: image_(step, stepId), order: i };
    });
  }
  const mode = ['none', 'up', 'down'].includes(body.timerMode) ? body.timerMode : 'none';
  const activity = {
    id: id, kind: kind, title: title,
    instructions: String(body.instructions || '').trim().slice(0, 240),
    timerMode: mode, timeLimitSeconds: clamp_(body.timeLimitSeconds || 180, 15, 3600),
    maxAttempts: body.maxAttempts === null ? null : clamp_(body.maxAttempts || 3, 1, 35),
    shuffle: body.shuffle !== false, sound: body.sound !== false, scoring: true,
    imageUrl: '', coverImageUrl: String(body.coverImageUrl || (old && old.config.coverImageUrl) || ''),
    cardTheme: ['mint', 'sky', 'lilac', 'peach'].indexOf(String(body.cardTheme || (old && old.config.cardTheme) || 'mint')) >= 0 ? String(body.cardTheme || (old && old.config.cardTheme) || 'mint') : 'mint', labels: [],
    assignedStudentIds: Array.isArray(body.assignedStudentIds) ? body.assignedStudentIds.map(String) : (old && old.config.assignedStudentIds) || []
  };
  Object.keys(content).forEach(function(key) { activity[key] = content[key]; });
  applySharedActivitySettings_(activity, body);
  const row = [id, title, JSON.stringify(activity), '', new Date()];
  if (old) sheet.getRange(old.row, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return activity;
}

function savePairActivity_(body, id, title) {
  if (!Array.isArray(body.pairs) || body.pairs.length < 3 || body.pairs.length > 30) throw new Error('Agrega entre 3 y 30 parejas.');
  const old = findActivityRow_(spreadsheet_().getSheetByName(TAB_ACTIVITIES), id);
  const seen = {};
  const pairs = body.pairs.map(function(pair, index) {
    const pairId = String(pair.id || ('pareja-' + (index + 1))).slice(0, 100);
    if (seen[pairId]) throw new Error('Cada pareja debe tener un identificador distinto.');
    seen[pairId] = true;
    function side_(value) {
      value = value || {};
      let imageUrl = String(value.imageUrl || '');
      if (value.imageData) imageUrl = saveImage_(String(value.imageData), id + '-' + pairId);
      const text = String(value.text || '').trim().slice(0, 160);
      if (!text && !imageUrl) throw new Error('Cada lado necesita texto o una imagen.');
      return { text: text, imageUrl: imageUrl || null };
    }
    return { id: pairId, left: side_(pair.left), right: side_(pair.right) };
  });
  const mode = ['none', 'up', 'down'].includes(body.timerMode) ? body.timerMode : 'none';
  const activity = {
    id: id, kind: 'pairs', title: title, instructions: String(body.instructions || 'Arrastra cada elemento junto a su pareja. En celular, toca un elemento y después su pareja.').trim().slice(0, 240),
    timerMode: mode, timeLimitSeconds: clamp_(body.timeLimitSeconds || 180, 15, 3600),
    maxAttempts: body.maxAttempts === null ? null : clamp_(body.maxAttempts || 3, 1, 35),
    imageUrl: '', coverImageUrl: String(body.coverImageUrl || (old && old.config.coverImageUrl) || ''),
    cardTheme: ['mint', 'sky', 'lilac', 'peach'].indexOf(String(body.cardTheme || (old && old.config.cardTheme) || 'mint')) >= 0 ? String(body.cardTheme || (old && old.config.cardTheme) || 'mint') : 'mint', labels: [], pairs: pairs,
    assignedStudentIds: Array.isArray(body.assignedStudentIds) ? body.assignedStudentIds.map(String) : old ? old.config.assignedStudentIds : []
  };
  applySharedActivitySettings_(activity, body);
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES), now = new Date();
  const row = [id, title, JSON.stringify(activity), '', now];
  if (old) sheet.getRange(old.row, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return activity;
}

function applySharedActivitySettings_(activity, body) {
  const fallbackShuffle = body.shuffle !== false;
  const fields = ['lenguajes', 'saberes', 'etica', 'humano'];
  activity.shuffleQuestions = body.shuffleQuestions === undefined ? fallbackShuffle : body.shuffleQuestions !== false;
  activity.shuffleAnswers = body.shuffleAnswers === undefined ? fallbackShuffle : body.shuffleAnswers !== false;
  activity.showAnswersAtEnd = body.showAnswersAtEnd === true;
  activity.showLeaderboard = body.showLeaderboard === true;
  activity.blurWhenInactive = body.blurWhenInactive === true;
  activity.fieldFormative = fields.indexOf(String(body.fieldFormative || '')) >= 0 ? String(body.fieldFormative) : '';
}

function listPairActivities_() {
  return listActivities_().filter(function(activity) { return activity.kind === 'pairs'; })
    .map(function(activity) {
      return { id: activity.id, kind: activity.kind, title: activity.title, timerMode: activity.timerMode,
        timeLimitSeconds: activity.timeLimitSeconds, maxAttempts: activity.maxAttempts, pairs: activity.pairs };
    });
}

function saveResult_(body) {
  const id = String(body.activityId || 'digestivo-inicial').slice(0, 100);
  const activity = getActivity_(id);
  if (activity.error) throw new Error('No se encontró la actividad.');
  const unavailable = activityAvailabilityError_(activity);
  if (unavailable) throw new Error(unavailable);
  const account = body.studentToken ? verifyStudentToken_(String(body.studentToken)) : null;
  if (body.studentToken && !account) throw new Error('Tu sesión venció. Vuelve a entrar con tu usuario y contraseña.');
  if (Array.isArray(activity.assignedStudentIds) && (!account || activity.assignedStudentIds.indexOf(String(account.id)) < 0)) throw new Error('Esta actividad no está asignada a tu cuenta.');
  const paternal = account ? account.paternalSurname : clean_(body.paternalSurname, 70);
  const maternal = account ? account.maternalSurname : clean_(body.maternalSurname, 70);
  const names = account ? account.givenNames : clean_(body.givenNames, 100);
  if (!paternal || !maternal || !names) return { error: 'Inicia sesión con tu usuario y contraseña.' };
  const placements = body.placements && typeof body.placements === 'object' ? body.placements : {};
  const matches = body.matches && typeof body.matches === 'object' ? body.matches : {};
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const safe = {};
  let correct = 0;
  if (activity.kind === 'roulette') {
    const allowed = {}; (activity.wheelEntries || []).forEach(function(entry) { allowed[entry.id] = true; });
    (Array.isArray(answers.completedIds) ? answers.completedIds.map(String) : []).forEach(function(entryId) { if (allowed[entryId] && !safe[entryId]) { safe[entryId] = entryId; correct++; } });
  } else if (activity.kind === 'word-search') {
    const allowed = {}; (activity.wordSearchWords || []).forEach(function(word) { allowed[normalizeWord_(word)] = word; });
    (Array.isArray(answers.foundWords) ? answers.foundWords : []).forEach(function(word) { const normalized = normalizeWord_(word); if (allowed[normalized] && !safe[allowed[normalized]]) { safe[allowed[normalized]] = allowed[normalized]; correct++; } });
  } else if (activity.kind === 'quiz' || activity.kind === 'quiz-show' || activity.kind === 'true-false') {
    (activity.questions || []).forEach(function(question) {
      const selected = String(answers[question.id] || '');
      if ((question.options || []).some(function(option) { return option.id === selected; })) safe[question.id] = selected;
      if (selected === question.correctOptionId) correct++;
    });
  } else if (activity.kind === 'group-sort') {
    (activity.items || []).forEach(function(item) {
      const selected = String(answers[item.id] || '');
      if ((activity.groups || []).some(function(group) { return group.id === selected; })) safe[item.id] = selected;
      if (selected === item.groupId) correct++;
    });
  } else if (activity.kind === 'sequence') {
    const submittedOrder = Array.isArray(answers.order) ? answers.order.map(String) : [];
    const correctSteps = (activity.steps || []).slice().sort(function(a, b) { return Number(a.order) - Number(b.order); });
    correctSteps.forEach(function(step, index) { if (submittedOrder[index] === step.id) correct++; });
    safe.order = submittedOrder.filter(function(stepId) { return correctSteps.some(function(step) { return step.id === stepId; }); });
  } else if (activity.kind === 'complete-sentence' || activity.kind === 'complete-phrase') {
    (activity.sentences || []).forEach(function(sentence) {
      const submitted = String(answers[sentence.id] || '').slice(0, 120);
      safe[sentence.id] = submitted;
      if (normalizeStudent_(submitted) === normalizeStudent_(sentence.answer)) correct++;
    });
  } else if (activity.kind === 'word-order') {
    (activity.wordSentences || []).forEach(function(sentence) {
      const submitted = String(answers[sentence.id] || '').split('|');
      const expected = (sentence.words || []).slice().sort(function(a, b) { return Number(a.order) - Number(b.order); });
      expected.forEach(function(word, index) { if (submitted[index] === word.id) correct++; });
      safe[sentence.id] = submitted.filter(function(wordId) { return expected.some(function(word) { return word.id === wordId; }); });
    });
  } else if (activity.kind === 'flashcards' || activity.kind === 'memory') {
    (activity.pairs || []).forEach(function(pair) {
      const selected = String(answers[pair.id] || '');
      if (selected === pair.id) { safe[pair.id] = pair.id; correct++; }
    });
  } else if (activity.kind === 'crossword') {
    (activity.crosswordClues || []).forEach(function(item) {
      const submitted = String(answers[item.id] || '').slice(0, 40);
      safe[item.id] = submitted;
      if (normalizeWord_(submitted) === normalizeWord_(item.answer)) correct++;
    });
  } else if (activity.kind === 'pairs') {
    (activity.pairs || []).forEach(function(pair) {
      const target = String(matches[pair.id] || '').slice(0, 100);
      if ((activity.pairs || []).some(function(other) { return other.id === target; })) safe[pair.id] = target;
      if (target === pair.id) correct++;
    });
  } else activity.labels.forEach(function(label) {
    const target = String(placements[label.id] || '').slice(0, 100);
    if (activity.labels.some(function(other) { return other.id === target; })) safe[label.id] = target;
    if (target === label.id) correct++;
  });
  const total = activity.kind === 'pairs' || activity.kind === 'flashcards' || activity.kind === 'memory' ? (activity.pairs || []).length : activity.kind === 'quiz' || activity.kind === 'quiz-show' || activity.kind === 'true-false' ? (activity.questions || []).length : activity.kind === 'group-sort' ? (activity.items || []).length : activity.kind === 'sequence' ? (activity.steps || []).length : activity.kind === 'complete-sentence' || activity.kind === 'complete-phrase' ? (activity.sentences || []).length : activity.kind === 'word-order' ? (activity.wordSentences || []).reduce(function(sum, sentence) { return sum + (sentence.words || []).length; }, 0) : activity.kind === 'roulette' ? (activity.wheelEntries || []).length : activity.kind === 'word-search' ? (activity.wordSearchWords || []).length : activity.kind === 'crossword' ? (activity.crosswordClues || []).length : activity.labels.length;
  const grade = Math.round((correct / Math.max(total, 1)) * 100) / 10;
  const elapsed = clamp_(body.elapsedSeconds || 0, 0, 86400);
  const remaining = body.remainingSeconds === null || body.remainingSeconds === undefined ? '' : clamp_(body.remainingSeconds, 0, 86400);
  const timedOut = body.timedOut ? 'Sí' : 'No';
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const availability = attemptInfo_(id, paternal, maternal, names, body.studentToken);
    if (!availability.canStart) throw new Error('Ya utilizaste todos tus intentos para esta actividad.');
    spreadsheet_().getSheetByName(TAB_RESULTS).appendRow([
      Utilities.getUuid(), id, paternal, maternal, names, correct, total, grade, elapsed, remaining,
      timedOut, JSON.stringify(safe), new Date(), account ? account.id : ''
    ]);
    const attemptsUsed = availability.used + 1;
    return { correct: correct, total: total, grade: grade, elapsedSeconds: elapsed, remainingSeconds: remaining === '' ? null : remaining, timedOut: timedOut === 'Sí', attemptsUsed: attemptsUsed, attemptsRemaining: availability.maxAttempts === null ? null : Math.max(0, availability.maxAttempts - attemptsUsed), maxAttempts: availability.maxAttempts };
  } finally {
    lock.releaseLock();
  }
}

function attemptInfo_(activityId, paternalValue, maternalValue, namesValue, studentToken) {
  const account = studentToken ? verifyStudentToken_(String(studentToken)) : null;
  if (studentToken && !account) return { error: 'Tu sesión venció. Vuelve a entrar con tu usuario y contraseña.' };
  if (studentToken && !account.active) return { error: 'La cuenta del alumno está desactivada.' };
  const paternal = clean_(paternalValue, 70);
  const maternal = clean_(maternalValue, 70);
  const names = clean_(namesValue, 100);
  if (!paternal || !maternal || !names) return { error: 'Escribe los dos apellidos y tu nombre.' };
  const activity = getActivity_(activityId);
  if (activity.error) return { error: 'No se encontró la actividad.' };
  if (Array.isArray(activity.assignedStudentIds) && (!account || activity.assignedStudentIds.indexOf(String(account.id)) < 0)) return { error: 'Esta actividad no está asignada a tu cuenta.' };
  const unavailable = activityAvailabilityError_(activity);
  if (unavailable) return { error: unavailable };
  const sheet = spreadsheet_().getSheetByName(TAB_RESULTS);
  let used = 0;
  if (sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RESULT_HEADERS.length).getValues();
    rows.forEach(function(row) {
      const sameStudent = account ? (String(row[13] || '') === account.id || (!row[13] && normalizeStudent_(row[2]) === normalizeStudent_(paternal) && normalizeStudent_(row[3]) === normalizeStudent_(maternal) && normalizeStudent_(row[4]) === normalizeStudent_(names))) : (normalizeStudent_(row[2]) === normalizeStudent_(paternal) && normalizeStudent_(row[3]) === normalizeStudent_(maternal) && normalizeStudent_(row[4]) === normalizeStudent_(names));
      if (String(row[1]) === activityId && sameStudent) used++;
    });
  }
  const maxAttempts = activity.maxAttempts === undefined ? 3 : activity.maxAttempts;
  return { used: used, maxAttempts: maxAttempts, remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - used), canStart: maxAttempts === null || used < maxAttempts, studentId: account ? account.id : '' };
}

function leaderboard_(activityId) {
  const activity = getActivity_(activityId);
  if (activity.error) return { error: 'No se encontró la actividad.' };
  const best = {}, counts = {};
  listResults_().filter(function(row) { return row.activity_id === activityId; }).forEach(function(row) {
    // Agrupa también los intentos antiguos que se guardaron antes de activar cuentas.
    const key = [normalizeStudent_(row.paternal_surname), normalizeStudent_(row.maternal_surname), normalizeStudent_(row.given_names)].join('|');
    counts[key] = (counts[key] || 0) + 1;
    const previous = best[key];
    if (!previous || Number(row.grade) > Number(previous.grade) || (Number(row.grade) === Number(previous.grade) && Number(row.correct) > Number(previous.correct)) || (Number(row.grade) === Number(previous.grade) && Number(row.correct) === Number(previous.correct) && Number(row.elapsed_seconds) < Number(previous.elapsed_seconds))) best[key] = row;
  });
  return Object.keys(best).map(function(key) { return { row: best[key], attempts: counts[key] }; })
    .sort(function(a, b) { return Number(b.row.grade) - Number(a.row.grade) || Number(b.row.correct) - Number(a.row.correct) || Number(a.row.elapsed_seconds) - Number(b.row.elapsed_seconds) || String(a.row.paternal_surname).localeCompare(String(b.row.paternal_surname), 'es-MX'); })
    .slice(0, 35)
    .map(function(item, index) {
      const row = item.row;
      return { rank: index + 1, name: String(row.given_names).trim().split(/\s+/)[0], paternalSurname: row.paternal_surname, grade: Number(row.grade), attempts: Number(item.attempts) };
    });
}

function studentPortal_(token) {
  const account = verifyStudentToken_(token);
  if (!account || !account.active) return { error: 'La sesión del alumno venció. Inicia sesión de nuevo.' };
  const attempts = listResults_().filter(function(row) {
    return row.student_id === account.id || (!row.student_id && normalizeStudent_(row.paternal_surname) === normalizeStudent_(account.paternalSurname) && normalizeStudent_(row.maternal_surname) === normalizeStudent_(account.maternalSurname) && normalizeStudent_(row.given_names) === normalizeStudent_(account.givenNames));
  });
  const activities = listActivities_().filter(function(activity) { return !Array.isArray(activity.assignedStudentIds) || activity.assignedStudentIds.indexOf(String(account.id)) >= 0; }).map(function(activity) {
    const startAt = activity.availableFrom || '';
    const dueAt = activity.availableUntil || '';
    const rows = attempts.filter(function(row) { return row.activity_id === activity.id; });
    const best = rows.reduce(function(current, row) {
      if (!current || Number(row.grade) > Number(current.grade) || (Number(row.grade) === Number(current.grade) && Number(row.correct) > Number(current.correct))) return row;
      return current;
    }, null);
    const expired = Boolean(dueAt && new Date(dueAt).getTime() <= Date.now());
    const scheduled = Boolean(startAt && new Date(startAt).getTime() > Date.now());
    return { id: activity.id, title: activity.title, instructions: activity.instructions || '', kind: activity.kind || 'diagram', imageUrl: activity.coverImageUrl || activityPreviewImage_(activity), theme: activity.cardTheme || 'mint', availableFrom: startAt || null, dueAt: dueAt || null,
      scheduled: scheduled, expired: expired, attempts: rows.length, bestGrade: best ? Number(best.grade) : null, completed: rows.length > 0 };
  });
  const grades = activities.filter(function(item) { return item.bestGrade !== null; }).map(function(item) { return Number(item.bestGrade); });
  const average = grades.length ? Math.round(grades.reduce(function(sum, grade) { return sum + grade; }, 0) / grades.length * 10) / 10 : null;
  return { student: { id: account.id, name: account.givenNames, givenNames: account.givenNames, paternalSurname: account.paternalSurname, maternalSurname: account.maternalSurname, username: account.username }, activities: activities, average: average, completedCount: grades.length };
}

function activityPreviewImage_(activity) {
  if (activity.imageUrl) return activity.imageUrl;
  const collections = [activity.pairs || [], activity.questions || [], activity.items || [], activity.steps || [], activity.sentences || [], activity.wheelEntries || []];
  for (let i = 0; i < collections.length; i++) {
    const items = collections[i];
    for (let j = 0; j < items.length; j++) {
      const item = items[j] || {};
      if (item.imageUrl) return item.imageUrl;
      if (item.left && item.left.imageUrl) return item.left.imageUrl;
      if (item.right && item.right.imageUrl) return item.right.imageUrl;
      if (item.front && item.front.imageUrl) return item.front.imageUrl;
      if (item.back && item.back.imageUrl) return item.back.imageUrl;
    }
  }
  return '';
}

function setActivityDesign_(body) {
  if (!authorized_(body.key)) throw new Error('La sesión docente venció. Inicia sesión otra vez.');
  const id = String(body.id || '').slice(0, 100);
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const row = findActivityRow_(sheet, id);
  if (!row) throw new Error('No se encontró la actividad.');
  const themes = ['mint', 'sky', 'lilac', 'peach'];
  const theme = themes.indexOf(String(body.theme || 'mint')) >= 0 ? String(body.theme) : 'mint';
  const activity = row.config;
  let coverImageUrl = String(body.coverImageUrl || activity.coverImageUrl || activityPreviewImage_(activity) || '');
  if (body.imageData) coverImageUrl = saveImage_(String(body.imageData), id + '-portada');
  activity.coverImageUrl = coverImageUrl;
  activity.cardTheme = theme;
  sheet.getRange(row.row, 3).setValue(JSON.stringify(activity));
  sheet.getRange(row.row, 5).setValue(new Date());
  SpreadsheetApp.flush();
  return { id: id, coverImageUrl: coverImageUrl, cardTheme: theme };
}

function getDeadlineMap_() {
  const sheet = spreadsheet_().getSheetByName(TAB_DEADLINES), map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function(row) {
    if (!row[0]) return;
    map[String(row[0])] = { availableFrom: row[1] ? new Date(row[1]).toISOString() : null, availableUntil: row[2] ? new Date(row[2]).toISOString() : null };
  });
  return map;
}

function setActivityDeadline_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.id || '').slice(0, 100);
  if (!findActivityRow_(spreadsheet_().getSheetByName(TAB_ACTIVITIES), id)) throw new Error('No se encontró la actividad.');
  const rawFrom = String(body.availableFrom || '').trim(), rawUntil = String(body.availableUntil || '').trim(), sheet = spreadsheet_().getSheetByName(TAB_DEADLINES);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const index = rows.findIndex(function(row) { return String(row[0]) === id; });
  if (!rawFrom && !rawUntil) {
    if (index >= 0) sheet.deleteRow(index + 2);
    return { ok: true, availableFrom: null, availableUntil: null };
  }
  const from = rawFrom ? new Date(rawFrom) : null, until = rawUntil ? new Date(rawUntil) : null;
  if ((from && !isFinite(from.getTime())) || (until && !isFinite(until.getTime()))) throw new Error('La fecha y hora no son válidas.');
  if (from && until && from.getTime() >= until.getTime()) throw new Error('La fecha de finalización debe ser posterior a la fecha de activación.');
  const fromValue = from ? from.toISOString() : '', untilValue = until ? until.toISOString() : '';
  if (index >= 0) sheet.getRange(index + 2, 1, 1, 4).setValues([[id, fromValue, untilValue, new Date()]]);
  else sheet.appendRow([id, fromValue, untilValue, new Date()]);
  return { ok: true, availableFrom: fromValue || null, availableUntil: untilValue || null };
}

function setActivityStudents_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.id || '').slice(0, 100), row = findActivityRow_(spreadsheet_().getSheetByName(TAB_ACTIVITIES), id);
  if (!row) throw new Error('No se encontró la actividad.');
  if (!Array.isArray(body.studentIds)) throw new Error('Selecciona al menos un alumno o elige a todos.');
  const active = listStudents_().filter(function(student) { return student.active; }).map(function(student) { return String(student.id); });
  const requested = Array.from(new Set(body.studentIds.map(String)));
  if (requested.some(function(studentId) { return active.indexOf(studentId) < 0; })) throw new Error('La lista contiene una cuenta inactiva o inexistente. Actualiza la lista de alumnos.');
  const activity = row.config;
  activity.assignedStudentIds = requested;
  spreadsheet_().getSheetByName(TAB_ACTIVITIES).getRange(row.row, 3).setValue(JSON.stringify(activity));
  spreadsheet_().getSheetByName(TAB_ACTIVITIES).getRange(row.row, 5).setValue(new Date());
  return { id: id, assignedStudentIds: requested };
}

function activityAvailabilityError_(activity) {
  if (activity.availableFrom && new Date(activity.availableFrom).getTime() > Date.now()) return 'La actividad aún no está disponible.';
  if (activity.availableUntil && new Date(activity.availableUntil).getTime() <= Date.now()) return 'El plazo para esta actividad terminó.';
  return '';
}

function normalizeWord_(value) { return String(value || '').toLocaleUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-ZÑ]/g, ''); }

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

function archiveActivity_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.id || '').slice(0, 100);
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const row = findActivityRow_(sheet, id);
  if (!row) throw new Error('No se encontró la actividad.');
  const activity = row.config;
  activity.archivedAt = new Date().toISOString();
  sheet.getRange(row.row, 3).setValue(JSON.stringify(activity));
  sheet.getRange(row.row, 5).setValue(new Date());
  return { ok: true, id: id };
}

function getActivity_(id) {
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  const row = findActivityRow_(sheet, id);
  if (!row) return { error: 'No se encontró la actividad.' };
  try {
    const activity = row.config;
    if (activity.archivedAt) return { error: 'La actividad fue archivada.' };
    const availability = getDeadlineMap_()[id] || {};
    activity.availableFrom = availability.availableFrom || null;
    activity.availableUntil = availability.availableUntil || null;
    if (activity.maxAttempts === undefined) activity.maxAttempts = 3;
    if (activity.kind === 'pairs') activity.instructions = activity.instructions || 'Arrastra cada elemento junto a su pareja. En celular, toca un elemento y después su pareja.';
    else if (activity.kind === 'diagram' || !activity.kind) activity.instructions = 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.';
    else activity.instructions = activity.instructions || 'Resuelve la actividad.';
    return activity;
  }
  catch (_) { return { error: 'La actividad guardada está dañada.' }; }
}

function listActivities_() {
  const sheet = spreadsheet_().getSheetByName(TAB_ACTIVITIES);
  if (sheet.getLastRow() < 2) return [];
  const deadlineMap = getDeadlineMap_();
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().map(function(row) {
    try {
      const activity = JSON.parse(row[2]);
      if (activity.archivedAt) return null;
      const availability = deadlineMap[String(row[0])] || {};
      activity.availableFrom = availability.availableFrom || null;
      activity.availableUntil = availability.availableUntil || null;
      if (activity.maxAttempts === undefined) activity.maxAttempts = 3;
      if (activity.kind === 'pairs') activity.instructions = activity.instructions || 'Une cada elemento con su pareja.';
      else if (activity.kind === 'diagram' || !activity.kind) activity.instructions = 'Arrastra y suelta las chinchetas en su lugar correcto de la imagen.';
      else activity.instructions = activity.instructions || 'Resuelve la actividad.';
      return activity;
    } catch (_) { return null; }
  }).filter(Boolean).reverse();
}

function listResults_() {
  const sheet = spreadsheet_().getSheetByName(TAB_RESULTS);
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RESULT_HEADERS.length).getValues().slice(-1000).reverse();
  return rows.map(function(r) {
    return {
      id: String(r[0]), activity_id: String(r[1]), paternal_surname: String(r[2]), maternal_surname: String(r[3]),
      given_names: String(r[4]), correct: Number(r[5]), total: Number(r[6]), grade: Number(r[7]),
      elapsed_seconds: Number(r[8]), remaining_seconds: r[9] === '' ? null : Number(r[9]),
      timed_out: r[10] === 'Sí' ? 1 : 0, answers_json: String(r[11]),
      submitted_at: r[12] instanceof Date ? r[12].toISOString() : String(r[12]), student_id: String(r[13] || '')
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
  const ss = SpreadsheetApp.openById(id);
  getOrCreateSheet_(ss, TAB_ACTIVITIES, ['ID', 'Título', 'Configuración JSON', 'Imagen URL', 'Actualizada']);
  getOrCreateSheet_(ss, TAB_RESULTS, RESULT_HEADERS);
  getOrCreateSheet_(ss, TAB_STUDENTS, STUDENT_HEADERS);
  ensureDeadlineSheet_(ss);
  ensureTokenSecret_();
  return ss;
}

function ensureDeadlineSheet_(ss) {
  let sheet = ss.getSheetByName(TAB_DEADLINES);
  if (!sheet) sheet = ss.insertSheet(TAB_DEADLINES);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Actividad ID', 'Disponible desde', 'Disponible hasta', 'Actualizada']);
  } else if (String(sheet.getRange(1, 2).getValue()) === 'Disponible hasta') {
    sheet.insertColumnBefore(2);
    sheet.getRange(1, 1, 1, 4).setValues([['Actividad ID', 'Disponible desde', 'Disponible hasta', 'Actualizada']]);
  } else {
    sheet.getRange(1, 1, 1, 4).setValues([['Actividad ID', 'Disponible desde', 'Disponible hasta', 'Actualizada']]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf4fb');
  } else if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf4fb');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function authorized_(pin) {
  const value = String(pin || '');
  const sessionKey = value ? 'TEACHER_SESSION_' + value : '';
  const expiry = sessionKey ? Number(PropertiesService.getScriptProperties().getProperty(sessionKey) || 0) : 0;
  if (expiry > Date.now()) return true;
  if (expiry) PropertiesService.getScriptProperties().deleteProperty(sessionKey);
  const expected = PropertiesService.getScriptProperties().getProperty('TEACHER_PIN');
  return Boolean(expected && value === expected);
}

function ensureTeacherLogin_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TEACHER_USERNAME')) props.setProperty('TEACHER_USERNAME', 'maestra');
  if (props.getProperty('TEACHER_PASSWORD_HASH') && props.getProperty('TEACHER_PASSWORD_SALT')) return '';
  const password = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const salt = Utilities.getUuid().replace(/-/g, '');
  props.setProperty('TEACHER_PASSWORD_SALT', salt);
  props.setProperty('TEACHER_PASSWORD_HASH', passwordHash_(salt, password));
  return password;
}

function teacherLogin_(body) {
  const requestId = String(body.requestId || ''), cache = CacheService.getScriptCache();
  if (!/^[a-f0-9-]{30,40}$/i.test(requestId)) throw new Error('Solicitud de acceso inválida.');
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const props = PropertiesService.getScriptProperties();
  const expectedUser = String(props.getProperty('TEACHER_USERNAME') || '').toLowerCase();
  const salt = props.getProperty('TEACHER_PASSWORD_SALT') || '';
  const expectedHash = props.getProperty('TEACHER_PASSWORD_HASH') || '';
  const throttleKey = 'teacher-lock:' + passwordHash_('teacher-login-throttle', username).slice(0, 32);
  const failures = Number(cache.get(throttleKey) || 0);
  if (failures >= 12) {
    cache.put('teacher-login:' + requestId, JSON.stringify({ error: 'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.' }), 60);
    return { accepted: true };
  }
  if (!expectedUser || !expectedHash || username !== expectedUser || passwordHash_(salt, password) !== expectedHash) {
    cache.put(throttleKey, String(failures + 1), 900);
    cache.put('teacher-login:' + requestId, JSON.stringify({ error: 'Usuario o contraseña incorrectos.' }), 60);
    return { accepted: true };
  }
  cache.remove(throttleKey);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const sessionExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.getKeys().forEach(function(key) {
    if (key.indexOf('TEACHER_SESSION_') === 0 && Number(scriptProps.getProperty(key) || 0) <= Date.now()) scriptProps.deleteProperty(key);
  });
  scriptProps.setProperty('TEACHER_SESSION_' + token, String(sessionExpiry));
  cache.put('teacher-login:' + requestId, JSON.stringify({ token: token, username: username }), 60);
  return { accepted: true };
}

function teacherLoginResult_(requestId) {
  if (!/^[a-f0-9-]{30,40}$/i.test(requestId)) return { error: 'Solicitud de acceso inválida.' };
  const cache = CacheService.getScriptCache(), key = 'teacher-login:' + requestId;
  const value = cache.get(key);
  if (!value) return { pending: true };
  cache.remove(key);
  return JSON.parse(value);
}

function teacherLogout_(body) {
  const token = String(body.token || '');
  if (token) PropertiesService.getScriptProperties().deleteProperty('TEACHER_SESSION_' + token);
  return { ok: true };
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

function saveStudents_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 35) throw new Error('Selecciona de 1 a 35 alumnos.');
  const sheet = spreadsheet_().getSheetByName(TAB_STUDENTS);
  const existing = getStudentRows_();
  const usernames = new Set(existing.map(function(s) { return s.username.toLowerCase(); }));
  const names = new Set(existing.map(function(s) { return studentKey_(s.paternalSurname, s.maternalSurname, s.givenNames); }));
  const rows = [];
  body.students.forEach(function(item) {
    const paternal = clean_(item.paternalSurname, 70), maternal = clean_(item.maternalSurname, 70), given = clean_(item.givenNames, 100);
    const username = String(item.username || '').toLowerCase().trim();
    const password = String(item.password || '');
    if (!paternal || !maternal || !given) throw new Error('Cada alumno debe tener sus dos apellidos y nombre(s).');
    if (!/^[a-z0-9][a-z0-9_-]{2,24}$/.test(username)) throw new Error('Hay un usuario con formato inválido.');
    if (password.length < 6 || password.length > 32) throw new Error('Las contraseñas deben tener entre 6 y 32 caracteres.');
    const key = studentKey_(paternal, maternal, given);
    if (names.has(key)) throw new Error('La lista contiene un alumno duplicado o que ya tiene cuenta: ' + given + ' ' + paternal + '.');
    if (usernames.has(username)) throw new Error('El usuario ' + username + ' ya existe.');
    names.add(key); usernames.add(username);
    const id = String(item.id || Utilities.getUuid());
    const salt = Utilities.getUuid().replace(/-/g, '');
    rows.push([id, paternal, maternal, given, username, salt, passwordHash_(salt, password), true, new Date(), Utilities.getUuid(), encryptStudentPassword_(password)]);
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { rows.forEach(function(row) { sheet.appendRow(row); }); SpreadsheetApp.flush(); }
  finally { lock.releaseLock(); }
  return { saved: rows.length, usernames: rows.map(function(row) { return row[4]; }) };
}

function listStudents_() {
  return getStudentRows_().map(function(s) { return { id: s.id, paternal_surname: s.paternalSurname, maternal_surname: s.maternalSurname, given_names: s.givenNames, username: s.username, active: s.active, password_version: s.passwordVersion, password: s.encryptedPassword ? decryptStudentPassword_(s.encryptedPassword) : '' }; });
}

function getStudentRows_() {
  const sheet = spreadsheet_().getSheetByName(TAB_STUDENTS);
  if (String(sheet.getRange(1, STUDENT_HEADERS.length).getValue()) !== STUDENT_HEADERS[STUDENT_HEADERS.length - 1]) sheet.getRange(1, STUDENT_HEADERS.length).setValue(STUDENT_HEADERS[STUDENT_HEADERS.length - 1]).setFontWeight('bold').setBackground('#eaf4fb');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, STUDENT_HEADERS.length).getValues().map(function(r) {
    return { id: String(r[0]), paternalSurname: String(r[1]), maternalSurname: String(r[2]), givenNames: String(r[3]), username: String(r[4]), salt: String(r[5]), hash: String(r[6]), active: r[7] !== false && String(r[7]).toLowerCase() !== 'false', passwordVersion: String(r[9] || ''), encryptedPassword: String(r[10] || '') };
  });
}

function studentLogin_(body) {
  const requestId = String(body.requestId || '');
  const cache = CacheService.getScriptCache();
  if (!/^[a-f0-9-]{30,40}$/i.test(requestId)) throw new Error('Solicitud de acceso inválida.');
  const username = String(body.username || '').toLowerCase().trim();
  const password = String(body.password || '');
  const throttleKey = 'student-lock:' + passwordHash_('login-throttle', username).slice(0, 32);
  const failures = Number(cache.get(throttleKey) || 0);
  if (failures >= 12) {
    cache.put('student-login:' + requestId, JSON.stringify({ error: 'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.' }), 60);
    return { accepted: true };
  }
  const account = getStudentRows_().find(function(s) { return s.username.toLowerCase() === username; });
  if (!account || !account.active || passwordHash_(account.salt, password) !== account.hash) {
    cache.put(throttleKey, String(failures + 1), 900);
    cache.put('student-login:' + requestId, JSON.stringify({ error: 'Usuario o contraseña incorrectos.' }), 60);
    return { accepted: true };
  }
  cache.remove(throttleKey);
  const student = { id: account.id, paternalSurname: account.paternalSurname, maternalSurname: account.maternalSurname, givenNames: account.givenNames, username: account.username, active: account.active };
  cache.put('student-login:' + requestId, JSON.stringify({ student: student, token: createStudentToken_(account.id) }), 60);
  return { accepted: true };
}

function loginResult_(requestId) {
  if (!/^[a-f0-9-]{30,40}$/i.test(requestId)) return { error: 'Solicitud de acceso inválida.' };
  const cache = CacheService.getScriptCache(), key = 'student-login:' + requestId;
  const value = cache.get(key);
  if (!value) return { pending: true };
  cache.remove(key);
  return JSON.parse(value);
}

function resetStudentPassword_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.studentId || ''), password = String(body.password || '');
  if (password.length < 6 || password.length > 32) throw new Error('La contraseña debe tener entre 6 y 32 caracteres.');
  const sheet = spreadsheet_().getSheetByName(TAB_STUDENTS), rows = getStudentRows_();
  const index = rows.findIndex(function(s) { return s.id === id; });
  if (index < 0) throw new Error('No se encontró la cuenta del alumno.');
  const row = index + 2, salt = Utilities.getUuid().replace(/-/g, '');
  sheet.getRange(row, 6, 1, 2).setValues([[salt, passwordHash_(salt, password)]]);
  sheet.getRange(row, 10).setValue(Utilities.getUuid());
  sheet.getRange(row, 11).setValue(encryptStudentPassword_(password));
  SpreadsheetApp.flush();
  return { reset: true };
}

function manageStudents_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const ids = Array.from(new Set((Array.isArray(body.studentIds) ? body.studentIds : []).map(String).filter(Boolean)));
  const action = String(body.operation || '');
  if (!ids.length || ids.length > 35) throw new Error('Selecciona de 1 a 35 alumnos.');
  const students = getStudentRows_(), matches = ids.map(function(id) { return students.find(function(s) { return s.id === id; }); });
  if (matches.some(function(s) { return !s; })) throw new Error('No se encontraron todas las cuentas seleccionadas. Actualiza la lista e inténtalo de nuevo.');
  const sheet = spreadsheet_().getSheetByName(TAB_STUDENTS);
  if (action === 'reset') {
    const passwords = Array.isArray(body.passwords) ? body.passwords : [];
    if (passwords.length !== ids.length) throw new Error('No se recibieron todas las contraseñas nuevas.');
    const byId = {};
    passwords.forEach(function(item) { byId[String(item.studentId)] = String(item.password || ''); });
    ids.forEach(function(id) {
      const password = byId[id];
      if (password.length < 6 || password.length > 32) throw new Error('La contraseña generada no cumple el formato requerido.');
      const row = students.findIndex(function(s) { return s.id === id; }) + 2, salt = Utilities.getUuid().replace(/-/g, '');
      sheet.getRange(row, 6, 1, 2).setValues([[salt, passwordHash_(salt, password)]]);
      sheet.getRange(row, 10, 1, 2).setValues([[Utilities.getUuid(), encryptStudentPassword_(password)]]);
    });
  } else if (action === 'deactivate') {
    ids.forEach(function(id) { const row = students.findIndex(function(s) { return s.id === id; }) + 2; sheet.getRange(row, 8).setValue(false); sheet.getRange(row, 10).setValue(Utilities.getUuid()); });
  } else if (action === 'delete') {
    const resultSheet = spreadsheet_().getSheetByName(TAB_RESULTS), selected = {};
    ids.forEach(function(id) { selected[id] = true; });
    if (resultSheet.getLastRow() > 1) {
      const resultRows = resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, RESULT_HEADERS.length).getValues();
      for (let i = resultRows.length - 1; i >= 0; i--) {
        const row = resultRows[i], id = String(row[13] || '');
        const student = matches.find(function(s) { return s.id === id; });
        const legacyMatch = !id && student && normalizeStudent_(row[2]) === normalizeStudent_(student.paternalSurname) && normalizeStudent_(row[3]) === normalizeStudent_(student.maternalSurname) && normalizeStudent_(row[4]) === normalizeStudent_(student.givenNames);
        if (selected[id] || legacyMatch) resultSheet.deleteRow(i + 2);
      }
    }
    const positions = ids.map(function(id) { return students.findIndex(function(s) { return s.id === id; }) + 2; }).sort(function(a, b) { return b - a; });
    positions.forEach(function(row) { sheet.deleteRow(row); });
  } else throw new Error('Acción de alumnos desconocida.');
  SpreadsheetApp.flush();
  return { ok: true, updated: ids.length };
}

function encryptStudentPassword_(password) {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('STUDENT_PASSWORD_ENCRYPTION_KEY');
  if (!key) { key = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('STUDENT_PASSWORD_ENCRYPTION_KEY', key); }
  const nonce = Utilities.getUuid(), bytes = Utilities.newBlob(String(password)).getBytes(), cipher = [];
  for (let offset = 0; offset < bytes.length; offset += 32) {
    const block = Math.floor(offset / 32), stream = Utilities.computeHmacSha256Signature(nonce + ':' + block, key, Utilities.Charset.UTF_8);
    for (let j = 0; j < Math.min(32, bytes.length - offset); j++) cipher.push(((bytes[offset + j] & 255) ^ (stream[j] & 255)) > 127 ? (((bytes[offset + j] & 255) ^ (stream[j] & 255)) - 256) : ((bytes[offset + j] & 255) ^ (stream[j] & 255)));
  }
  const encoded = Utilities.base64EncodeWebSafe(cipher), tag = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('tag:' + nonce + ':' + encoded, key, Utilities.Charset.UTF_8));
  return nonce + '.' + encoded + '.' + tag;
}

function decryptStudentPassword_(value) {
  try {
    const parts = String(value || '').split('.'), key = PropertiesService.getScriptProperties().getProperty('STUDENT_PASSWORD_ENCRYPTION_KEY');
    if (parts.length !== 3 || !key) return '';
    const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('tag:' + parts[0] + ':' + parts[1], key, Utilities.Charset.UTF_8));
    if (expected !== parts[2]) return '';
    const cipher = Utilities.base64DecodeWebSafe(parts[1]), bytes = [];
    for (let offset = 0; offset < cipher.length; offset += 32) {
      const block = Math.floor(offset / 32), stream = Utilities.computeHmacSha256Signature(parts[0] + ':' + block, key, Utilities.Charset.UTF_8);
      for (let j = 0; j < Math.min(32, cipher.length - offset); j++) { const byte = (cipher[offset + j] & 255) ^ (stream[j] & 255); bytes.push(byte > 127 ? byte - 256 : byte); }
    }
    return Utilities.newBlob(bytes).getDataAsString();
  } catch (e) { return ''; }
}

function setStudentActive_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.studentId || '');
  const rows = getStudentRows_();
  const index = rows.findIndex(function(s) { return s.id === id; });
  if (index < 0) throw new Error('No se encontró la cuenta del alumno.');
  const sheet = spreadsheet_().getSheetByName(TAB_STUDENTS), row = index + 2;
  const active = body.active === true;
  sheet.getRange(row, 8).setValue(active);
  sheet.getRange(row, 10).setValue(Utilities.getUuid());
  SpreadsheetApp.flush();
  return { ok: true, active: active };
}

function deleteStudent_(body) {
  if (!authorized_(body.key)) throw new Error('Clave del maestro incorrecta.');
  const id = String(body.studentId || ''), students = getStudentRows_();
  const index = students.findIndex(function(student) { return student.id === id; });
  if (index < 0) throw new Error('No se encontró la cuenta del alumno.');
  const student = students[index], resultSheet = spreadsheet_().getSheetByName(TAB_RESULTS);
  if (resultSheet.getLastRow() > 1) {
    const rows = resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, RESULT_HEADERS.length).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const sameId = String(row[13] || '') === id;
      const legacyMatch = !row[13] && normalizeStudent_(row[2]) === normalizeStudent_(student.paternalSurname) && normalizeStudent_(row[3]) === normalizeStudent_(student.maternalSurname) && normalizeStudent_(row[4]) === normalizeStudent_(student.givenNames);
      if (sameId || legacyMatch) resultSheet.deleteRow(i + 2);
    }
  }
  spreadsheet_().getSheetByName(TAB_STUDENTS).deleteRow(index + 2);
  SpreadsheetApp.flush();
  return { ok: true, deleted: true };
}

function passwordHash_(salt, password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function studentKey_(paternal, maternal, names) {
  return [paternal, maternal, names].map(normalizeStudent_).join('|');
}

function ensureTokenSecret_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('STUDENT_TOKEN_SECRET')) props.setProperty('STUDENT_TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
}

function createStudentToken_(studentId) {
  ensureTokenSecret_();
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ id: studentId, exp: Date.now() + 8 * 60 * 60 * 1000, nonce: Utilities.getUuid() })).replace(/=+$/g, '');
  const secret = PropertiesService.getScriptProperties().getProperty('STUDENT_TOKEN_SECRET');
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret)).replace(/=+$/g, '');
  return payload + '.' + signature;
}

function verifyStudentToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  ensureTokenSecret_();
  const secret = PropertiesService.getScriptProperties().getProperty('STUDENT_TOKEN_SECRET');
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret)).replace(/=+$/g, '');
  if (expected !== parts[1]) return null;
  try {
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload.id || Number(payload.exp) < Date.now()) return null;
    return getStudentRows_().find(function(s) { return s.id === String(payload.id); }) || null;
  } catch (_) { return null; }
}
