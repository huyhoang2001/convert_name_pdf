import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { createChatKeyStore } = createRequire(import.meta.url)('../electron/chat-key.cjs');
const secureStorage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async value => Buffer.from(`key:${value}`).map(byte => byte ^ 0xa5),
  decryptStringAsync: async bytes => {
    const value = Buffer.from(bytes).map(byte => byte ^ 0xa5).toString();
    if (!value.startsWith('key:')) throw Error('Unreadable');
    return { result: value.slice(4), shouldReEncrypt: false };
  }
};

test('Settings key is encrypted, wins over .env, and removing it restores .env', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'b6h-key-settings-'));
  const file = join(directory, 'openrouter-key.bin'), envFile = join(directory, '.env');
  writeFileSync(envFile, 'OPENROUTER_API_KEY=env-key');
  const store = createChatKeyStore({ file, envFile, safeStorage: secureStorage, environment: {} });
  try {
    assert.deepEqual(await store.status(), { source: 'environment', configured: true });
    assert.equal(await store.resolve(), 'env-key');
    assert.deepEqual(await store.save('saved-key'), { source: 'saved', configured: true });
    assert.ok(!readFileSync(file).includes(Buffer.from('saved-key')));
    assert.equal(await store.resolve(), 'saved-key');
    await store.save('replacement-key');
    assert.equal(await store.resolve(), 'replacement-key');
    assert.deepEqual(await store.remove(), { source: 'environment', configured: true });
    assert.equal(await store.resolve(), 'env-key');
  } finally {
    if (existsSync(file)) unlinkSync(file);
    if (existsSync(envFile)) unlinkSync(envFile);
    rmdirSync(directory);
  }
});

test('invalid input and unavailable encryption never save plaintext', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'b6h-key-errors-'));
  const file = join(directory, 'openrouter-key.bin');
  const store = createChatKeyStore({ file, envFile: join(directory, '.env'), safeStorage: { ...secureStorage, isAsyncEncryptionAvailable: async () => false }, environment: {} });
  try {
    for (const value of ['', 'key with spaces', 'x'.repeat(513)]) await assert.rejects(store.save(value), /valid OpenRouter API key/);
    await assert.rejects(store.save('valid-key'), /Secure key storage is unavailable/);
    assert.equal(existsSync(file), false);
  } finally { rmdirSync(directory); }
});

test('unreadable saved key reports an error and is not replaced by .env silently', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'b6h-key-corrupt-'));
  const file = join(directory, 'openrouter-key.bin'), envFile = join(directory, '.env');
  writeFileSync(file, 'corrupt');
  writeFileSync(envFile, 'OPENROUTER_API_KEY=env-key');
  const store = createChatKeyStore({ file, envFile, safeStorage: secureStorage, environment: {} });
  try {
    assert.deepEqual(await store.status(), { source: 'error', configured: false });
    await assert.rejects(store.resolve(), /cannot be read/);
    assert.deepEqual(await store.remove(), { source: 'environment', configured: true });
  } finally {
    if (existsSync(file)) unlinkSync(file);
    unlinkSync(envFile);
    rmdirSync(directory);
  }
});
