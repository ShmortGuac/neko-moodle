// Theme packs (themes/<id>/theme.json + assets) and site profiles (sites/<id>.json).
// Themes are data only: JSON, CSS and images. Their files are served to the UI through
// the theme:// protocol, which can only read inside a theme's folder.
//
// Themes live in two places:
//   <app>/themes        built in (Default is read-only)
//   <userData>/themes   made in the theme editor; wins over a built-in theme with the same id

const { app, dialog, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BUILTIN_DIR = path.join(__dirname, '..', 'themes');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const LOCKED = new Set(['default']);
const ID = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const ASSET_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'apng', 'woff', 'woff2', 'ttf', 'otf'];

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
        if (!Array.isArray(theme.variants) || !theme.variants.length) throw new Error('no variants');
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
  if (dir.startsWith(BUILTIN_DIR) && LOCKED.has(id)) throw new Error('The built-in Default theme can\'t be changed. Make a copy instead.');
  return dir;
}

function saveTheme({ id, theme, css }) {
  const dir = writableDir(id);
  if (!theme || !Array.isArray(theme.variants) || !theme.variants.length) throw new Error('A theme needs at least one variant.');
  fs.writeFileSync(path.join(dir, 'theme.json'), `${formatJson(theme)}\n`, 'utf8');
  const cssFile = path.join(dir, 'theme.css');
  if (typeof css === 'string') {
    if (css.trim()) fs.writeFileSync(cssFile, css, 'utf8');
    else fs.rmSync(cssFile, { force: true });
  }
}

function slugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'theme';
}

// Copies an existing theme (default: the built-in Default) into the user folder under a new name.
function createTheme({ name, from = 'default' }) {
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
  listThemes, readTheme, saveTheme, createTheme, importAsset, themeDir,
  listSites, registerScheme, handleProtocol,
};
