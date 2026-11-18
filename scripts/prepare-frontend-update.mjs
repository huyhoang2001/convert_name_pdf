import { readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/frontend-update');
if (dirname(output) !== resolve(root, 'dist') || !(await stat(output).then(value => value.isDirectory(), () => false))) throw Error('Frontend update output is missing or outside dist.');
for (const name of await readdir(output)) {
  if (name === 'wordcraft' || name.startsWith('.wordcraft-stage-')) await rm(join(output, name), { recursive: true, force: true });
}
if (await readdir(output).then(names => names.some(name => name === 'wordcraft' || name.startsWith('.wordcraft-stage-')))) throw Error('Frontend update must not contain Wordcraft runtime or staging files.');
