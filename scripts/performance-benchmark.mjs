import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';

const require = createRequire(new URL('../package.json', import.meta.url));
const ExcelJS = require('exceljs');
const endpoint = process.env.B6H_CDP_URL || 'http://127.0.0.1:9222';
const root = await mkdtemp(join(tmpdir(), 'b6h-perf-bench-'));
const samples = 5;

const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && /(?:localhost:5175|tauri\.localhost)\//.test(item.url));
if (!page) throw Error(`Tauri WebView is unavailable at ${endpoint}; run npm.cmd run dev with remote debugging enabled.`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const [resolve, reject, label] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails) reject(Error(`${label}: ${JSON.stringify(message.error || message.result.exceptionDetails)}`));
  else resolve(message.result.result?.value ?? message.result);
};
const evaluate = expression => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, [resolve, reject, expression.slice(0, 100)]);
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
});
const call = (method, ...args) => evaluate(`window.pdfApp[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const invoke = (command, args) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], ...(sorted.length >= 20 ? { p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] } : {}), minMs: sorted[0], maxMs: sorted.at(-1), runs: values.length };
};
const measure = async action => {
  await action();
  const values = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    await action();
    values.push(performance.now() - start);
  }
  return summarize(values);
};

try {
  const pdf = {};
  for (const count of [100, 1_000, 10_000]) {
    const folder = join(root, `pdf-${count}`);
    await mkdir(folder);
    for (let start = 1; start <= count; start += 500) {
      await Promise.all(Array.from({ length: Math.min(500, count - start + 1) }, (_, offset) => {
        const number = start + offset;
        return writeFile(join(folder, `Case_${String(number).padStart(5, '0')}.pdf`), '%PDF-1.4\nsynthetic\n');
      }));
    }
    pdf[count] = await measure(async () => {
      const result = await call('scan', folder);
      if (result.groups.reduce((total, group) => total + group.pdfCount, 0) !== count) throw Error(`PDF scan returned the wrong count for ${count} files.`);
    });
  }

  const headers = [
    'Serial / certification number', 'Certification date',
    'Full name and number of Citizen Identity Card/Identity Card/Electronic Identity/Certificate of Identity or Passport/immigration or international travel document',
    'Translated document name', 'Translated from / to', 'Certifying signer and title',
    'Number of certified translated copies', 'Certification fee', 'Notes',
  ];
  const workbook = {};
  for (const count of [100, 1_000, 10_000]) {
    const file = join(root, `translation-${count}.xlsx`);
    const book = new ExcelJS.Workbook();
    const cover = book.addWorksheet('Cover');
    cover.getCell('A1').value = 'Keep me';
    cover.getCell('A1').font = { bold: true, color: { argb: 'FFFF0000' } };
    cover.getCell('B1').value = { formula: '1+2', result: 3 };
    cover.mergeCells('A3:B3');
    cover.getCell('A3').value = 'Merged';
    const register = book.addWorksheet('Register');
    register.addRow(headers);
    // Keep data sparse across a wide sheet to exercise empty-cell scans.
    register.getCell(220, 1).value = 'Unused far column';
    for (let row = 1; row <= count; row++) register.addRow([row, new Date(2026, 10, 1), `Person ${row}`, `Document ${row}`, 'VI - EN', 'Signer', 2, 10000, `Note ${row}`]);
    await book.xlsx.writeFile(file);
    const importWorkbook = () => invoke('import_translation_workbook', { file });
    workbook[count] = await measure(async () => {
      const result = await importWorkbook();
      if (result.sheets[0]?.rows.length !== count) throw Error(`Workbook import returned the wrong row count for ${count} rows.`);
    });
    if (count === 1_000) {
      const input = await importWorkbook();
      workbook.save1000 = await measure(() => call('saveTranslationWorkbook', input));
      const saved = new ExcelJS.Workbook();
      await saved.xlsx.readFile(file);
      if (saved.getWorksheet('Cover').getCell('B1').value?.formula !== '1+2' || saved.getWorksheet('Cover').getCell('B3').master.address !== 'A3') throw Error('Workbook save changed the unrelated formula or merge fixture.');
    }
  }
  console.log(JSON.stringify({ runsPerWorkload: samples, pdfScan: pdf, xlsxImport: workbook }, null, 2));
} finally {
  socket.close();
  const temp = resolve(tmpdir()), target = resolve(root);
  if (target.startsWith(`${temp}${sep}`) && basename(target).startsWith('b6h-perf-bench-')) await rm(target, { recursive: true, force: true });
}
