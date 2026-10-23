const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const signature = require('../electron/signature.cjs');
const { readWorkbook, saveWorkbook } = require('../electron/signature-workbook.cjs');

test('signature records accept integer counts and grouped numeric fees', () => {
  const record = { id: 'row', date: '', person: '', document: '', certifier: '', copies: '2', fee: '10,000', notes: '' };
  assert.doesNotThrow(() => signature.validate([record]));
  assert.throws(() => signature.validate([{ ...record, copies: '2.5' }]), /whole number/);
  assert.throws(() => signature.validate([{ ...record, fee: '1,00' }]), /whole number/);
});

test('signature register reads template columns, ignores sequence-only rows, and saves back with the template header', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-'));
  const file = path.join(dir, 'register.xlsx');
  try {
    const original = new ExcelJS.Workbook();
    original.addWorksheet('Cover').getCell('A1').value = 'Keep this sheet';
    const register = original.addWorksheet('2026');
    register.addRow(signature.headers);
    register.addRow(['01', new Date(2026, 0, 5), 'First person\nCCCD: 123', 'Passport', 'Notary', '', 10000, '']);
    register.addRow(['02']);
    register.addRow(['03', new Date(2026, 0, 6), 'Second person', 'Authorization', 'Notary', 2, 1000, 'Note']);
    register.getRow(200).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    await original.xlsx.writeFile(file);

    const imported = await readWorkbook(file);
    assert.equal(imported.sheets.length, 1);
    assert.equal(imported.sheets[0].rows.length, 2);
    assert.equal(imported.sheets[0].rows[0].date, '2026-01-05');
    imported.sheets[0].rows.shift();
    await saveWorkbook(file, imported.sheets, imported.sourceMap);

    const saved = new ExcelJS.Workbook();
    await saved.xlsx.readFile(file);
    const savedRegister = saved.getWorksheet('2026');
    assert.equal(saved.getWorksheet('Cover').getCell('A1').value, 'Keep this sheet');
    assert.equal(savedRegister.getCell('C1').value, signature.headers[2]);
    assert.equal(savedRegister.getCell('A2').value, '01');
    assert.equal(savedRegister.getCell('C2').value, 'Second person');
    assert.equal(Object.values(savedRegister.tables)[0].table.style.theme, 'TableStyleLight15');
    assert.equal(savedRegister.getCell('A2').font.name, 'Times New Roman');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
