import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintInputs, inventory, matchesInventory, selectAction } from '../scripts/wordcraft-build-state.mjs';

async function withTree(run) {
  const root = await mkdtemp(join(tmpdir(), 'wordcraft-state-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('Wordcraft fingerprint tracks source and patch contents but excludes generated output', async () => {
  await withTree(async root => {
    const source = join(root, 'source');
    const generated = join(source, 'dist');
    const patch = join(root, 'bridge.patch');
    const externalDependency = join(root, 'craft-i18n');
    const bridgeContract = join(root, 'WordcraftEditor.tsx');
    await mkdir(generated, { recursive: true });
    await mkdir(externalDependency);
    await writeFile(join(source, 'Cargo.toml'), 'source-v1');
    await writeFile(join(generated, 'bundle.wasm'), 'output-v1');
    await writeFile(patch, 'patch-v1');
    await writeFile(join(externalDependency, 'language-data.txt'), 'dependency-v1');
    await writeFile(bridgeContract, 'bridge-v1');
    const unrelatedB6hFile = join(root, 'b6h-src.ts');
    await writeFile(unrelatedB6hFile, 'app-v1');
    const recipe = { trunk: '1', command: 'trunk build --release' };
    const first = await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe);
    await writeFile(unrelatedB6hFile, 'app-v2');
    assert.equal(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
    assert.notEqual(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], { ...recipe, trunk: '2' }), first);
    await writeFile(join(generated, 'bundle.wasm'), 'output-v2');
    assert.equal(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
    await writeFile(join(externalDependency, 'language-data.txt'), 'dependency-v2');
    assert.notEqual(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
    await writeFile(join(externalDependency, 'language-data.txt'), 'dependency-v1');
    await writeFile(patch, 'patch-v2');
    assert.notEqual(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
    await writeFile(patch, 'patch-v1');
    await writeFile(bridgeContract, 'bridge-v2');
    assert.notEqual(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
    await writeFile(bridgeContract, 'bridge-v1');
    await writeFile(join(source, 'Cargo.toml'), 'source-v2');
    assert.notEqual(await fingerprintInputs(source, [patch, externalDependency, bridgeContract], recipe), first);
  });
});

test('verified unchanged Wordcraft output is reused, while deployed output allows sync only', () => {
  const manifest = { version: 1, verified: true, inputFingerprint: 'same' };
  assert.equal(selectAction('same', null, true, true), 'UNKNOWN');
  assert.equal(selectAction('same', { ...manifest, verified: false }, true, true), 'UNKNOWN');
  assert.equal(selectAction('same', manifest, true, true), 'REUSE');
  assert.equal(selectAction('same', manifest, false, true), 'SYNC ONLY');
  assert.equal(selectAction('same', manifest, false, false), 'BUILD REQUIRED');
  assert.equal(selectAction('changed', manifest, true, true), 'BUILD REQUIRED');
});

test('output inventory rejects missing and corrupted files', async () => {
  await withTree(async root => {
    await writeFile(join(root, 'wordcraft.js'), 'valid');
    const expected = await inventory(root);
    assert.equal(await matchesInventory(root, expected), true);
    await writeFile(join(root, 'wordcraft.js'), 'corrupt');
    assert.equal(await matchesInventory(root, expected), false);
    await rm(join(root, 'wordcraft.js'));
    assert.equal(await matchesInventory(root, expected), false);
  });
});
