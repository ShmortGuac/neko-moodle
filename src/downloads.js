// Saves course files to <download folder>/<course>/<...>. The folder is Downloads/NEKO unless the
// user picked another one in Settings (kept in <userData>/downloads.json).
// Files already on disk with the same size are skipped, so "Download all" works as a sync.

const { app, dialog } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { MoodleError } = require('./moodle');

const defaultRoot = () => path.join(app.getPath('downloads'), 'NEKO');
const configFile = () => path.join(app.getPath('userData'), 'downloads.json');

function customRoot() {
  try {
    const { folder } = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    return typeof folder === 'string' && path.isAbsolute(folder) ? folder : null;
  } catch {
    return null;
  }
}

const root = () => customRoot() || defaultRoot();
const folderInfo = () => ({ folder: root(), custom: !!customRoot(), default: defaultRoot() });

// Asks for a new download folder. Returns the folder info, or null if cancelled.
async function chooseRoot(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose where NEKO saves files',
    defaultPath: root(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths.length) return null;
  const folder = path.resolve(filePaths[0]);
  if (folder === defaultRoot()) return resetRoot();
  fs.writeFileSync(configFile(), `${JSON.stringify({ folder }, null, 2)}\n`, 'utf8');
  return folderInfo();
}

function resetRoot() {
  fs.rmSync(configFile(), { force: true });
  return folderInfo();
}

function safeName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150);
  return cleaned || 'file';
}

// Saves a Moodle file to `target` (via a .part file, so a cancelled download never looks finished).
async function fetchTo(client, url, target) {
  if (!client.isOwnUrl(url)) throw new MoodleError('Refusing to download from outside your Moodle site.');
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const res = await fetch(client.tokenize(url));
  if (!res.ok) throw new MoodleError(`Download failed (${res.status}).`);
  if ((res.headers.get('content-type') || '').includes('application/json')) {
    const json = await res.json().catch(() => ({}));
    throw new MoodleError(json.error || json.message || 'Download failed.', json.errorcode);
  }
  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, target);
}

const sizeIs = (file, size) => {
  try {
    return fs.statSync(file).size === size;
  } catch {
    return false;
  }
};

async function downloadFile(client, { url, filename, folder = [], filesize }) {
  if (!client.isOwnUrl(url)) throw new MoodleError('Refusing to download from outside your Moodle site.');

  const segments = (Array.isArray(folder) ? folder : [folder])
    .flatMap((s) => String(s || '').split(/[\\/]/))
    .map((s) => s.trim())
    .filter(Boolean)
    .map(safeName);
  const dir = path.join(root(), ...segments);
  const target = path.join(dir, safeName(filename));

  if (filesize && sizeIs(target, filesize)) return { path: target, skipped: true };
  await fetchTo(client, url, target);
  return { path: target, skipped: false };
}

// PDFs opened in NEKO's viewer are kept in a temporary folder (not the download folder), emptied when
// NEKO starts and quits. Returns a file:// URL for the viewer.
const previewDir = () => path.join(app.getPath('temp'), 'NEKO-preview');

async function previewFile(client, { url, filename, filesize, mimetype }) {
  if (!/\.pdf$/i.test(filename || '') && mimetype !== 'application/pdf') throw new MoodleError('Only PDF files open in NEKO.');
  const key = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
  const target = path.join(previewDir(), `${key}-${safeName(filename).replace(/\.pdf$/i, '')}.pdf`);
  if (!(filesize && sizeIs(target, filesize))) {
    await fetchTo(client, url, target);
    // A login page or error page instead of the file shouldn't end up in the viewer.
    const head = Buffer.alloc(5);
    const fd = fs.openSync(target, 'r');
    fs.readSync(fd, head, 0, 5, 0);
    fs.closeSync(fd);
    if (head.toString('latin1') !== '%PDF-') {
      fs.rmSync(target, { force: true });
      throw new MoodleError('Moodle didn\'t send a PDF. Try downloading it instead.');
    }
  }
  return pathToFileURL(target).href;
}

function clearPreviews() {
  fs.rmSync(previewDir(), { recursive: true, force: true });
}

module.exports = { downloadFile, previewFile, clearPreviews, root, folderInfo, chooseRoot, resetRoot };
