import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatUpdateTimestamp } from '../src/updateManagerText.mjs';

test('formats update history in local DD/MM/YYYY HH:mm:ss form', () => {
  const value = '2026-11-19T02:19:25.186552300Z';
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  const expected = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  assert.equal(formatUpdateTimestamp(value), expected);
  assert.equal(formatUpdateTimestamp('not a date'), '');
});

test('Update Manager exposes installed, available, and history sections without manual rollback controls', async () => {
  const source = await readFile(new URL('../src/UpdateManager.tsx', import.meta.url), 'utf8');
  const startup = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(source, /updateInstalledComponents/);
  assert.match(source, /updateAvailable/);
  assert.match(source, /updateHistory/);
  assert.doesNotMatch(source, /updateRollback|rollbackCore|function rollback\(/);
  assert.match(source, /updateReadyToActivate/);
  assert.match(source, /updateEmpty/);
  assert.match(source, /archiveBytes/);
  assert.match(source, /updateCurrentVersion/);
  assert.match(source, /formatBytes\(update\.archiveBytes\)/);
  assert.match(startup, /mark_runtime_ready/);
  assert.match(startup, /b6h-update-ready/);
});

test('Update Manager labels are localized in English and Vietnamese', async () => {
  const [en, vi] = await Promise.all(['en', 'vi'].map(async language => JSON.parse(await readFile(new URL(`../src/locales/${language}.json`, import.meta.url), 'utf8'))));
  for (const key of ['updateInstalledComponents', 'updateAvailable', 'updateStatus', 'updateActive', 'updateEmpty', 'updateHistoryEmpty', 'updateSuccess', 'updateFailed', 'updateHistoryImport', 'updateHistoryActivate', 'updateCurrentVersion', 'updateDownloadSize', 'updateLatestStatus']) {
    assert.ok(en[key], `English label ${key}`);
    assert.ok(vi[key], `Vietnamese label ${key}`);
  }
});
