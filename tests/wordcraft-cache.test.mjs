import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCache } from '../scripts/wordcraft-cache.mjs';

test('Wordcraft cache report separates incremental candidates from reusable dependency artifacts', async () => {
  const target = await mkdtemp(join(tmpdir(), 'wordcraft-cache-'));
  try {
    await mkdir(join(target, 'debug', 'incremental', 'old-run'), { recursive: true });
    await mkdir(join(target, 'debug', 'deps'), { recursive: true });
    await mkdir(join(target, 'wasm32-unknown-unknown', 'debug', 'incremental', 'wasm-run'), { recursive: true });
    await writeFile(join(target, 'debug', 'incremental', 'old-run', 'cache'), Buffer.alloc(13));
    await writeFile(join(target, 'debug', 'deps', 'libreuse.rlib'), Buffer.alloc(29));
    await writeFile(join(target, 'wasm32-unknown-unknown', 'debug', 'incremental', 'wasm-run', 'cache'), Buffer.alloc(7));
    const report = await scanCache(target);
    assert.equal(report.bytes, 49);
    assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates.reduce((sum, item) => sum + item.bytes, 0), 20);
    assert.ok(report.categories.some(item => item.path === 'debug/deps' && item.bytes === 29));
  } finally { await rm(target, { recursive: true, force: true }); }
});
