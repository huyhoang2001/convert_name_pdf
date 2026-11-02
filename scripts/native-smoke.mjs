import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'b6h-native-smoke-'));
const source = join(root, 'source');
const backup = join(root, 'backup');
const output = join(root, 'output');
await Promise.all([mkdir(source), mkdir(backup), mkdir(output)]);
const files = ['A_1.pdf', 'A_3.PDF'];
await Promise.all(files.map((name, index) => writeFile(join(source, name), `disposable PDF ${index}`)));
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const original = await Promise.all(files.map(name => digest(join(source, name))));

const pages = await fetch('http://127.0.0.1:9222/json/list').then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.startsWith('http://localhost:5175/'));
if (!page) throw Error('Tauri development WebView is unavailable');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const [resolve, reject] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails) reject(Error(JSON.stringify(message.error || message.result.exceptionDetails)));
  else resolve(message.result.result.value);
};
const evaluate = expression => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, [resolve, reject]);
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
});
const call = (method, ...args) => evaluate(`window.pdfApp[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const invoke = (command, args) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const assert = (value, message) => { if (!value) throw Error(message); };

try {
  await call('saveLanguage', 'EN');
  assert(await call('getLanguage') === 'EN', 'English settings were not saved');
  await call('saveDestination', 'backup', backup);
  await call('saveDestination', 'output', output);
  const scan = await call('scan', source);
  assert(scan.groups.length === 1 && scan.groups[0].pdfCount === 2, 'PDF scan mismatch');
  const preview = await call('preview', { rootPath: source, mode: 'SINGLE', selectedPrefixes: ['A_'], selectedFileNames: null, newName: 'B_010', language: 'EN' });
  assert(JSON.stringify(preview.mapping.map(item => item.targetFile)) === JSON.stringify(['B_010.pdf', 'B_012.pdf']), 'PDF mapping mismatch');
  assert(JSON.stringify(preview.missing) === JSON.stringify(['B_011']), 'Missing number mismatch');
  const result = await call('run', { token: preview.token });
  assert(result.successes === 2 && result.errors.length === 0, 'PDF copy failed');
  assert((await Promise.all(files.map(name => digest(join(source, name))))).every((value, index) => value === original[index]), 'Source hash changed');
  assert((await readdir(result.backupPath)).length === 2, 'Backup is incomplete');
  assert((await readdir(result.outputPath)).includes('B_012.pdf'), 'Output is incomplete');
  const backupTimes = await Promise.all(files.map(async name => (await stat(join(result.backupPath, name))).birthtimeMs));
  const outputTimes = await Promise.all(['B_010.pdf', 'B_012.pdf'].map(async name => (await stat(join(result.outputPath, name))).birthtimeMs));
  assert(Math.max(...backupTimes) <= Math.min(...outputTimes), 'Output started before Backup completed');
  assert((await call('readReport', result.reportPath)).includes('B_010.pdf'), 'Report is unavailable');
  let tokenRejected = false;
  try { await call('run', { token: preview.token }); } catch { tokenRejected = true; }
  assert(tokenRejected, 'Preview token was reusable');
  const counted = await call('countScan', source);
  assert(counted.groups.length === 1 && counted.groups[0].missing[0] === '2', 'Count scan mismatch');
  const countReport = await call('saveCountReport', source, 'EN');
  assert((await readFile(countReport, 'utf8')).includes('Missing numbers:'), 'Count report failed');
  assert((await call('readReport', countReport)).includes('Missing numbers:'), 'Count report cannot be reopened');
  let unsafeChatRejected = false;
  try { await call('askOnlineChat', [{ role: 'user', content: 'Write a Python script' }], 'EN'); } catch { unsafeChatRejected = true; }
  assert(unsafeChatRejected, 'Unsafe online chat request was accepted');
  const workbook = join(root, 'register.xlsx');
  const parityScript = fileURLToPath(new URL('./workbook-parity.cjs', import.meta.url));
  execFileSync(process.execPath, [parityScript, 'create', workbook]);
  const imported = await invoke('import_translation_workbook', { file: workbook });
  assert(imported.sheets[0].rows[0].person === 'First person', 'Translation workbook import failed');
  imported.sheets[0].rows[0].person = 'Second person';
  await call('saveTranslationWorkbook', imported);
  execFileSync(process.execPath, [parityScript, 'compare', workbook]);
  const signatureFile = join(root, 'signature.xlsx');
  await invoke('new_signature_workbook', { file: signatureFile, sheets: [{ id: 'sig', name: 'Signature', rows: [{ id: 'row', number: '1', date: '2026-11-01', person: 'First signer', document: 'Document', certifier: 'Official', copies: '2', fee: '10000', notes: 'Note' }] }] });
  const signature = await invoke('import_signature_workbook', { file: signatureFile });
  assert(signature.sheets[0].rows[0].person === 'First signer', 'Signature workbook import failed');
  signature.sheets[0].rows[0].person = 'Second signer';
  await call('saveSignatureWorkbook', signature);
  const signatureRefresh = await call('refreshSignatureWorkbook', signatureFile);
  assert(signatureRefresh.sheets[0].rows[0].person === 'Second signer', 'Signature workbook save failed');
  const copiesFile = join(root, 'copies.xlsx');
  await invoke('new_copies_workbook', { file: copiesFile, sheets: [{ id: 'copies', name: 'November', title: 'BẢNG KÊ CHỨNG THỰC BẢN SAO TỪ BẢN CHÍNH - KHÁCH LẺ', address: 'Test address', date: '2026-11-01', rows: [{ id: 'row', refNo: '3487', customer: 'First customer', description: 'Document', quantity: '5', unitPrice: '1' }] }] });
  const copies = await invoke('import_copies_workbook', { file: copiesFile });
  assert(copies.sheets[0].rows[0].customer === 'First customer', 'Copies workbook import failed');
  copies.sheets[0].rows[0].customer = 'Second customer';
  await call('saveCopiesWorkbook', copies);
  const copiesRefresh = await call('refreshCopiesWorkbook', copiesFile);
  assert(copiesRefresh.sheets[0].rows[0].customer === 'Second customer', 'Copies workbook save failed');
  console.log(JSON.stringify({ result: 'passed', source, backupPath: result.backupPath, outputPath: result.outputPath, sourceHashesUnchanged: true, backupBeforeOutput: true, tokenRejected, unsafeChatRejected, reportPath: result.reportPath, workbookParity: true, signatureWorkbook: true, copiesWorkbook: true }));
} finally {
  socket.close();
}
