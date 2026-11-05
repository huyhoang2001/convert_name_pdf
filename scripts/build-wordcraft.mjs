import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const upstream = join(root, 'wordcraft-upstream');
const built = join(upstream, 'dist/web');
const output = join(root, 'public/wordcraft');
const checkPath = process.argv.find(arg => arg.startsWith('--check='))?.slice(8);
const checkOnly = process.argv.includes('--check') || Boolean(checkPath);
const expectedCommit = '08afab50b6a1ed19f9af55bb9f74d18f5e17bfa0';

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

if (checkOnly) {
  for (const dir of checkPath ? [resolve(checkPath)] : [output, join(root, 'dist/wordcraft')]) await prepare(dir, false);
} else {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' });
  if (revision.status !== 0 || revision.stdout.trim() !== expectedCommit) throw Error(`Wordcraft source must be ${expectedCommit}`);
  const patchPresent = spawnSync('git', ['apply', '--check', '--reverse', join(root, 'wordcraft-bridge.patch')], { cwd: upstream, stdio: 'ignore' }).status === 0;
  if (!patchPresent) throw Error('The existing Wordcraft bridge patch is not present in wordcraft-upstream');
  const build = spawnSync(process.platform === 'win32' ? 'trunk.exe' : 'trunk', ['build', '--release'], { cwd: join(upstream, 'apps/wordcraft-web'), stdio: 'inherit' });
  if (build.status !== 0) throw Error('Trunk failed to build patched Wordcraft');

  const staging = await mkdtemp(join(tmpdir(), 'b6h-wordcraft-'));
  try {
    await cp(built, staging, { recursive: true });
    await prepare(staging);
    const generated = await filesUnder(staging);
    const generatedPaths = new Set(generated.map(path => relative(staging, path)));
    for (const path of await filesUnder(output)) {
      if (isGeneratedAsset(relative(output, path)) && !generatedPaths.has(relative(output, path))) await rm(path);
    }
    for (const path of generated) {
      const target = join(output, relative(staging, path));
      await mkdir(join(target, '..'), { recursive: true });
      await cp(path, target);
    }
    await prepare(output, false);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
