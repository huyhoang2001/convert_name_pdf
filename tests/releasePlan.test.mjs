import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyChangedPaths, compareVersions, nextPatch, resolvePlanBase, selectLatestPublishedReleaseTag, standardVersionAllowed, updateUiKnowledgeVersion } from '../scripts/release-plan.mjs';

const inputs = version => ({
  package: { version, dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^6.0.0' }, scripts: { 'release:prepare': 'node scripts/release-plan.mjs prepare' } },
  packageLock: { version, packages: { '': { version }, 'node_modules/react': { version: '19.0.0' } } },
  cargo: '[package]\nname = "b6h"\nversion = "' + version + '"\n\n[dependencies]\nserde = "1"\n',
  cargoLock: '[[package]]\nname = "b6h"\nversion = "' + version + '"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n',
  tauri: { version, productName: 'B6H' },
});

test('release planner ignores version-only and release-tool changes', () => {
  const before = inputs('3.0.2');
  const after = inputs('3.0.3');
  before.packageLock.packages['node_modules/@tauri-apps/cli'] = { version: '2.5.0' };
  after.packageLock.packages['node_modules/@tauri-apps/cli'] = { version: '2.5.0' };
  after.cargo = after.cargo.replace(/\n/g, '\r\n');
  after.cargoLock = after.cargoLock.replace(/\n/g, '\r\n');
  assert.deepEqual(classifyChangedPaths(['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'scripts/release-plan.mjs'], before, after), []);
});

test('release planner maps changed runtime inputs to their components', () => {
  assert.deepEqual(classifyChangedPaths(['src/UpdateManager.tsx', 'src-tauri/src/modular_update.rs', 'public/wordcraft/index.html'], inputs('3.0.2'), inputs('3.0.2')), ['frontend', 'core', 'wordcraft']);
  assert.deepEqual(classifyChangedPaths(['public/logo.png', 'src-tauri/capabilities/default.json', 'scripts/prepare-frontend-update.mjs', 'scripts/build-update-runner.mjs'], inputs('3.0.2'), inputs('3.0.2')), ['frontend', 'core']);
  assert.deepEqual(classifyChangedPaths(['src-tauri/frontend-version.txt', 'src-tauri/wordcraft-version.txt'], inputs('3.0.2'), inputs('3.0.3')), []);
});

test('incremental routes keep unaffected components out of the build plan', async () => {
  const before = inputs('3.0.4'); const after = inputs('3.0.4');
  for (const [paths, expected] of [
    [['src/style.css'], ['frontend']],
    [['src-tauri/src/modular_update.rs'], ['core']],
    [['public/wordcraft/wordcraft_bg.wasm'], ['wordcraft']],
    [['src/UpdateManager.tsx', 'src-tauri/src/modular_update.rs'], ['frontend', 'core']],
  ]) assert.deepEqual(classifyChangedPaths(paths, before, after), expected);
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(scripts['build:frontend-update'], /cargo|tauri build|wordcraft|nsis/i);
});

test('release planner recognizes dependency changes and increments an unused maintenance version', () => {
  const before = inputs('3.0.2');
  const after = inputs('3.0.2');
  after.cargo = after.cargo.replace('serde = "1"', 'serde = "2"');
  assert.deepEqual(classifyChangedPaths(['src-tauri/Cargo.toml'], before, after), ['core']);
  assert.equal(compareVersions('3.0.9', '3.0.10'), -1);
  assert.equal(nextPatch('3.0.2', ['v3.0.2', 'v3.0.4']), '3.0.5');
});

test('main release may use an unused already prepared native version without renumbering builds', () => {
  const previous = ['3.0.4', '3.0.4'];
  const native = { frontend: '3.0.7', core: '3.0.7' };
  assert.equal(standardVersionAllowed('3.0.7', 'v3.0.4', ['v3.0.4'], previous, native), true);
  assert.equal(standardVersionAllowed('3.0.7', 'v3.0.4', ['v3.0.4', 'v3.0.7'], previous, native), false);
  assert.equal(standardVersionAllowed('3.0.7', 'v3.0.4', ['v3.0.4'], previous, { ...native, core: '3.0.6' }), false);
  assert.equal(standardVersionAllowed('3.0.8', 'v3.0.4', ['v3.0.4'], previous, native), false);
});

test('release preparation baseline ignores local tags without a published stable release', () => {
  const releases = [
    { tag_name: 'v3.0.5', draft: true, prerelease: false, published_at: null, assets: [] },
    { tag_name: 'v3.0.4', draft: false, prerelease: false, published_at: '2026-11-23T15:41:05Z', assets: [{ name: 'catalog.json' }, { name: 'catalog.sig' }] },
    { tag_name: 'v3.0.6-rc.1', draft: false, prerelease: true, published_at: '2026-11-24T00:00:00Z', assets: [{ name: 'catalog.json' }, { name: 'catalog.sig' }] },
  ];
  assert.equal(selectLatestPublishedReleaseTag(releases), 'v3.0.4');
});

test('published revision supersedes local-only standard tags', () => {
  const signed = [{ name: 'catalog.json' }, { name: 'catalog.sig' }];
  assert.equal(selectLatestPublishedReleaseTag([
    { tag_name: 'v3.0.6', draft: true, prerelease: false, published_at: null, assets: [] },
    { tag_name: 'v3.0.4.0001', draft: false, prerelease: false, published_at: '2026-11-24T00:00:00Z', assets: signed },
    { tag_name: 'v3.0.4', draft: false, prerelease: false, published_at: '2026-11-23T15:41:05Z', assets: signed },
  ]), 'v3.0.4.0001');
});

test('release plan defaults to the published baseline instead of the nearest local tag', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([
    { tag_name: 'v3.0.4', draft: false, prerelease: false, published_at: '2026-11-23T15:41:05Z', assets: [{ name: 'catalog.json' }, { name: 'catalog.sig' }] },
    { tag_name: 'v2.0.25', draft: false, prerelease: false, published_at: '2025-01-01T00:00:00Z', assets: [{ name: 'catalog.json' }, { name: 'catalog.sig' }] },
  ]), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(await resolvePlanBase(), 'v3.0.4');
});

test('release preparation updates only the UI knowledge version field', () => {
  const source = '{\n  "appVersion": "3.0.3",\n  "entries": [{"id":"keep-formatting"}]\n}\n';
  const updated = updateUiKnowledgeVersion(source, '3.0.4');
  assert.equal(updated, source.replace('3.0.3', '3.0.4'));
  assert.equal(updateUiKnowledgeVersion(updated, '3.0.4'), updated);
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

test('production Frontend packages declare the planned minimum Core version', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\$frontendMinimumCore = if \(\$env:B6H_CORE_CHANGED -eq 'true'\) \{ \$env:B6H_CORE_VERSION \} else \{ \$env:B6H_PREVIOUS_CORE_VERSION \}/);
  assert.match(workflow, /pack --component frontend[^\r\n]*--core \$frontendMinimumCore/);
  assert.match(workflow, /\$legacyPackages = @\(\$packages \| Where-Object \{[^]*?\$frontendMinimumCore -le \[version\]\$env:B6H_BASE_VERSION/);
  assert.match(workflow, /\$needsFullCatalog = \$env:B6H_REVISION -ne '0' -or \$legacyPackages\.Count -ne \$packages\.Count/);
  assert.match(workflow, /B6H_EXPECTED_COMPONENTS: \$\{\{ steps\.assets\.outputs\.legacyComponents \}\}/);
  assert.ok(workflow.indexOf('Build Core and lightweight installer when changed') < workflow.indexOf('Build Frontend payload when changed'));
  assert.match(workflow, /Get-Item -LiteralPath "src-tauri\/target\/x86_64-pc-windows-msvc\/release\/bundle\/nsis\/B6H_\$\(\$env:B6H_CORE_VERSION\)_x64-setup\.exe"/);
});

test('four-part production candidates stop before package signing until legacy activation is verified', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const gate = workflow.indexOf('Revision packaging is blocked until shipped base-version discovery and activation have been verified.');
  const signing = workflow.indexOf('Prepare signed packages, catalog, and installer assets');
  assert.ok(gate > 0 && gate < signing);
  assert.match(workflow, /catalog-v2\.json/);
  assert.match(workflow, /catalog-v2\.sig/);
});
