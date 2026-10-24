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

// Accepts things like "moodle.example.edu", "https://moodle.example.edu/my/" or a pasted login URL.
function normalizeSite(input) {
  let s = String(input || '').trim();
  if (!s) throw new MoodleError('Please enter your Moodle site address.');
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
  if (json.token) return { token: json.token, privatetoken: json.privatetoken || null };
  throw new MoodleError(json.error || 'Login failed.', json.errorcode);
}

class MoodleClient {
  constructor(site, token, privatetoken = null) {
    this.site = site;
    this.token = token;
    this.privatetoken = privatetoken;
    this.origin = new URL(site).origin;
    this.userid = null;
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

  // A one-time link that signs the in-app browser in and then goes to `target` (Moodle's "autologin").
  // Needs the private token from sign-in; Moodle rate-limits it (default: once every 6 minutes).
  async autologinUrl(target) {
    if (!this.privatetoken) throw new MoodleError('No private token: sign out and in again to enable in-app sign-in.', 'noprivatetoken');
    const { key, autologinurl } = await this.call('tool_mobile_get_autologin_key', { privatetoken: this.privatetoken });
    const u = new URL(autologinurl);
    u.searchParams.set('userid', this.userid);
    u.searchParams.set('key', key);
    u.searchParams.set('urltogo', target);
    return u.toString();
  }

  // Fetches an activity's HTML file (a page, a book chapter), ready to show (see rewriteHtml).
  async fetchHtml(url) {
    if (!this.isOwnUrl(url)) throw new MoodleError('Refusing to fetch from outside your Moodle site.');
    let res;
    try {
      res = await fetch(this.tokenize(url), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new MoodleError(`Could not reach the server (${e.cause?.code || e.name}).`, 'network');
    }
    if (!res.ok) throw new MoodleError(`Server responded with ${res.status}.`, 'http');
    return this.rewriteHtml(await res.text(), url);
  }

  // Makes Moodle HTML (pages, forum posts) absolute and points images at tokenised file URLs so they load.
  // Links keep plain URLs so the token never ends up in a browser; file links go to the signed-in web URL.
  rewriteHtml(html, base = this.site) {
    return String(html || '').replace(/(\s(src|href|poster)\s*=\s*)(["'])(.*?)\3/gi, (match, pre, attr, q, value) => {
      if (/^(#|mailto:|data:|javascript:)/i.test(value)) return match;
      let abs;
      try {
        abs = new URL(value.replace(/&amp;/g, '&'), base).toString();
      } catch {
        return match;
      }
      if (this.isOwnUrl(abs) && abs.includes('/pluginfile.php')) {
        abs = attr.toLowerCase() === 'href' ? this.untokenize(abs) : this.tokenize(abs);
      }
      return `${pre}${q}${abs.replace(/&/g, '&amp;')}${q}`;
    });
  }

  // The browser-facing form of a file URL: regular pluginfile endpoint, no token.
  untokenize(url) {
    const u = new URL(url);
    u.pathname = u.pathname.replace('/webservice/pluginfile.php', '/pluginfile.php');
    u.searchParams.delete('token');
    return u.toString();
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
