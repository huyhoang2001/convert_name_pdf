const fs = require('node:fs');
const path = require('node:path');
const { readKey } = require('./chatbot.cjs');

function createChatKeyStore({ file, envFile, safeStorage, environment = process.env }) {
  const fallback = () => readKey(envFile, environment);
  const exists = () => fs.existsSync(file);
  async function savedKey() {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw Error('Secure key storage is unavailable.');
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(fs.readFileSync(file));
      if (!result) throw Error('Empty key');
      if (shouldReEncrypt) await save(result);
      return result;
    } catch { throw Error('Saved OpenRouter key cannot be read. Replace or remove it in Settings.'); }
  }
  async function status() {
    if (exists()) {
      try { await savedKey(); return { source: 'saved', configured: true }; }
      catch { return { source: 'error', configured: false }; }
    }
    return { source: fallback() ? 'environment' : 'none', configured: Boolean(fallback()) };
  }
  async function resolve() { return exists() ? savedKey() : fallback(); }
  async function save(value) {
    if (typeof value !== 'string' || !value || value.length > 512 || /\s/.test(value)) throw Error('Enter a valid OpenRouter API key without spaces.');
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw Error('Secure key storage is unavailable.');
    const encrypted = await safeStorage.encryptStringAsync(value);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try { fs.writeFileSync(temporary, encrypted); fs.renameSync(temporary, file); }
    catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
    return { source: 'saved', configured: true };
  }
  async function remove() {
    try { fs.unlinkSync(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return status();
  }
  return { status, resolve, save, remove };
}

module.exports = { createChatKeyStore };
