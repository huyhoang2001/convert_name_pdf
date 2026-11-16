import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprintInputs, inventory, matchesInventory, publishDirectory, selectBuildAction } from './wordcraft-build-state.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const configuredUpstream = process.env.B6H_WORDCRAFT_UPSTREAM;
const upstreamCandidates = configuredUpstream
  ? [resolve(root, configuredUpstream)]
  : [join(root, 'wordcraft-upstream')];
const upstream = upstreamCandidates.find(path => existsSync(path)) ?? upstreamCandidates[0];
const built = join(upstream, 'dist/web');
const output = join(root, 'public/wordcraft');
const deployed = join(root, 'dist/wordcraft');
const stateDir = join(root, '.b6h-state/wordcraft');
const runtimeManifestPath = join(stateDir, 'runtime.json');
const manifestPath = join(stateDir, 'source-provenance.json');
const lockPath = join(stateDir, 'build.lock');
const patchPath = join(root, 'wordcraft-bridge.patch');
const targetDir = resolve(join(upstream, 'target'));
if (process.env.CARGO_TARGET_DIR && resolve(process.env.CARGO_TARGET_DIR) !== targetDir) throw Error(`Wordcraft builds must reuse ${targetDir}; refusing CARGO_TARGET_DIR=${process.env.CARGO_TARGET_DIR}`);
const targetLimitGiB = Number(process.env.B6H_WORDCRAFT_TARGET_LIMIT_GIB || 16);
const checkPath = process.argv.find(arg => arg.startsWith('--check='))?.slice(8);
const checkOnly = process.argv.includes('--check') || Boolean(checkPath);

async function saveManifest(inputFingerprint, recipe, outputInventory) {
  const manifestTemp = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  const manifest = { version: 2, verified: true, inputFingerprint, sourceCommit: recipe.sourceCommit, recipe, outputInventory, outputInventorySha256: createHash('sha256').update(JSON.stringify(outputInventory)).digest('hex'), verification: 'structure+sri+wasm-imports', verifiedAt: new Date().toISOString() };
  try {
    await writeFile(manifestTemp, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await rename(manifestTemp, manifestPath);
  } finally {
    await rm(manifestTemp, { force: true });
  }
}

async function saveRuntimeManifest(outputInventory, sourceProvenance) {
  const outputHash = createHash('sha256').update(JSON.stringify(outputInventory)).digest('hex');
  let previous;
  try { previous = JSON.parse(await readFile(runtimeManifestPath, 'utf8')); } catch {}
  const manifest = {
    version: 2,
    validated: true,
    inventorySha256: outputHash,
    outputInventory,
    validation: 'structure+sri+wasm-imports',
    sourceProvenance: sourceProvenance?.outputInventorySha256 === outputHash
      ? { inputFingerprint: sourceProvenance.inputFingerprint, sourceCommit: sourceProvenance.sourceCommit, verifiedAt: sourceProvenance.verifiedAt }
      : previous?.inventorySha256 === outputHash && previous.sourceProvenance && typeof previous.sourceProvenance === 'object' ? previous.sourceProvenance : null,
    bridgeCompatibility: previous?.inventorySha256 === outputHash && previous.bridgeCompatibility === 'webview2-smoke-passed' ? previous.bridgeCompatibility : 'requires-webview2-smoke',
    bridgeSmoke: previous?.inventorySha256 === outputHash ? previous.bridgeSmoke ?? null : null,
  };
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

async function directoryBytes(path) {
  let bytes = 0;
  for (const file of await filesUnder(path)) bytes += (await stat(file)).size;
  return bytes;
}

function targetLimitBytes() {
  if (!Number.isFinite(targetLimitGiB) || targetLimitGiB < 1) throw Error('B6H_WORDCRAFT_TARGET_LIMIT_GIB must be a number of at least 1');
  return Math.floor(targetLimitGiB * 1024 ** 3);
}

async function executableHash(command) {
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')] : [''];
  const paths = isAbsolute(command) || command.includes(sep)
    ? extensions.map(extension => `${command}${extension}`)
    : (process.env.PATH || '').split(delimiter).flatMap(directory => extensions.map(extension => join(directory.replace(/^"|"$/g, ''), `${command}${extension}`)));
  for (const path of paths) {
      try {
        if ((await stat(path)).isFile()) return createHash('sha256').update(await readFile(path)).digest('hex');
      } catch {}
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
  if (![1, 2].includes(manifest?.version) || manifest.verified !== true) console.log(`Wordcraft source provenance: UNKNOWN; explicit source build requested for ${upstream}`);
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
    if (revision.status !== 0 || !/^[0-9a-f]{40}$/i.test(revision.stdout.trim())) throw Error('Could not identify the existing Wordcraft checkout commit');
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
    const wasmBindgenLock = (await readFile(join(upstream, 'Cargo.lock'), 'utf8')).match(/\[\[package\]\]\s+name = "wasm-bindgen"\s+version = "([^"]+)"/);
    const trunkTools = spawnSync(trunk, ['tools', 'show'], { cwd: join(upstream, 'apps/wordcraft-web'), encoding: 'utf8', windowsHide: true });
    if (!wasmBindgenLock || trunkTools.status !== 0) throw Error('Could not establish the Wordcraft wasm-bindgen or Trunk tool configuration');
    const trunkVersion = name => trunkTools.stdout.match(new RegExp(`^${name}\\s*\\r?\\n\\s+Installed Version: [^\\r\\n]+\\r?\\n\\s+Default Version: ([^\\r\\n]+)`, 'm'))?.[1]?.trim();
    const wasmBindgenVersion = process.env.TRUNK_TOOLS_WASM_BINDGEN || wasmBindgenLock[1];
    const wasmOptVersion = process.env.TRUNK_TOOLS_WASM_OPT || trunkVersion('wasm-opt');
    if (!wasmOptVersion) throw Error('Could not determine the effective Trunk wasm-opt version');
    const trunkCache = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE ?? root, 'AppData/Local'), 'trunkrs/trunk/cache')
      : join(process.env.XDG_CACHE_HOME || join(process.env.HOME ?? root, '.cache'), 'trunkrs/trunk/cache');
    const toolPath = async (name, selectedVersion) => {
      const executable = process.platform === 'win32' ? `${name}.exe` : name;
      const cached = join(trunkCache, `${name}-${selectedVersion}`, ...(name === 'wasm-opt' ? ['bin'] : []), executable);
      if (await stat(cached).then(info => info.isFile(), () => false)) return cached;
      if (await executableHash(executable) !== 'missing' && version(executable, ['--version']).includes(selectedVersion.replace(/^version_/, ''))) return executable;
      throw Error(`Could not locate Trunk's selected ${name} ${selectedVersion} binary; refusing unverifiable Wordcraft provenance`);
    };
    const wasmBindgenPath = await toolPath('wasm-bindgen', wasmBindgenVersion);
    const wasmOptPath = await toolPath('wasm-opt', wasmOptVersion);
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'PATHEXT', 'NODE_OPTIONS', 'SOURCE_DATE_EPOCH', 'TZ', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'CC', 'AR', 'CFLAGS', 'LDFLAGS'].includes(key) || /^(CARGO_|RUST|RUSTUP_|TRUNK_|CRAFT_|WASM_)/.test(key)).sort(([a], [b]) => a.localeCompare(b)));
    const recipe = {
      sourceCommit: revision.stdout.trim(),
      upstreamPath: relative(root, upstream).split(sep).join('/') || '.',
      node: process.version,
      pipeline: 2,
      command: `${trunk} build --release`,
      cwd: 'apps/wordcraft-web',
      cargoTargetDir: relative(upstream, targetDir).split(sep).join('/') || '.',
      tools: {
        trunkBinarySha256: await executableHash(trunk),
        cargo: version('cargo', ['--version']),
        rustc: version('rustc', ['-Vv']),
        wasmBindgen: { selection: process.env.TRUNK_TOOLS_WASM_BINDGEN ? 'TRUNK_TOOLS_WASM_BINDGEN' : 'Cargo.lock', version: version(wasmBindgenPath, ['--version']), sha256: await executableHash(wasmBindgenPath) },
        wasmOpt: { selection: process.env.TRUNK_TOOLS_WASM_OPT ? 'TRUNK_TOOLS_WASM_OPT' : 'Trunk default', version: version(wasmOptPath, ['--version']), sha256: await executableHash(wasmOptPath) },
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
    const action = selectBuildAction(fingerprint, manifest, outputMatches, distMatches, explicitBuild);
    if (action === 'REUSE') {
      const outputInventory = await inventory(output);
      const provenance = { ...manifest, version: 2, sourceCommit: revision.stdout.trim(), recipe, outputInventory, outputInventorySha256: createHash('sha256').update(JSON.stringify(outputInventory)).digest('hex'), verification: manifest.verification ?? 'structure+sri+wasm-imports' };
      await saveManifest(fingerprint, recipe, outputInventory);
      await saveRuntimeManifest(outputInventory, provenance);
      console.log(`Wordcraft artifacts reused: ${output} (${fingerprint.slice(0, 20)}); no compile or sync`);
      return;
    }
    if (!explicitBuild && action !== 'SYNC ONLY') {
      console.log(`Wordcraft decision: ${action}; this source/output combination has no reusable verification; no build or synchronization performed. Use --build only after explicit approval.`);
      process.exitCode = 2;
      return;
    }

    let targetBytesBefore;
    if (action === 'BUILD REQUIRED') {
      if (!await stat(targetDir).then(info => info.isDirectory(), () => false)) throw Error(`The existing Wordcraft Cargo target is missing; refusing to create another target directory: ${targetDir}`);
      targetBytesBefore = await directoryBytes(targetDir);
      const estimatedGrowth = Math.max(3 * 1024 ** 3, await directoryBytes(join(targetDir, 'wasm32-unknown-unknown', 'release')));
      const limit = targetLimitBytes();
      if (targetBytesBefore + estimatedGrowth > limit) {
        throw Error(`Wordcraft Cargo target is ${(targetBytesBefore / 1024 ** 3).toFixed(2)} GiB; the ${targetLimitGiB} GiB cache limit does not leave the estimated ${(estimatedGrowth / 1024 ** 3).toFixed(2)} GiB build headroom. Review the dry-run cache cleanup before rebuilding.`);
      }
    }

    stagingRoot = await mkdtemp(join(root, 'public/.wordcraft-stage-'));
    const staging = join(stagingRoot, 'bundle');
    if (action === 'SYNC ONLY') {
      console.log(`Wordcraft artifacts verified in ${deployed}; synchronizing without compilation`);
      await cp(deployed, staging, { recursive: true });
      await prepare(staging, false);
    } else {
      console.log('Wordcraft inputs or verified outputs changed; building the release bundle');
      const build = spawnSync(trunk, ['build', '--release'], { cwd: join(upstream, 'apps/wordcraft-web'), env: { ...process.env, CARGO_TARGET_DIR: targetDir }, stdio: 'inherit', windowsHide: true });
      if (build.status !== 0) throw Error('Trunk failed to build patched Wordcraft');
      const targetBytesAfter = await directoryBytes(targetDir);
      console.log(`Wordcraft Cargo target: ${(targetBytesBefore / 1024 ** 3).toFixed(2)} GiB -> ${(targetBytesAfter / 1024 ** 3).toFixed(2)} GiB (limit ${targetLimitGiB} GiB)`);
      if (targetBytesAfter > targetLimitBytes()) console.warn('Wordcraft Cargo target is over its configured limit; no artifacts were removed. Run the cache dry-run and approve a targeted cleanup if appropriate.');
      if (await fingerprintInputs(upstream, fingerprintFiles, recipe) !== fingerprint) throw Error('Wordcraft inputs changed during compilation; staged output was discarded');
      try { await cp(output, staging, { recursive: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(staging, { recursive: true }); }
      await cp(built, staging, { recursive: true });
      await prepare(staging);
      await prepare(staging, false);
    }

    const stagedInventory = await inventory(staging);
    const currentMatches = await matchesInventory(output, stagedInventory);
    if (action === 'SYNC ONLY' || !currentMatches) {
      const backupPath = join(stagingRoot, 'previous');
      const provenance = { version: 2, verified: true, inputFingerprint: fingerprint, sourceCommit: revision.stdout.trim(), recipe, outputInventory: stagedInventory, outputInventorySha256: createHash('sha256').update(JSON.stringify(stagedInventory)).digest('hex'), verification: 'structure+sri+wasm-imports', verifiedAt: new Date().toISOString() };
      try {
        await publishDirectory(output, staging, backupPath,
          async path => {
            await prepare(path, false);
            if (JSON.stringify(await inventory(path)) !== JSON.stringify(stagedInventory)) throw Error('Published Wordcraft assets differ from the validated staging bundle');
          },
          async () => { await saveManifest(fingerprint, recipe, stagedInventory); await saveRuntimeManifest(stagedInventory, provenance); });
      } catch (error) {
        if (error instanceof AggregateError) preserveRecovery = true;
        throw error;
      }
    } else {
      console.log('Generated Wordcraft bundle matches deployed assets; no synchronization needed');
      const provenance = { version: 2, verified: true, inputFingerprint: fingerprint, sourceCommit: revision.stdout.trim(), recipe, outputInventory: stagedInventory, outputInventorySha256: createHash('sha256').update(JSON.stringify(stagedInventory)).digest('hex'), verification: 'structure+sri+wasm-imports', verifiedAt: new Date().toISOString() };
      await saveManifest(fingerprint, recipe, stagedInventory);
      await saveRuntimeManifest(stagedInventory, provenance);
    }
    console.log(`Wordcraft build state saved: ${manifestPath}`);
  } finally {
    if (stagingRoot && !preserveRecovery) await rm(stagingRoot, { recursive: true, force: true });
    try { await lock.close(); } finally { await rm(lockPath, { force: true }); }
  }
}
}

await main();
