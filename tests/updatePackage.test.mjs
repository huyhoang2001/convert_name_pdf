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
    const emptyDir = join(root, 'empty-stable');
    await mkdir(emptyDir);
    const emptyCatalog = join(emptyDir, 'catalog.json');
    assert.equal(run('catalog', '--empty', '--output', emptyCatalog, '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.0').status, 0);
    const emptyBytes = await readFile(emptyCatalog);
    const emptySignature = Buffer.from((await readFile(join(emptyDir, 'catalog.sig'), 'utf8')).trim(), 'base64');
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

test('stable catalogs retain unchanged signed components and advance package and catalog sequences', async () => {
  const root = await mkdtemp(join(tmpdir(), 'b6h-release-catalog-test-'));
  const run = (...args) => spawnSync(process.execPath, ['scripts/update-package.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8' });
  try {
    const keys = join(root, 'keys'); const input = join(root, 'input'); const packages = join(root, 'packages');
    const previousDir = join(root, 'previous'); const currentDir = join(root, 'current');
    await Promise.all([mkdir(input), mkdir(packages), mkdir(previousDir), mkdir(currentDir)]);
    await writeFile(join(input, 'index.html'), '<main>stable UI</main>');
    await writeFile(join(input, 'runtime.js'), 'globalThis.runtime = true;');
    assert.equal(run('keygen', '--dir', keys).status, 0);
    const pack = (component, version, inputName, releaseId) => {
      const output = join(packages, `${component}-v${version}.b6hupdate`);
      const result = run('pack', '--component', component, '--input', join(input, inputName), '--output', output,
        '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--version', version,
        '--release-id', releaseId, '--core', '3.0.0');
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return output;
    };
    const frontend0 = join(input, 'frontend'); const wordcraft = join(input, 'wordcraft');
    await Promise.all([mkdir(frontend0), mkdir(wordcraft)]);
    await writeFile(join(frontend0, 'index.html'), '<main>old frontend</main>');
    await writeFile(join(wordcraft, 'runtime.js'), 'globalThis.wordcraft = true;');
    const oldFrontend = pack('frontend', '3.0.0', 'frontend', 'frontend-v3.0.0');
    const oldWordcraft = pack('wordcraft', '3.0.0', 'wordcraft', 'wordcraft-v3.0.0');
    const previousCatalog = join(previousDir, 'catalog.json');
    let result = run('catalog', '--packages', `${oldFrontend},${oldWordcraft}`, '--output', previousCatalog,
      '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.0');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const frontend1 = join(input, 'frontend-v3.0.1');
    await mkdir(frontend1);
    await writeFile(join(frontend1, 'index.html'), '<main>new frontend</main>');
    const newFrontend = join(packages, 'frontend-v3.0.1.b6hupdate');
    result = run('pack', '--component', 'frontend', '--input', frontend1, '--output', newFrontend,
      '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--version', '3.0.1',
      '--release-id', 'frontend-v3.0.1', '--core', '3.0.0', '--previous-catalog', previousCatalog);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const currentCatalog = join(currentDir, 'catalog.json');
    result = run('catalog', '--packages', newFrontend, '--previous-catalog', previousCatalog, '--output', currentCatalog,
      '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.1');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const catalog = JSON.parse(await readFile(currentCatalog, 'utf8'));
    assert.equal(catalog.sequence, 2);
    assert.deepEqual(catalog.packages.map(item => [item.component, item.version, item.sequence]), [['wordcraft', '3.0.0', 1], ['frontend', '3.0.1', 2]]);
    result = run('verify-catalog', '--catalog', currentCatalog, '--key', join(keys, 'test-public.pem'), '--key-id', 'release-test', '--packages-dir', packages);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await writeFile(join(currentDir, 'catalog.sig'), 'invalid\n');
    assert.notEqual(run('catalog', '--packages', newFrontend, '--previous-catalog', previousCatalog, '--previous-signature', join(currentDir, 'catalog.sig'), '--output', join(root, 'bad.json'), '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.1').status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
