// Assignment submissions: picking files, uploading them to Moodle's draft area and saving the submission.
// The renderer never handles file paths. Files it can submit are the ones the person picked or dropped,
// which get an id here; anything else is refused.

const { dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { MoodleError } = require('./moodle');

const TIMEOUT_MS = 5 * 60 * 1000;
const picked = new Map(); // id -> absolute path
let nextId = 1;

function register(paths) {
  const out = [];
  for (const p of paths) {
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const id = `f${nextId++}`;
    picked.set(id, p);
    out.push({ id, name: path.basename(p), size: stat.size });
  }
  return out;
}

async function pick(win, { extensions = [] } = {}) {
  const filters = extensions.length ? [{ name: 'Accepted files', extensions }, { name: 'All files', extensions: ['*'] }] : [];
  const res = await dialog.showOpenDialog(win, { title: 'Add files', properties: ['openFile', 'multiSelections'], filters });
  return res.canceled ? [] : register(res.filePaths);
}

// Uploads one file into a draft area (itemid 0 starts a new one). Resolves to the draft itemid.
async function uploadDraft(client, itemid, name, data) {
  const form = new FormData();
  form.append('token', client.token);
  form.append('filearea', 'draft');
  form.append('itemid', String(itemid));
  form.append('file_1', new Blob([data]), name);
  let res;
  try {
    res = await fetch(`${client.site}/webservice/upload.php`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new MoodleError(`Could not upload ${name} (${e.cause?.code || e.name}).`, 'network');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new MoodleError(`Could not upload ${name}.`, 'http');
  if (json.error || json.exception) throw new MoodleError(json.error || json.message, json.errorcode);
  return json[0].itemid;
}

// A file already in the submission is uploaded again, the way the Moodle app keeps files when editing.
async function fetchExisting(client, url, name) {
  if (!client.isOwnUrl(url)) throw new MoodleError('Refusing to fetch from outside your Moodle site.');
  const res = await fetch(client.tokenize(url), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok || (res.headers.get('content-type') || '').includes('application/json')) throw new MoodleError(`Could not keep ${name}; try removing and adding it again.`);
  return Buffer.from(await res.arrayBuffer());
}

// files: [{ id }] for new files or [{ url, name }] for ones already submitted. text: HTML, or null to leave it out.
async function save(client, { assignid, files = null, text = null }) {
  const plugindata = {};
  if (files) {
    // An empty draft area (a fresh random itemid) clears the files, same as Moodle's own form does.
    let itemid = 0;
    for (const f of files) {
      if (f.id) {
        const p = picked.get(f.id);
        if (!p) throw new MoodleError('That file is no longer available. Add it again.');
        itemid = await uploadDraft(client, itemid, path.basename(p), await fs.promises.readFile(p));
      } else {
        itemid = await uploadDraft(client, itemid, f.name, await fetchExisting(client, f.url, f.name));
      }
    }
    plugindata.files_filemanager = itemid || randomItemid();
  }
  if (text !== null) plugindata.onlinetext_editor = { text, format: 1, itemid: randomItemid() };
  const warnings = await client.call('mod_assign_save_submission', { assignmentid: assignid, plugindata });
  if (Array.isArray(warnings) && warnings.length) throw new MoodleError(warnings.map((w) => w.message).join(' '));
  for (const f of files || []) if (f.id) picked.delete(f.id);
}

function randomItemid() {
  return Math.floor(Math.random() * 900000000) + 100000000;
}

module.exports = { pick, register, save };
