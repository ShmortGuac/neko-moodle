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

const palette = (id) => `pal-${Math.abs(Number(id) || 0) % Theme.paletteSize}`;

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

// kind: '' | 'boot' | 'course' | 'deadlines' picks the theme's loading text.
function loadingHTML(kind = '') {
  const cfg = Theme.cfg.loading;
  const text = cfg[kind ? `${kind}Text` : 'text'] || cfg.text;
  const anim = cfg.animation && cfg.animation !== 'none' ? `anim-${cfg.animation}` : '';
  const art = cfg.image
    ? `<img class="${anim}" src="${esc(cfg.image)}" alt="" style="width:${esc(cssLen(cfg.imageWidth, 'px'))}">`
    : `<span class="spinner" style="--spinner-size:${esc(cssLen(cfg.spinner.size, 'px'))}"></span>`;
  return `<div class="loading">${art}<div class="dots">${esc(text)}</div></div>`;
}

function emptyHTML(title, text = '') {
  const { empty, emptyWidth } = Theme.cfg.states;
  const art = empty ? `<img src="${esc(empty)}" alt="" style="width:${esc(cssLen(emptyWidth, 'px'))}">` : `<span class="empty__icon">${Icons.check}</span>`;
  return `<div class="empty">${art}<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}

function errorHTML(err) {
  const { error } = Theme.cfg.states;
  const art = error ? `<img src="${esc(error)}" alt="">` : `<span class="empty__icon">${Icons.alert}</span>`;
  return `
    <div class="card"><div class="card__body" style="padding-top:22px">
      <div class="empty empty--error">
        ${art}
        <b>Something went wrong</b><span>${esc(err.message || String(err))}</span>
        <button class="btn btn--ghost btn--sm" data-retry>${Icons.refresh} Try again</button>
      </div>
    </div></div>`;
}

// A small text prompt (window.prompt doesn't exist in Electron). Resolves to the text, or null.
function promptModal({ title, label = '', value = '', okLabel = 'OK', hint = '' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal__box card">
        <h3>${esc(title)}</h3>
        ${hint ? `<p class="modal__hint">${esc(hint)}</p>` : ''}
        <label class="field"><span>${esc(label)}</span><input class="input" name="value" value="${esc(value)}" required></label>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
          <button class="btn btn--primary">${esc(okLabel)}</button>
        </div>
      </form>`;
    const close = (result) => { wrap.remove(); resolve(result); };
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      close(wrap.querySelector('input').value.trim() || null);
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    document.body.append(wrap);
    const input = wrap.querySelector('input');
    input.focus();
    input.select();
  });
}

// Writing a forum post. `send({subject, message})` posts it; the modal stays open (showing the error) if that fails.
// withSubject: false hides the subject field and keeps `subject` as given.
function composeModal({ title, subject = '', withSubject = true, okLabel = 'Post', send }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal__box modal__box--wide card">
        <h3>${esc(title)}</h3>
        ${withSubject ? `<label class="field"><span>Subject</span><input class="input" name="subject" value="${esc(subject)}" required maxlength="255"></label>` : ''}
        <label class="field"><span>Message</span><textarea class="input input--area" name="message" rows="8" required></textarea></label>
        <p class="modal__error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
          <button class="btn btn--primary" data-send>${esc(okLabel)}</button>
        </div>
      </form>`;
    const form = wrap.querySelector('form');
    const error = wrap.querySelector('.modal__error');
    const close = (result) => { wrap.remove(); resolve(result); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const post = { subject: withSubject ? form.subject.value.trim() : subject, message: form.message.value.trim() };
      if (!post.subject || !post.message) return;
      const button = wrap.querySelector('[data-send]');
      button.disabled = true;
      error.hidden = true;
      try {
        close(await send(post));
      } catch (err) {
        error.textContent = err.message || String(err);
        error.hidden = false;
        button.disabled = false;
      }
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    // Escape only closes an empty draft, so a stray key press doesn't lose what was written.
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !form.message.value.trim()) close(null); });
    document.body.append(wrap);
    (withSubject && !subject ? form.subject : form.message).focus();
  });
}

// Asks before doing something that can't be undone. A statement adds a checkbox that must be ticked.
// `run()` does the work; the modal stays open (showing the error) if it fails. Resolves to its result, or null.
function confirmModal({ title, text = '', statement = '', okLabel = 'OK', run }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal__box card">
        <h3>${esc(title)}</h3>
        ${text ? `<p class="modal__hint">${esc(text)}</p>` : ''}
        ${statement ? `<label class="statement"><input type="checkbox" name="statement" required> <span>${esc(statement)}</span></label>` : ''}
        <p class="modal__error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
          <button class="btn btn--primary" data-ok>${esc(okLabel)}</button>
        </div>
      </form>`;
    const error = wrap.querySelector('.modal__error');
    const close = (result) => { wrap.remove(); resolve(result); };
    wrap.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = wrap.querySelector('[data-ok]');
      button.disabled = true;
      error.hidden = true;
      try {
        close(await run());
      } catch (err) {
        error.textContent = err.message || String(err);
        error.hidden = false;
        button.disabled = false;
      }
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    document.body.append(wrap);
    wrap.querySelector(statement ? 'input' : '[data-ok]').focus();
  });
}

// Plain text from a text box as simple HTML: blank lines make paragraphs, single newlines make line breaks.
function textToHtml(text) {
  return text.trim().split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// Shows Moodle-authored HTML (pages, book chapters) in a locked-down frame: no scripts can run, links open
// through NEKO, and it's styled with the current theme. It grows to fit its content. `css` adds styles
// (a string, or a function given the theme-variable reader). Returns the frame.
function mountHtml(container, html, { css: extraCss = '' } = {}) {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const css = `
    html, body { margin: 0; background: transparent; color: ${v('--text', '#1d2033')}; font-family: ${v('--font', 'system-ui, sans-serif')};
      font-size: 15px; line-height: 1.65; overflow-wrap: anywhere; }
    body { display: flow-root; } body > :first-child { margin-top: 0; } body > :last-child { margin-bottom: 0; }
    a { color: ${v('--accent', '#1f9e93')}; font-weight: 600; }
    img, video, iframe { max-width: 100%; height: auto; border-radius: 8px; }
    table { border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; }
    td, th { border: 1px solid ${v('--border', '#ddd')}; padding: 6px 10px; text-align: left; }
    pre, code { background: ${v('--surface-2', '#f5f5f5')}; border-radius: 6px; font-family: Consolas, monospace; font-size: 13px; }
    code { padding: 1px 5px; } pre { padding: 12px 14px; overflow: auto; }
    h1, h2, h3, h4 { line-height: 1.25; font-family: ${v('--font-heading', v('--font', 'inherit'))}; }
    blockquote { margin: 0; padding: 2px 0 2px 14px; border-left: 3px solid ${v('--accent', '#1f9e93')}; color: ${v('--text-muted', '#666')}; }
    hr { border: 0; border-top: 1px solid ${v('--border', '#ddd')}; }
    ${typeof extraCss === 'function' ? extraCss(v) : extraCss}`;
  const frame = document.createElement('iframe');
  frame.className = 'html-frame';
  // allow-same-origin only lets NEKO measure the height; with scripts off, the content can't use it.
  frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${css}</style></head><body>${html}</body></html>`;
  // Resize on the next frame (not inside the observer callback) and only when the height really changed.
  let pending = 0;
  const fit = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      try {
        // The body, not the document: the document is never shorter than the frame, so short posts wouldn't shrink.
        const h = `${Math.ceil(frame.contentDocument.body.getBoundingClientRect().height)}px`;
        if (frame.style.height !== h) frame.style.height = h;
      } catch {
        // frame gone
      }
    });
  };
  // Re-measure when the content, its images or fonts finish loading, and when the window resizes.
  frame.addEventListener('load', () => {
    fit();
    const doc = frame.contentDocument;
    doc.querySelectorAll('img, video').forEach((m) => {
      m.addEventListener('load', fit);
      m.addEventListener('loadedmetadata', fit);
    });
    doc.fonts?.ready.then(fit);
  });
  const onResize = () => (frame.isConnected ? fit() : window.removeEventListener('resize', onResize));
  window.addEventListener('resize', onResize);
  container.replaceChildren(frame);
  return frame;
}
