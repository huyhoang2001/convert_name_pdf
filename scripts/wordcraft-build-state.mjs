import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const excludedDirectories = new Set(['.git', 'target', 'dist', 'node_modules']);

async function filesUnder(dir, excludeGenerated = true, root = dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const generated = excludedDirectories.has(item.name) && (item.name !== 'dist' || dir === root);
    if (item.isDirectory() && (!excludeGenerated || !generated)) files.push(...await filesUnder(join(dir, item.name), excludeGenerated, root));
    else if (item.isFile()) files.push(join(dir, item.name));
    else if (item.isSymbolicLink()) throw Error(`Wordcraft build state cannot safely fingerprint symlink: ${join(dir, item.name)}`);
  }
  return files;
}

export async function inventory(dir) {
  const files = await filesUnder(dir, false);
  const entries = await Promise.all(files.map(async path => ({
    path: relative(dir, path).split(sep).join('/'),
    sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
  })));
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function fingerprintInputs(root, extraFiles, recipe) {
  const files = await filesUnder(root);
  const missing = [];
  for (const path of extraFiles) {
    try {
      if ((await stat(path)).isDirectory()) files.push(...await filesUnder(path));
      else files.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      missing.push(path);
    }
  }
  files.sort();
  const digest = createHash('sha256').update(JSON.stringify(recipe));
  for (const path of missing.sort()) digest.update(`missing:${relative(root, path).split(sep).join('/')}`);
  for (const path of files) {
    digest.update(relative(root, path).split(sep).join('/'));
    digest.update(await readFile(path));
  }
  return digest.digest('hex');
}

export function selectAction(fingerprint, manifest, publicMatches, distMatches) {
  if (![1, 2].includes(manifest?.version) || manifest.verified !== true) return 'UNKNOWN';
  if (manifest.inputFingerprint !== fingerprint) return 'BUILD REQUIRED';
  if (publicMatches) return 'REUSE';
  if (distMatches) return 'SYNC ONLY';
  return 'BUILD REQUIRED';
}

export function selectBuildAction(fingerprint, manifest, publicMatches, distMatches, explicitBuild) {
  const action = selectAction(fingerprint, manifest, publicMatches, distMatches);
  return explicitBuild && action === 'UNKNOWN' ? 'BUILD REQUIRED' : action;
}

export async function matchesInventory(dir, expected) {
  try {
    const info = await lstat(dir);
    if (!info.isDirectory()) return false;
    return JSON.stringify(await inventory(dir)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

export async function publishDirectory(current, staged, backup, validate, commit) {
  let hasBackup = false;
  try { await rename(current, backup); hasBackup = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await rename(staged, current);
    await validate(current);
    await commit();
  } catch (error) {
    if (hasBackup) {
      try {
        const failed = `${backup}.failed`;
        try { await rename(current, failed); } catch (moveError) { if (moveError.code !== 'ENOENT') throw moveError; }
        await rename(backup, current);
        if (await stat(failed).then(() => true, () => false)) await rm(failed, { recursive: true });
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Could not restore the previous runtime; recovery files remain at ${backup}`);
      }
    }
    throw error;
  }
  if (hasBackup) await rm(backup, { recursive: true });
}
