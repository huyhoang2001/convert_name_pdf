import type ExcelJS from 'exceljs';

const duplicateMarker = 'N("B6H_DUPLICATE_STT")=0';

export function applyTranslationExcelRules(sheet: ExcelJS.Worksheet, duplicateNumbers: Set<number>) {
  sheet.eachRow({ includeEmpty: false }, row => row.eachCell(cell => {
    if (typeof cell.value === 'string') cell.value = cell.value.toUpperCase();
    else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
      cell.value = { ...cell.value, richText: cell.value.richText.map(run => ({ ...run, text: run.text.toUpperCase() })) };
    }
  }));

  sheet.removeConditionalFormatting((entry: { rules?: { formulae?: string[] }[] }) => !entry.rules?.some(rule => rule.formulae?.includes(duplicateMarker)));
  const lastColumn = sheet.columnCount;
  const rows = Array.from({ length: Math.max(0, sheet.rowCount - 1) }, (_, index) => index + 2)
    .filter(row => duplicateNumbers.has(Number(sheet.getCell(row, 1).value)));
  if (!lastColumn || !rows.length) return;

  const ranges = rows.map(row => `A${row}:${sheet.getColumn(lastColumn).letter}${row}`).join(' ');
  sheet.addConditionalFormatting({
    ref: ranges,
    rules: [{
      type: 'expression',
      priority: 1,
      formulae: [duplicateMarker],
      style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } },
    }],
  });
}
