export function normalizeSignaturePerson(value) {
  return value
    .replace(/(^|\n)[ \t]*\d+\.[ \t]*(?=(?:ÔNG|BÀ)\s*:)/gi, '$1')
    .replace(/[ \t]+\d+\.[ \t]*(?=(?:ÔNG|BÀ)\s*:)/gi, '\n');
}

export function uppercaseSignatureText(value) {
  return value.toUpperCase();
}

const foldSuggestion = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export function filterRegisterSuggestions(values, query) {
  const needle = foldSuggestion(query);
  return needle ? values.filter(value => foldSuggestion(value).includes(needle)) : values;
}

export function signatureDocumentSuggestions(rows, query) {
  const needle = query.toLocaleLowerCase();
  const seen = new Set();
  const suggestions = [];
  for (const row of [...rows].reverse()) {
    const value = row.document ?? '';
    const key = value.trim().toLocaleUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!needle || value.toLocaleLowerCase().includes(needle)) suggestions.push(value.toUpperCase());
  }
  return suggestions;
}

export function translationPersonSuggestions(rows, query) {
  const seen = new Set();
  const values = [];
  for (const row of [...rows].reverse()) {
    const value = row.person ?? '';
    const key = foldSuggestion(value.trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return filterRegisterSuggestions(values, query);
}

export function splitSearchMatches(value, query) {
  if (!query) return [{ text: value, match: false }];
  const parts = [];
  const lower = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let cursor = 0;
  while (cursor < value.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) break;
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + query.length), match: true });
    cursor = index + query.length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), match: false });
  return parts.length ? parts : [{ text: value, match: false }];
}

export function duplicateSignatureNumbers(rows) {
  const counts = new Map();
  for (const { number } of rows) {
    const value = Number(number);
    if (Number.isSafeInteger(value) && value > 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([number]) => number));
}

export function nextAvailableSignatureNumber(rows) {
  const used = new Set(rows.map(row => Number(row.number)).filter(number => Number.isSafeInteger(number) && number > 0));
  let next = 1;
  while (used.has(next)) next++;
  return formatSignatureNumber(next);
}

export function nextSignatureNumberAfterHighWater(rows, highWater = 0) {
  const highest = rows.reduce((max, row) => {
    const number = Number(row.number);
    return Number.isSafeInteger(number) && number > max ? number : max;
  }, Number.isSafeInteger(highWater) && highWater > 0 ? highWater : 0);
  return formatSignatureNumber(highest + 1);
}

export function formatSignatureNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number).padStart(2, '0') : String(value ?? '');
}

export function insertSignatureRow(rows, row) {
  const number = Number(row.number);
  const lastMatch = rows.findLastIndex(existing => Number(existing.number) === number);
  const index = lastMatch < 0 ? rows.findIndex(existing => Number(existing.number) > number) : lastMatch + 1;
  return index < 0 ? [...rows, row] : [...rows.slice(0, index), row, ...rows.slice(index)];
}

export function applySignatureDuplicateFill(row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE2A8' } };
  });
}
