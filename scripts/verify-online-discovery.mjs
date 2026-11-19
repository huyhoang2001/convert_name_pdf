import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.B6H_ONLINE_DISCOVERY_SMOKE !== '1') throw Error('Set B6H_ONLINE_DISCOVERY_SMOKE=1 to enable the isolated release smoke test.');
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const setup = resolve(option('--setup') ?? '');
const version = option('--version');
const expected = (option('--expected') ?? '').split(',').filter(Boolean).sort();
if (!setup.toLowerCase().endsWith('.exe') || !await stat(setup).then(value => value.isFile(), () => false) || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !expected.length || expected.some(value => !['frontend', 'core', 'wordcraft'].includes(value))) throw Error('Usage: verify-online-discovery.mjs --setup BASE-SETUP.exe --version X.Y.Z --expected frontend,core');

const root = await mkdtemp(join(tmpdir(), 'b6h-online-discovery-'));
const install = join(root, 'install');
const profile = join(root, 'profile');
const local = join(root, 'local');
await Promise.all([mkdir(install), mkdir(profile), mkdir(local)]);
const port = 9230 + (process.pid % 500);
const env = {
  ...process.env,
  APPDATA: profile,
  LOCALAPPDATA: local,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
};
let app;
let socket;

async function page() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
  return (await response.json()).find(item => item.type === 'page' && /(?:tauri\.localhost|localhost:\d+)\//.test(item.url));
}

async function invoke(command) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const target = await page();
      if (!target) throw Error('B6H page is not ready.');
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`Timed out invoking ${command}.`)), 60_000);
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          clearTimeout(timer);
          if (message.error || message.result?.exceptionDetails) reject(Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
          else resolve(message.result.result?.value);
        };
        socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
          expression: `typeof window.__TAURI_INTERNALS__?.invoke === 'function' ? Promise.resolve(window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)})).then(value => ({ready:true,value})) : {ready:false}`,
          returnByValue: true,
          awaitPromise: true,
        } }));
      });
      if (result?.ready) return result.value;
    } catch {}
    socket?.close();
    socket = undefined;
    await delay(500);
  }
  throw Error(`The installed B6H app did not expose ${command}.`);
}

try {
  const installed = spawnSync(setup, ['/S', `/D=${install}`], { env, windowsHide: true, stdio: 'ignore', timeout: 120_000 });
  assert.equal(installed.status, 0, `Base Setup failed to install: ${installed.error ?? installed.status}`);
  assert.equal(await stat(join(install, 'b6h.exe')).then(value => value.isFile(), () => false), true, 'Base Setup did not install b6h.exe.');
  app = spawn(join(install, 'b6h.exe'), [], { cwd: install, env, windowsHide: true, stdio: 'ignore' });

  let updates;
  for (let attempt = 0; attempt < 24; attempt++) {
    updates = await invoke('discover_online_updates');
    const actual = updates.map(item => item.component).sort();
    if (JSON.stringify(actual) === JSON.stringify(expected) && updates.every(item => item.version === version)) break;
    if (attempt === 23) throw Error(`Settings update discovery returned ${JSON.stringify(updates)}; expected ${JSON.stringify(expected)} at ${version}.`);
    await delay(5000);
  }
  assert.deepEqual(updates.map(item => item.component).sort(), expected);
  console.log(JSON.stringify({ result: 'passed', version, discovered: updates.map(item => ({ component: item.component, version: item.version })) }));
} finally {
  socket?.close();
  if (app && app.exitCode === null) app.kill();
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "name='b6h.exe'" | Where-Object { $_.ExecutablePath -eq '${join(install, 'b6h.exe').replaceAll("'", "''")}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { windowsHide: true, stdio: 'ignore' });
  await rm(root, { recursive: true, force: true });
}
