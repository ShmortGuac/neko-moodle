// Remembers the signed-in site + token between launches.
// The token is encrypted with the OS keychain (DPAPI on Windows) via safeStorage.

const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const file = () => path.join(app.getPath('userData'), 'session.json');

async function save({ site, token }) {
  const encrypted = await safeStorage.isAsyncEncryptionAvailable();
  const stored = encrypted ? (await safeStorage.encryptStringAsync(token)).toString('base64') : token;
  await fs.writeFile(file(), JSON.stringify({ site, token: stored, encrypted }), 'utf8');
}

async function load() {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8'));
    const token = data.encrypted
      ? (await safeStorage.decryptStringAsync(Buffer.from(data.token, 'base64'))).result
      : data.token;
    return data.site && token ? { site: data.site, token } : null;
  } catch {
    return null;
  }
}

async function clear() {
  await fs.rm(file(), { force: true });
}

module.exports = { save, load, clear };
