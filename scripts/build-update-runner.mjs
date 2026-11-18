import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = resolve(root, 'src-tauri/target');
const args = ['build', '--manifest-path', 'src-tauri/update-runner/Cargo.toml', '--locked', '--release', '--target', 'x86_64-pc-windows-msvc', '--bin', 'b6h-update-runner'];
if (process.argv.includes('--test')) args.push('--features', 'update-test-keys');
const result = spawnSync('cargo', args, { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
