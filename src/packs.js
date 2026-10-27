// Theme packs (themes/<id>/theme.json + assets) and site profiles (sites/<id>.json).
// Themes are data only: JSON, CSS and images. Their files are served to the UI through
// the theme:// protocol, which can only read inside a theme's folder.
//
// Themes live in two places:
//   <app>/themes        built in (Default Light / Dark are read-only)
//   <userData>/themes   made in the theme editor; wins over a built-in theme with the same id

const { app, dialog, protocol, net, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BUILTIN_DIR = path.join(__dirname, '..', 'themes');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const LOCKED = new Set(['default-light', 'default-dark']);
const ID = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const ASSET_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'apng', 'woff', 'woff2', 'ttf', 'otf'];
// Files an imported theme may bring along. Anything else in its folder is left out.
const THEME_FILES = new Set(['json', 'css', ...ASSET_EXTS]);
const IMPORT_LIMIT = 200 * 1024 * 1024;

const userDir = () => path.join(app.getPath('userData'), 'themes');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Folder holding theme <id>, or null. User themes are checked first.
function themeDir(id) {
  if (!ID.test(id || '')) return null;
  for (const root of [userDir(), BUILTIN_DIR]) {
    const dir = path.join(root, id);
    if (fs.existsSync(path.join(dir, 'theme.json'))) return dir;
  }
  return null;
}

function listThemes() {
  const found = new Map();
  for (const [root, source] of [[BUILTIN_DIR, 'builtin'], [userDir(), 'user']]) {
    if (!fs.existsSync(root)) continue;
    for (const id of fs.readdirSync(root)) {
      const manifest = path.join(root, id, 'theme.json');
      if (!ID.test(id) || !fs.existsSync(manifest)) continue;
      try {
        const theme = readJson(manifest);
        if ('variants' in theme) throw new Error('uses the old "variants" format');
        found.set(id, {
          ...theme,
          id,
          source,
          locked: source === 'builtin' && LOCKED.has(id),
          hasCss: fs.existsSync(path.join(root, id, 'theme.css')),
        });
      } catch (e) {
        console.warn(`Skipping theme "${id}": ${e.message}`);
      }
    }
  }
  return [...found.values()];
}

function readTheme(id) {
  const dir = themeDir(id);
  if (!dir) throw new Error(`Theme "${id}" not found.`);
  const cssFile = path.join(dir, 'theme.css');
  return {
    id,
    theme: readJson(path.join(dir, 'theme.json')),
    css: fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : '',
    locked: dir.startsWith(BUILTIN_DIR) && LOCKED.has(id),
    folder: dir,
  };
}

function writableDir(id) {
  const dir = themeDir(id);
  if (!dir) throw new Error(`Theme "${id}" not found.`);
  if (dir.startsWith(BUILTIN_DIR) && LOCKED.has(id)) throw new Error('Built-in Default themes can\'t be changed. Make a copy instead.');
  return dir;
}

function saveTheme({ id, theme, css }) {
  const dir = writableDir(id);
  if (!theme || typeof theme !== 'object' || Array.isArray(theme) || 'variants' in theme) throw new Error('That isn\'t a valid theme.');
  fs.writeFileSync(path.join(dir, 'theme.json'), `${formatJson(theme)}\n`, 'utf8');
  const cssFile = path.join(dir, 'theme.css');
  if (typeof css === 'string') {
    if (css.trim()) fs.writeFileSync(cssFile, css, 'utf8');
    else fs.rmSync(cssFile, { force: true });
  }
}

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Objects merge key by key; arrays and plain values replace (same rules as the renderer's theme engine).
function deepMerge(...layers) {
  const out = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer || {})) {
      out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
    }
  }
  return out;
}

// Themes used to hold "variants" (e.g. Light / Dark) that each overrode the theme. Now one theme is
// one look, so an old theme becomes one theme per variant, named "<theme> <variant>".
// Returns [{ variant: <old variant id>, theme }].
function splitVariants(theme) {
  const { variants, ...base } = theme;
  const { name: baseName, author, version, description, ...rest } = base;
  return variants.map((v) => {
    const { id, name, subtitle, preview, swatches, ...overrides } = v;
    const head = {
      name: variants.length > 1 ? `${baseName || 'Theme'} ${name || id}` : baseName,
      author, version, description, subtitle, preview, swatches,
    };
    const flat = { ...Object.fromEntries(Object.entries(head).filter(([, x]) => x !== undefined)), ...deepMerge(rest, overrides) };
    return { variant: String(id || ''), theme: flat };
  });
}

// Splits old multi-variant themes in the user folder into separate themes (<id>-<variant>).
// The original folder is kept in <userData>/themes-backup.
function migrateUserThemes() {
  const root = userDir();
  if (!fs.existsSync(root)) return;
  for (const id of fs.readdirSync(root)) {
    const dir = path.join(root, id);
    const manifest = path.join(dir, 'theme.json');
    if (!ID.test(id) || !fs.existsSync(manifest)) continue;
    try {
      const theme = readJson(manifest);
      if (!Array.isArray(theme.variants) || !theme.variants.length) continue;
      const parts = splitVariants(theme);
      if (parts.length === 1) {
        fs.writeFileSync(manifest, `${formatJson(parts[0].theme)}\n`, 'utf8');
        continue;
      }
      for (const part of parts) {
        const base = `${id}-${slugify(part.variant)}`;
        let newId = base;
        for (let n = 2; themeDir(newId); n++) newId = `${base}-${n}`;
        fs.cpSync(dir, path.join(root, newId), { recursive: true });
        fs.writeFileSync(path.join(root, newId, 'theme.json'), `${formatJson(part.theme)}\n`, 'utf8');
      }
      const backup = path.join(app.getPath('userData'), 'themes-backup', id);
      fs.rmSync(backup, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(dir, backup);
    } catch (e) {
      console.warn(`Could not convert theme "${id}": ${e.message}`);
    }
  }
}

function slugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'theme';
}

// Copies an existing theme (default: the built-in Default Light) into the user folder under a new name.
function createTheme({ name, from = 'default-light' }) {
  const source = themeDir(from);
  if (!source) throw new Error(`Theme "${from}" not found.`);
  const base = slugify(name);
  let id = base;
  for (let n = 2; themeDir(id); n++) id = `${base}-${n}`;
  const dest = path.join(userDir(), id);
  fs.mkdirSync(userDir(), { recursive: true });
  fs.cpSync(source, dest, { recursive: true });
  const theme = readJson(path.join(dest, 'theme.json'));
  Object.assign(theme, { name: String(name || 'My theme').trim() || 'My theme', author: '', version: '1.0.0', description: '' });
  fs.writeFileSync(path.join(dest, 'theme.json'), `${formatJson(theme)}\n`, 'utf8');
  return id;
}

// Moves a theme the user made to the Recycle Bin. Built-in themes can't be deleted.
async function deleteTheme(id) {
  const dir = themeDir(id);
  if (!dir) throw new Error(`Theme "${id}" not found.`);
  if (!dir.startsWith(userDir() + path.sep)) throw new Error('Built-in themes can\'t be deleted.');
  await shell.trashItem(dir);
}

// Lets the user pick themes to import: a theme.json (its whole folder comes along) or a .zip of one
// or more theme folders. Each becomes a new theme in the user folder; nothing is overwritten.
// Returns { ids, errors }, or null if cancelled.
async function importThemes(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import themes',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Themes (theme.json or .zip)', extensions: ['json', 'zip'] }],
  });
  if (canceled || !filePaths.length) return null;
  return importFiles(filePaths);
}

async function importFiles(filePaths) {
  const ids = [];
  const errors = [];
  for (const file of filePaths) {
    try {
      if (path.extname(file).toLowerCase() === '.zip') ids.push(...(await importZip(file)));
      else ids.push(...importFolder(path.dirname(file), path.basename(file)));
    } catch (e) {
      errors.push(`${path.basename(file)}: ${e.message}`);
    }
  }
  return { ids, errors };
}

async function importZip(file) {
  if (fs.statSync(file).size > IMPORT_LIMIT) throw new Error('The file is too big.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-theme-'));
  try {
    // Windows' own tar reads .zip files. It refuses "../" paths, and only real files are copied out.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    await new Promise((resolve, reject) => execFile(tar, ['-xf', file, '-C', tmp], { windowsHide: true }, (err) => (err ? reject(new Error('That isn\'t a zip file NEKO can read.')) : resolve())));
    // The theme can be at the top of the zip, or in one folder per theme.
    if (fs.existsSync(path.join(tmp, 'theme.json'))) return importFolder(tmp, 'theme.json', path.basename(file, path.extname(file)));
    const found = fs.readdirSync(tmp, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(tmp, d.name, 'theme.json')));
    if (!found.length) throw new Error('No theme.json in the zip.');
    return found.flatMap((d) => importFolder(path.join(tmp, d.name), 'theme.json'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Copies a theme folder into the user folder under a new id. Old themes with variants become one theme each.
function importFolder(src, manifest = 'theme.json', fallbackName = path.basename(src)) {
  let theme;
  try {
    theme = readJson(path.join(src, manifest));
  } catch {
    throw new Error('Not a valid theme.json.');
  }
  if (!isPlainObject(theme)) throw new Error('Not a valid theme.json.');
  const parts = Array.isArray(theme.variants) && theme.variants.length ? splitVariants(theme).map((p) => p.theme) : [theme];
  return parts.map((part) => {
    if (!part.name) part.name = fallbackName;
    const base = slugify(part.name);
    let id = base;
    for (let n = 2; themeDir(id); n++) id = `${base}-${n}`;
    const dest = path.join(userDir(), id);
    copyThemeFiles(src, dest, manifest);
    fs.writeFileSync(path.join(dest, 'theme.json'), `${formatJson(part)}\n`, 'utf8');
    return id;
  });
}

// Copies the theme's CSS, images and fonts (no other files, no links), up to IMPORT_LIMIT in total.
function copyThemeFiles(src, dest, manifest) {
  let total = 0;
  const walk = (from, to, depth) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, entry.name);
      const b = path.join(to, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4 && !entry.name.startsWith('.') && entry.name !== 'node_modules') walk(a, b, depth + 1);
      } else if (entry.isFile() && THEME_FILES.has(path.extname(entry.name).slice(1).toLowerCase()) && !(depth === 0 && entry.name === manifest)) {
        total += fs.statSync(a).size;
        if (total > IMPORT_LIMIT) throw new Error('The theme is too big.');
        fs.copyFileSync(a, b);
      }
    }
  };
  try {
    walk(src, dest, 0);
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }
}

// Saves a theme as a .zip someone else can import: one <id>/ folder with theme.json, theme.css and its
// pictures and fonts (nothing else from the folder). Returns the saved path, or null if cancelled.
async function exportTheme(win, id) {
  const dir = themeDir(id);
  if (!dir) throw new Error(`Theme "${id}" not found.`);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export theme',
    defaultPath: path.join(app.getPath('downloads'), `${id}.zip`),
    filters: [{ name: 'Theme (.zip)', extensions: ['zip'] }],
  });
  if (canceled || !filePath) return null;
  const out = path.extname(filePath).toLowerCase() === '.zip' ? filePath : `${filePath}.zip`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-export-'));
  try {
    copyThemeFiles(dir, path.join(tmp, id), null);
    const zip = path.join(tmp, 'theme.zip');
    // Windows' own tar writes a .zip when the name ends in .zip (-a). Built next to the theme, then moved into place.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    await new Promise((resolve, reject) => execFile(tar, ['-a', '-cf', zip, '-C', tmp, id], { windowsHide: true }, (err) => (err ? reject(new Error('Could not make the zip file.')) : resolve())));
    fs.copyFileSync(zip, out);
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The folder holding the user's themes (created if missing).
function userFolder() {
  fs.mkdirSync(userDir(), { recursive: true });
  return userDir();
}

// Lets the user pick an image or font and copies it into the theme's assets folder.
async function importAsset(win, { id, kind = 'image' }) {
  const dir = writableDir(id);
  const filters = kind === 'font'
    ? [{ name: 'Fonts', extensions: ['woff2', 'woff', 'ttf', 'otf'] }]
    : [{ name: 'Images', extensions: ASSET_EXTS.filter((e) => !['woff', 'woff2', 'ttf', 'otf'].includes(e)) }];
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Add to theme', properties: ['openFile'], filters });
  if (canceled || !filePaths.length) return null;
  const src = filePaths[0];
  const ext = path.extname(src).slice(1).toLowerCase();
  if (!ASSET_EXTS.includes(ext)) throw new Error('That file type isn\'t supported.');
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const stem = slugify(path.basename(src, path.extname(src)));
  let file = `${stem}.${ext}`;
  for (let n = 2; fs.existsSync(path.join(assets, file)); n++) {
    if (fs.readFileSync(path.join(assets, file)).equals(fs.readFileSync(src))) break; // same file already there
    file = `${stem}-${n}.${ext}`;
  }
  fs.copyFileSync(src, path.join(assets, file));
  return `assets/${file}`;
}

// JSON with short arrays/objects kept on one line, so theme files stay readable.
function formatJson(value, indent = '') {
  const inline = JSON.stringify(value);
  const nested = value && typeof value === 'object' && Object.values(value).some((v) => v && typeof v === 'object');
  if (!value || typeof value !== 'object' || (!nested && inline.length <= 90)) return inline;
  const next = `${indent}  `;
  const items = Array.isArray(value)
    ? value.map((v) => next + formatJson(v, next))
    : Object.entries(value).map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`);
  if (!items.length) return Array.isArray(value) ? '[]' : '{}';
  return Array.isArray(value) ? `[\n${items.join(',\n')}\n${indent}]` : `{\n${items.join(',\n')}\n${indent}}`;
}

function listSites() {
  const sites = [];
  if (!fs.existsSync(SITES_DIR)) return sites;
  for (const file of fs.readdirSync(SITES_DIR)) {
    const id = path.basename(file, '.json');
    if (!file.endsWith('.json') || !ID.test(id)) continue;
    try {
      const site = readJson(path.join(SITES_DIR, file));
      if (site.logo) {
        try {
          site.logo = inlineImage(SITES_DIR, site.logo);
        } catch (e) {
          console.warn(`Site profile "${id}": no logo (${e.message})`);
          delete site.logo;
        }
      }
      sites.push({ ...site, id });
    } catch (e) {
      console.warn(`Skipping site profile "${id}": ${e.message}`);
    }
  }
  return sites;
}

// Small images in site profiles are sent to the UI as data: URLs. Paths stay inside `root`.
function inlineImage(root, rel) {
  const file = path.normalize(path.join(root, rel));
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(root + path.sep)) throw new Error(`bad image path "${rel}"`);
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

// Must run before app "ready".
function registerScheme() {
  // corsEnabled: CSS masks (the theme motif) and fonts load in CORS mode.
  protocol.registerSchemesAsPrivileged([{ scheme: 'theme', privileges: { standard: true, secure: true, corsEnabled: true } }]);
}

// theme://<id>/<path> -> <theme folder>/<path>
function handleProtocol() {
  protocol.handle('theme', async (req) => {
    const { host, pathname } = new URL(req.url);
    const root = themeDir(host);
    const file = root && path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!root || !file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store'); // edited assets show up right away
    return new Response(res.body, { status: res.status, headers });
  });
}

module.exports = {
  listThemes, readTheme, saveTheme, createTheme, deleteTheme, importThemes, importFiles, exportTheme, userFolder, importAsset, themeDir, migrateUserThemes, splitVariants, formatJson,
  listSites, registerScheme, handleProtocol,
};
