import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyChangedPaths, compareVersions, nextPatch, updateUiKnowledgeVersion } from '../scripts/release-plan.mjs';

const inputs = version => ({
  package: { version, dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^6.0.0' }, scripts: { 'release:prepare': 'node scripts/release-plan.mjs prepare' } },
  packageLock: { version, packages: { '': { version }, 'node_modules/react': { version: '19.0.0' } } },
  cargo: '[package]\nname = "b6h"\nversion = "' + version + '"\n\n[dependencies]\nserde = "1"\n',
  cargoLock: '[[package]]\nname = "b6h"\nversion = "' + version + '"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n',
  tauri: { version, productName: 'B6H' },
});

test('release planner ignores version-only and release-tool changes', () => {
  assert.deepEqual(classifyChangedPaths(['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'scripts/release-plan.mjs'], inputs('3.0.2'), inputs('3.0.3')), []);
});

test('release planner maps changed runtime inputs to their components', () => {
  assert.deepEqual(classifyChangedPaths(['src/UpdateManager.tsx', 'src-tauri/src/modular_update.rs', 'public/wordcraft/index.html'], inputs('3.0.2'), inputs('3.0.2')), ['frontend', 'core', 'wordcraft']);
  assert.deepEqual(classifyChangedPaths(['public/logo.png', 'src-tauri/capabilities/default.json', 'scripts/prepare-frontend-update.mjs', 'scripts/build-update-runner.mjs'], inputs('3.0.2'), inputs('3.0.2')), ['frontend', 'core']);
  assert.deepEqual(classifyChangedPaths(['src-tauri/frontend-version.txt', 'src-tauri/wordcraft-version.txt'], inputs('3.0.2'), inputs('3.0.3')), []);
});

test('release planner recognizes dependency changes and increments an unused maintenance version', () => {
  const before = inputs('3.0.2');
  const after = inputs('3.0.2');
  after.cargo = after.cargo.replace('serde = "1"', 'serde = "2"');
  assert.deepEqual(classifyChangedPaths(['src-tauri/Cargo.toml'], before, after), ['core']);
  assert.equal(compareVersions('3.0.9', '3.0.10'), -1);
  assert.equal(nextPatch('3.0.2', ['v3.0.2', 'v3.0.4']), '3.0.5');
});

test('release preparation updates only the UI knowledge version field', () => {
  const source = '{\n  "appVersion": "3.0.3",\n  "entries": [{"id":"keep-formatting"}]\n}\n';
  const updated = updateUiKnowledgeVersion(source, '3.0.4');
  assert.equal(updated, source.replace('3.0.3', '3.0.4'));
  assert.deepEqual(JSON.parse(updated), { appVersion: '3.0.4', entries: [{ id: 'keep-formatting' }] });
});

test('production release signing requires explicit manual authorization on a version tag', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /authorize_production_signing:\r?\n\s+description:/);
  assert.match(workflow, /required: true\r?\n\s+default: false\r?\n\s+type: boolean/);
  assert.match(workflow, /if: \$\{\{ inputs\.authorize_production_signing == true && startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}/);
  assert.match(workflow, /environment: b6h-production-release/);
  assert.match(workflow, /secrets\.B6H_UPDATE_SIGNING_KEY_B64/);
  assert.match(workflow, /release-plan\.mjs verify-key/);
});
