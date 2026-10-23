// Remembers the signed-in site + tokens between launches.
// Tokens are encrypted with the OS keychain (DPAPI on Windows) via safeStorage.
// privatetoken is optional: Moodle hands it out at sign-in and NEKO needs it to open signed-in in-app pages.

const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const file = () => path.join(app.getPath('userData'), 'session.json');

async function save({ site, token, privatetoken }) {
  const secret = JSON.stringify({ token, privatetoken: privatetoken || null });
  const encrypted = await safeStorage.isAsyncEncryptionAvailable();
  const stored = encrypted ? (await safeStorage.encryptStringAsync(secret)).toString('base64') : secret;
  await fs.writeFile(file(), JSON.stringify({ site, token: stored, encrypted, v: 2 }), 'utf8');
}

async function load() {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8'));
    const secret = data.encrypted
      ? (await safeStorage.decryptStringAsync(Buffer.from(data.token, 'base64'))).result
      : data.token;
    // Older sessions stored the bare token.
    const { token, privatetoken } = data.v === 2 ? JSON.parse(secret) : { token: secret, privatetoken: null };
    return data.site && token ? { site: data.site, token, privatetoken } : null;
  } catch {
    return null;
  }
}

async function clear() {
  await fs.rm(file(), { force: true });
}

module.exports = { save, load, clear };
