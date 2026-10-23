// Small helpers shared by all views.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Moodle sends HTML descriptions; we show them as plain text (DOMParser output is inert).
function stripHtml(html) {
  return htmlToText(html).replace(/\s+/g, ' ').trim();
}

// Like stripHtml but keeps paragraph / line breaks.
function htmlToText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br, p, div, li, h1, h2, h3, h4, h5, h6, tr').forEach((el) => el.append('\n'));
  return (doc.body.textContent || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Escapes text and turns URLs into links that open in the browser.
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => {
    const real = url.replace(/&amp;/g, '&');
    return `<a href="#" data-url="${esc(real)}">${url}</a>`;
  });
}

// "PRESENTATION & CRITICAL THINKING" -> "Presentation & Critical Thinking". Mixed-case text is left alone.
const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'in', 'on', 'for', 'to', 'a', 'an', 'with', 'by']);
function titleCase(s) {
  const letters = s.replace(/[^a-z]/gi, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().replace(/[a-z][a-z']*/g, (w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
}

// IIUM puts the whole name in "firstname". Keep the given name: "AIMAN HAKIMI BIN ..." -> "Aiman Hakimi".
function givenName(user) {
  const raw = stripHtml(user.firstname || user.fullname || '');
  return titleCase(raw.split(/\s+(?:bin|binti|bt|bte|b\.|a\/l|a\/p)\s+/i)[0].trim()) || raw;
}

// "SEM1 BICS 3303 Section 02 Parallel & Distributed Systems" -> {code:'BICS 3303', section:'02', title:'Parallel & Distributed Systems'}
function parseCourse(c) {
  const full = stripHtml(c.fullname);
  const m = full.match(/^(?:SEM\s*\d+\s+)?([A-Z]{2,6}\s?\d{3,5})\s*(?:Section\s*(\w+))?\s*[-:–]?\s*(.*)$/i);
  if (!m || !m[3]) return { code: stripHtml(c.shortname), section: null, title: titleCase(full) };
  return { code: m[1].toUpperCase(), section: m[2] || null, title: titleCase(m[3]) };
}

function courseTag(c) {
  const p = parseCourse(c);
  return p.section ? `${p.code} · Sec ${p.section}` : p.code;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function relTime(sec) {
  const diff = sec * 1000 - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['week', 6048e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
  }
}

function fmtDate(sec, opts = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) {
  return new Date(sec * 1000).toLocaleString('en-MY', opts);
}

function fmtSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const palette = (id) => `pal-${Math.abs(Number(id) || 0) % 5}`;

function toast(title, { message = '', type = 'info', actions = [], timeout = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icon = type === 'error' ? Icons.alert : type === 'ok' ? Icons.check : Icons.info;
  el.innerHTML = `
    <span class="toast__icon">${icon}</span>
    <div class="toast__msg"><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}</div>
    ${actions.length ? `<div class="toast__actions">${actions.map((a, i) => `<button class="btn btn--ghost btn--sm" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
  $$('[data-i]', el).forEach((b) => b.addEventListener('click', () => {
    actions[b.dataset.i].onClick();
    dismiss();
  }));
  const dismiss = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  };
  $('#toasts').append(el);
  if (timeout) setTimeout(dismiss, timeout);
  return {
    update(newTitle, newMessage) {
      $('.toast__msg', el).innerHTML = `<b>${esc(newTitle)}</b>${newMessage ? `<span>${esc(newMessage)}</span>` : ''}`;
    },
    dismiss,
  };
}

function loadingHTML(text = 'Aqua is fetching your stuff') {
  return `<div class="loading"><img src="assets/aqua-gamer.png" alt=""><div class="dots">${esc(text)}</div></div>`;
}

function emptyHTML(title, text = '') {
  return `<div class="empty"><img src="assets/aqua-chibi.png" alt=""><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}

function errorHTML(err) {
  return `
    <div class="card"><div class="card__body" style="padding-top:22px">
      <div class="empty empty--error">
        <img src="assets/aqua-akutan.jpg" alt="">
        <b>Something went wrong</b><span>${esc(err.message || String(err))}</span>
        <button class="btn btn--ghost btn--sm" data-retry>${Icons.refresh} Try again</button>
      </div>
    </div></div>`;
}
