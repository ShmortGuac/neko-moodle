// Updates from GitHub Releases: checks for a newer NEKO, keeps the release notes for "What's new",
// and downloads the new version when asked. Nothing is installed by itself: the installer only runs
// when the user presses Install, and the portable build is saved for them to start.
//
// State lives in <userData>/updates.json: { auto, lastCheck, seen } (seen = the version whose notes were shown).

const { app, net, shell } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'ShmortGuac/neko-moodle';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const PAGE = `https://github.com/${REPO}/releases`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const FIRST_CHECK_MS = 15 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const NOTES_LIMIT = 20000;
const ASSETS = {
  installer: /^NEKO-Setup-.+\.exe$/i,
  portable: /^NEKO-.+-portable\.exe$/i,
};

let cache = null; // { at, releases }
let download = null; // { version, file, kind, received, total, done, error, promise }
let timer = null;

const stateFile = () => path.join(app.getPath('userData'), 'updates.json');

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return { auto: s.auto !== false, lastCheck: Number(s.lastCheck) || 0, seen: typeof s.seen === 'string' ? s.seen : null };
  } catch {
    return { auto: true, lastCheck: 0, seen: null };
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2));
  return next;
}

// "v1.2.3" / "1.2.3-beta.1" → { text, parts, pre }, or null.
function parseVersion(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag || '').trim());
  return m ? { text: `${m[1]}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ''}`, parts: [m[1], m[2], m[3]].map(Number), pre: m[4] || '' } : null;
}

// Like semver: numbers first, and a pre-release comes before its release.
function compare(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

// How this copy of NEKO was installed, which decides what Download does.
function installKind() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  return app.isPackaged ? 'installer' : 'dev';
}

async function fetchReleases() {
  let res;
  try {
    res = await net.fetch(API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `NEKO/${app.getVersion()}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Couldn\'t reach GitHub. Check your internet connection.');
  }
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting update checks right now. Try again later.');
  if (!res.ok) throw new Error(`GitHub answered with an error (${res.status}).`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('GitHub sent something unexpected.');
  return list
    .filter((r) => r && !r.draft && !r.prerelease && parseVersion(r.tag_name))
    .map((r) => ({
      version: parseVersion(r.tag_name).text,
      name: String(r.name || r.tag_name),
      notes: String(r.body || '').slice(0, NOTES_LIMIT),
      date: r.published_at || null,
      url: String(r.html_url || '').startsWith(`https://github.com/${REPO}/`) ? r.html_url : PAGE,
      assets: (Array.isArray(r.assets) ? r.assets : [])
        .filter((a) => String(a.browser_download_url || '').startsWith(DOWNLOAD_PREFIX))
        .map((a) => ({ name: String(a.name), size: Number(a.size) || 0, url: a.browser_download_url, digest: typeof a.digest === 'string' ? a.digest : '' })),
    }))
    .sort((a, b) => compare(b.version, a.version));
}

function pickAsset(release, kind) {
  return kind === 'dev' ? null : release?.assets.find((a) => ASSETS[kind].test(a.name)) || null;
}

function status() {
  const state = readState();
  const current = app.getVersion();
  const releases = cache?.releases || [];
  const newer = releases.filter((r) => compare(r.version, current) > 0);
  const kind = installKind();
  const latest = newer[0] || null;
  return {
    current,
    kind,
    auto: state.auto,
    lastCheck: state.lastCheck,
    checked: !!cache,
    latest,
    newer,
    canDownload: !!pickAsset(latest, kind),
    download: download && { version: download.version, kind: download.kind, received: download.received, total: download.total, done: download.done, error: download.error, file: download.done ? download.file : null },
    page: latest?.url || PAGE,
  };
}

async function check({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return status();
  cache = { at: Date.now(), releases: await fetchReleases() };
  writeState({ lastCheck: Date.now() });
  return status();
}

// Release notes for the versions up to this one, newest first, and which version was last seen
// (so "What's new" can mark what changed since then).
async function whatsNew() {
  try {
    await check();
  } catch (e) {
    if (!cache) throw e;
  }
  const current = app.getVersion();
  return { current, releases: cache.releases.filter((r) => compare(r.version, current) <= 0).slice(0, 10), page: PAGE };
}

// On the first run of a new version: { from } with the version used before (null if it's not known), else null.
// A first-ever run just records the version. Copies from before update checks existed have no record,
// but someone already signed in has used an earlier version.
function justUpdated() {
  const state = readState();
  const current = app.getVersion();
  if (!state.seen) {
    if (fs.existsSync(path.join(app.getPath('userData'), 'session.json'))) return { from: null };
    writeState({ seen: current });
    return null;
  }
  return compare(current, state.seen) > 0 ? { from: state.seen } : null;
}

function markSeen() {
  writeState({ seen: app.getVersion() });
}

function setAuto(on) {
  writeState({ auto: !!on });
  return status();
}

// Checks shortly after start and then every few hours while auto-checks are on.
// `notify(status)` is called once per newer version found.
function startAuto(notify) {
  let told = null;
  const run = async () => {
    if (!readState().auto) return;
    try {
      const s = await check({ force: true });
      if (s.latest && s.latest.version !== told) {
        told = s.latest.version;
        notify(s);
      }
    } catch {
      // Offline or rate-limited: try again next time.
    }
  };
  clearTimeout(timer);
  timer = setTimeout(function tick() {
    run();
    timer = setTimeout(tick, CHECK_EVERY_MS);
  }, FIRST_CHECK_MS);
}

// Downloads the newest release's file for this kind of install. The installer goes to a temporary folder;
// the portable build goes to Downloads so it can replace the old one. Size and SHA-256 are checked.
function startDownload(onProgress) {
  const s = status();
  if (!s.latest) throw new Error('You already have the newest version.');
  const asset = pickAsset(s.latest, s.kind);
  if (!asset) throw new Error('There\'s no download for this copy of NEKO. Open the release page instead.');
  if (download && download.version === s.latest.version && !download.error) return status();

  const dir = s.kind === 'installer' ? path.join(app.getPath('temp'), 'NEKO-update') : app.getPath('downloads');
  const file = path.join(dir, path.basename(asset.name));
  download = { version: s.latest.version, kind: s.kind, file, received: 0, total: asset.size, done: false, error: null };
  const job = download;
  job.promise = (async () => {
    const part = `${file}.part`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const res = await net.fetch(asset.url, { headers: { 'User-Agent': `NEKO/${app.getVersion()}` } });
      if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(part);
      let last = 0;
      for await (const chunk of res.body) {
        hash.update(chunk);
        job.received += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (Date.now() - last > 150) {
          last = Date.now();
          onProgress(status());
        }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      if (asset.size && job.received !== asset.size) throw new Error('The download was incomplete. Try again.');
      const [algo, want] = asset.digest.split(':');
      if (algo === 'sha256' && want && hash.digest('hex') !== want.toLowerCase()) throw new Error('The downloaded file didn\'t match the release. Try again.');
      fs.rmSync(file, { force: true });
      fs.renameSync(part, file);
      job.done = true;
    } catch (e) {
      fs.rmSync(part, { force: true });
      job.error = e.message || String(e);
    }
    onProgress(status());
  })();
  return status();
}

// Runs the downloaded installer and closes NEKO so it can replace the files.
function install() {
  if (!download?.done || download.kind !== 'installer' || !fs.existsSync(download.file)) throw new Error('Download the update first.');
  spawn(download.file, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  setTimeout(() => app.quit(), 300);
}

function showDownloaded() {
  if (download?.done) shell.showItemInFolder(download.file);
}

module.exports = { status, check, whatsNew, justUpdated, markSeen, setAuto, startAuto, startDownload, install, showDownloaded, compare, parseVersion, PAGE };
