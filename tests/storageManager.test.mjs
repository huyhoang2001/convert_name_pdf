import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMessageKey, storageSelectors } from '../src/storageSelectors.ts';
import en from '../src/locales/en.json' with { type: 'json' };
import vi from '../src/locales/vi.json' with { type: 'json' };

test('Storage Manager lists all six selectors, Copies first', () => {
  assert.deepEqual(storageSelectors.map(item => item.id), ['copies', 'count', 'rename', 'signature', 'translation', 'word']);
});

test('only Rename PDFs exposes persisted Backup and Output fields', () => {
  for (const item of storageSelectors) {
    assert.deepEqual(item.fields.map(([kind]) => kind), item.id === 'rename' ? ['backup', 'output'] : []);
  }
});

test('every Storage Manager label exists in English and Vietnamese', () => {
  const keys = [...storageSelectors.flatMap(item => [item.label, item.note, ...item.fields.map(([, key]) => key)]), ...Object.values(checkMessageKey), 'storageManager', 'storageChoose', 'storageOpen', 'storageCheck', 'storageReset', 'storageCurrentPath', 'storageResultPath', 'storageNotChecked'];
  for (const key of keys) assert.ok(en[key] && vi[key], key);
});

test('Rename PDF storage cards use the specified Vietnamese labels and descriptions', () => {
  assert.equal(vi.backupFolder, 'Thư mục sao lưu');
  assert.equal(vi.storageBackupDesc, 'Lưu giữ bản sao nguyên trạng của tệp gốc trước khi đổi tên.');
  assert.equal(vi.outputFolder, 'Thư mục kết quả');
  assert.equal(vi.storageOutputDesc, 'Vị trí xuất tự động các tệp PDF đã hoàn tất quy trình đổi tên.');
  assert.equal(vi.storageCurrentPath, 'ĐƯỜNG DẪN LƯU TRỮ HIỆN TẠI:');
  assert.equal(vi.storageResultPath, 'ĐƯỜNG DẪN XUẤT KẾT QUẢ:');
});

