import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprintInputs, inventory, matchesInventory, selectAction } from './wordcraft-build-state.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const configuredUpstream = process.env.B6H_WORDCRAFT_UPSTREAM;
const upstreamCandidates = configuredUpstream
  ? [resolve(root, configuredUpstream)]
  : [join(root, 'wordcraft-upstream'), resolve(root, '..', 'wordcraft-upstream')];
const upstream = upstreamCandidates.find(path => existsSync(path)) ?? upstreamCandidates[0];
const built = join(upstream, 'dist/web');
const output = join(root, 'public/wordcraft');
const deployed = join(root, 'dist/wordcraft');
const stateDir = join(root, '.b6h-state/wordcraft');
const runtimeManifestPath = join(stateDir, 'runtime.json');
const manifestPath = join(stateDir, 'source-provenance.json');
const lockPath = join(stateDir, 'build.lock');
const patchPath = join(root, 'wordcraft-bridge.patch');
const checkPath = process.argv.find(arg => arg.startsWith('--check='))?.slice(8);
const checkOnly = process.argv.includes('--check') || Boolean(checkPath);
const expectedCommit = '08afab50b6a1ed19f9af55bb9f74d18f5e17bfa0';

async function saveManifest(inputFingerprint, recipe, outputInventory) {
  const manifestTemp = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  const manifest = { version: 1, verified: true, inputFingerprint, recipe, outputInventory, verifiedAt: new Date().toISOString() };
  try {
    await writeFile(manifestTemp, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await rename(manifestTemp, manifestPath);
  } finally {
    await rm(manifestTemp, { force: true });
  }
}

async function saveRuntimeManifest(outputInventory) {
  const manifest = {
    version: 1,
    validated: true,
    inventorySha256: createHash('sha256').update(JSON.stringify(outputInventory)).digest('hex'),
    outputInventory,
    validation: 'structure+sri+wasm-imports',
    bridgeCompatibility: 'not-runtime-smoke-verified',
    sourceProvenance: 'not-claimed',
  };
  let previous;
  try { previous = JSON.parse(await readFile(runtimeManifestPath, 'utf8')); } catch {}
  if (JSON.stringify(previous) === JSON.stringify(manifest)) return;
  await mkdir(stateDir, { recursive: true });
  const temp = `${runtimeManifestPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await rename(temp, runtimeManifestPath);
  } finally {
    await rm(temp, { force: true });
  }
}

async function executableHash(command) {
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')] : [''];
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const extension of extensions) {
      const path = join(directory.replace(/^"|"$/g, ''), `${command}${extension}`);
      try {
        if ((await stat(path)).isFile()) return createHash('sha256').update(await readFile(path)).digest('hex');
      } catch {}
    }
  }
  return 'missing';
}

async function filesUnder(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) files.push(...await filesUnder(path));
    else if (item.isFile()) files.push(path);
  }
  return files;
}

function relativeRefs(text) {
  return [...text.matchAll(/["']\.\/([^"']+)["']/g)].map(match => match[1].split(/[?#]/)[0]);
}

function imports(text, from = '') {
  return [...text.matchAll(/(?:from\s+|import\s*\()(['"])(\.\/[^'"]+)\1/g)].map(match =>
    join(from, '..', match[2].slice(2)).replaceAll('\\', '/').split(/[?#]/)[0]);
}

function addVersion(text, assets, version) {
  for (const asset of [...assets].sort((a, b) => b.length - a.length)) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(["'])\\./${escaped}(?:\\?[^"']*)?(["'])`, 'g'), `$1./${asset}?v=${version}$2`);
  }
  return text;
}

function addImportVersions(text, assets, version) {
  for (const asset of assets.filter(path => path.endsWith('.js'))) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`((?:from\\s+|import\\s*\\()(['"])\\./${escaped})(?:\\?[^'"]*)?\\2`, 'g'), `$1?v=${version}$2`);
  }
  return text;
}

function isGeneratedAsset(path) {
  return /^wordcraft-web-.*\.(?:js|wasm)$/.test(path) || /^wordcraft-.*\.ico$/.test(path) || (path.startsWith(`snippets${sep}`) && path.endsWith('.js'));
}

async function prepare(dir, write = !checkOnly) {
  const htmlPath = join(dir, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const allFiles = await filesUnder(dir);
  const assets = new Set(relativeRefs(html));
  if (![...assets].some(path => path.endsWith('.js')) || ![...assets].some(path => path.endsWith('.wasm')) || ![...assets].some(path => path.includes('snippets/') && path.endsWith('.js'))) throw Error(`Wordcraft HTML is missing its JS, snippet, or WASM entry in ${dir}`);
  const pending = [...assets].filter(path => path.endsWith('.js'));
  const requireAsset = async path => {
    try { await stat(join(dir, path)); }
    catch { throw Error(`Wordcraft bundle is missing ${path}`); }
  };
  for (const asset of assets) await requireAsset(asset);
  while (pending.length) {
    const path = pending.pop();
    const body = await readFile(join(dir, path), 'utf8');
    for (const dependency of imports(body, path)) {
      if (assets.has(dependency)) continue;
      assets.add(dependency);
      await requireAsset(dependency);
      if (dependency.endsWith('.js')) pending.push(dependency);
    }
  }

  const wasmPath = [...assets].find(asset => asset.endsWith('.wasm'));
  const wasmModule = await WebAssembly.compile(await readFile(join(dir, wasmPath)));
  const wasmNamespaces = new Set(WebAssembly.Module.imports(wasmModule).map(item => item.module));
  const importedModules = new Map();
  const namespaceMappings = new Map();
  for (const path of [...assets].filter(asset => asset.endsWith('.js'))) {
    const body = await readFile(join(dir, path), 'utf8');
    for (const match of body.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/g)) {
      importedModules.set(match[1], `./${join(dirname(path), match[2].slice(2)).replaceAll('\\', '/').split(/[?#]/)[0]}`);
    }
    for (const match of body.matchAll(/["']([^"']+)["']\s*:\s*(import\d+)/g)) {
      if (wasmNamespaces.has(match[1])) namespaceMappings.set(match[1], match[2]);
    }
  }
  for (const namespace of wasmNamespaces) {
    const mapped = namespaceMappings.get(namespace);
    if (!mapped) throw Error(`Wordcraft WASM namespace is missing from generated glue: ${namespace}`);
    if (namespace.includes('?')) throw Error(`Wordcraft WASM namespace must not be versioned: ${namespace}`);
    const generatedLocal = namespace === './wordcraft-web_bg.js' && mapped === 'import0';
    if (!generatedLocal && importedModules.get(mapped) !== namespace) throw Error(`Wordcraft glue maps ${namespace} to the wrong module (${importedModules.get(mapped) ?? 'no ESM import'})`);
  }

  const resources = [...assets].filter(asset => /\.(?:js|wasm|ico|css|woff2?)$/i.test(asset));
  const stale = allFiles.filter(path => {
    const asset = relative(dir, path);
    return isGeneratedAsset(asset) && !assets.has(asset.split(sep).join('/'));
  });
  if (!write && stale.length) throw Error(`Wordcraft bundle contains stale assets: ${stale.map(path => relative(dir, path)).join(', ')}`);
  const sriAssets = [...html.matchAll(/href="\.\/([^"?#]+)(?:\?[^"]*)?"[^>]*integrity="/g)].map(match => match[1]);
  for (const required of resources.filter(path => path.endsWith('.js') || path.endsWith('.wasm'))) if (!sriAssets.includes(required)) throw Error(`Wordcraft HTML has no SRI entry for ${required}`);
  const digest = createHash('sha256');
  for (const asset of resources.sort()) {
    digest.update(asset);
    const bytes = await readFile(join(dir, asset));
    digest.update(asset.endsWith('.js') ? bytes.toString('utf8').replace(/\?v=[a-f0-9]{20}/g, '') : bytes);
  }
  const version = digest.digest('hex').slice(0, 20);
  const finalHtml = addVersion(html, resources, version);
  const finalJs = new Map();
  for (const asset of resources.filter(path => path.endsWith('.js'))) {
    finalJs.set(join(dir, asset), addImportVersions(await readFile(join(dir, asset), 'utf8'), resources, version));
  }
  let integrityHtml = finalHtml;
  for (const match of finalHtml.matchAll(/href="\.\/([^"?#]+)(?:\?[^"]*)?"[^>]*integrity="sha384-[^"]+"/g)) {
    const asset = match[1];
    const bytes = finalJs.has(join(dir, asset)) ? Buffer.from(finalJs.get(join(dir, asset))) : await readFile(join(dir, asset));
    const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
    integrityHtml = integrityHtml.replace(match[0], match[0].replace(/integrity="[^"]+"/, `integrity="${integrity}"`));
  }

  if (!write) {
    for (const match of html.matchAll(/href="\.\/([^"?#]+)(?:\?[^"]*)?"[^>]*integrity="([^"]+)"/g)) {
      const actual = `sha384-${createHash('sha384').update(await readFile(join(dir, match[1]))).digest('base64')}`;
      if (match[2] !== actual) throw Error(`Wordcraft SRI mismatch for ${match[1]}`);
    }
    if (integrityHtml !== html) throw Error(`Wordcraft build metadata or SRI is stale in ${dir} (expected version ${version})`);
    for (const [path, body] of finalJs) if (body !== await readFile(path, 'utf8')) throw Error(`Wordcraft asset version is stale in ${relative(dir, path)}`);
    console.log(`Wordcraft bundle valid: ${dir} (${version})`);
    return;
  }

  for (const [path, body] of finalJs) await writeFile(path, body);
  await writeFile(htmlPath, integrityHtml);
  for (const path of stale) await rm(path);
  for (const match of integrityHtml.matchAll(/href="\.\/([^"?#]+)(?:\?[^"]*)?"[^>]*integrity="([^"]+)"/g)) {
    const actual = `sha384-${createHash('sha384').update(await readFile(join(dir, match[1]))).digest('base64')}`;
    if (match[2] !== actual) throw Error(`Wordcraft SRI mismatch for ${match[1]}`);
  }
  console.log(`Prepared Wordcraft bundle: ${dir} (${version}); ${allFiles.length} files`);
}

async function main() {
if (checkOnly) {
  const dirs = checkPath ? [resolve(checkPath)] : [output, deployed];
  for (const dir of dirs) await prepare(dir, false);
  if (!checkPath || resolve(checkPath) === output) await saveRuntimeManifest(await inventory(output));
} else {
  const explicitBuild = process.argv.includes('--build');
  if (!explicitBuild) {
    await prepare(output, false);
    const outputInventory = await inventory(output);
    await saveRuntimeManifest(outputInventory);
    const identity = createHash('sha256').update(JSON.stringify(outputInventory)).digest('hex');
    console.log(`Wordcraft decision: REUSE; validated runtime ${output} (${identity}); source provenance remains independent`);
    return;
  }
  if (!await stat(upstream).then(info => info.isDirectory(), () => false)) {
    console.log(`Wordcraft decision: UNKNOWN; source directory is missing: ${upstream}`);
    process.exitCode = 2;
    return;
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  if (manifest?.version !== 1 || manifest.verified !== true) console.log(`Wordcraft source provenance: UNKNOWN; explicit source build requested for ${upstream}`);
  await mkdir(stateDir, { recursive: true });
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw Error(`Another Wordcraft build may be running (lock: ${lockPath}); verify its owner before removing the lock`);
    throw error;
  }
  let stagingRoot;
  let preserveRecovery = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' });
    if (revision.status !== 0 || revision.stdout.trim() !== expectedCommit) {
      if (explicitBuild) throw Error(`Wordcraft source must be ${expectedCommit}`);
      console.log(`Wordcraft decision: UNKNOWN; source commit is not ${expectedCommit}`);
      process.exitCode = 2;
      return;
    }
    const patchPresent = spawnSync('git', ['apply', '--check', '--reverse', patchPath], { cwd: upstream, stdio: 'ignore' }).status === 0;
    if (!patchPresent) {
      if (explicitBuild) throw Error('The existing Wordcraft bridge patch is not present in wordcraft-upstream');
      console.log('Wordcraft decision: UNKNOWN; the B6H bridge patch is not applied to the upstream source');
      process.exitCode = 2;
      return;
    }

    const trunk = process.platform === 'win32' ? 'trunk.exe' : 'trunk';
    const version = (command, args) => {
      const result = spawnSync(command, args, { cwd: upstream, encoding: 'utf8', windowsHide: true });
      return result.status === 0 ? result.stdout.trim() : `unavailable:${result.error?.code ?? result.status}`;
    };
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'PATHEXT', 'NODE_OPTIONS', 'SOURCE_DATE_EPOCH', 'TZ', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'CC', 'AR', 'CFLAGS', 'LDFLAGS'].includes(key) || /^(CARGO_|RUST|RUSTUP_|TRUNK_|CRAFT_|WASM_)/.test(key)).sort(([a], [b]) => a.localeCompare(b)));
    const recipe = {
      sourceCommit: revision.stdout.trim(),
      upstreamPath: relative(root, upstream).split(sep).join('/') || '.',
      node: process.version,
      pipeline: 1,
      command: `${trunk} build --release`,
      cwd: 'apps/wordcraft-web',
      tools: {
        trunkBinarySha256: await executableHash(trunk),
        cargo: version('cargo', ['--version']),
        rustc: version('rustc', ['-Vv']),
        wasmBindgen: version(process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen', ['--version']),
        wasmOpt: version(process.platform === 'win32' ? 'wasm-opt.exe' : 'wasm-opt', ['--version']),
      },
      environmentFingerprint: createHash('sha256').update(JSON.stringify(environment)).digest('hex'),
    };
    const cargoHome = process.env.CARGO_HOME || join(process.env.USERPROFILE ?? process.env.HOME ?? root, '.cargo');
    const cargoConfigs = ['config.toml', 'config'].map(name => join(cargoHome, name));
    const fingerprintFiles = [patchPath, fileURLToPath(import.meta.url), fileURLToPath(new URL('./wordcraft-build-state.mjs', import.meta.url)), join(root, 'src/word/WordcraftEditor.tsx'), join(root, 'src/word/wordcraftProtocol.ts')];
    for (const key of ['CRAFT_FONTS_DIR', 'CRAFT_I18N_DIR']) if (process.env[key]) fingerprintFiles.push(resolve(process.env[key]));
    for (const path of cargoConfigs) if (await stat(path).then(() => true, () => false)) fingerprintFiles.push(path);
    const fingerprint = await fingerprintInputs(upstream, fingerprintFiles, recipe);
    const outputMatches = await matchesInventory(output, manifest?.outputInventory);
    const distMatches = outputMatches ? false : await matchesInventory(deployed, manifest?.outputInventory);
    const action = selectAction(fingerprint, manifest, outputMatches, distMatches);
    if (action === 'REUSE') {
      console.log(`Wordcraft artifacts reused: ${output} (${fingerprint.slice(0, 20)}); no compile or sync`);
      return;
    }
    if (!explicitBuild && action !== 'SYNC ONLY') {
      console.log(`Wordcraft decision: ${action}; this source/output combination has no reusable verification; no build or synchronization performed. Use --build only after explicit approval.`);
      process.exitCode = 2;
      return;
    }

    stagingRoot = await mkdtemp(join(root, 'public/.wordcraft-stage-'));
    const staging = join(stagingRoot, 'bundle');
    if (action === 'SYNC ONLY') {
      console.log(`Wordcraft artifacts verified in ${deployed}; synchronizing without compilation`);
      await cp(deployed, staging, { recursive: true });
      await prepare(staging, false);
    } else {
      console.log('Wordcraft inputs or verified outputs changed; building the release bundle');
      const build = spawnSync(trunk, ['build', '--release'], { cwd: join(upstream, 'apps/wordcraft-web'), stdio: 'inherit', windowsHide: true });
      if (build.status !== 0) throw Error('Trunk failed to build patched Wordcraft');
      if (await fingerprintInputs(upstream, fingerprintFiles, recipe) !== fingerprint) throw Error('Wordcraft inputs changed during compilation; staged output was discarded');
      try { await cp(output, staging, { recursive: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(staging, { recursive: true }); }
      await cp(built, staging, { recursive: true });
      await prepare(staging);
      await prepare(staging, false);
    }

    const stagedInventory = await inventory(staging);
    const currentMatches = await matchesInventory(output, stagedInventory);
    let backup;
    if (action === 'SYNC ONLY' || !currentMatches) {
      const backupPath = join(stagingRoot, 'previous');
      try { await rename(output, backupPath); backup = backupPath; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      try {
        await rename(staging, output);
        await prepare(output, false);
        if (JSON.stringify(await inventory(output)) !== JSON.stringify(stagedInventory)) throw Error('Published Wordcraft assets differ from the validated staging bundle');
        await saveManifest(fingerprint, recipe, stagedInventory);
        await saveRuntimeManifest(stagedInventory);
      } catch (error) {
        if (backup) {
          try {
            const failedPath = join(stagingRoot, 'failed');
            try { await rename(output, failedPath); } catch (moveError) { if (moveError.code !== 'ENOENT') throw moveError; }
            await rename(backup, output);
            if (await stat(failedPath).then(() => true, () => false)) await rm(failedPath, { recursive: true, force: true });
          } catch (rollbackError) {
            preserveRecovery = true;
            throw new AggregateError([error, rollbackError], `Could not restore the previous Wordcraft bundle; recovery files remain under ${stagingRoot}`);
          }
        }
        throw error;
      }
    } else {
      console.log('Generated Wordcraft bundle matches deployed assets; no synchronization needed');
      await saveManifest(fingerprint, recipe, stagedInventory);
      await saveRuntimeManifest(stagedInventory);
    }
    if (backup) await rm(backup, { recursive: true, force: true });
    console.log(`Wordcraft build state saved: ${manifestPath}`);
  } finally {
    if (stagingRoot && !preserveRecovery) await rm(stagingRoot, { recursive: true, force: true });
    try { await lock.close(); } finally { await rm(lockPath, { force: true }); }
  }
}
}

await main();
