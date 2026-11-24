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
      const minimumCore = component === 'frontend' ? ['--core', '3.0.5'] : [];
      assert.equal(run('pack', '--component', component, '--input', input, '--output', output, '--key', join(keys, 'test-private.pem'), ...minimumCore).status, 0);
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
    assert.equal(run('pack', '--component', 'frontend', '--input', frontend, '--output', incompatible, '--key', join(keys, 'test-private.pem'), '--core', 'not-a-version').status, 0);
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
      '--release-id', 'frontend-v3.0.1', '--core', '3.0.5', '--previous-catalog', previousCatalog);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const currentCatalog = join(currentDir, 'catalog.json');
    result = run('catalog', '--packages', newFrontend, '--previous-catalog', previousCatalog, '--output', currentCatalog,
      '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.1');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const catalog = JSON.parse(await readFile(currentCatalog, 'utf8'));
    assert.equal(catalog.sequence, 2);
    assert.deepEqual(catalog.packages.map(item => [item.component, item.version, item.sequence]), [['wordcraft', '3.0.0', 1], ['frontend', '3.0.1', 2]]);
    assert.equal(catalog.packages.find(item => item.component === 'frontend').requires.core, '3.0.5');
    result = run('verify-catalog', '--catalog', currentCatalog, '--key', join(keys, 'test-public.pem'), '--key-id', 'release-test', '--packages-dir', packages);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await writeFile(join(currentDir, 'catalog.sig'), 'invalid\n');
    assert.notEqual(run('catalog', '--packages', newFrontend, '--previous-catalog', previousCatalog, '--previous-signature', join(currentDir, 'catalog.sig'), '--output', join(root, 'bad.json'), '--key', join(keys, 'test-private.pem'), '--key-id', 'release-test', '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.1').status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('revision catalogs keep a legacy Core path while newer clients receive mixed updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'b6h-hotfix-catalog-test-'));
  const run = (...args) => spawnSync(process.execPath, ['scripts/update-package.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8' });
  const keyId = 'release-test';
  const key = join(root, 'keys', 'test-private.pem');
  const publicKey = join(root, 'keys', 'test-public.pem');
  const baseUrl = 'https://github.com/example/repo/releases/download/v3.0.4.0001';
  try {
    const input = join(root, 'input'); const previous = join(root, 'previous'); const next = join(root, 'next');
    await Promise.all([mkdir(input), mkdir(previous), mkdir(next)]);
    await writeFile(join(input, 'b6h.exe'), 'test setup bytes');
    assert.equal(run('keygen', '--dir', join(root, 'keys')).status, 0);
    const pack = (component, version, releaseId, minimumCore, prior) => {
      const output = join(input, `${component}-${version}.b6hupdate`);
      const result = run('pack', '--component', component, '--input', join(root, 'payload'), '--output', output,
        '--key', key, '--key-id', keyId, '--channel', 'stable', '--version', version,
        '--release-id', releaseId, '--core', minimumCore, ...(prior ? ['--previous-catalog', prior] : []));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return output;
    };
    const payload = join(root, 'payload');
    await mkdir(payload);
    await writeFile(join(payload, 'Setup.exe'), 'test setup bytes');
    const oldFrontend = pack('frontend', '3.0.4', 'frontend-v3.0.4', '3.0.4');
    const oldCatalog = join(previous, 'catalog.json');
    let result = run('catalog', '--packages', oldFrontend, '--output', oldCatalog, '--key', key,
      '--key-id', keyId, '--channel', 'stable', '--base-url', 'https://github.com/example/repo/releases/download/v3.0.4');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const compatibleFrontend = join(input, 'frontend-compatible.b6hupdate');
    result = run('pack', '--component', 'frontend', '--input', payload, '--output', compatibleFrontend,
      '--key', key, '--key-id', keyId, '--channel', 'stable', '--version', '3.0.7',
      '--release-id', 'frontend-v3.0.4.0001', '--core', '3.0.4', '--previous-catalog', oldCatalog);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const frontendOnly = join(root, 'frontend-only');
    await mkdir(frontendOnly);
    result = run('catalog', '--packages', compatibleFrontend, '--previous-catalog', oldCatalog,
      '--previous-signature', join(previous, 'catalog.sig'), '--output', join(frontendOnly, 'catalog.json'),
      '--key', key, '--key-id', keyId, '--channel', 'stable', '--base-url', baseUrl);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const frontendOnlyCatalog = JSON.parse(await readFile(join(frontendOnly, 'catalog.json')));
    assert.deepEqual(frontendOnlyCatalog.packages.map(item => [item.component, item.requires.core]), [['frontend', '3.0.4']]);
    result = run('verify-catalog', '--catalog', join(frontendOnly, 'catalog.json'), '--key', publicKey, '--key-id', keyId, '--packages-dir', input);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const wordcraft = pack('wordcraft', '3.0.1', 'wordcraft-v3.0.4.0001', '3.0.4');
    const wordcraftOnly = join(root, 'wordcraft-only');
    await mkdir(wordcraftOnly);
    result = run('catalog', '--packages', wordcraft, '--previous-catalog', oldCatalog,
      '--previous-signature', join(previous, 'catalog.sig'), '--output', join(wordcraftOnly, 'catalog.json'),
      '--key', key, '--key-id', keyId, '--channel', 'stable', '--base-url', baseUrl);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(wordcraftOnly, 'catalog.json'))).packages.map(item => item.component), ['frontend', 'wordcraft']);
    result = run('verify-catalog', '--catalog', join(wordcraftOnly, 'catalog.json'), '--key', publicKey, '--key-id', keyId, '--packages-dir', input);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const core = pack('core', '3.0.7', 'core-v3.0.4.0001', '3.0.4');
    const frontend = pack('frontend', '3.0.7', 'frontend-v3.0.4.0001', '3.0.7', oldCatalog);
    assert.notEqual(run('pack', '--component', 'frontend', '--input', payload, '--output', join(root, 'invalid.b6hupdate'),
      '--key', key, '--key-id', keyId, '--channel', 'stable', '--version', '3.0.7', '--release-id', 'frontend-v3.0.4.0000').status, 0);
    const shared = ['--previous-catalog', oldCatalog, '--previous-signature', join(previous, 'catalog.sig'), '--key', key,
      '--key-id', keyId, '--channel', 'stable', '--base-url', baseUrl];
    result = run('catalog', '--packages', core, ...shared, '--output', join(next, 'catalog.json'));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    result = run('catalog', '--packages', `${core},${frontend}`, ...shared, '--sequence', '3', '--output', join(next, 'catalog-v2.json'));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const legacy = JSON.parse(await readFile(join(next, 'catalog.json')));
    const full = JSON.parse(await readFile(join(next, 'catalog-v2.json')));
    assert.equal(legacy.sequence, 2);
    assert.equal(full.sequence, 3);
    assert.deepEqual(legacy.packages.map(item => [item.component, item.version, item.requires.core]), [['frontend', '3.0.4', '3.0.4'], ['core', '3.0.7', '3.0.4']]);
    assert.deepEqual(full.packages.map(item => [item.component, item.version, item.requires.core]), [['core', '3.0.7', '3.0.4'], ['frontend', '3.0.7', '3.0.7']]);
    assert.equal(legacy.packages.every(item => item.requires.core <= '3.0.4'), true);
    const shipped = spawnSync('git', ['show', 'v3.0.4:src-tauri/src/modular_update.rs'], { encoding: 'utf8' });
    assert.equal(shipped.status, 0, shipped.stderr);
    assert.match(shipped.stdout, /releases\/latest/);
    assert.match(shipped.stdout, /asset\("catalog\.json"\)/);
    assert.match(shipped.stdout, /asset\("catalog\.sig"\)/);
    assert.match(shipped.stdout, /core_satisfies\(CORE_VERSION,\s*&package\.requires\.core\)/);
    assert.match(shipped.stdout, /fn version_cmp\([^]*?semver::Version::parse\(left\)/);
    assert.match(shipped.stdout, /struct Catalog \{[^]*?schema_version: u8/);
    assert.ok(legacy.packages.every(item => /^\d+\.\d+\.\d+$/.test(item.version) && /^\d+\.\d+\.\d+$/.test(item.requires.core)));
    for (const name of ['catalog.json', 'catalog-v2.json']) {
      result = run('verify-catalog', '--catalog', join(next, name), '--key', publicKey, '--key-id', keyId, '--packages-dir', input);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
