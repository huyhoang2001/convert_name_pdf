import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = new URL('../public/wordcraft/', import.meta.url);
const checker = fileURLToPath(new URL('../scripts/build-wordcraft.mjs', import.meta.url));

async function checkMutatedBundle(mutate) {
  const directory = await mkdtemp(join(tmpdir(), 'wordcraft-check-'));
  try {
    await cp(source, directory, { recursive: true });
    await mutate(directory);
    return spawnSync(process.execPath, [checker, `--check=${directory}`], { cwd: root, encoding: 'utf8' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('Wordcraft asset checker rejects changed bytes covered by SRI', async () => {
  const result = await checkMutatedBundle(async directory => {
    const entry = (await readdir(directory)).find(file => /^wordcraft-web-.*\.js$/.test(file));
    const js = join(directory, entry);
    await writeFile(js, Buffer.concat([await readFile(js), Buffer.from('\n// changed') ]));
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SRI mismatch/);
});

test('Wordcraft asset checker rejects a missing snippet', async () => {
  const result = await checkMutatedBundle(async directory => {
    const snippets = await readdir(join(directory, 'snippets'));
    await rm(join(directory, 'snippets', snippets[0], 'inline0.js'));
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing .*inline0\.js/);
});

test('Wordcraft asset checker rejects a missing or versioned WASM namespace mapping', async () => {
  const result = await checkMutatedBundle(async directory => {
    const entry = (await readdir(directory)).find(file => /^wordcraft-web-.*\.js$/.test(file));
    const js = join(directory, entry);
    const body = await readFile(js, 'utf8');
    await writeFile(js, body.replace(/("\.\/snippets\/[^\"]+inline0\.js")\s*:\s*import\d+/g, '$1?v=stale: import1'));
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WASM namespace is missing/);
});

test('Wordcraft asset checker rejects stale generated bundle files', async () => {
  const result = await checkMutatedBundle(async directory => {
    await writeFile(join(directory, 'wordcraft-web-obsolete.js'), 'export {};');
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale assets/);
});
