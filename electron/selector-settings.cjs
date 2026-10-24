const fs = require('node:fs');
const path = require('node:path');

const baseFields = {
  translation: ['number', 'date', 'person', 'document', 'languages', 'certifier', 'copies', 'fee', 'notes'],
  copies: ['listDate', 'number', 'refNo', 'customer', 'description', 'quantity', 'unitPrice', 'total']
};
const customPattern = /^custom:([a-f0-9-]{36}):(label|header)$/;

function validate(value, selector) {
  if (!baseFields[selector] || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 200) throw Error('Invalid selector settings.');
  const result = {};
  for (const [key, label] of Object.entries(value)) {
    const base = /^(field|header):([a-zA-Z]+)$/.exec(key);
    if ((!base || !baseFields[selector].includes(base[2])) && !customPattern.test(key)) throw Error('Invalid selector settings.');
    if (typeof label !== 'string' || label.length > 1000) throw Error('Selector labels must be 1,000 characters or fewer.');
    result[key] = label;
  }
  const ids = new Set(Object.keys(result).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter(Boolean));
  for (const id of ids) if (!result[`custom:${id}:label`]?.trim() || !result[`custom:${id}:header`]?.trim()) throw Error('Custom field labels and headers cannot be empty.');
  for (const key of Object.keys(result)) { const id = key.match(/^custom:([a-f0-9-]{36}):header$/)?.[1]; if (id && !ids.has(id)) throw Error('Invalid selector settings.'); }
  return result;
}

function fileFor(userData, selector) {
  if (!baseFields[selector]) throw Error('Invalid selector.');
  return path.join(userData, `${selector}-settings.json`);
}

function load(userData, selector) {
  try { return validate(JSON.parse(fs.readFileSync(fileFor(userData, selector), 'utf8')), selector); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function save(userData, selector, value) {
  const settings = validate(value, selector);
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(fileFor(userData, selector), JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

module.exports = { baseFields, validate, load, save };
