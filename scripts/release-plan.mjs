import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createPublicKey, createPrivateKey } from 'node:crypto';

const root = new URL('../', import.meta.url);
const run = (args, cwd = root) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

export function compareVersions(left, right) {
  const parse = value => {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
    if (!match) throw Error(`Invalid stable version: ${value}`);
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function nextPatch(version, tags = []) {
  const newest = tags.reduce((best, tag) => compareVersions(tag, best) > 0 ? tag : best, version);
  const [major, minor, patch] = newest.replace(/^v/, '').split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

const jsonAt = (ref, path) => JSON.parse(run(['show', `${ref}:${path}`]));
const sameJsonWithout = (left, right, paths) => {
  if (typeof left === 'string' && typeof right === 'string') {
    if (paths[0] === 'cargo') return left.replace(/^version\s*=\s*"[^"]+"/m, 'version = "<version>"') === right.replace(/^version\s*=\s*"[^"]+"/m, 'version = "<version>"');
    if (paths[0] === 'cargo-lock') {
      const normalize = text => text.replace(/(\[\[package\]\]\r?\nname = "b6h"\r?\nversion = ")[^"]+("\r?\n)/, '$1<version>$2');
      return normalize(left) === normalize(right);
    }
  }
  const withoutVersion = (value, path) => {
    const copy = structuredClone(value);
    let node = copy;
    for (const key of path) node = node?.[key];
    if (node && typeof node === 'object') delete node.version;
    return JSON.stringify(copy);
  };
  return withoutVersion(left, paths) === withoutVersion(right, paths);
};

export function classifyChangedPaths(paths, before, after) {
  const components = new Set();
  for (const path of paths) {
    if (path.startsWith('public/wordcraft/') || ['scripts/build-wordcraft.mjs', 'scripts/wordcraft-build-state.mjs', 'scripts/wordcraft-cache.mjs'].includes(path)) components.add('wordcraft');
    else if (path.startsWith('src-tauri/src/') || path.startsWith('src-tauri/update-runner/') || path === 'src-tauri/build.rs' || path.startsWith('src-tauri/icons/') || path === 'scripts/build-update-runner.mjs') components.add('core');
    else if (path === 'scripts/prepare-frontend-update.mjs') components.add('frontend');
    else if (path.startsWith('src/') || path.startsWith('public/') || ['index.html', 'vite.config.ts', 'tsconfig.json'].includes(path)) components.add('frontend');
    else if (path === 'src-tauri/Cargo.toml' || path === 'src-tauri/Cargo.lock') {
      const a = path.endsWith('Cargo.toml') ? before.cargo : before.cargoLock;
      const b = path.endsWith('Cargo.toml') ? after.cargo : after.cargoLock;
      if (!sameJsonWithout(a, b, [path.endsWith('Cargo.toml') ? 'cargo' : 'cargo-lock'])) components.add('core');
    } else if (path === 'src-tauri/tauri.conf.json') {
      if (!sameJsonWithout(before.tauri, after.tauri, [])) components.add('core');
    } else if (path === 'package.json') {
      const frontendInputs = value => ({ dependencies: value.dependencies, devDependencies: value.devDependencies, type: value.type,
        scripts: Object.fromEntries(Object.entries(value.scripts ?? {}).filter(([name]) => ['build', 'web:build', 'build:frontend-update', 'wordcraft:build', 'wordcraft:source-build'].includes(name))) });
      const coreScripts = value => ({ tauriCli: value.devDependencies?.['@tauri-apps/cli'], scripts: Object.fromEntries(Object.entries(value.scripts ?? {}).filter(([name]) => ['web:build', 'build:installer', 'build:update-runner'].includes(name))) });
      if (JSON.stringify(frontendInputs(before.package)) !== JSON.stringify(frontendInputs(after.package))) components.add('frontend');
      if (JSON.stringify(coreScripts(before.package)) !== JSON.stringify(coreScripts(after.package))) components.add('core');
    } else if (path === 'package-lock.json') {
      const clean = value => {
        const copy = structuredClone(value);
        delete copy.version;
        delete copy.packages?.['']?.version;
        return copy;
      };
      if (JSON.stringify(clean(before.packageLock)) !== JSON.stringify(clean(after.packageLock))) components.add('frontend');
      if (JSON.stringify(before.packageLock.packages?.['node_modules/@tauri-apps/cli']) !== JSON.stringify(after.packageLock.packages?.['node_modules/@tauri-apps/cli'])) components.add('core');
    } else if (path.startsWith('src-tauri/') && !['src-tauri/frontend-version.txt', 'src-tauri/wordcraft-version.txt'].includes(path)) components.add('core');
  }
  return ['frontend', 'core', 'wordcraft'].filter(component => components.has(component));
}

async function currentInputs() {
  return {
    package: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
    packageLock: JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')),
    cargo: await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8'),
    cargoLock: await readFile(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8'),
    tauri: JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')),
    frontendVersion: (await readFile(new URL('../src-tauri/frontend-version.txt', import.meta.url), 'utf8')).trim(),
    wordcraftVersion: (await readFile(new URL('../src-tauri/wordcraft-version.txt', import.meta.url), 'utf8')).trim(),
  };
}

async function latestTag() {
  const tag = run(['describe', '--tags', '--abbrev=0', 'HEAD']);
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw Error(`Latest ancestor tag is not a stable B6H version: ${tag}`);
  return tag;
}

async function plan(base, head) {
  const paths = run(['diff', '--name-only', `${base}..${head}`]).split(/\r?\n/).filter(Boolean);
  const before = {
    package: jsonAt(base, 'package.json'),
    packageLock: jsonAt(base, 'package-lock.json'),
    cargo: run(['show', `${base}:src-tauri/Cargo.toml`]),
    cargoLock: run(['show', `${base}:src-tauri/Cargo.lock`]),
    tauri: jsonAt(base, 'src-tauri/tauri.conf.json'),
  };
  const cargo = run(['show', `${head}:src-tauri/Cargo.toml`]);
  const cargoLock = run(['show', `${head}:src-tauri/Cargo.lock`]);
  const after = {
    package: jsonAt(head, 'package.json'),
    packageLock: jsonAt(head, 'package-lock.json'),
    cargo,
    cargoLock,
    tauri: jsonAt(head, 'src-tauri/tauri.conf.json'),
  };
  return { base, head, paths, components: classifyChangedPaths(paths, before, after), packageVersion: after.package.version, coreVersion: /^version\s*=\s*"([^"]+)"/m.exec(after.cargo)?.[1], frontendVersion: run(['show', `${head}:src-tauri/frontend-version.txt`]).trim(), wordcraftVersion: run(['show', `${head}:src-tauri/wordcraft-version.txt`]).trim(), tauriVersion: after.tauri.version };
}

async function prepare() {
  const base = await latestTag();
  const current = await currentInputs();
  const paths = run(['diff', '--name-only', `${base}..HEAD`]).split(/\r?\n/).filter(Boolean);
  const before = {
    package: jsonAt(base, 'package.json'),
    packageLock: jsonAt(base, 'package-lock.json'),
    cargo: run(['show', `${base}:src-tauri/Cargo.toml`]),
    cargoLock: run(['show', `${base}:src-tauri/Cargo.lock`]),
    tauri: jsonAt(base, 'src-tauri/tauri.conf.json'),
  };
  const after = {
    ...current,
    cargo: current.cargo,
    cargoLock: current.cargoLock,
  };
  const components = classifyChangedPaths(paths, before, after);
  if (!components.length) throw Error(`No application component changes since ${base}; no release version was allocated.`);
  const uncommitted = [...run(['diff', '--name-only', 'HEAD']).split(/\r?\n/), ...run(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)].filter(Boolean);
  const uncommittedComponents = classifyChangedPaths(uncommitted, before, after);
  if (uncommittedComponents.length) throw Error(`Commit intended application changes before preparing a release: ${uncommittedComponents.join(', ')}.`);
  const tags = run(['tag', '--list', 'v*']).split(/\r?\n/).filter(tag => /^v\d+\.\d+\.\d+$/.test(tag));
  const version = nextPatch(base, tags);
  const packageText = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const lockText = await readFile(new URL('../package-lock.json', import.meta.url), 'utf8');
  const lockMatch = /(name = "b6h"\r?\nversion = ")[^\"]+("\r?\n)/.exec(current.cargoLock);
  const readmeUrl = new URL('../README.md', import.meta.url);
  const readme = await readFile(readmeUrl, 'utf8');
  if (components.includes('frontend') && (!JSON.parse(packageText).version || !JSON.parse(lockText).packages?.[''])) throw Error('Frontend version metadata is incomplete.');
  if (components.includes('core') && (!/^version\s*=\s*"[^\"]+"/m.test(current.cargo) || !lockMatch)) throw Error('Core version metadata is incomplete.');
  if (!/The current maintenance release is B6H v\d+\.\d+\.\d+\. It includes[^\r\n]*\./.test(readme)) throw Error('Could not locate the README current-release line.');
  const summaries = [...new Set(run(['log', '--no-merges', '--format=%s', `${base}..HEAD`, '--', 'src', 'src-tauri/src', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'public/wordcraft']).split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
  if (!summaries.length) summaries.push(`Maintenance update for ${components.join(', ')}`);
  const updateJson = async (path, change) => {
    const url = new URL(`../${path}`, import.meta.url);
    const value = JSON.parse(await readFile(url, 'utf8'));
    change(value);
    await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
  };
  if (components.includes('frontend')) {
    await updateJson('package.json', value => { value.version = version; });
    await updateJson('package-lock.json', value => {
      value.version = version;
      value.packages[''].version = version;
    });
    await writeFile(new URL('../src-tauri/frontend-version.txt', import.meta.url), version);
  }
  if (components.includes('core')) {
    const manifest = current.cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
    if (manifest === current.cargo) throw Error('Could not update src-tauri/Cargo.toml package version.');
    await writeFile(new URL('../src-tauri/Cargo.toml', import.meta.url), manifest);
    const lock = current.cargoLock.replace(/(name = "b6h"\r?\nversion = ")[^"]+("\r?\n)/, `$1${version}$2`);
    if (lock === current.cargoLock) throw Error('Could not update the b6h entry in src-tauri/Cargo.lock.');
    await writeFile(new URL('../src-tauri/Cargo.lock', import.meta.url), lock);
    const tauriUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
    const tauri = await readFile(tauriUrl, 'utf8');
    const updatedTauri = tauri.replace(/("version"\s*:\s*")[^"]+("\s*,?)/, `$1${version}$2`);
    if (tauri === updatedTauri) throw Error('Could not update src-tauri/tauri.conf.json package version.');
    await writeFile(tauriUrl, updatedTauri);
  }
  if (components.includes('wordcraft')) await writeFile(new URL('../src-tauri/wordcraft-version.txt', import.meta.url), version);
  const componentNames = components.map(value => value[0].toUpperCase() + value.slice(1)).join(', ');
  const notes = [
    `# B6H v${version} - Maintenance Release`,
    '',
    ...summaries.map(value => `- ${value.replace(/[.!?]*$/, '.')}`),
    `- Published a production-signed ${componentNames} modular update package${components.length === 1 ? '' : 's'}${components.includes('core') ? ' and lightweight Windows x64 Setup' : '; the existing Setup is reused'}; the validated Wordcraft runtime was reused when unchanged.`,
    '- The Setup is unsigned by Authenticode because B6H is free and open source. Windows may show an unknown-publisher or SmartScreen warning. Verify its published SHA-256 checksum and download only from this official GitHub release.',
    '',
  ].join('\n');
  await writeFile(new URL('../RELEASE_NOTES.md', import.meta.url), notes);
  const updatedReadme = readme.replace(/The current maintenance release is B6H v\d+\.\d+\.\d+\. It includes[^\r\n]*\./, `The current maintenance release is B6H v${version}. See the release notes for its component changes.`);
  if (updatedReadme === readme && !readme.includes(`The current maintenance release is B6H v${version}.`)) throw Error('Could not update the README current-release line.');
  await writeFile(readmeUrl, updatedReadme);
  return { base, version, components, changedFiles: paths };
}

async function verifySigningKey() {
  const keyPath = option('--key');
  const keyId = option('--key-id');
  const publicOutput = option('--public-output');
  if (!keyPath || !keyId || !publicOutput || !process.env.B6H_UPDATE_TRUST_ROOTS) throw Error('Usage: release-plan.mjs verify-key --key FILE --key-id ID --public-output FILE with B6H_UPDATE_TRUST_ROOTS set.');
  const roots = JSON.parse(process.env.B6H_UPDATE_TRUST_ROOTS);
  const trusted = roots[keyId];
  if (!/^[0-9a-f]{64}$/.test(trusted ?? '')) throw Error(`No valid compiled trust root is configured for ${keyId}.`);
  const publicKey = createPublicKey(createPrivateKey(await readFile(keyPath)));
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  if (raw !== trusted) throw Error(`Signing key does not match the compiled trust root for ${keyId}.`);
  await writeFile(publicOutput, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
  console.log(`Signing key verified against the compiled trust root (${keyId}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    if (command === 'prepare') console.log(JSON.stringify(await prepare()));
    else if (command === 'verify-key') await verifySigningKey();
    else if (command === 'plan') {
      const tag = option('--tag') ?? process.env.GITHUB_REF_NAME;
      if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Usage: release-plan.mjs plan --tag vX.Y.Z');
      const base = option('--base') ?? run(['describe', '--tags', '--abbrev=0', `${tag}^`]);
      const result = await plan(base, option('--head') ?? tag);
      if (!result.components.length) throw Error(`No application component changes since ${base}.`);
      const priorTags = run(['tag', '--list', 'v*']).split(/\r?\n/).filter(value => /^v\d+\.\d+\.\d+$/.test(value) && value !== tag);
      if (compareVersions(tag, base) <= 0 || nextPatch(base, priorTags) !== tag.slice(1)) throw Error(`Release tag ${tag} is not the next unused maintenance version after ${base}.`);
      if (result.components.includes('frontend') && (result.packageVersion !== tag.slice(1) || result.frontendVersion !== tag.slice(1))) throw Error(`Frontend version metadata does not match tag ${tag}. Run npm run release:prepare before tagging.`);
      if (result.components.includes('core') && result.coreVersion !== tag.slice(1)) throw Error(`Core version ${result.coreVersion} does not match tag ${tag}. Run npm run release:prepare before tagging.`);
      if (result.components.includes('wordcraft') && result.wordcraftVersion !== tag.slice(1)) throw Error(`Wordcraft version ${result.wordcraftVersion} does not match tag ${tag}. Run npm run release:prepare before tagging.`);
      const notes = run(['show', `${tag}:RELEASE_NOTES.md`]);
      if (!notes.startsWith(`# B6H v${tag.slice(1)} `)) throw Error(`RELEASE_NOTES.md must describe ${tag}; run npm run release:prepare and review its generated notes before tagging.`);
      console.log(JSON.stringify(result));
    } else throw Error('Usage: release-plan.mjs prepare | plan --tag vX.Y.Z');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
