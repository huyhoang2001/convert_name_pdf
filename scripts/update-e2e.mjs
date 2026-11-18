import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import { resolve, join, relative, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve('.');
const state = resolve('.b6h-state');
const runId = process.env.B6H_UPDATE_E2E_ID ?? 'modular-final';
if (!/^[a-z0-9-]{1,32}$/i.test(runId)) throw Error('Invalid isolated update E2E run ID.');
const testRoot = resolve('.b6h-state', `installer-smoke-${runId}`);
const install = join(testRoot, 'install');
const profile = join(testRoot, 'profile');
const local = join(testRoot, 'local');
const distribution = resolve(process.env.B6H_UPDATE_E2E_DISTRIBUTION ?? '.b6h-state/distribution');
const scenario = process.env.B6H_UPDATE_E2E_SCENARIO ?? (process.env.B6H_UPDATE_E2E_FAULT === 'core-readiness' ? 'core-readiness' : 'success');
const setup = join(distribution, process.env.B6H_UPDATE_E2E_SETUP ?? 'B6H-v3.0.0-x64-Setup.exe');
const exe = join(install, 'b6h.exe');
const cdp = 'http://127.0.0.1:9222';
const usesOnline = scenario !== 'offline-modular';
const timings = {};
const inside = path => relative(state, path) && !relative(state, path).startsWith(`..${sep}`) && !resolve(path).startsWith('..');
if (process.env.B6H_UPDATE_E2E !== '1' || !inside(install) || !inside(profile) || !inside(local)) throw Error('Refusing update E2E without B6H_UPDATE_E2E=1 and isolated paths inside .b6h-state.');
if (await stat(install).then(() => true, () => false)) throw Error(`Refusing to overwrite existing test install: ${install}`);
await mkdir(profile, { recursive: true });
await mkdir(local, { recursive: true });
const data = join(profile, 'SAFE PDF RENAME');
await mkdir(data, { recursive: true });
const sentinel = join(data, 'update-e2e-preserve.txt');
const sentinelBytes = Buffer.from(`B6H update E2E ${Date.now()}\n`);
await writeFile(sentinel, sentinelBytes, { flag: 'wx' });
const settingsPath = join(data, 'settings.json');
const settingsBytes = Buffer.from(JSON.stringify({ chatbotVisible: true, acceptanceMarker: runId }));
await writeFile(settingsPath, settingsBytes, { flag: 'wx' });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sentinelHash = digest(sentinelBytes);
const settingsHash = digest(settingsBytes);
const baseEnv = {
  ...process.env,
  APPDATA: profile,
  LOCALAPPDATA: local,
  B6H_TEST_SKIP_RUNONCE: '1',
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222',
};
let testCa;
if (usesOnline) {
  baseEnv.B6H_UPDATE_TEST_CA = resolve('.b6h-state/update-test-keys/local-test-ca.pem');
  baseEnv.B6H_UPDATE_TEST_ENDPOINT = 'https://localhost:8443/releases/latest';
  testCa = await readFile(baseEnv.B6H_UPDATE_TEST_CA);
} else {
  delete baseEnv.B6H_UPDATE_TEST_CA;
  delete baseEnv.B6H_UPDATE_TEST_ENDPOINT;
}
const server = usesOnline ? spawn(process.execPath, ['scripts/update-test-server.mjs'], {
  cwd: root, env: { ...baseEnv, B6H_UPDATE_TEST_SERVER: '1', B6H_UPDATE_TEST_DISTRIBUTION: distribution }, windowsHide: true,
  stdio: ['ignore', 'ignore', 'inherit'],
}) : null;
let app;
let appEnv = baseEnv;
try {
  if (usesOnline) {
    for (let i = 0; i < 80; i++) {
      try {
        await new Promise((resolve, reject) => https.get(baseEnv.B6H_UPDATE_TEST_ENDPOINT, { ca: testCa }, response => {
          response.resume();
          response.statusCode === 200 ? resolve() : reject(Error(`Test endpoint returned ${response.statusCode}`));
        }).on('error', reject));
        break;
      } catch {}
      if (i === 79) throw Error('Local HTTPS update test server did not become ready.');
      await delay(250);
    }
  }
  const installed = spawnSync(setup, ['/S', `/D=${install}`], { env: baseEnv, windowsHide: true, stdio: 'ignore', timeout: 120_000 });
  assert.equal(installed.status, 0, `Initial current-user install failed: ${installed.stderr ?? installed.error ?? installed.status}`);
  assert.equal(await stat(join(install, 'b6h-update-runner.exe')).then(() => true, () => false), true, 'Update runner was not installed as a resource.');
  app = spawn(exe, [], { cwd: install, env: appEnv, windowsHide: true, stdio: 'ignore' });
  const invoke = async (command, args = {}, timeoutMs = 60_000) => {
    for (let attempt = 0; attempt < 240; attempt++) {
      const page = await waitPage();
      const socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error(`CDP timed out invoking ${command}`)), timeoutMs);
          socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (message.id !== 1) return;
            clearTimeout(timer);
            if (message.error || message.result?.exceptionDetails) reject(Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
            else resolve(message.result.result?.value);
          };
          socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
            expression: `typeof window.__TAURI_INTERNALS__?.invoke === 'function' ? Promise.resolve(window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})).then(value => ({ready:true,value})) : {ready:false}`,
            returnByValue: true, awaitPromise: true,
          } }));
        });
        if (result?.ready) return result.value;
      } catch (error) {
        if (timeoutMs > 5_000 || !String(error).includes(`CDP timed out invoking ${command}`)) throw error;
      } finally { socket.close(); }
      await delay(250);
    }
    throw Error(`Installed B6H frontend did not expose its native API for ${command}.`);
  };
  async function waitPage() {
    for (let i = 0; i < 240; i++) {
      try {
        const pages = await fetch(`${cdp}/json/list`).then(response => response.json());
        const page = pages.find(item => item.type === 'page' && /tauri\.localhost\//.test(item.url));
        if (page) return page;
      } catch {}
      await delay(500);
    }
    throw Error('Installed B6H WebView2 did not reach readiness.');
  }
  async function waitStatus(predicate, label) {
    let last;
    for (let i = 0; i < 240; i++) {
      try {
        last = await invoke('get_update_runtime_status', {}, 5_000);
        if (predicate(last)) return last;
      } catch {}
      await delay(500);
    }
    throw Error(`${label}; last status: ${JSON.stringify(last)}`);
  }
  const updates = join(data, 'updates');
  const transactionPath = join(updates, 'core-transaction.json');
  const runner = join(updates, 'core-update-runner.exe');
  const runnerHash = digest(await readFile(join(install, 'b6h-update-runner.exe')));
  const waitTransactionComplete = async label => {
    for (let i = 0; i < 240; i++) {
      if (!(await stat(transactionPath).then(() => true, () => false))) return;
      await delay(250);
    }
    throw Error(`${label}: Core transaction journal was not cleared.`);
  };
  const waitTransactionStarted = async label => {
    for (let i = 0; i < 240; i++) {
      if (await stat(transactionPath).then(() => true, () => false)) return JSON.parse(await readFile(transactionPath, 'utf8'));
      await delay(100);
    }
    throw Error(`${label}: Core transaction journal was not created.`);
  };
  const installedVersion = async () => (await import('node:child_process')).execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).trim();
  const coreSnapshotFiles = async dir => {
    let files = [];
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files = files.concat(await coreSnapshotFiles(path));
      else if (entry.isFile() && entry.name.toLowerCase() === 'b6h.exe') files.push(path);
    }
    return files;
  };
  const assertPreserved = async () => {
    assert.equal(digest(await readFile(sentinel)), sentinelHash, 'Core transaction changed user data');
    assert.equal(digest(await readFile(settingsPath)), settingsHash, 'Core transaction changed settings JSON');
    assert.equal(digest(await readFile(runner)), runnerHash, 'Core transaction replaced or damaged the external update runner');
  };
  const assertCoreTerminal = async (expectedVersion, status) => {
    await waitTransactionComplete(`Core ${expectedVersion} terminal state`);
    for (const name of ['core-pending.json', 'core-next', 'core-next.tmp', 'core-rollback.new', 'core-rollback.old']) {
      assert.equal(await stat(join(updates, name)).then(() => true, () => false), false, `Core terminal state left ${name}`);
    }
    const ready = (await readdir(updates)).filter(name => name.startsWith('core-ready-'));
    assert.deepEqual(ready, [], `Core terminal state left readiness markers: ${ready}`);
    assert.match(await installedVersion(), new RegExp(`^${expectedVersion.replaceAll('.', '\\.')}`));
    const snapshots = await coreSnapshotFiles(join(updates, 'core-rollback'));
    assert(snapshots.length <= 1, `More than one prior Core installation remains: ${snapshots.length}`);
    assert.equal(Boolean(status?.canRollbackCore), snapshots.length === 1, 'Core rollback status does not match retained snapshot');
    await assertPreserved();
    assert.equal(await stat(runner).then(() => true, () => false), true, 'External update runner is missing');
  };
  let phaseStart = performance.now();
  let discovered = [];
  if (usesOnline) {
    discovered = await invoke('discover_online_updates');
    timings.onlineDiscoveryMs = Math.round(performance.now() - phaseStart);
    assert.equal(discovered.length, 3, `Expected all three signed online packages, got ${JSON.stringify(discovered)}`);
    for (const component of ['frontend', 'wordcraft', 'core']) {
      const candidate = discovered.find(item => item.component === component);
      assert(candidate, `${component} was not found in the signed catalog`);
      const started = performance.now();
      const downloaded = await invoke('download_online_update', { component, releaseId: candidate.releaseId });
      timings[`${component}DownloadAndVerifyMs`] = Math.round(performance.now() - started);
      assert.equal(downloaded.version, '3.0.1', `${component} package version mismatch`);
    }
  } else {
    for (const [component, name] of [
      ['frontend', 'frontend-v3.0.1-test.b6hupdate'],
      ['wordcraft', 'wordcraft-v3.0.1-test.b6hupdate'],
      ['core', 'core-v3.0.1-recovery-test.b6hupdate'],
    ]) {
      const started = performance.now();
      const imported = await invoke('install_update_from_file', { file: resolve(distribution, name) });
      timings[`${component}OfflineImportMs`] = Math.round(performance.now() - started);
      assert.equal(imported.component, component, `${component} offline package component mismatch`);
      assert.equal(imported.version, '3.0.1', `${component} offline package version mismatch`);
    }
  }
  const staged = await invoke('get_staged_updates');
  assert.deepEqual(staged.map(item => item.component).sort(), ['core', 'frontend', 'wordcraft']);
  const coreReleaseId = staged.find(item => item.component === 'core').releaseId;
  const fireNative = async (command, id) => {
    const page = await waitPage();
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
      expression: `window.__TAURI_INTERNALS__.invoke('${command}')`, returnByValue: true, awaitPromise: false,
    } }));
    socket.close();
  };
  const activateAndRestart = async (component, id) => {
    const item = staged.find(candidate => candidate.component === component);
    await invoke('activate_update', { component, releaseId: item.releaseId });
    await fireNative('restart_application', id);
  };
  phaseStart = performance.now();
  await activateAndRestart('frontend', 2);
  let status = await waitStatus(value => value.activeFrontend, 'Frontend activation did not complete');
  timings.frontendActivationAndRestartMs = Math.round(performance.now() - phaseStart);
  assert.match(status.activeFrontend, /3\.0\.1/);
  phaseStart = performance.now();
  await activateAndRestart('wordcraft', 3);
  status = await waitStatus(value => value.activeWordcraft, 'Wordcraft activation did not complete');
  timings.wordcraftActivationAndRestartMs = Math.round(performance.now() - phaseStart);
  assert.match(status.activeWordcraft, /3\.0\.1/);
  const runtimeSelection = { frontend: status.activeFrontend, wordcraft: status.activeWordcraft };
  const assertRuntimePreserved = current => {
    assert.equal(current.activeFrontend, runtimeSelection.frontend, 'Core transaction changed Frontend selection');
    assert.equal(current.activeWordcraft, runtimeSelection.wordcraft, 'Core transaction changed Wordcraft selection');
  };
  const faultEnv = name => {
    const env = { ...baseEnv, B6H_TEST_SUPPRESS_UPDATE_ERROR: '1' };
    if (name === 'readiness' || name === 'restore-failure') env.B6H_TEST_CORE_READY_TIMEOUT_SECS = '1';
    if (name === 'installer-failure') env.B6H_TEST_FAIL_CORE_INSTALLER = '1';
    if (name === 'launch-failure') env.B6H_TEST_FAIL_CORE_LAUNCH = '1';
    if (name === 'restore-failure') env.B6H_TEST_FAIL_CORE_RESTORE = '1';
    if (name === 'interrupted') env.B6H_TEST_PAUSE_CORE_AFTER_INSTALL = '1';
    return env;
  };
  const terminateImage = async imagePath => {
    const escaped = imagePath.replaceAll("'", "''");
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${escaped}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { windowsHide: true, stdio: 'ignore' });
  };
  const relaunch = async (environment, expectedVersion = '3.0.0') => {
    await terminateImage(exe);
    await delay(500);
    appEnv = environment;
    app = spawn(exe, [], { cwd: install, env: appEnv, windowsHide: true, stdio: 'ignore' });
    const current = await waitStatus(value => value.coreVersion === expectedVersion, `B6H did not restart at Core ${expectedVersion}`);
    assertRuntimePreserved(current);
    return current;
  };
  const triggerCoreUpdate = async () => {
    await invoke('activate_update', { component: 'core', releaseId: coreReleaseId });
    assert.equal(await stat(join(updates, 'core-pending.json')).then(() => true, () => false), true, 'Core update was not scheduled');
    const started = waitTransactionStarted('Core update launch');
    await fireNative('launch_core_update', 4);
    const transaction = await started;
    assert.equal(transaction.action, 'upgrade');
    assert.equal(transaction.version, '3.0.1');
    return transaction;
  };
  const invokeRecovery = () => {
    const result = spawnSync(runner, ['recover', updates, install, '--quiet'], { cwd: install, env: baseEnv, windowsHide: true, stdio: 'ignore', timeout: 60_000 });
    assert.equal(result.status, 0, `Explicit recovery helper failed: ${result.error ?? result.status}`);
  };
  const runFailure = async name => {
    await relaunch(faultEnv(name));
    const startedAt = performance.now();
    const tx = await triggerCoreUpdate();
    if (name === 'interrupted') {
      const marker = join(updates, `core-ready-testpause-${tx.nonce}`);
      for (let i = 0; i < 240 && !(await stat(marker).then(() => true, () => false)); i++) await delay(100);
      assert.equal(await stat(marker).then(() => true, () => false), true, 'Core runner did not pause after installer replacement');
      await terminateImage(runner);
      await delay(300);
      invokeRecovery();
    } else if (name === 'restore-failure') {
      for (let i = 0; i < 100; i++) {
        const running = spawnSync('powershell.exe', ['-NoProfile', '-Command', `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${runner.replaceAll("'", "''")}' }).Count`], { encoding: 'utf8', windowsHide: true }).stdout.trim();
        if (running === '0') break;
        await delay(200);
      }
      assert.equal(await stat(transactionPath).then(() => true, () => false), true, 'Failed restore discarded its transaction journal');
      assert.equal(await stat(join(updates, 'core-next')).then(() => true, () => false), true, 'Failed restore discarded its recovery backup');
      assert.equal(await stat(join(updates, 'core-pending.json')).then(() => true, () => false), true, 'Failed restore discarded pending recovery state');
      assert.match(await installedVersion(), /^3\.0\.1/);
      invokeRecovery();
    }
    status = await waitStatus(value => value.coreVersion === '3.0.0', `${name} did not restore the previous Core`);
    await waitTransactionComplete(`${name} recovery`);
    assertRuntimePreserved(status);
    await assertCoreTerminal('3.0.0', status);
    timings[`${name}RecoveryMs`] = Math.round(performance.now() - startedAt);
    await relaunch(baseEnv);
  };
  const runSuccessfulUpdate = async () => {
    const startedAt = performance.now();
    const tx = await triggerCoreUpdate();
    const upgraded = await waitStatus(value => value.coreVersion === '3.0.1' && value.canRollbackCore, 'Core installer upgrade/readiness failed');
    await waitTransactionComplete('Successful Core upgrade');
    assertRuntimePreserved(upgraded);
    await assertCoreTerminal('3.0.1', upgraded);
    timings.successfulCoreUpgradeMs = Math.round(performance.now() - startedAt);
    return tx;
  };
  const runManualRollback = async () => {
    const startedAt = performance.now();
    await fireNative('rollback_core_update', 5);
    const rolledBack = await waitStatus(value => value.coreVersion === '3.0.0', 'Manual Core rollback/readiness failed');
    await waitTransactionComplete('Manual Core rollback');
    assertRuntimePreserved(rolledBack);
    await assertCoreTerminal('3.0.0', rolledBack);
    assert.equal((await coreSnapshotFiles(join(updates, 'core-rollback'))).length, 1, 'Rollback must retain exactly one previous Core installation');
    timings.manualCoreRollbackMs = Math.round(performance.now() - startedAt);
  };
  if (scenario === 'offline-modular') {
    const upgraded = await runSuccessfulUpdate();
    await runManualRollback();
    for (let i = 0; i < 2; i++) {
      await fireNative('restart_application', 6 + i);
      status = await waitStatus(value => value.coreVersion === '3.0.0', `Offline update repeated restart ${i + 1} failed`);
      assertRuntimePreserved(status);
      await assertCoreTerminal('3.0.0', status);
    }
    console.log(JSON.stringify({ result: 'PASS', scenario, networkServer: false, install, profile, packages: staged.map(item => ({ component: item.component, version: item.version, releaseId: item.releaseId, bytes: item.bytes })), frontend: status.activeFrontend, wordcraft: status.activeWordcraft, coreAfterUpgrade: '3.0.1', coreAfterRollback: '3.0.0', settingsSha256: settingsHash, userDataSha256: sentinelHash, runnerSha256: runnerHash, setupBytes: (await stat(setup)).size, timings }, null, 2));
  } else if (scenario === 'core-recovery-matrix') {
    for (const name of ['installer-failure', 'launch-failure', 'readiness', 'interrupted', 'restore-failure']) await runFailure(name);
    await runSuccessfulUpdate();
    await runManualRollback();
    for (let i = 0; i < 2; i++) {
      await fireNative('restart_application', 6 + i);
      status = await waitStatus(value => value.coreVersion === '3.0.0', `Repeated restart ${i + 1} failed`);
      await assertCoreTerminal('3.0.0', status);
    }
    console.log(JSON.stringify({ result: 'PASS', scenario, install, profile, packages: discovered.map(item => ({ component: item.component, bytes: item.archiveBytes })), frontend: status.activeFrontend, wordcraft: status.activeWordcraft, coreAfterRecoveryRetry: '3.0.1', coreAfterRollback: '3.0.0', settingsSha256: settingsHash, userDataSha256: sentinelHash, runnerSha256: runnerHash, setupBytes: (await stat(setup)).size, timings }, null, 2));
  } else if (['core-readiness', 'readiness', 'installer-failure', 'launch-failure', 'interrupted', 'restore-failure'].includes(scenario)) {
    await runFailure(scenario === 'core-readiness' ? 'readiness' : scenario);
    await runSuccessfulUpdate();
    await runManualRollback();
    console.log(JSON.stringify({ result: 'PASS', scenario, install, profile, coreAfterRecoveryRetry: '3.0.1', coreAfterRollback: '3.0.0', settingsSha256: settingsHash, userDataSha256: sentinelHash, runnerSha256: runnerHash, setupBytes: (await stat(setup)).size, timings }, null, 2));
  } else {
    const startedAt = performance.now();
    const tx = await triggerCoreUpdate();
    const upgraded = await waitStatus(value => value.coreVersion === '3.0.1' && value.canRollbackCore, 'Core installer upgrade/restart readiness failed');
    await waitTransactionComplete('Core upgrade');
    assertRuntimePreserved(upgraded);
    await assertCoreTerminal('3.0.1', upgraded);
    timings.coreUpgradeAndReadinessMs = Math.round(performance.now() - startedAt);
    await runManualRollback();
    console.log(JSON.stringify({ result: 'PASS', scenario, install, profile, packages: discovered.map(item => ({ component: item.component, bytes: item.archiveBytes })), frontend: upgraded.activeFrontend, wordcraft: upgraded.activeWordcraft, coreAfterUpgrade: '3.0.1', coreAfterRollback: '3.0.0', settingsSha256: settingsHash, userDataSha256: sentinelHash, runnerSha256: runnerHash, setupBytes: (await stat(setup)).size, timings }, null, 2));
  }
} finally {
  server?.kill();
  if (app && app.exitCode === null) app.kill();
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "name='b6h.exe'" | Where-Object { $_.ExecutablePath -eq '${exe.replaceAll("'", "''")}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { windowsHide: true, stdio: 'ignore' });
}
