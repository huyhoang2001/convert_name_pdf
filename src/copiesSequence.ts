type ReferenceRow = { refNo: string; manualRefNo?: boolean };

export function inspectReferenceNumbers(references: (string | number)[]) {
  const valid = [...new Set(references.map(String).filter(value => /^\d+$/.test(value)).map(Number).filter(value => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  let missingCount = 0;
  for (let index = 1; index < valid.length; index++) {
    const start = valid[index - 1] + 1, end = valid[index] - 1;
    if (start <= end) { ranges.push({ start, end }); missingCount += end - start + 1; }
  }
  return { checked: valid.length, min: valid[0] ?? null, max: valid.at(-1) ?? null, ranges, missingCount };
}

export function inspectAdjacentReferenceNumbers(current: (string | number)[], next?: (string | number)[]) {
  const validInRowOrder = (references: (string | number)[]) => references.map(String).filter(value => /^\d+$/.test(value)).map(Number).filter(value => Number.isSafeInteger(value) && value > 0);
  const currentValid = validInRowOrder(current), nextValid = next === undefined ? undefined : validInRowOrder(next);
  const currentLast = currentValid.at(-1) ?? null, nextFirst = nextValid?.[0] ?? null;
  return {
    ...inspectReferenceNumbers([...current, ...(next ?? [])]),
    currentLast,
    nextFirst,
    hasNextSheet: next !== undefined,
    boundarySequential: currentLast !== null && nextFirst !== null ? nextFirst === currentLast + 1 : null
  };
}

export function nextReferenceNumber(rows: ReferenceRow[], previousLast = 0) {
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.refNo) || 0), previousLast);
  return String(highest + 1);
}

export function insertReferenceNumber<T extends ReferenceRow>(rows: T[], row: T) {
  const number = Number(row.refNo);
  const ordered = [...rows].sort((a, b) => Number(a.refNo) - Number(b.refNo));
  const index = ordered.findIndex(item => Number(item.refNo) >= number);
  const shifted = ordered.map(item => Number(item.refNo) >= number ? { ...item, refNo: String(Number(item.refNo) + 1) } : item);
  shifted.splice(index < 0 ? shifted.length : index, 0, row);
  return shifted;
}

export function distributeRows<T, S extends { rows: T[] }>(sheets: S[], rows: T[]) {
  let start = 0;
  return sheets.map((sheet, index) => {
    const end = index === sheets.length - 1 ? rows.length : start + sheet.rows.length;
    const next = { ...sheet, rows: rows.slice(start, end) };
    start = end;
    return next;
  });
}

export function compactReferenceNumbers<T extends ReferenceRow>(rows: T[], removed?: T | T[]) {
  const fixed = new Set(rows.filter(row => row.manualRefNo).map(row => row.refNo));
  const removedRows = removed ? Array.isArray(removed) ? removed : [removed] : [];
  const automatic = rows.filter(row => !row.manualRefNo);
  const existingNumbers = [...automatic, ...removedRows].map(row => Number(row.refNo)).filter(value => Number.isSafeInteger(value) && value > 0);
  let next = existingNumbers.length ? existingNumbers.reduce((min, value) => Math.min(min, value), Infinity) : 1;
  return rows.map(row => {
    if (row.manualRefNo) return row;
    while (fixed.has(String(next))) next++;
    const refNo = String(next++);
    fixed.add(refNo);
    return { ...row, refNo };
  });
}

export function compactSortedReferenceNumbers<T extends ReferenceRow>(rows: T[]) {
  return compactReferenceNumbers([...rows].sort((a, b) => Number(a.refNo) - Number(b.refNo)));
}
