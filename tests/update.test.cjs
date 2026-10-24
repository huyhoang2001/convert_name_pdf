const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isNewerVersion, isPortableReleaseAsset, isWindowsExecutable, portableUpdateScript } = require('../electron/update.cjs');

test('compares release versions and skips intermediate releases', () => {
  assert.equal(isNewerVersion('1.0.4', 'v1.2.0'), true);
  assert.equal(isNewerVersion('1.2.0', '1.2.0'), false);
  assert.equal(isNewerVersion('1.2.1', '1.2.0'), false);
  assert.throws(() => isNewerVersion('1.0', '1.1.0'), /Invalid version/);
});

test('recognizes portable release asset names after GitHub normalizes spaces', () => {
  assert.equal(isPortableReleaseAsset('SAFE.PDF.RENAME.1.0.1.exe'), true);
  assert.equal(isPortableReleaseAsset('SAFE-PDF-RENAME-1.0.2.exe'), true);
  assert.equal(isPortableReleaseAsset('B6H-1.0.8.exe'), true);
  assert.equal(isPortableReleaseAsset('unrelated.exe'), false);
});

test('accepts only files with the Windows executable signature', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-pdf-update-'));
  const exe = path.join(dir, 'update.exe');
  const text = path.join(dir, 'update.txt');
  fs.writeFileSync(exe, Buffer.from([0x4d, 0x5a, 0x00]));
  fs.writeFileSync(text, 'not an exe');
  assert.equal(isWindowsExecutable(exe), true);
  assert.equal(isWindowsExecutable(text), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('portable update helper waits for the launcher and keeps a rollback copy', () => {
  assert.match(portableUpdateScript, /ProcessId=/);
  assert.match(portableUpdateScript, /backup = target & "\.previous"/);
  assert.match(portableUpdateScript, /fso\.MoveFile backup, target/);
});
