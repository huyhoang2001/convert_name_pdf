import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import test from 'node:test';

test('signed frontend and Wordcraft snapshots verify offline and reject tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'b6h-update-test-'));
  const run = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/update-package.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  try {
    const keys = join(root, 'keys'); const frontend = join(root, 'frontend'); const wordcraft = join(root, 'wordcraft');
    await mkdir(frontend); await mkdir(wordcraft);
    await writeFile(join(frontend, 'index.html'), '<main>offline UI</main>');
    await writeFile(join(wordcraft, 'runtime.js'), 'globalThis.runtime = true;');
    assert.equal(run('keygen', '--dir', keys).status, 0);
    const packages = [];
    for (const [component, input] of [['frontend', frontend], ['wordcraft', wordcraft]]) {
      const output = join(root, `${component}.b6hupdate`);
      assert.equal(run('pack', '--component', component, '--input', input, '--output', output, '--key', join(keys, 'test-private.pem')).status, 0);
      assert.equal(run('verify', '--package', output, '--key', join(keys, 'test-public.pem')).status, 0);
      packages.push(output);
    }
    const catalog = join(root, 'catalog.json');
    assert.equal(run('catalog', '--packages', packages.join(','), '--output', catalog, '--key', join(keys, 'test-private.pem'), '--base-url', 'https://github.com/example/repo/releases/download/test').status, 0);
    const catalogBytes = await readFile(catalog);
    const catalogSignature = Buffer.from((await readFile(join(root, 'catalog.sig'), 'utf8')).trim(), 'base64');
    assert.equal(verify(null, catalogBytes, createPublicKey(await readFile(join(keys, 'test-public.pem'))), catalogSignature), true);
    const modifiedCatalog = Buffer.from(catalogBytes); modifiedCatalog[0] ^= 1;
    assert.equal(verify(null, modifiedCatalog, createPublicKey(await readFile(join(keys, 'test-public.pem'))), catalogSignature), false);
    assert.notEqual(run('catalog', '--empty', '--output', join(root, 'invalid-stable.json'), '--key', join(keys, 'test-private.pem'), '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.0').status, 0);
    const emptyCatalog = join(root, 'empty-stable.json');
    assert.equal(run('catalog', '--empty', '--output', emptyCatalog, '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.0').status, 0);
    const emptyBytes = await readFile(emptyCatalog);
    const emptySignature = Buffer.from((await readFile(join(root, 'catalog.sig'), 'utf8')).trim(), 'base64');
    assert.equal(verify(null, emptyBytes, createPublicKey(await readFile(join(keys, 'test-public.pem'))), emptySignature), true);
    assert.deepEqual(JSON.parse(emptyBytes).packages, []);
    const incompatible = join(root, 'incompatible.b6hupdate');
    assert.equal(run('pack', '--component', 'frontend', '--input', frontend, '--output', incompatible, '--key', join(keys, 'test-private.pem'), '--core', '2.0.25').status, 0);
    assert.notEqual(run('verify', '--package', incompatible, '--key', join(keys, 'test-public.pem')).status, 0);
    for (const [component, output] of [['frontend', packages[0]], ['wordcraft', packages[1]]]) {
      const archive = unzipSync(await readFile(output)); archive['payload/' + (component === 'frontend' ? 'index.html' : 'runtime.js')][0] ^= 1; await writeFile(output, zipSync(archive));
      assert.notEqual(run('verify', '--package', output, '--key', join(keys, 'test-public.pem')).status, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
