// Minimal Moodle Web Services client (runs in the main process, so no CORS issues).
// API reference: https://docs.moodle.org/dev/Web_service_API_functions

const SERVICE = 'moodle_mobile_app';
const TIMEOUT_MS = 30000;

class MoodleError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Accepts things like "italeem.iium.edu.my", "https://italeem.iium.edu.my/my/" or a pasted login URL.
function normalizeSite(input) {
  let s = String(input || '').trim();
  if (!s) throw new MoodleError('Please enter the i-Taleem site address.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new MoodleError('That site address does not look valid.');
  }
  const p = u.pathname
    .replace(/\/(login\/index\.php|my\/?|index\.php)?$/i, '')
    .replace(/\/+$/, '');
  return u.origin + p;
}

// Moodle REST expects nested params as key[0][name]=value.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') flatten(v, key, out);
    else out[key] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}

async function postForm(url, data) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new MoodleError(`Could not reach the server (${e.cause?.code || e.name}).`, 'network');
  }
  const text = await res.text();
  if (!res.ok) throw new MoodleError(`Server responded with ${res.status}.`, 'http');
  try {
    return JSON.parse(text);
  } catch {
    throw new MoodleError('Unexpected response from the server. Is this a Moodle site?', 'badresponse');
  }
}

// Public info about the site (login type, SSO launch URL, site name). Null if mobile services are off.
async function getPublicConfig(site) {
  try {
    const res = await fetch(
      `${site}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config&lang=en`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
        signal: AbortSignal.timeout(15000),
      }
    );
    const json = await res.json();
    if (Array.isArray(json) && json[0] && !json[0].error) return json[0].data;
  } catch {
    // Older sites or blocked endpoint: caller falls back to password login.
  }
  return null;
}

async function loginWithPassword(site, username, password) {
  const json = await postForm(`${site}/login/token.php`, { username, password, service: SERVICE });
  if (json.token) return json.token;
  throw new MoodleError(json.error || 'Login failed.', json.errorcode);
}

class MoodleClient {
  constructor(site, token) {
    this.site = site;
    this.token = token;
    this.origin = new URL(site).origin;
  }

  async call(wsfunction, params = {}) {
    const url = `${this.site}/webservice/rest/server.php?moodlewsrestformat=json&wsfunction=${encodeURIComponent(wsfunction)}`;
    const json = await postForm(url, { wstoken: this.token, wsfunction, ...flatten(params) });
    if (json && json.exception) throw new MoodleError(json.message || json.errorcode, json.errorcode);
    return json;
  }

  isOwnUrl(url) {
    try {
      return new URL(url).origin === this.origin;
    } catch {
      return false;
    }
  }

  // Files on Moodle need the token and the webservice pluginfile endpoint.
  tokenize(url) {
    if (!url || !this.isOwnUrl(url)) return url;
    const u = new URL(url);
    if (u.pathname.includes('/pluginfile.php') && !u.pathname.includes('/webservice/pluginfile.php')) {
      u.pathname = u.pathname.replace('/pluginfile.php', '/webservice/pluginfile.php');
    }
    u.searchParams.set('token', this.token);
    return u.toString();
  }
}

module.exports = { MoodleClient, MoodleError, SERVICE, normalizeSite, getPublicConfig, loginWithPassword };
