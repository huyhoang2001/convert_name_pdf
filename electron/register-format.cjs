const border = { top: { style: 'thin', color: { argb: 'FFD9E0E8' } }, left: { style: 'thin', color: { argb: 'FFD9E0E8' } }, bottom: { style: 'thin', color: { argb: 'FFD9E0E8' } }, right: { style: 'thin', color: { argb: 'FFD9E0E8' } } };

function displayText(value) {
  if (value instanceof Date) return '00/00/0000';
  if (value && typeof value === 'object') return displayText(value.result ?? value.text ?? value.richText?.map(part => part.text).join('') ?? '');
  return String(value ?? '');
}

function longestLine(value) {
  return displayText(value).split(/\r?\n/).reduce((max, line) => Math.max(max, [...line].length), 0);
}

function fitAndBorder(worksheet, lastRow, columnCount, options = {}) {
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    let lines = 1;
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      cell.border = border;
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      const width = options.widthForCell?.(rowNumber, column) ?? worksheet.getColumn(column).width;
      const usableWidth = Math.max(1, width - 2);
      const cellLines = displayText(cell.value).split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / usableWidth)), 0);
      lines = Math.max(lines, cellLines);
    }
    row.height = Math.min(409, Math.max(options.minHeight?.(rowNumber) ?? 24, lines * 16 + 8));
  }
}

module.exports = { longestLine, fitAndBorder };
