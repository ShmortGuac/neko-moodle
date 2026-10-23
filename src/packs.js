// Theme packs (themes/<id>/theme.json + assets) and site profiles (sites/<id>.json).
// Themes are data only: JSON, CSS and images. Their files are served to the UI through
// the theme:// protocol, which can only read inside the themes folder.

const { protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const THEMES_DIR = path.join(__dirname, '..', 'themes');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const ID = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listThemes() {
  const themes = [];
  for (const id of fs.readdirSync(THEMES_DIR)) {
    const manifest = path.join(THEMES_DIR, id, 'theme.json');
    if (!ID.test(id) || !fs.existsSync(manifest)) continue;
    try {
      const theme = readJson(manifest);
      if (!Array.isArray(theme.variants) || !theme.variants.length) throw new Error('no variants');
      themes.push({ ...theme, id, hasCss: fs.existsSync(path.join(THEMES_DIR, id, 'theme.css')) });
    } catch (e) {
      console.warn(`Skipping theme "${id}": ${e.message}`);
    }
  }
  return themes;
}

function listSites() {
  const sites = [];
  for (const file of fs.readdirSync(SITES_DIR)) {
    const id = path.basename(file, '.json');
    if (!file.endsWith('.json') || !ID.test(id)) continue;
    try {
      const site = readJson(path.join(SITES_DIR, file));
      if (site.logo) site.logo = inlineImage(SITES_DIR, site.logo);
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

// theme://<id>/<path> -> themes/<id>/<path>
function handleProtocol() {
  protocol.handle('theme', async (req) => {
    const { host, pathname } = new URL(req.url);
    const root = path.join(THEMES_DIR, host);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!ID.test(host) || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(res.body, { status: res.status, headers });
  });
}

module.exports = { listThemes, listSites, registerScheme, handleProtocol };
