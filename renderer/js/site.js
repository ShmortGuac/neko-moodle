// Site profiles: per-institution tweaks from sites/<id>.json, picked by the Moodle site's host name.
// Without a matching profile everything falls back to plain Moodle behaviour.

// Shown wherever no site profile provides a brand. Rename once the app has a name.
const APP_NAME = 'Desktop Client';

const Site = {
  profiles: [],
  regexCache: new Map(),

  async load() {
    Site.profiles = await italeem.listSites();
  },

  forUrl(url) {
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
    } catch {
      return null;
    }
    return Site.profiles.find((p) => (p.hosts || []).includes(host)) || null;
  },

  // Profile for the signed-in site.
  current() {
    return App.user ? Site.forUrl(App.user.site) : null;
  },

  // Quick-pick sites from every profile, for the login screen.
  presets() {
    return Site.profiles.flatMap((p) => p.sites || []);
  },

  regex(pattern, flags = '') {
    const key = `${flags}/${pattern}`;
    if (!Site.regexCache.has(key)) Site.regexCache.set(key, new RegExp(pattern, flags));
    return Site.regexCache.get(key);
  },
};

function brandName(profile = Site.current()) {
  return profile?.brand || stripHtml(App.user?.sitename) || APP_NAME;
}

// Splits a course's full name into code / section / title using the site's courseName rule.
// IIUM: "SEM1 BICS 3303 Section 02 Parallel & Distributed Systems" -> BICS 3303 / 02 / Parallel & Distributed Systems
function parseCourse(c) {
  const full = stripHtml(c.fullname);
  const rule = Site.current()?.courseName;
  const tc = (s) => (rule?.titleCase ? titleCase(s) : s);
  const fallback = { code: stripHtml(c.shortname), section: null, title: tc(full) };
  if (!rule) return fallback;
  const m = full.match(Site.regex(rule.pattern, rule.flags));
  if (!m || !m[rule.title]) return fallback;
  return {
    code: m[rule.code] ? m[rule.code].toUpperCase() : fallback.code,
    section: (rule.section && m[rule.section]) || null,
    title: tc(m[rule.title]),
  };
}

function courseTag(c) {
  const p = parseCourse(c);
  return p.section ? `${p.code} · Sec ${p.section}` : p.code;
}

// Name used in greetings. IIUM: "AIMAN HAKIMI BIN ..." -> "Aiman Hakimi".
function givenName(user) {
  const rule = Site.current()?.personName;
  const raw = stripHtml(user.firstname || user.fullname || '');
  if (!rule) return raw;
  const given = rule.givenNameSplit ? raw.split(Site.regex(rule.givenNameSplit, 'i'))[0].trim() : raw;
  return (rule.titleCase ? titleCase(given) : given) || raw;
}

function displayName(user) {
  const full = stripHtml(user.fullname);
  return Site.current()?.personName?.titleCase ? titleCase(full) : full;
}
