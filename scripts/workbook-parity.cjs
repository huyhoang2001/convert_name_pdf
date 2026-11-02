const ExcelJS = require('exceljs');
const translationHeaders = [
  'Số thứ tự / số chứng thực',
  'Ngày tháng năm chứng thực',
  'Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế',
  'Tên của giấy tờ, văn bản đã được dịch',
  'Dịch từ tiếng sang tiếng',
  'Họ tên, chức danh người ký chứng thực',
  'Số lượng bản dịch đã được chứng thực chữ ký',
  'Phí chứng thực',
  'Ghi chú',
];

async function main() {
  const [mode, file] = process.argv.slice(2);
  const book = new ExcelJS.Workbook();
  if (mode === 'create') {
    const cover = book.addWorksheet('Cover');
    cover.getCell('A1').value = 'Keep me';
    cover.getCell('A1').font = { bold: true, color: { argb: 'FFFF0000' } };
    cover.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    cover.getCell('B1').value = { formula: '1+2', result: 3 };
    cover.mergeCells('A3:B3');
    cover.getCell('A3').value = 'Merged';
    await cover.protect('pass');
    const register = book.addWorksheet('2026');
    register.addRow(translationHeaders);
    register.addRow([1, new Date(2026, 10, 1), 'First person', 'Document', 'EN / VI', 'Signer', 2, 10000, 'Note']);
    register.getCell('B2').numFmt = 'm/d/yyyy';
    await book.xlsx.writeFile(file);
  } else if (mode === 'compare') {
    await book.xlsx.readFile(file);
    const cover = book.getWorksheet('Cover');
    const register = book.getWorksheet('2026');
    if (!cover || !register) throw Error('Missing sheet');
    if (cover.getCell('A1').value !== 'Keep me' || !cover.getCell('A1').font.bold) throw Error('Cover value or font changed');
    if (cover.getCell('A1').font.color?.argb !== 'FFFF0000') throw Error('Cover font color changed');
    if (cover.getCell('A1').fill.fgColor?.argb !== 'FFFFFF00') throw Error('Cover fill changed');
    if (cover.getCell('B1').value?.formula !== '1+2') throw Error('Cover formula changed');
    if (cover.getCell('A3').value !== 'Merged' || cover.getCell('B3').master.address !== 'A3') throw Error('Cover merge changed');
    if (!cover.sheetProtection?.sheet) throw Error('Cover protection changed');
    if (register.getCell('C2').value !== 'Second person') throw Error('Register edit missing');
  } else throw Error('Expected create or compare');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
