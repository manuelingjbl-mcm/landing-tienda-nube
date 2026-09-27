(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = {
    rows: [], headers: [], delimiter: ',', lineEnding: '\n', encoding: '', fileName: '', fileSize: 0,
    fileValid: false, priceCol: -1, promoCol: -1, nameCol: -1, categoryCol: -1,
    brandCol: -1, urlCol: -1, skuCol: -1, propValueCols: [], effName: [], effCat: [],
    duplicates: new Set(), selectedCategories: new Set(), categoryValues: [], brandValues: [],
    onlyChanged: false, previewRuleId: 'all', previewQuickFilter: '', numberConvention: { decimal: null, thousands: null },
    planRules: [], editingRuleId: null, ruleSequence: 0
  };

  const defaultProjects = [{ id: 'mi-tienda', name: 'Mi tienda' }];
  const builtInProfiles = [
    { label: 'Aumentar 8% / $50', sub: 'Recomendado', type: 'increase', percent: 8, round: 50, roundCriteria: 'guarantee', promo: 'keep', scope: 'all', categoryLevel: 'main', categories: [], brand: '', text: '' },
    { label: 'Aumentar 10% / $100', sub: 'Ajuste amplio', type: 'increase', percent: 10, round: 100, roundCriteria: 'guarantee', promo: 'keep', scope: 'all', categoryLevel: 'main', categories: [], brand: '', text: '' },
    { label: 'Solo redondear / $50', sub: 'Sin variación porcentual', type: 'round-only', percent: 0, round: 50, roundCriteria: 'nearest', promo: 'keep', scope: 'all', categoryLevel: 'main', categories: [], brand: '', text: '' }
  ];

  let projects = loadProjects();
  let currentProjectId = projects[0].id;
  let profiles = [];

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function appendText(parent, tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }
  function emptyMessage(parent, message, colspan) {
    clear(parent);
    const row = document.createElement('tr');
    row.className = 'placeholder-row';
    const cell = document.createElement('td');
    cell.colSpan = colspan || 5;
    cell.textContent = message;
    row.appendChild(cell);
    parent.appendChild(row);
  }
  function readJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed == null ? fallback : parsed;
    } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* La app continúa en la sesión actual. */ }
  }
  function normalizeProject(candidate, used) {
    const base = candidate.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tienda';
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    return id;
  }
  function loadProjects() {
    const stored = readJSON('priceflow_projects_v2', null);
    if (Array.isArray(stored) && stored.length) {
      const used = new Set();
      const valid = stored.map(item => ({ id: String(item?.id || ''), name: String(item?.name || '').trim() }))
        .filter(item => item.id && item.name && !used.has(item.id) && (used.add(item.id), true));
      if (valid.length) return valid;
    }
    return defaultProjects.map(project => ({ ...project }));
  }
  function saveProjects() { writeJSON('priceflow_projects_v2', projects); }
  function profileKey(projectId) { return `priceflow_profiles_v2_${projectId}`; }
  function loadCustomProfiles(projectId) {
    const list = readJSON(profileKey(projectId), []);
    return Array.isArray(list) ? list.filter(profile => profile && typeof profile.label === 'string') : [];
  }
  function saveCustomProfiles(projectId, list) { writeJSON(profileKey(projectId), list); }

  function renderProjects() {
    const select = $('storeSelect');
    clear(select);
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      select.appendChild(option);
    });
    select.value = currentProjectId;
    $('deleteStoreBtn').disabled = projects.length === 1;
  }
  function renderProfiles(activeIndex = -1) {
    profiles = builtInProfiles.concat(loadCustomProfiles(currentProjectId));
    const root = $('profiles');
    clear(root);
    profiles.forEach((profile, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `profile-btn${index === activeIndex ? ' active' : ''}`;
      const title = appendText(button, 'div', `${index === activeIndex ? '✨ ' : ''}${profile.label}`, 'pb-title');
      title.setAttribute('aria-label', profile.label);
      appendText(button, 'div', profile.sub || 'Personalizado', 'pb-sub');
      button.addEventListener('click', () => applyProfile(profile, index));
      root.appendChild(button);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'profile-btn add';
    add.textContent = '+ Guardar perfil actual';
    add.addEventListener('click', () => toggleProfileForm(true));
    root.appendChild(add);
  }
  function toggleProfileForm(show) {
    $('addProfileForm').style.display = show ? 'flex' : 'none';
    if (show) $('newProfileName').focus();
    else $('newProfileName').value = '';
  }
  function currentConfig() {
    const roundMode = $('cfgRound').value;
    const customRound = Number($('cfgCustomRound').value);
    const round = roundMode === 'custom' ? customRound : Number(roundMode);
    return {
      type: $('cfgType').value,
      percent: Number($('cfgPercent').value) || 0,
      round,
      roundMode,
      customRound: $('cfgCustomRound').value,
      roundValid: roundMode !== 'custom' || (Number.isFinite(customRound) && customRound > 0),
      roundCriteria: $('cfgRoundCriteria').value,
      promo: $('cfgPromo').value,
      scope: $('cfgScope').value,
      categoryLevel: $('cfgCategoryLevel').value,
      categories: [...state.selectedCategories],
      brand: $('brandSelect').value,
      text: $('textFilterInput').value
    };
  }
  function copyConfig(config) {
    return {
      type: config.type, percent: Number(config.percent) || 0, round: Number(config.round), roundMode: config.roundMode,
      customRound: config.customRound, roundValid: Boolean(config.roundValid), roundCriteria: config.roundCriteria,
      promo: config.promo, scope: config.scope, categoryLevel: config.categoryLevel,
      categories: Array.isArray(config.categories) ? config.categories.slice() : [], brand: config.brand || '', text: config.text || ''
    };
  }
  function applyConfigToEditor(config) {
    $('cfgType').value = config.type || 'increase';
    $('cfgPercent').value = Number.isFinite(Number(config.percent)) ? String(config.percent) : '0';
    $('cfgRound').value = config.roundMode || String(config.round ?? 0);
    $('cfgCustomRound').value = config.customRound || '';
    $('cfgRoundCriteria').value = config.roundCriteria || 'guarantee';
    $('cfgPromo').value = config.promo || 'keep';
    $('cfgScope').value = config.scope || 'all';
    $('cfgCategoryLevel').value = config.categoryLevel || 'main';
    $('textFilterInput').value = config.text || '';
    syncAdjustmentControls();
    populateCategories(Array.isArray(config.categories) ? config.categories : null);
    populateBrands(config.brand || '');
    syncScopeUI();
  }
  function applyProfile(profile, index) {
    applyConfigToEditor(profile);
    renderProfiles(index);
    recalc();
  }

  function addProject() {
    const name = window.prompt('Nombre del nuevo proyecto o tienda:');
    if (name == null) return;
    const clean = name.trim();
    if (!clean) return;
    const id = normalizeProject(clean, new Set(projects.map(project => project.id)));
    projects.push({ id, name: clean });
    currentProjectId = id;
    saveProjects();
    renderProjects();
    renderProfiles();
  }
  function renameProject() {
    const project = projects.find(item => item.id === currentProjectId);
    if (!project) return;
    const name = window.prompt('Nuevo nombre del proyecto o tienda:', project.name);
    if (name == null) return;
    const clean = name.trim();
    if (!clean) return;
    project.name = clean;
    saveProjects();
    renderProjects();
  }
  function deleteProject() {
    if (projects.length === 1) return;
    const project = projects.find(item => item.id === currentProjectId);
    if (!project || !window.confirm('¿Eliminar este proyecto y sus perfiles guardados en este navegador?')) return;
    try { localStorage.removeItem(profileKey(project.id)); } catch (_) { /* No impide quitar el proyecto de la lista. */ }
    projects = projects.filter(item => item.id !== project.id);
    currentProjectId = projects[0].id;
    saveProjects();
    renderProjects();
    renderProfiles();
  }

  function normalizeHeader(header) {
    return String(header || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }
  function findHeader(match) { return state.headers.findIndex(header => match(normalizeHeader(header))); }
  function detectDelimiter(sample) {
    const firstLine = String(sample || '').split(/\r?\n/, 1)[0] || '';
    const counts = { ',': (firstLine.match(/,/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
    return Object.keys(counts).reduce((winner, delimiter) => counts[delimiter] > counts[winner] ? delimiter : winner, ',');
  }
  function parseCSV(text, delimiter) {
    const selected = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') { field += '"'; index += 1; }
          else quoted = false;
        } else field += character;
      } else if (character === '"') quoted = true;
      else if (character === selected) { row.push(field); field = ''; }
      else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (character !== '\r') field += character;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return { rows: rows.filter(item => item.length > 1 || item[0] !== ''), delimiter: selected, unclosedQuote: quoted };
  }
  function toCSV(headers, rows, delimiter, lineEnding) {
    const escape = value => {
      const text = String(value ?? '');
      return text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
    };
    return [headers.map(escape).join(delimiter), ...rows.map(row => row.map(escape).join(delimiter))].join(lineEnding || '\n');
  }
  function decodeFile(file, callback) {
    const reader = new FileReader();
    reader.onerror = () => callback({ error: 'No se pudo leer el archivo.' });
    reader.onload = event => {
      const buffer = event.target.result;
      try {
        callback({ text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' });
      } catch (_) {
        callback({ text: new TextDecoder('windows-1252').decode(buffer), encoding: 'Windows-1252' });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function numericSource(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return { valid: false, reason: 'vacío' };
    const compact = text.replace(/[\s$€£]/g, '');
    if (!/^-?[0-9][0-9.,]*$/.test(compact)) return { valid: false, reason: 'inválido' };
    const minusCount = (compact.match(/-/g) || []).length;
    if (minusCount > 1 || (minusCount === 1 && !compact.startsWith('-'))) return { valid: false, reason: 'inválido' };
    return { valid: true, text: compact };
  }
  function inferMoneyConvention(values) {
    const evidence = { dotDecimal: 0, commaDecimal: 0, dotThousands: 0, commaThousands: 0 };
    values.forEach(raw => {
      const source = numericSource(raw);
      if (!source.valid) return;
      const text = source.text.replace('-', '');
      if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) { evidence.dotDecimal += 2; evidence.commaThousands += 2; return; }
      if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) { evidence.commaDecimal += 2; evidence.dotThousands += 2; return; }
      if (/^\d+[.]\d{1,2}$/.test(text)) evidence.dotDecimal += 1;
      if (/^\d+[,]\d{1,2}$/.test(text)) evidence.commaDecimal += 1;
      if (/^\d{1,3}(\.\d{3})+$/.test(text)) evidence.dotThousands += 1;
      if (/^\d{1,3}(,\d{3})+$/.test(text)) evidence.commaThousands += 1;
    });
    const decimal = evidence.dotDecimal > evidence.commaDecimal ? '.' : evidence.commaDecimal > evidence.dotDecimal ? ',' : null;
    const thousands = evidence.dotThousands > evidence.commaThousands ? '.' : evidence.commaThousands > evidence.dotThousands ? ',' : null;
    return { decimal, thousands, evidence };
  }
  function parsePrice(raw, convention = state.numberConvention) {
    const source = numericSource(raw);
    if (!source.valid) return { valid: false, review: false, reason: source.reason, value: NaN };
    const negative = source.text.startsWith('-');
    const text = negative ? source.text.slice(1) : source.text;
    const commas = (text.match(/,/g) || []).length;
    const dots = (text.match(/\./g) || []).length;
    if (!commas && !dots) return { valid: true, review: false, value: Number(`${negative ? '-' : ''}${text}`) };
    if (commas && dots) {
      const lastComma = text.lastIndexOf(',');
      const lastDot = text.lastIndexOf('.');
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? '.' : ',';
      const splitAt = Math.max(lastComma, lastDot);
      const integer = text.slice(0, splitAt);
      const fraction = text.slice(splitAt + 1);
      const integerOk = /^\d+$/.test(integer) || new RegExp(`^\\d{1,3}(?:\\${thousands}\\d{3})+$`).test(integer);
      if (!integerOk || !/^\d{1,2}$/.test(fraction)) return { valid: false, review: true, reason: 'formato ambiguo', value: NaN };
      const normalized = integer.replaceAll(thousands, '') + '.' + fraction;
      return { valid: true, review: false, value: Number(`${negative ? '-' : ''}${normalized}`) };
    }
    const separator = commas ? ',' : '.';
    const occurrences = commas || dots;
    if (occurrences > 1) {
      if (!new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`).test(text)) return { valid: false, review: true, reason: 'formato inválido', value: NaN };
      return { valid: true, review: false, value: Number(`${negative ? '-' : ''}${text.replaceAll(separator, '')}`) };
    }
    const position = text.lastIndexOf(separator);
    const digitsAfter = text.length - position - 1;
    if (digitsAfter === 1 || digitsAfter === 2) {
      const normalized = text.replace(separator, '.');
      return { valid: true, review: false, value: Number(`${negative ? '-' : ''}${normalized}`) };
    }
    if (digitsAfter === 3 && /^\d{1,3}[,.]\d{3}$/.test(text)) {
      if (!convention?.decimal && !convention?.thousands) return { valid: false, review: true, reason: 'separador ambiguo', value: NaN };
      return { valid: true, review: false, value: Number(`${negative ? '-' : ''}${text.replace(separator, '')}`) };
    }
    return { valid: false, review: true, reason: 'formato inválido', value: NaN };
  }

  function buildEffectiveFields() {
    const contexts = new Map();
    state.rows.forEach(row => {
      const url = state.urlCol >= 0 ? String(row[state.urlCol] || '').trim() : '';
      if (!url) return;
      const current = contexts.get(url) || {};
      const name = state.nameCol >= 0 ? String(row[state.nameCol] || '').trim() : '';
      const category = state.categoryCol >= 0 ? String(row[state.categoryCol] || '').trim() : '';
      if (name) current.name = name;
      if (category) current.category = category;
      contexts.set(url, current);
    });
    state.effName = [];
    state.effCat = [];
    state.rows.forEach((row, index) => {
      const url = state.urlCol >= 0 ? String(row[state.urlCol] || '').trim() : '';
      const context = url ? contexts.get(url) : null;
      const name = state.nameCol >= 0 ? String(row[state.nameCol] || '').trim() : '';
      const category = state.categoryCol >= 0 ? String(row[state.categoryCol] || '').trim() : '';
      state.effName[index] = name || context?.name || '(sin nombre)';
      state.effCat[index] = category || context?.category || '';
    });
  }
  function variantLabel(row) {
    return state.propValueCols.map(index => String(row[index] || '').trim()).filter(Boolean).join(' / ');
  }
  function duplicateRows() {
    const keyedRows = new Map();
    state.rows.forEach((row, index) => {
      const sku = state.skuCol >= 0 ? String(row[state.skuCol] || '').trim() : '';
      const url = state.urlCol >= 0 ? String(row[state.urlCol] || '').trim() : '';
      const props = state.propValueCols.map(column => String(row[column] || '').trim()).join('\u241f');
      // En algunos exports de Tienda Nube el SKU se repite en variantes válidas.
      // La identidad más segura de una variante es URL + valores de propiedades; el SKU
      // queda como respaldo solamente cuando no hay propiedades que la distingan.
      const key = url && props ? `variant:${url}\u241e${props}` : url && sku ? `product-sku:${url}\u241e${sku}` : sku ? `sku:${sku}` : url ? `product:${url}` : '';
      if (!key) return;
      if (!keyedRows.has(key)) keyedRows.set(key, []);
      keyedRows.get(key).push(index);
    });
    const duplicate = new Set();
    keyedRows.forEach(indices => { if (indices.length > 1) indices.forEach(index => duplicate.add(index)); });
    return duplicate;
  }
  function productCount() {
    const keys = new Set();
    state.rows.forEach((row, index) => {
      const url = state.urlCol >= 0 ? String(row[state.urlCol] || '').trim() : '';
      keys.add(url ? `url:${url}` : `name:${state.effName[index] || index}`);
    });
    return keys.size;
  }
  function categoryPaths(index) {
    if (state.categoryCol < 0) return [];
    return String(state.effCat[index] || '').split(',').map(item => item.trim()).filter(Boolean);
  }
  function categoryValuesForRow(index, level) {
    const paths = categoryPaths(index);
    return level === 'path' ? paths : paths.map(path => path.split('>')[0].trim()).filter(Boolean);
  }
  function populateColumnOverrides() {
    const price = $('colPriceOverride');
    const category = $('colCategoryOverride');
    clear(price);
    clear(category);
    const none = document.createElement('option');
    none.value = '-1';
    none.textContent = '(ninguna)';
    category.appendChild(none);
    state.headers.forEach((header, index) => {
      const priceOption = document.createElement('option');
      priceOption.value = String(index);
      priceOption.textContent = header;
      price.appendChild(priceOption);
      const categoryOption = document.createElement('option');
      categoryOption.value = String(index);
      categoryOption.textContent = header;
      category.appendChild(categoryOption);
    });
    price.value = String(state.priceCol);
    category.value = String(state.categoryCol);
  }
  function renderCategoryChips() {
    const picker = $('catPicker');
    clear(picker);
    if (state.categoryCol < 0) {
      appendText(picker, 'span', 'Este archivo no tiene columna de categoría.', 'empty');
      return;
    }
    if (!state.categoryValues.length) {
      appendText(picker, 'span', 'No se encontraron categorías en el archivo.', 'empty');
      return;
    }
    state.categoryValues.forEach(category => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `cat-chip${state.selectedCategories.has(category) ? ' active' : ''}`;
      chip.textContent = category;
      chip.addEventListener('click', () => {
        if (state.selectedCategories.has(category)) state.selectedCategories.delete(category);
        else state.selectedCategories.add(category);
        chip.classList.toggle('active', state.selectedCategories.has(category));
        recalc();
      });
      picker.appendChild(chip);
    });
  }
  function populateCategories(requestedSelection = null) {
    const level = $('cfgCategoryLevel').value;
    const values = new Set();
    state.rows.forEach((_, index) => categoryValuesForRow(index, level).forEach(value => values.add(value)));
    state.categoryValues = [...values].sort((a, b) => a.localeCompare(b, 'es'));
    const requested = requestedSelection ? new Set(requestedSelection) : null;
    state.selectedCategories = new Set(requested ? state.categoryValues.filter(value => requested.has(value)) : state.categoryValues);
    $('catLabel').textContent = state.categoryCol < 0
      ? 'Categorías a incluir (no se detectó columna de categoría)'
      : `Categorías a incluir (${state.categoryValues.length} detectadas)`;
    renderCategoryChips();
  }
  function populateBrands(requestedBrand = null) {
    const select = $('brandSelect');
    clear(select);
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Todas las marcas';
    select.appendChild(all);
    state.brandValues = state.brandCol < 0 ? [] : [...new Set(state.rows.map(row => String(row[state.brandCol] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    state.brandValues.forEach(brand => {
      const option = document.createElement('option');
      option.value = brand;
      option.textContent = brand;
      select.appendChild(option);
    });
    select.disabled = state.brandCol < 0 || !state.brandValues.length;
    select.value = requestedBrand && state.brandValues.includes(requestedBrand) ? requestedBrand : '';
  }
  function delimiterLabel(delimiter) { return delimiter === ';' ? 'Punto y coma (;)' : delimiter === '\t' ? 'Tabulación' : 'Coma (,)'; }
  function showFileError(name, message) {
    state.fileValid = false;
    state.rows = [];
    $('fiName').textContent = name || 'Archivo no válido';
    $('fiStatus').textContent = message;
    $('fiState').textContent = 'No procesable';
    $('fileInfo').classList.add('show', 'error');
    $('emptyFileInfo').style.display = 'none';
    $('generateBtn').disabled = true;
    recalc();
  }
  function analyseImportedText(text, fileName, fileSize, encoding) {
    const parsed = parseCSV(text);
    state.fileName = fileName;
    state.fileSize = fileSize;
    state.encoding = encoding;
    if (parsed.unclosedQuote || parsed.rows.length < 2) {
      showFileError(fileName, parsed.unclosedQuote ? 'Comillas sin cerrar en el CSV' : 'El archivo no tiene filas de datos válidas');
      return;
    }
    state.headers = parsed.rows[0];
    state.rows = parsed.rows.slice(1);
    state.delimiter = parsed.delimiter;
    state.lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
    state.priceCol = findHeader(header => header === 'precio') ;
    if (state.priceCol < 0) state.priceCol = findHeader(header => header.includes('precio') && !header.includes('promocional'));
    state.promoCol = findHeader(header => header === 'precio promocional' || header.includes('precio promocional'));
    state.nameCol = findHeader(header => header === 'nombre' || header === 'producto' || header.includes('nombre de producto'));
    state.categoryCol = findHeader(header => header === 'categorias' || header === 'categoria');
    if (state.categoryCol < 0) state.categoryCol = findHeader(header => header.includes('categoria') && !/google|shopping|keyword|clave|tag|seo/.test(header));
    state.brandCol = findHeader(header => header === 'marca');
    state.urlCol = findHeader(header => header === 'identificador de url' || header === 'url' || header.includes('identificador url'));
    state.skuCol = findHeader(header => header === 'sku');
    state.propValueCols = [1, 2, 3].map(number => findHeader(header => header === `valor de propiedad ${number}`)).filter(index => index >= 0);
    state.numberConvention = state.priceCol >= 0 ? inferMoneyConvention(state.rows.map(row => row[state.priceCol])) : { decimal: null, thousands: null };
    buildEffectiveFields();
    state.duplicates = duplicateRows();
    state.fileValid = state.priceCol >= 0;
    populateColumnOverrides();
    populateCategories();
    populateBrands();
    $('fiName').textContent = fileName;
    $('fiStatus').textContent = state.fileValid ? '✓ Archivo válido y procesable' : 'No se detectó una columna de Precio';
    $('fiProducts').textContent = String(productCount());
    $('fiVariants').textContent = String(state.rows.filter(row => variantLabel(row)).length);
    $('fiRows').textContent = String(state.rows.length);
    $('fiCol').textContent = state.priceCol >= 0 ? state.headers[state.priceCol] : 'No detectada';
    $('fiPromoCol').textContent = state.promoCol >= 0 ? state.headers[state.promoCol] : 'No detectado';
    $('fiBrandCol').textContent = state.brandCol >= 0 ? state.headers[state.brandCol] : 'No detectada';
    $('fiDelimiter').textContent = delimiterLabel(state.delimiter);
    $('fiSize').textContent = `${(fileSize / 1024).toFixed(1)} KB · ${encoding}`;
    $('fiState').textContent = state.fileValid ? 'Listo para revisar' : 'No procesable';
    $('fileInfo').classList.toggle('error', !state.fileValid);
    $('fileInfo').classList.add('show');
    $('emptyFileInfo').style.display = 'none';
    syncAdjustmentControls();
    syncScopeUI();
    recalc();
  }
  function handleFile(file) {
    if (!file) return;
    decodeFile(file, result => {
      if (result.error) showFileError(file.name, result.error);
      else analyseImportedText(result.text, file.name, file.size, result.encoding);
    });
  }

  function roundPrice(value, mode, direction, criterion) {
    if (!Number.isFinite(mode) || mode <= 0) return value;
    if (mode === 90 || mode === 99) {
      const lower = Math.floor((value - mode) / 100) * 100 + mode;
      const safeLower = lower >= 0 ? lower : null;
      const upper = lower + 100;
      if (criterion === 'nearest') {
        if (safeLower == null) return upper;
        return Math.abs(value - safeLower) <= Math.abs(upper - value) ? safeLower : upper;
      }
      if (direction === 'decrease') return safeLower == null ? 0 : safeLower;
      return safeLower != null && safeLower >= value ? safeLower : upper;
    }
    if (criterion === 'nearest') return Math.round(value / mode) * mode;
    return (direction === 'decrease' ? Math.floor(value / mode) : Math.ceil(value / mode)) * mode;
  }
  function calculateAdjustedPrice(value, config) {
    if (config.type === 'round-only') return roundPrice(value, config.round, 'round-only', 'nearest');
    const direction = config.type === 'decrease' ? 'decrease' : 'increase';
    const raw = value * (1 + (direction === 'increase' ? 1 : -1) * config.percent / 100);
    const result = roundPrice(raw, config.round, direction, config.roundCriteria);
    // Solo limpia el residuo binario de JavaScript; no convierte el importe a un entero.
    return Number(result.toFixed(8));
  }
  function effectiveChangePercent(current, next) {
    return current === 0 ? NaN : ((next - current) / current) * 100;
  }
  function hasRoundingDeviation(current, next, config) {
    if (!config.roundValid || !config.round || config.type === 'round-only') return false;
    const requested = config.type === 'decrease' ? -config.percent : config.percent;
    return Math.abs(effectiveChangePercent(current, next) - requested) > 2;
  }
  function rowIsIncluded(index, config) {
    if (config.scope === 'categories') {
      const categories = Array.isArray(config.categories) ? new Set(config.categories) : state.selectedCategories;
      return categoryValuesForRow(index, config.categoryLevel).some(value => categories.has(value));
    }
    if (config.scope === 'brand') return state.brandCol >= 0 && Boolean(config.brand) && String(state.rows[index][state.brandCol] || '').trim() === config.brand;
    if (config.scope === 'text') return Boolean(config.text) && state.effName[index].toLocaleLowerCase('es').includes(config.text.toLocaleLowerCase('es'));
    return true;
  }
  function closeEnough(a, b) { return Math.abs(a - b) < 1e-9; }
  function computeRows() {
    if (!state.fileValid || state.priceCol < 0) return [];
    const editorConfig = currentConfig();
    const rules = state.planRules.length ? state.planRules : [editorConfig];
    const usingPlan = state.planRules.length > 0;
    return state.rows.map((row, index) => {
      const parsedPrice = parsePrice(row[state.priceCol]);
      const current = parsedPrice.value;
      const hasPromo = state.promoCol >= 0 && String(row[state.promoCol] || '').trim() !== '';
      const matchingRules = rules.filter(rule => rowIsIncluded(index, rule));
      const conflict = usingPlan && matchingRules.length > 1;
      const config = matchingRules.length === 1 ? matchingRules[0] : null;
      const included = matchingRules.length > 0;
      let error = !parsedPrice.valid && !parsedPrice.review;
      let review = parsedPrice.review || (parsedPrice.valid && current <= 0) || state.duplicates.has(index);
      let promo = null;
      if (hasPromo && config?.promo === 'same') {
        promo = parsePrice(row[state.promoCol]);
        if (!promo.valid || promo.review || promo.value <= 0) review = true;
      }
      const canModify = Boolean(config) && config.roundValid && !conflict && !error && !review;
      const next = canModify ? calculateAdjustedPrice(current, config) : current;
      let promoNext = hasPromo ? row[state.promoCol] : '';
      if (canModify && hasPromo && config.promo === 'remove') promoNext = '';
      else if (canModify && hasPromo && config.promo === 'same') promoNext = calculateAdjustedPrice(promo.value, config);
      const priceChanged = canModify && !closeEnough(next, current);
      const promoChanged = canModify && hasPromo && config.promo !== 'keep' && (config.promo === 'remove' ? String(row[state.promoCol] || '') !== '' : !closeEnough(promoNext, promo.value));
      const effectiveChange = canModify ? effectiveChangePercent(current, next) : NaN;
      const roundingWarning = canModify && hasRoundingDeviation(current, next, config);
      const requestedChange = config?.type === 'round-only' ? NaN : config ? (config.type === 'decrease' ? -config.percent : config.percent) : NaN;
      return {
        index, name: state.effName[index], variant: variantLabel(row), current, next, included, error, review, canModify,
        hasPromo, promoCurrent: promo?.value, promoNext, priceChanged, promoChanged, changed: priceChanged || promoChanged,
        effectiveChange, requestedChange, roundingWarning, conflict, matchingRules: matchingRules.map(rule => rule.id), ruleId: config?.id || null,
        reason: error ? parsedPrice.reason : review ? (state.duplicates.has(index) ? 'duplicado potencial' : parsedPrice.reason || 'requiere revisión') : ''
      };
    });
  }
  function normalizedNumber(value) {
    return Number(value.toFixed(8));
  }
  function exportNumber(value) {
    return String(normalizedNumber(value));
  }
  function displayPrice(value) {
    return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 }).format(normalizedNumber(value));
  }
  function formatSignedPercent(change) {
    if (!Number.isFinite(change)) return '—';
    const prefix = change > 0 ? '+' : '';
    return `${prefix}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(normalizedNumber(change))}%`;
  }
  function signedChange(current, next) { return formatSignedPercent(effectiveChangePercent(current, next)); }
  function ruleIssue(config) {
    if (!config.roundValid) return 'Ingresá un múltiplo personalizado mayor que 0.';
    if (config.scope === 'categories' && !config.categories.length) return 'Elegí al menos una categoría para esta regla.';
    if (config.scope === 'brand' && !config.brand) return 'Elegí una marca para esta regla.';
    if (config.scope === 'text' && !config.text.trim()) return 'Ingresá el texto que debe coincidir para esta regla.';
    return '';
  }
  function ruleTitle(config) {
    if (config.type === 'round-only') return 'Solo redondear';
    return `${config.type === 'decrease' ? 'Disminuir' : 'Aumentar'} ${config.percent}%`;
  }
  function ruleScope(config) {
    if (config.scope === 'categories') return `Categorías: ${config.categories.length ? config.categories.join(', ') : 'sin selección'}`;
    if (config.scope === 'brand') return `Marca: ${config.brand || 'sin seleccionar'}`;
    if (config.scope === 'text') return `Nombre contiene: ${config.text || 'sin texto'}`;
    return 'Todo el archivo';
  }
  function ruleDetails(config) {
    const rounding = config.round ? (config.roundMode === 'custom' ? `múltiplo personalizado de $${config.round}` : `múltiplo de $${config.round}`) : 'sin redondeo';
    const criterion = config.round && config.type !== 'round-only' ? (config.roundCriteria === 'nearest' ? 'al más cercano' : 'garantizar % mínimo') : '';
    const promo = config.promo === 'same' ? 'aplicar también a promo' : config.promo === 'remove' ? 'eliminar promo' : 'mantener promo';
    return [rounding, criterion, promo].filter(Boolean).join(' · ');
  }
  function setPlanEditorMessage(message, error) {
    const node = $('planEditorMessage');
    node.hidden = !message;
    node.textContent = message || '';
    node.classList.toggle('error', Boolean(error));
  }
  function ruleAffectedCount(rule) {
    return state.rows.reduce((total, _row, rowIndex) => total + (rowIsIncluded(rowIndex, rule) ? 1 : 0), 0);
  }
  function rulePreviewLabel(rule, index) {
    const affected = ruleAffectedCount(rule);
    return `Regla ${index + 1} · ${ruleScope(rule)} · ${affected} fila${affected === 1 ? '' : 's'}`;
  }
  function renderPreviewRuleFilter() {
    const select = $('previewRuleFilter');
    clear(select);
    const all = appendText(select, 'option', 'Todas las reglas');
    all.value = 'all';
    state.planRules.forEach((rule, index) => {
      const option = appendText(select, 'option', rulePreviewLabel(rule, index));
      option.value = rule.id;
    });
    if (state.previewRuleId !== 'all' && !state.planRules.some(rule => rule.id === state.previewRuleId)) state.previewRuleId = 'all';
    select.value = state.previewRuleId;
    select.disabled = state.planRules.length === 0;
  }
  function syncPreviewQuickFilters(roundingWarnings, conflicts) {
    if (!roundingWarnings && state.previewQuickFilter === 'warnings') state.previewQuickFilter = '';
    if (!conflicts && state.previewQuickFilter === 'conflicts') state.previewQuickFilter = '';
    $('previewWarningsBtn').hidden = roundingWarnings === 0;
    $('previewConflictsBtn').hidden = conflicts === 0;
    $('previewWarningsBtn').classList.toggle('active', state.previewQuickFilter === 'warnings');
    $('previewConflictsBtn').classList.toggle('active', state.previewQuickFilter === 'conflicts');
  }
  function filterPreviewRows(computed) {
    let rows = computed;
    if (state.previewRuleId !== 'all') rows = rows.filter(row => row.matchingRules.includes(state.previewRuleId));
    if (state.onlyChanged) rows = rows.filter(row => row.changed || row.roundingWarning || row.conflict);
    if (state.previewQuickFilter === 'warnings') rows = rows.filter(row => row.roundingWarning);
    if (state.previewQuickFilter === 'conflicts') rows = rows.filter(row => row.conflict);
    return rows;
  }
  function viewPlanRule(id) {
    if (!state.planRules.some(rule => rule.id === id)) return;
    state.previewRuleId = id;
    recalc();
    $('previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderPlan() {
    const list = $('planList');
    clear(list);
    const count = state.planRules.length;
    $('planSummary').textContent = count ? `${count} regla${count === 1 ? '' : 's'} temporal${count === 1 ? '' : 'es'}` : 'Sin reglas todavía';
    if (!count) {
      appendText(list, 'p', 'Configurá un ajuste y agregalo al plan. Cuando haya reglas, el preview y la exportación usarán únicamente ese plan.', 'plan-empty');
      return;
    }
    state.planRules.forEach((rule, index) => {
      const item = document.createElement('div');
      item.className = 'plan-rule';
      const content = document.createElement('div');
      appendText(content, 'div', `Regla ${index + 1}: ${ruleTitle(rule)}`, 'plan-rule-title');
      const affected = ruleAffectedCount(rule);
      appendText(content, 'div', `${ruleScope(rule)} · ${affected} fila${affected === 1 ? '' : 's'} afectada${affected === 1 ? '' : 's'}`, 'plan-rule-meta');
      appendText(content, 'div', ruleDetails(rule), 'plan-rule-meta');
      item.appendChild(content);
      const actions = document.createElement('div');
      actions.className = 'plan-rule-actions';
      const view = appendText(actions, 'button', 'Ver cambios', 'small-btn');
      view.type = 'button';
      view.addEventListener('click', () => viewPlanRule(rule.id));
      const edit = appendText(actions, 'button', 'Editar', 'small-btn');
      edit.type = 'button';
      edit.addEventListener('click', () => editPlanRule(rule.id));
      const remove = appendText(actions, 'button', 'Eliminar', 'small-btn danger');
      remove.type = 'button';
      remove.addEventListener('click', () => deletePlanRule(rule.id));
      item.appendChild(actions);
      list.appendChild(item);
    });
  }
  function refreshPlanEditor() {
    const editing = state.planRules.find(rule => rule.id === state.editingRuleId);
    $('addRuleBtn').textContent = editing ? 'Guardar cambios de la regla' : '+ Agregar regla al plan';
    $('cancelEditRuleBtn').hidden = !editing;
  }
  function addOrUpdatePlanRule() {
    const config = copyConfig(currentConfig());
    const issue = ruleIssue(config);
    if (issue) { setPlanEditorMessage(issue, true); return; }
    const existing = state.planRules.find(rule => rule.id === state.editingRuleId);
    if (existing) {
      Object.assign(existing, config);
      state.editingRuleId = null;
      setPlanEditorMessage('La regla fue actualizada en el plan.', false);
    } else {
      state.planRules.push({ id: `rule-${++state.ruleSequence}`, ...config });
      setPlanEditorMessage('La regla fue agregada al plan.', false);
    }
    refreshPlanEditor();
    renderPlan();
    recalc();
  }
  function editPlanRule(id) {
    const rule = state.planRules.find(item => item.id === id);
    if (!rule) return;
    state.editingRuleId = id;
    applyConfigToEditor(rule);
    setPlanEditorMessage('Editando una regla: guardá los cambios para aplicarlos al plan.', false);
    refreshPlanEditor();
    renderPlan();
    recalc();
  }
  function cancelPlanRuleEdit() {
    state.editingRuleId = null;
    setPlanEditorMessage('', false);
    refreshPlanEditor();
    renderPlan();
    recalc();
  }
  function deletePlanRule(id) {
    const rule = state.planRules.find(item => item.id === id);
    if (!rule || !window.confirm('¿Eliminar esta regla temporal del plan?')) return;
    state.planRules = state.planRules.filter(item => item.id !== id);
    if (state.editingRuleId === id) state.editingRuleId = null;
    setPlanEditorMessage('La regla fue eliminada del plan.', false);
    refreshPlanEditor();
    renderPlan();
    recalc();
  }
  function appendPreviewRow(tbody, row) {
    const tr = document.createElement('tr');
    const product = document.createElement('td');
    product.textContent = row.name;
    if (row.conflict) appendText(product, 'span', `Conflicto: coincide con ${row.matchingRules.length} reglas del plan. Editá o eliminá una de ellas.`, 'preview-note rounding-warning');
    if (row.error || row.review || !row.included) {
      const note = appendText(product, 'span', row.error ? 'Error: ' + row.reason : row.review ? 'Revisar: ' + row.reason : 'Excluido por filtro', 'preview-note');
      note.classList.add(row.error ? 'delta' : '');
    }
    if (row.roundingWarning) appendText(product, 'span', `Desvío de redondeo: solicitado ${formatSignedPercent(row.requestedChange)}; efectivo ${formatSignedPercent(row.effectiveChange)}.`, 'preview-note rounding-warning');
    tr.appendChild(product);
    appendText(tr, 'td', row.variant || '—');
    appendText(tr, 'td', row.error ? '—' : displayPrice(row.current));
    const next = document.createElement('td');
    next.className = 'new-price';
    next.textContent = row.error ? '—' : displayPrice(row.next);
    if (row.hasPromo) {
      const promoText = row.promoChanged
        ? row.promoNext === '' ? `Promo: ${displayPrice(row.promoCurrent)} → eliminar` : `Promo: ${displayPrice(row.promoCurrent)} → ${displayPrice(row.promoNext)}`
        : `Promo actual: ${row.promoCurrent == null ? String(state.rows[row.index][state.promoCol]) : displayPrice(row.promoCurrent)}`;
      appendText(next, 'span', promoText, 'preview-note');
    }
    tr.appendChild(next);
    const delta = document.createElement('td');
    delta.textContent = row.error ? '—' : signedChange(row.current, row.next);
    delta.className = `delta ${row.next >= row.current ? 'up' : 'down'}`;
    tr.appendChild(delta);
    tbody.appendChild(tr);
  }
  function setReadyList(items) {
    const list = $('readyList');
    clear(list);
    items.forEach(item => appendText(list, 'li', item));
  }
  function recalc() {
    const computed = computeRows();
    const config = currentConfig();
    const usingPlan = state.planRules.length > 0;
    const invalidRule = usingPlan ? state.planRules.some(rule => !rule.roundValid) : !config.roundValid;
    const hasFile = state.fileValid && computed.length > 0;
    $('summaryRow').hidden = !hasFile;
    const modified = computed.filter(row => row.changed).length;
    const reviews = computed.filter(row => row.review).length;
    const errors = computed.filter(row => row.error).length;
    const promotions = computed.filter(row => row.hasPromo).length;
    const excluded = computed.filter(row => !row.included).length;
    const roundingWarnings = computed.filter(row => row.roundingWarning).length;
    const conflicts = computed.filter(row => row.conflict).length;
    $('statModified').textContent = String(modified);
    $('statReview').textContent = String(reviews);
    $('statErrors').textContent = String(errors);
    $('statPromo').textContent = String(promotions);
    $('statExcluded').textContent = String(excluded);
    $('statRoundingWarning').textContent = String(roundingWarnings);
    $('statConflicts').textContent = String(conflicts);
    renderPlan();
    renderPreviewRuleFilter();
    syncPreviewQuickFilters(roundingWarnings, conflicts);
    const rows = filterPreviewRows(computed);
    const tbody = $('tbody');
    if (!hasFile) {
      emptyMessage(tbody, 'Cargá un CSV válido para ver la vista previa.');
      $('rowCountLabel').textContent = '';
    } else if (!rows.length) {
      emptyMessage(tbody, 'Ninguna fila cambia con esta configuración.');
      $('rowCountLabel').textContent = '';
    } else {
      clear(tbody);
      rows.slice(0, 300).forEach(row => appendPreviewRow(tbody, row));
      $('rowCountLabel').textContent = rows.length > 300 ? `Mostrando las primeras 300 de ${rows.length} filas` : `Mostrando ${rows.length} de ${computed.length} filas`;
    }
    if (hasFile) {
      $('readyTitle').textContent = conflicts ? 'Resolvé los conflictos del plan antes de generar' : invalidRule ? 'Ingresá un múltiplo personalizado mayor que 0' : errors || reviews ? 'Hay filas que requieren revisión' : roundingWarnings ? 'Revisá los desvíos de redondeo antes de generar' : 'Todo listo para generar el archivo';
      const readiness = [
        `${modified} fila${modified === 1 ? '' : 's'} tendrán cambios autorizados.`,
        `${excluded} fila${excluded === 1 ? '' : 's'} quedan idénticas ${usingPlan ? 'porque no coinciden con ninguna regla' : 'por el filtro'}.`,
        'Solo se modifican Precio y, si lo elegiste, Precio promocional.'
      ];
      if (conflicts) readiness.unshift(`${conflicts} fila${conflicts === 1 ? '' : 's'} coinciden con más de una regla. No se generará el archivo hasta resolverlo.`);
      else if (invalidRule) readiness.unshift('El múltiplo personalizado debe ser mayor que 0.');
      else if (roundingWarnings) readiness.unshift(`${roundingWarnings} fila${roundingWarnings === 1 ? '' : 's'} presentan un desvío de redondeo mayor a 2 puntos porcentuales.`);
      setReadyList(readiness);
    } else {
      $('readyTitle').textContent = 'Cargá un archivo para continuar';
      setReadyList([]);
    }
    $('generateBtn').disabled = !hasFile || invalidRule || conflicts > 0 || !computed.some(row => row.canModify);
  }
  function buildOutputRows(computed) {
    return state.rows.map((row, index) => {
      const copy = row.slice();
      const calculation = computed[index];
      if (!calculation?.canModify) return copy;
      if (calculation.priceChanged) copy[state.priceCol] = exportNumber(calculation.next);
      if (state.promoCol >= 0 && calculation.promoChanged) copy[state.promoCol] = calculation.promoNext === '' ? '' : exportNumber(calculation.promoNext);
      return copy;
    });
  }
  function downloadCSV(filename, csv) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  function syncAdjustmentControls() {
    const roundOnly = $('cfgType').value === 'round-only';
    const customRound = $('cfgRound').value === 'custom';
    const customValue = Number($('cfgCustomRound').value);
    const invalidCustomRound = customRound && (!Number.isFinite(customValue) || customValue <= 0);
    const noRounding = $('cfgRound').value === '0';
    const percentField = $('cfgPercent').closest('.field');
    percentField.hidden = roundOnly;
    $('cfgPercent').disabled = roundOnly;
    $('customRoundField').hidden = !customRound;
    $('cfgCustomRound').disabled = !customRound;
    $('cfgCustomRound').setCustomValidity(invalidCustomRound ? 'Ingresá un múltiplo mayor que 0.' : '');
    $('roundCriteriaField').hidden = roundOnly || noRounding || invalidCustomRound;
    $('cfgRoundCriteria').disabled = roundOnly || noRounding || invalidCustomRound;
    const samePromotion = [...$('cfgPromo').options].find(option => option.value === 'same');
    samePromotion.disabled = roundOnly;
    if (roundOnly && $('cfgPromo').value === 'same') $('cfgPromo').value = 'keep';
  }
  function syncScopeUI() {
    const scope = $('cfgScope').value;
    $('categoryPickerWrap').style.display = scope === 'categories' ? 'block' : 'none';
    $('brandPickerWrap').style.display = scope === 'brand' ? 'block' : 'none';
    $('textFilterWrap').style.display = scope === 'text' ? 'block' : 'none';
  }

  $('storeSelect').addEventListener('change', event => {
    currentProjectId = event.target.value;
    toggleProfileForm(false);
    renderProfiles();
  });
  $('addStoreBtn').addEventListener('click', addProject);
  $('renameStoreBtn').addEventListener('click', renameProject);
  $('deleteStoreBtn').addEventListener('click', deleteProject);
  $('cancelProfileBtn').addEventListener('click', () => toggleProfileForm(false));
  $('saveProfileBtn').addEventListener('click', () => {
    const label = $('newProfileName').value.trim();
    if (!label) { $('newProfileName').focus(); return; }
    const custom = loadCustomProfiles(currentProjectId);
    custom.push({ label, sub: 'Personalizado', ...currentConfig() });
    saveCustomProfiles(currentProjectId, custom);
    toggleProfileForm(false);
    renderProfiles(builtInProfiles.length + custom.length - 1);
  });
  $('newProfileName').addEventListener('keydown', event => { if (event.key === 'Enter') $('saveProfileBtn').click(); });
  $('colPriceOverride').addEventListener('change', event => {
    state.priceCol = Number(event.target.value);
    state.numberConvention = inferMoneyConvention(state.rows.map(row => row[state.priceCol]));
    $('fiCol').textContent = state.headers[state.priceCol] || 'No detectada';
    state.fileValid = state.priceCol >= 0;
    recalc();
  });
  $('colCategoryOverride').addEventListener('change', event => {
    state.categoryCol = Number(event.target.value);
    buildEffectiveFields();
    populateCategories();
    recalc();
  });
  $('cfgCategoryLevel').addEventListener('change', () => { populateCategories(); recalc(); });
  $('brandSelect').addEventListener('change', recalc);
  $('cfgScope').addEventListener('change', () => { syncScopeUI(); recalc(); });
  ['cfgType', 'cfgRound'].forEach(id => $(id).addEventListener('change', () => { syncAdjustmentControls(); recalc(); }));
  $('cfgCustomRound').addEventListener('input', () => { syncAdjustmentControls(); recalc(); });
  ['cfgRoundCriteria', 'cfgPromo'].forEach(id => $(id).addEventListener('change', recalc));
  $('cfgPercent').addEventListener('input', recalc);
  $('textFilterInput').addEventListener('input', recalc);
  $('catSelectAll').addEventListener('click', () => { state.selectedCategories = new Set(state.categoryValues); renderCategoryChips(); recalc(); });
  $('catSelectNone').addEventListener('click', () => { state.selectedCategories = new Set(); renderCategoryChips(); recalc(); });
  $('addRuleBtn').addEventListener('click', addOrUpdatePlanRule);
  $('cancelEditRuleBtn').addEventListener('click', cancelPlanRuleEdit);
  $('previewRuleFilter').addEventListener('change', event => { state.previewRuleId = event.target.value; recalc(); });
  $('onlyChanged').addEventListener('click', function () { state.onlyChanged = !state.onlyChanged; this.classList.toggle('active', state.onlyChanged); recalc(); });
  $('previewWarningsBtn').addEventListener('click', () => { state.previewQuickFilter = state.previewQuickFilter === 'warnings' ? '' : 'warnings'; recalc(); });
  $('previewConflictsBtn').addEventListener('click', () => { state.previewQuickFilter = state.previewQuickFilter === 'conflicts' ? '' : 'conflicts'; recalc(); });
  $('generateBtn').addEventListener('click', () => {
    const computed = computeRows();
    if (!state.fileValid || computed.some(row => row.conflict) || !computed.some(row => row.canModify)) return;
    const output = buildOutputRows(computed);
    const csv = toCSV(state.headers, output, state.delimiter, state.lineEnding);
    const filename = state.fileName.replace(/\.csv$/i, '') + '-actualizado.csv';
    downloadCSV(filename, csv);
  });
  const dropzone = $('dropzone');
  const fileInput = $('fileInput');
  $('selectBtn').addEventListener('click', event => { event.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', event => handleFile(event.target.files[0]));
  ['dragenter', 'dragover'].forEach(eventName => dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', event => handleFile(event.dataTransfer.files[0]));

  renderProjects();
  renderProfiles();
  syncAdjustmentControls();
  syncScopeUI();
  refreshPlanEditor();
  recalc();
})();
