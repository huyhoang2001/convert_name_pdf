import { lstat, readdir, realpath, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const upstream = join(root, 'wordcraft-upstream');
const target = join(upstream, 'target');
const limitGiB = Number(process.env.B6H_WORDCRAFT_TARGET_LIMIT_GIB || 16);
const candidates = ['debug/incremental', 'wasm32-unknown-unknown/debug/incremental'];

export async function scanCache(targetDir = target) {
  const totals = new Map();
  const profiles = new Map();
  const cacheCandidates = [];
  let bytes = 0;
  let files = 0;
  async function walk(dir, top, topDir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path, top, topDir);
      else if (entry.isFile()) {
        const size = (await stat(path)).size;
        bytes += size;
        files++;
        const key = `${top}/${categoryFor(dir, topDir)}`;
        const total = totals.get(key) ?? { files: 0, bytes: 0 };
        total.files++;
        total.bytes += size;
        totals.set(key, total);
        const pathParts = relative(targetDir, dir).split(sep);
        const profile = top === 'wasm32-unknown-unknown' ? `${top}/${pathParts[1] || 'other'}` : top;
        const profileTotal = profiles.get(profile) ?? { files: 0, bytes: 0 };
        profileTotal.files++;
        profileTotal.bytes += size;
        profiles.set(profile, profileTotal);
      }
    }
  }
  for (const path of candidates) {
    const fullPath = join(targetDir, path);
    try {
      const info = await lstat(fullPath);
      if (!info.isDirectory()) continue;
      const candidate = { path: fullPath, bytes: 0, files: 0 };
      async function count(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const child = join(dir, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) await count(child);
          else if (entry.isFile()) { candidate.bytes += (await stat(child)).size; candidate.files++; }
        }
      }
      await count(fullPath);
      cacheCandidates.push(candidate);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const entry of await readdir(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const top = entry.name;
    await walk(join(targetDir, top), top, join(targetDir, top));
  }
  return { bytes, files, profiles: [...profiles].map(([path, total]) => ({ path, ...total })).sort((a, b) => b.bytes - a.bytes), categories: [...totals].map(([path, total]) => ({ path, ...total })).sort((a, b) => b.bytes - a.bytes), candidates: cacheCandidates };
}

function categoryFor(path, topDir) {
  const name = path.slice(topDir.length + 1).split(sep)[0];
  return ['incremental', 'deps', 'build', '.fingerprint', 'examples'].includes(name) ? name : 'other';
}

function assertIdle() {
  try {
    const command = process.platform === 'win32' ? 'tasklist.exe' : 'ps';
    const args = process.platform === 'win32' ? ['/FO', 'CSV', '/NH'] : ['-Ao', 'comm='];
    const processList = execFileSync(command, args, { encoding: 'utf8', windowsHide: true }).toLowerCase();
    if (/(?:cargo|rustc|trunk)(?:\.exe)?/.test(processList)) throw Error('Cargo, rustc, or Trunk is running; stop before cache cleanup.');
  } catch (error) {
    if (error.message.includes('is running')) throw error;
    throw Error(`Could not verify that Cargo is idle: ${error.message}`);
  }
}

async function applyCleanup(report) {
  if (!process.stdin.isTTY) throw Error('Cleanup requires an interactive terminal and explicit approval.');
  try { await stat(join(root, '.b6h-state', 'wordcraft', 'build.lock')); throw Error('A Wordcraft build lock exists; cleanup stopped.'); }
  catch (error) { if (error.message.includes('lock exists')) throw error; if (error.code !== 'ENOENT') throw error; }
  assertIdle();
  const canonicalTarget = await realpath(target);
  for (const candidate of report.candidates) {
    const canonicalCandidate = await realpath(candidate.path);
    if (!canonicalCandidate.toLowerCase().startsWith(`${canonicalTarget.toLowerCase()}${sep}`)) throw Error(`Refusing cleanup outside the Wordcraft target: ${candidate.path}`);
    const info = await lstat(candidate.path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error(`Refusing changed or linked cache path: ${candidate.path}`);
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Type DELETE WORDCRAFT INCREMENTAL CACHE to remove up to ${(report.candidates.reduce((sum, item) => sum + item.bytes, 0) / 1024 ** 3).toFixed(2)} GiB of rebuildable Cargo incremental data: `);
  prompt.close();
  if (answer.trim() !== 'DELETE WORDCRAFT INCREMENTAL CACHE') throw Error('Approval phrase did not match; no cache data was removed.');
  for (const candidate of report.candidates) await rm(candidate.path, { recursive: true, force: false });
}

async function main() {
  if (!Number.isFinite(limitGiB) || limitGiB < 1) throw Error('B6H_WORDCRAFT_TARGET_LIMIT_GIB must be a number of at least 1');
  if (!await stat(target).then(info => info.isDirectory(), () => false)) throw Error(`Existing Wordcraft Cargo target is missing: ${target}`);
  const report = await scanCache(target);
  console.log(`Wordcraft Cargo target: ${(report.bytes / 1024 ** 3).toFixed(2)} GiB / ${limitGiB} GiB configured limit; ${report.files} files`);
  console.log('Target/profile totals:');
  for (const item of report.profiles) console.log(`  ${item.path}: ${(item.bytes / 1024 ** 3).toFixed(2)} GiB (${item.files} files)`);
  for (const item of report.categories) console.log(`  ${item.path}: ${(item.bytes / 1024 ** 3).toFixed(2)} GiB (${item.files} files)`);
  console.log('Eligible for opt-in cleanup (rebuildable; whether it is still useful is not inferred):');
  for (const item of report.candidates) console.log(`  ${relative(root, item.path)}: ${(item.bytes / 1024 ** 3).toFixed(2)} GiB (${item.files} files)`);
  if (!process.argv.includes('--apply')) console.log('Dry run only. To delete these caches, run again with --apply and confirm the prompt.');
  else await applyCleanup(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
