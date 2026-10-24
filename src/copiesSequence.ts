type ReferenceRow = { refNo: string; manualRefNo?: boolean };

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
