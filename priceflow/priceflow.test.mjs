import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';

class FakeClassList {
  add() {}
  remove() {}
  toggle() { return false; }
}
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.style = {};
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
  }
  get firstChild() { return this.children[0] || null; }
  get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; }
  addEventListener() {}
  setAttribute() {}
  setCustomValidity() {}
  closest() { return new FakeElement('div'); }
  click() {}
}

function createRuntime() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id === 'tbody' ? 'tbody' : 'div'));
    return elements.get(id);
  };
  const promo = get('cfgPromo');
  ['keep', 'same', 'remove'].forEach(value => { const option = new FakeElement('option'); option.value = value; promo.appendChild(option); });
  get('cfgType').value = 'increase';
  get('cfgPercent').value = '8';
  get('cfgRound').value = '50';
  get('cfgRoundCriteria').value = 'guarantee';
  get('cfgScope').value = 'all';
  get('cfgCategoryLevel').value = 'main';
  get('brandSelect').value = '';
  get('textFilterInput').value = '';
  const local = new Map();
  const context = {
    console,
    TextDecoder,
    Intl,
    Number,
    String,
    Math,
    Set,
    Map,
    RegExp,
    JSON,
    Array,
    Object,
    Date,
    Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) },
    document: { getElementById: get, createElement: tag => new FakeElement(tag), querySelectorAll: () => [] },
    window: { prompt: () => null, confirm: () => false },
    FileReader: class {},
    alert() {}
  };
  context.window.window = context.window;
  context.globalThis = context;
  return { context: vm.createContext(context), get };
}

const sourcePath = new URL('./app.js', import.meta.url);
let source = await readFile(sourcePath, 'utf8');
source = source.replace(/\}\)\(\);\s*$/, `globalThis.__api = { state, parseCSV, toCSV, inferMoneyConvention, parsePrice, roundPrice, calculateAdjustedPrice, effectiveChangePercent, hasRoundingDeviation, analyseImportedText, computeRows, buildOutputRows, filterPreviewRows, productCount, buildEffectiveFields };\n})();`);
const runtime = createRuntime();
vm.runInContext(source, runtime.context, { filename: 'app.js' });
const api = runtime.context.__api;

function configure(values) {
  Object.entries(values).forEach(([id, value]) => { runtime.get(id).value = String(value); });
}
function importCsv(path) {
  return readFile(path).then(bytes => {
    const text = new TextDecoder('windows-1252').decode(bytes);
    api.analyseImportedText(text, basename(path), bytes.length, 'Windows-1252');
  });
}
function changedColumns(before, after) {
  return before.map((value, index) => value === after[index] ? null : index).filter(index => index != null);
}

const dotConvention = api.inferMoneyConvention(['4700.00', '4,700.00', '23,290.00']);
const commaConvention = api.inferMoneyConvention(['4700,00', '4.700,00']);
assert.equal(api.parsePrice('4700', dotConvention).value, 4700);
assert.equal(api.parsePrice('4.700', dotConvention).value, 4700);
assert.equal(api.parsePrice('4,700', dotConvention).value, 4700);
assert.equal(api.parsePrice('4700.00', dotConvention).value, 4700);
assert.equal(api.parsePrice('4700,00', commaConvention).value, 4700);
assert.equal(api.parsePrice('4.700,00', commaConvention).value, 4700);
assert.equal(api.parsePrice('4,700.00', dotConvention).value, 4700);
assert.equal(api.parsePrice('1.234.567', dotConvention).value, 1234567);
assert.equal(api.parsePrice('1,234,567.00', dotConvention).value, 1234567);
assert.equal(api.parsePrice('4.700', { decimal: null, thousands: null }).review, true);

assert.equal(api.calculateAdjustedPrice(4328, { type: 'increase', percent: 8, round: 0, roundCriteria: 'nearest' }), 4674.24);
assert.equal(api.calculateAdjustedPrice(4328, { type: 'increase', percent: 8, round: 50, roundCriteria: 'nearest' }), 4650);
assert.equal(api.calculateAdjustedPrice(4328, { type: 'increase', percent: 8, round: 50, roundCriteria: 'guarantee' }), 4700);
assert.equal(api.calculateAdjustedPrice(4700, { type: 'increase', percent: 8, round: 50, roundCriteria: 'nearest' }), 5100);
assert.equal(api.calculateAdjustedPrice(4700, { type: 'increase', percent: 8, round: 50, roundCriteria: 'guarantee' }), 5100);
assert.equal(api.roundPrice(6101, 90, 'increase', 'nearest'), 6090);
assert.equal(api.roundPrice(4674.24, 50, 'decrease', 'guarantee'), 4650);

const round50Nearest = { type: 'increase', percent: 8, round: 50, roundMode: '50', roundValid: true, roundCriteria: 'nearest' };
const round10Nearest = { type: 'increase', percent: 8, round: 10, roundMode: '10', roundValid: true, roundCriteria: 'nearest' };
const custom10Nearest = { type: 'increase', percent: 8, round: 10, roundMode: 'custom', customRound: '10', roundValid: true, roundCriteria: 'nearest' };
const rounded149To50 = api.calculateAdjustedPrice(149, round50Nearest);
const rounded149To10 = api.calculateAdjustedPrice(149, round10Nearest);
const rounded845To10 = api.calculateAdjustedPrice(845, round10Nearest);
assert.equal(rounded149To50, 150);
assert(Math.abs(api.effectiveChangePercent(149, rounded149To50) - 0.67) < 0.01);
assert.equal(api.hasRoundingDeviation(149, rounded149To50, round50Nearest), true);
assert.equal(rounded149To10, 160);
assert(Math.abs(api.effectiveChangePercent(149, rounded149To10) - 7.38) < 0.01);
assert.equal(api.hasRoundingDeviation(149, rounded149To10, round10Nearest), false);
assert.equal(api.calculateAdjustedPrice(149, custom10Nearest), 160);
assert.equal(rounded845To10, 910);
assert(Math.abs(api.effectiveChangePercent(845, rounded845To10) - 7.69) < 0.01);
assert.equal(api.hasRoundingDeviation(845, rounded845To10, round10Nearest), false);

const ceppiPath = process.argv[2];
const sansayPath = process.argv[3];
if (!ceppiPath || !sansayPath) throw new Error('Usage: node priceflow.test.mjs <ceppi.csv> <sansay.csv>');

await importCsv(ceppiPath);
assert.equal(api.state.rows.length, 32);
assert.equal(api.state.headers[api.state.priceCol], 'Precio');
assert.equal(api.state.headers[api.state.brandCol], 'Marca');
assert.equal(api.parsePrice(api.state.rows[0][api.state.priceCol]).value, 23290);
configure({ cfgType: 'increase', cfgPercent: 8, cfgRound: 50, cfgRoundCriteria: 'guarantee', cfgScope: 'brand', brandSelect: 'Wadfow', cfgPromo: 'keep' });
let ceppiComputed = api.computeRows();
let ceppiOutput = api.buildOutputRows(ceppiComputed);
assert(ceppiComputed.some(row => row.included), 'El filtro de Marca debe incluir filas Wadfow.');
assert(ceppiComputed.some(row => !row.included), 'El filtro de Marca debe excluir otras filas.');
ceppiComputed.forEach((row, index) => {
  const differences = changedColumns(api.state.rows[index], ceppiOutput[index]);
  if (!row.included) assert.deepEqual(ceppiOutput[index], api.state.rows[index], `Fila excluida ${index + 1} fue alterada.`);
  else assert.deepEqual([...differences], row.priceChanged ? [api.state.priceCol] : [], `La fila incluida ${index + 1} alteró columnas no autorizadas.`);
});
const ceppiRoundTrip = api.parseCSV(api.toCSV(api.state.headers, ceppiOutput, api.state.delimiter, api.state.lineEnding), api.state.delimiter).rows;
assert.deepEqual(ceppiRoundTrip.slice(1), ceppiOutput, 'La exportación de Ferre CEPPI debe conservar la estructura de celdas.');

await importCsv(sansayPath);
assert.equal(api.state.rows.length, 751);
assert.equal(api.productCount(), 87);
assert(api.state.rows.filter(row => api.state.propValueCols.some(column => String(row[column] || '').trim())).length > 700, 'Sansay debe conservar más de 700 filas de variantes.');
configure({ cfgType: 'increase', cfgPercent: 8, cfgRound: 0, cfgRoundCriteria: 'nearest', cfgScope: 'all', cfgPromo: 'keep' });
let sansayComputed = api.computeRows();
let sansayOutput = api.buildOutputRows(sansayComputed);
const byUrl = new Map();
api.state.rows.forEach((row, index) => {
  const url = row[api.state.urlCol];
  const current = api.parsePrice(row[api.state.priceCol]).value;
  if (!byUrl.has(url)) byUrl.set(url, []);
  byUrl.get(url).push({ index, current });
});
const variedProduct = [...byUrl.values()].find(rows => rows.length > 1 && new Set(rows.map(row => row.current)).size > 1 && rows.every(row => sansayComputed[row.index].canModify));
assert(variedProduct, 'La muestra Sansay debe contener variantes con precios distintos.');
variedProduct.forEach(row => assert.equal(sansayComputed[row.index].next, Number((row.current * 1.08).toFixed(8)), 'Cada variante debe calcularse desde su propio precio.'));
sansayComputed.forEach((row, index) => {
  const differences = changedColumns(api.state.rows[index], sansayOutput[index]);
  assert.deepEqual([...differences], row.priceChanged ? [api.state.priceCol] : [], `Sansay fila ${index + 1} alteró una columna no autorizada.`);
});

api.state.headers = ['Identificador de URL', 'Nombre', 'Precio', 'Precio promocional', 'Marca'];
api.state.rows = [['a', 'Incluido', '100', '80', 'Marca A'], ['b', 'Excluido', '200', '150', 'Marca B'], ['c', 'Sin regla', '300', '260', 'Marca C']];
api.state.fileValid = true;
api.state.priceCol = 2;
api.state.promoCol = 3;
api.state.nameCol = 1;
api.state.brandCol = 4;
api.state.urlCol = 0;
api.state.categoryCol = -1;
api.state.propValueCols = [];
api.state.duplicates = new Set();
api.state.effName = ['Incluido', 'Excluido', 'Sin regla'];
api.state.numberConvention = api.inferMoneyConvention(['100', '200', '300']);
api.state.planRules = [];
configure({ cfgType: 'increase', cfgPercent: 10, cfgRound: 0, cfgRoundCriteria: 'nearest', cfgScope: 'brand', brandSelect: 'Marca A', cfgPromo: 'remove' });
const promoComputed = api.computeRows();
const promoOutput = api.buildOutputRows(promoComputed);
assert.equal(promoOutput[0][2], '110');
assert.equal(promoOutput[0][3], '');
assert.deepEqual(promoOutput[1], api.state.rows[1], 'Una fila excluida no puede cambiar ni Precio ni Precio promocional.');
assert.deepEqual(promoOutput[2], api.state.rows[2], 'Una fila sin coincidencia debe conservarse completa.');

api.state.planRules = [
  { id: 'marca-a', type: 'increase', percent: 10, round: 0, roundMode: '0', roundValid: true, roundCriteria: 'nearest', promo: 'same', scope: 'brand', categoryLevel: 'main', categories: [], brand: 'Marca A', text: '' },
  { id: 'marca-b', type: 'decrease', percent: 10, round: 0, roundMode: '0', roundValid: true, roundCriteria: 'nearest', promo: 'keep', scope: 'brand', categoryLevel: 'main', categories: [], brand: 'Marca B', text: '' }
];
const planComputed = api.computeRows();
const planOutput = api.buildOutputRows(planComputed);
assert.equal(planComputed[0].next, 110, 'La primera regla debe partir del precio original.');
assert.equal(planComputed[1].next, 180, 'Cada regla debe calcularse desde su precio original, sin encadenarse.');
assert.equal(planOutput[0][2], '110');
assert.equal(planOutput[0][3], '88', 'La regla conserva su tratamiento promocional.');
assert.equal(planOutput[1][2], '180');
assert.equal(planOutput[1][3], '150');
assert.deepEqual(planOutput[2], api.state.rows[2], 'Las filas sin reglas coincidentes deben permanecer idénticas.');
api.state.previewQuickFilter = '';
api.state.onlyChanged = false;
api.state.previewRuleId = 'marca-a';
assert.deepEqual([...api.filterPreviewRows(planComputed).map(row => row.index)], [0], 'La vista de Regla 1 debe mostrar solo sus filas.');
api.state.previewRuleId = 'marca-b';
assert.deepEqual([...api.filterPreviewRows(planComputed).map(row => row.index)], [1], 'La vista de Regla 2 debe mostrar solo sus filas.');
api.state.previewRuleId = 'all';
assert.deepEqual([...api.filterPreviewRows(planComputed).map(row => row.index)], [0, 1, 2], 'Todas las reglas debe mantener la vista completa.');
api.state.previewRuleId = 'marca-a';
api.state.onlyChanged = true;
assert.deepEqual([...api.filterPreviewRows(planComputed).map(row => row.index)], [0], 'Ver solo los que cambian debe combinarse con la regla seleccionada.');
assert.deepEqual(api.buildOutputRows(api.computeRows()), planOutput, 'El filtro visual no puede alterar la exportación combinada del plan.');
api.state.onlyChanged = false;
api.state.previewRuleId = 'all';

api.state.planRules = [
  { id: 'marca-a', type: 'increase', percent: 10, round: 0, roundMode: '0', roundValid: true, roundCriteria: 'nearest', promo: 'keep', scope: 'brand', categoryLevel: 'main', categories: [], brand: 'Marca A', text: '' },
  { id: 'texto-incluido', type: 'increase', percent: 5, round: 0, roundMode: '0', roundValid: true, roundCriteria: 'nearest', promo: 'keep', scope: 'text', categoryLevel: 'main', categories: [], brand: '', text: 'Incluido' }
];
const conflictComputed = api.computeRows();
const conflictOutput = api.buildOutputRows(conflictComputed);
assert.equal(conflictComputed[0].conflict, true, 'Una fila alcanzada por dos reglas debe marcarse como conflicto.');
assert.equal(conflictComputed[0].canModify, false, 'Un conflicto no puede modificar la fila ni habilitar su exportación.');
assert.deepEqual(conflictOutput[0], api.state.rows[0], 'Una fila en conflicto debe conservarse idéntica hasta resolverlo.');
api.state.previewRuleId = 'all';
api.state.previewQuickFilter = 'conflicts';
assert.deepEqual([...api.filterPreviewRows(conflictComputed).map(row => row.index)], [0], 'El filtro rápido de conflictos debe mostrar solo filas en conflicto.');

api.state.planRules = [
  { id: 'desvio', type: 'increase', percent: 8, round: 50, roundMode: '50', roundValid: true, roundCriteria: 'nearest', promo: 'keep', scope: 'brand', categoryLevel: 'main', categories: [], brand: 'Marca A', text: '' }
];
api.state.previewQuickFilter = 'warnings';
const warningComputed = api.computeRows();
assert.equal(warningComputed[0].roundingWarning, true, 'La regla con desvío debe conservar su advertencia.');
assert.deepEqual([...api.filterPreviewRows(warningComputed).map(row => row.index)], [0], 'El filtro rápido de advertencias debe mostrar solo filas con desvío.');

console.log('PriceFlow tests passed: parser, standard/custom rounding, plan preview filters, deviation warnings, plan rules/conflicts, promotions, variants, encoding, and CSV-preservation checks.');
