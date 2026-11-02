import type ExcelJS from 'exceljs';

export function applyRegisterExcelFormatting(sheet: ExcelJS.Worksheet) {
  const maxRow = sheet.actualRowCount;
  const maxColumn = sheet.actualColumnCount;
  const header = sheet.getRow(1);
  for (let column = 1; column <= maxColumn; column++) {
    const dimension = sheet.getColumn(column);
    if ((dimension.width ?? 0) > 40 && header.getCell(column).text.length > 40) dimension.width = 40;
  }
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.font = { ...row.font, size: 14 };
    row.alignment = { ...row.alignment, wrapText: true };
    let lines = 1;
    for (let column = 1; column <= maxColumn; column++) {
      const cell = row.getCell(column);
      const width = sheet.getColumn(column).width ?? 14;
      const text = cell.text;
      lines = Math.max(lines, text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / (width * 1.15))), 0));
    }
    row.height = Math.min(300, Math.max(28, lines * 20 + 8));
  }
}
