const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { readWorkbook, createWorkbook, saveWorkbook, writeWorkbook } = require('../electron/copies-workbook.cjs');
const { headers, title, address, inWords, invoice, supplier, signature, total } = require('../electron/copies.cjs');

test('Copies amount charges 10,000 VND per two copies times the copy multiplier', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(quantity => total({ quantity: String(quantity), unitPrice: '1' })), [10000, 10000, 20000, 20000, 30000]);
  assert.equal(total({ quantity: '10', unitPrice: '2' }), 100000);
  assert.equal(require('../electron/copies.cjs').toInteger('1,000', 'Number of copies'), '1000');
  assert.equal(total({ quantity: '4', unitPrice: '10000', manualTotal: true, totalAmount: '15000' }), 15000);
});

test('Copies import reads the supplied register layout and ignores footer rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copies-import-'));
  const file = path.join(dir, 'source.xlsx');
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cover').getCell('A1').value = 'Keep this';
    const sheet = workbook.addWorksheet('kê 15-08');
    sheet.getCell('A1').value = title; sheet.getCell('A2').value = 'Ngày 15 tháng 08 năm 2026'; sheet.getCell('A4').value = `Địa chỉ: ${address}`;
    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow(['STT', 'SCT', 'Tên khách hàng', 'Nội dung', 'SL', 'Đơn', 'Thành tiền']);
    sheet.addRow([1, 3487, 'Customer A', 'Certified copy', 5, 1, { formula: 'E8*F8', result: 30000 }]);
    sheet.addRow([2, 3488, 'Customer B', 'Passport', 5, '1,000', '5,000']);
    sheet.addRow(['Total for Certified Copies']);
    sheet.addRow(['In words: Eighty thousand VND']);
    await workbook.xlsx.writeFile(file);
    const imported = await readWorkbook(file);
    assert.equal(imported.sheets.length, 1);
    assert.equal(imported.sheets[0].date, '2026-08-15');
    assert.equal(imported.sheets[0].rows.length, 2);
    assert.equal(imported.sheets[0].rows[0].refNo, '3487');
    assert.equal(imported.sheets[0].rows[0].totalAmount, '30000');
    assert.equal(imported.sheets[0].rows[0].manualTotal, false);
    assert.equal(imported.sheets[0].rows[1].unitPrice, '1000');
    assert.equal(imported.sheets[0].rows[1].totalAmount, '25000000');
    assert.equal(imported.sheets[0].rows[1].manualTotal, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Copies create and save write the requested header, automatic numbers, totals, and footer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copies-export-'));
  const file = path.join(dir, 'copies.xlsx');
  try {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Cover').getCell('A1').value = 'Preserved'; await workbook.xlsx.writeFile(file);
    const sheet = { id: 'one', name: 'August', title, address, date: '2026-08-15', rows: [{ id: 'row-1', refNo: '3487', customer: 'Customer A', description: 'Certified copy', quantity: '5', unitPrice: '1' }] };
    await saveWorkbook(file, [sheet], {});
    const output = new ExcelJS.Workbook(); await output.xlsx.readFile(file);
    const saved = output.getWorksheet('August');
    assert.equal(output.getWorksheet('Cover').getCell('A1').value, 'Preserved');
    assert.equal(saved.getCell('A1').value, title);
    assert.equal(saved.getCell('A2').value, 'Ngày 15 tháng 08 năm 2026');
    assert.equal(saved.getCell('A3').value, `Địa chỉ: ${address}`);
    assert.equal(saved.getCell('A4').value, 'Đơn vị tính: VNĐ');
    assert.equal(saved.getCell('A4').alignment.horizontal, 'right');
    assert.equal(saved.getCell('A5').value, headers[0]);
    assert.equal(saved.getCell('A6').value, 1);
    assert.equal(saved.getCell('B6').value, 3487);
    assert.equal(saved.getCell('G6').value, 30000);
    assert.equal(saved.getCell('A7').value, 'Tổng cộng chứng thực bản sao');
    assert.equal(saved.getCell('A7').alignment.horizontal, 'left');
    assert.equal(saved.getCell('G7').result, 30000);
    assert.equal(saved.getCell('A8').value, inWords);
    assert.equal(saved.getCell('A9').value, invoice);
    assert.equal(saved.getCell('D9').value, supplier);
    assert.equal(saved.getCell('D10').value, signature);
    assert.equal(saved.getCell('G6').numFmt, '#,##0');
    assert.equal(Object.values(saved.tables)[0].table.style.theme, 'TableStyleLight15');
    assert.equal((await readWorkbook(file)).sheets[0].date, '2026-08-15');
    const newFile = path.join(dir, 'new.xlsx'); await createWorkbook(newFile, [sheet]);
    const created = new ExcelJS.Workbook(); await created.xlsx.readFile(newFile);
    assert.equal(created.getWorksheet('August').getCell('A1').value, title);
    const emptyFile = path.join(dir, 'empty.xlsx'); await createWorkbook(emptyFile, [{ ...sheet, id: 'empty', name: 'Empty', rows: [] }]);
    const empty = new ExcelJS.Workbook(); await empty.xlsx.readFile(emptyFile);
    assert.equal(empty.getWorksheet('Empty').getCell('A5').value, headers[0]);
    const exportedFile = path.join(dir, 'exported.xlsx');
    assert.equal(await writeWorkbook(exportedFile, [{ ...sheet, id: 'exported', name: 'Exported' }]), exportedFile);
    const exported = new ExcelJS.Workbook(); await exported.xlsx.readFile(exportedFile);
    assert.equal(exported.getWorksheet('Exported').getCell('A8').value, inWords);
    const discountedFile = path.join(dir, 'discounted.xlsx');
    await writeWorkbook(discountedFile, [{ ...sheet, id: 'discounted', name: 'Discounted', rows: [{ ...sheet.rows[0], manualTotal: true, totalAmount: '15000' }] }]);
    const discounted = new ExcelJS.Workbook(); await discounted.xlsx.readFile(discountedFile);
    assert.equal(discounted.getWorksheet('Discounted').getCell('G6').value, 15000);
    const lockedFile = path.join(dir, 'locked.xlsx'); await fs.promises.writeFile(lockedFile, 'keep existing file');
    const originalRename = fs.renameSync;
    try {
      fs.renameSync = (source, destination) => {
        if (destination === lockedFile) { const error = Error('locked'); error.code = 'EPERM'; throw error; }
        return originalRename(source, destination);
      };
      const fallbackFile = await writeWorkbook(lockedFile, [{ ...sheet, id: 'fallback', name: 'Fallback' }]);
      assert.equal(fallbackFile, path.join(dir, 'locked (1).xlsx'));
      assert.equal(fs.readFileSync(lockedFile, 'utf8'), 'keep existing file');
      assert.ok(fs.existsSync(fallbackFile));
    } finally { fs.renameSync = originalRename; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
