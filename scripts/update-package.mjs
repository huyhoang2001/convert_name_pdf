import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_EXPANDED = 512 * 1024 * 1024;
const MAX_FILES = 10_000;
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const keyId = () => {
  const id = option('--key-id') ?? 'local-test-only';
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) throw Error('Invalid signing key ID.');
  if ((option('--channel') ?? 'local-test') === 'stable' && id === 'local-test-only') throw Error('Stable packages require a production signing key ID.');
  return id;
};
const writeChecksum = async path => writeFile(`${path}.sha256`, `${sha256(await readFile(path))} *${basename(path)}\n`);

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 240 &&
    !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !/[\u0000-\u001f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

async function filesUnder(root, dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw Error(`Symlink is not allowed: ${entry.name}`);
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(root, path));
    else if (entry.isFile()) result.push(path);
    else throw Error(`Unsupported package entry: ${entry.name}`);
  }
  return result;
}

async function keygen() {
  const dir = resolve(option('--dir') ?? '.b6h-state/update-test-keys');
  await mkdir(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  await writeFile(join(dir, 'test-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx' });
  await writeFile(join(dir, 'test-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
  console.log(`Created isolated local test keys in ${dir}`);
}

async function pack() {
  const component = option('--component');
  const input = resolve(option('--input') ?? '');
  const output = resolve(option('--output') ?? '');
  const keyPath = resolve(option('--key') ?? '');
  if (!['frontend', 'wordcraft', 'core'].includes(component) || !option('--input') || !option('--output') || !option('--key')) throw Error('Usage: pack --component frontend|wordcraft|core --input DIR --output FILE.b6hupdate --key PRIVATE.pem');
  const signingKeyId = keyId();
  const channel = option('--channel') ?? 'local-test';
  const sequence = Number(option('--sequence') ?? 1);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw Error('Package sequence must be a positive integer.');
  const names = (await filesUnder(input)).map(path => [relative(input, path).split(sep).join('/'), path]).sort(([a], [b]) => a.localeCompare(b));
  if (!names.length || names.length > MAX_FILES) throw Error('Invalid package file count.');
  const payload = {};
  const files = [];
  let total = 0;
  for (const [name, path] of names) {
    if (!safePath(name)) throw Error(`Unsafe package path: ${name}`);
    const bytes = await readFile(path);
    total += bytes.length;
    if (total > MAX_EXPANDED) throw Error('Package exceeds the expanded size limit.');
    payload[`payload/${name}`] = bytes;
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, productId: 'com.safe-pdf-rename.desktop', platform: 'windows', arch: 'x86_64', channel, releaseId: option('--release-id') ?? `${component}-v3.0.0-test`, sequence, component, version: option('--version') ?? '3.0.0', requires: { core: option('--core') ?? '3.0.0', ipcContract: Number(option('--ipc-contract') ?? 1), wordcraftBridge: Number(option('--wordcraft-bridge') ?? 1) }, keyId: signingKeyId, payloadBytes: total, files }));
  const signature = sign(null, manifest, createPrivateKey(await readFile(keyPath)));
  const archive = zipSync({ 'manifest.json': manifest, 'manifest.sig': Buffer.from(signature.toString('base64')), ...payload }, { level: 6 });
  if (archive.length > MAX_ARCHIVE) throw Error('Package exceeds the archive size limit.');
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, archive);
  await writeChecksum(output);
  console.log(`Created ${output} (${archive.length} bytes, ${files.length} files)`);
}

async function catalog() {
  const packagePaths = (option('--packages') ?? '').split(',').filter(Boolean).map(path => resolve(path));
  const output = resolve(option('--output') ?? '');
  const keyPath = resolve(option('--key') ?? '');
  const baseUrl = option('--base-url');
  if ((!packagePaths.length && !args.includes('--empty')) || (packagePaths.length && args.includes('--empty')) || !option('--output') || !option('--key') || !baseUrl) throw Error('Usage: catalog --packages FILE1,FILE2 | --empty --output catalog.json --key PRIVATE.pem --base-url https://github.com/owner/repo/releases/download/tag');
  const signingKeyId = keyId();
  const catalogSequence = Number(option('--sequence') ?? 1);
  if (!Number.isSafeInteger(catalogSequence) || catalogSequence < 1) throw Error('Catalog sequence must be a positive integer.');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || ((option('--channel') ?? 'local-test') === 'stable' && base.hostname !== 'github.com')) throw Error('Stable catalogs must use HTTPS GitHub release URLs.');
  const packages = [];
  const components = new Set();
  const privateKey = createPrivateKey(await readFile(keyPath));
  const publicKey = createPublicKey(privateKey);
  for (const path of packagePaths) {
    const bytes = await readFile(path);
    if (bytes.length > MAX_ARCHIVE) throw Error(`Package exceeds archive limit: ${basename(path)}`);
    const files = unzipSync(bytes);
    if (!files['manifest.json'] || !files['manifest.sig']) throw Error(`Package is missing its signature: ${basename(path)}`);
    const manifestBytes = Buffer.from(files['manifest.json']);
    if (!verify(null, manifestBytes, publicKey, Buffer.from(Buffer.from(files['manifest.sig']).toString('utf8').trim(), 'base64'))) throw Error(`Package signature is invalid: ${basename(path)}`);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.keyId !== signingKeyId || manifest.channel !== (option('--channel') ?? 'local-test') || components.has(manifest.component)) throw Error(`Package signing identity, channel, or component is invalid: ${basename(path)}`);
    components.add(manifest.component);
    for (const file of manifest.files ?? []) {
      const payload = files[`payload/${file.path}`];
      if (!payload || payload.length !== file.bytes || sha256(payload) !== file.sha256) throw Error(`Package payload is invalid: ${basename(path)}`);
    }
    packages.push({ component: manifest.component, version: manifest.version, releaseId: manifest.releaseId, sequence: manifest.sequence, url: `${baseUrl.replace(/\/$/, '')}/${basename(path)}`, archiveBytes: bytes.length, sha256: sha256(bytes), requires: manifest.requires });
  }
  const channel = option('--channel') ?? 'local-test';
  if (channel === 'stable' && !components.size && !args.includes('--empty')) throw Error('An empty stable catalog must be explicitly requested with --empty.');
  const catalogBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, productId: 'com.safe-pdf-rename.desktop', platform: 'windows', arch: 'x86_64', channel, sequence: catalogSequence, keyId: signingKeyId, packages }));
  const signature = sign(null, catalogBytes, privateKey);
  await mkdir(resolve(output, '..'), { recursive: true });
  const signaturePath = join(resolve(output, '..'), 'catalog.sig');
  await writeFile(output, catalogBytes); await writeFile(signaturePath, `${signature.toString('base64')}\n`);
  await writeChecksum(output); await writeChecksum(signaturePath);
  console.log(`Created signed catalog with ${packages.length} package(s)`);
}

async function verifyPackage() {
  const packagePath = resolve(option('--package') ?? '');
  const keyPath = resolve(option('--key') ?? '');
  if (!option('--package') || !option('--key')) throw Error('Usage: verify --package FILE.b6hupdate --key PUBLIC.pem');
  const py = String.raw`import base64, hashlib, json, pathlib, re, stat, sys, zipfile
p=pathlib.Path(sys.argv[1])
if p.stat().st_size>256*1024*1024: raise ValueError('Package exceeds the archive size limit.')
with zipfile.ZipFile(p) as z:
 infos=z.infolist()
 if len(infos)>10002: raise ValueError('Too many archive entries.')
 names=set(); folded=set(); by_name={}
 for i in infos:
  n=i.filename
  if not n or n.startswith('/') or '\\' in n or ':' in n or any(x in ('','.','..') or x.endswith(('.',' ')) or re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)',x) for x in n.split('/')): raise ValueError('Unsafe package path.')
  if i.is_dir() or i.flag_bits&1 or stat.S_ISLNK(i.external_attr>>16): raise ValueError('Unsupported archive entry.')
  if n in names or n.casefold() in folded: raise ValueError('Duplicate or case-colliding package path.')
  names.add(n); folded.add(n.casefold()); by_name[n]=i
 if 'manifest.json' not in by_name or 'manifest.sig' not in by_name: raise ValueError('Package manifest or signature is missing.')
 with z.open(by_name['manifest.json']) as f: mb=f.read(1024*1024+1)
 if len(mb)>1024*1024: raise ValueError('Manifest exceeds size limit.')
 m=json.loads(mb)
 expected={'manifest.json','manifest.sig'}; total=0; result=[]
 if not isinstance(m.get('files'),list) or len(m['files'])>10000: raise ValueError('Invalid manifest file inventory.')
 for x in m['files']:
  n='payload/'+x['path']; expected.add(n); actual=0; h=hashlib.sha256()
  with z.open(by_name[n]) as f:
   while True:
    b=f.read(1024*1024)
    if not b: break
    actual+=len(b); total+=len(b)
    if actual>x['bytes'] or total>512*1024*1024: raise ValueError('Package exceeds its declared or expanded size limit.')
    h.update(b)
  if actual!=x['bytes'] or h.hexdigest()!=x['sha256']: raise ValueError('Payload verification failed: '+x['path'])
  result.append(x['path'])
 if total!=m.get('payloadBytes') or names!=expected: raise ValueError('Package payload inventory does not match its manifest.')
 with z.open(by_name['manifest.sig']) as f: sig=f.read(4096).decode('ascii').strip()
 print(json.dumps({'manifest':base64.b64encode(mb).decode('ascii'),'signature':sig,'files':result}))`;
  const inspected = spawnSync('python.exe', ['-c', py, packagePath], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (inspected.status !== 0) throw Error(inspected.stderr.trim() || 'Package inspection failed.');
  const result = JSON.parse(inspected.stdout);
  const manifestBytes = Buffer.from(result.manifest, 'base64');
  if (!verify(null, manifestBytes, createPublicKey(await readFile(keyPath)), Buffer.from(result.signature, 'base64'))) throw Error('Package signature is invalid.');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  if (manifest.schemaVersion !== 1 || manifest.productId !== 'com.safe-pdf-rename.desktop' || manifest.platform !== 'windows' || manifest.arch !== 'x86_64' || !['frontend', 'wordcraft', 'core'].includes(manifest.component) || manifest.requires?.core !== '3.0.0' || manifest.requires?.ipcContract !== 1 || manifest.requires?.wordcraftBridge !== 1 || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES || (manifest.component === 'core' && manifest.files.length !== 1)) throw Error('Unsupported or invalid update manifest.');
  const expected = new Set(['manifest.json', 'manifest.sig']);
  let total = 0;
  for (const file of manifest.files) {
    if (!safePath(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) throw Error('Invalid file entry.');
    const archivePath = `payload/${file.path}`;
    if (expected.has(archivePath) || !result.files.includes(file.path)) throw Error('Package path is duplicated or missing.');
    expected.add(archivePath);
    total += file.bytes;
    if (total > MAX_EXPANDED) throw Error('Package exceeds the expanded size limit.');
  }
  if (total !== manifest.payloadBytes || expected.size !== result.files.length + 2) throw Error('Package payload inventory does not match its signed manifest.');
  console.log(`Verified ${basename(packagePath)} (${manifest.component} ${manifest.version}, ${manifest.files.length} files)`);
}

try {
  if (args[0] === 'keygen') await keygen();
  else if (args[0] === 'pack') await pack();
  else if (args[0] === 'verify') await verifyPackage();
  else if (args[0] === 'catalog') await catalog();
  else throw Error('Usage: node scripts/update-package.mjs keygen|pack|verify|catalog ...');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
