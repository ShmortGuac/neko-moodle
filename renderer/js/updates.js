// Updates in the UI: a toast when a newer NEKO is out, the Updates card in Settings, and the "What's new" window
// (release notes from GitHub). The checking and downloading happen in the main process (src/updates.js).

const Updates = {
  state: null,
  started: false,

  // Once, after signing in: listen for news from the main process and show What's new after an update.
  async init() {
    if (Updates.started) return;
    Updates.started = true;
    neko.onUpdateAvailable((s) => {
      Updates.set(s);
      toast(`NEKO ${s.latest.version} is out`, {
        message: `You have ${s.current}.`,
        timeout: 12000,
        actions: [{ label: 'What\'s new', onClick: () => Updates.showNew() }],
      });
    });
    neko.onUpdateProgress((s) => Updates.set(s));
    try {
      Updates.set(await neko.updateStatus());
      const updated = await neko.justUpdated();
      if (updated) {
        await neko.markUpdateSeen();
        Updates.showInstalled({ since: updated.from });
      }
    } catch {}
  },

  set(s) {
    Updates.state = s;
    Updates.paint();
  },

  async check() {
    const btn = $('#updCheck');
    if (btn) btn.disabled = true;
    try {
      Updates.set(await neko.checkForUpdates());
      if (!Updates.state.latest) toast('NEKO is up to date', { type: 'ok', message: `You have the newest version, ${Updates.state.current}.` });
    } catch (e) {
      toast('Couldn\'t check for updates', { type: 'error', message: e.message });
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async download() {
    try {
      Updates.set(await neko.downloadUpdate());
    } catch (e) {
      toast('Couldn\'t download the update', { type: 'error', message: e.message });
    }
  },

  async install() {
    try {
      await neko.installUpdate();
    } catch (e) {
      toast('Couldn\'t start the installer', { type: 'error', message: e.message });
    }
  },

  // ---------- What's new ----------
  // A newer version is out: its notes (and any versions in between).
  showNew() {
    const s = Updates.state;
    if (!s?.latest) return;
    Updates.modal({
      title: `What's new in NEKO ${s.latest.version}`,
      intro: `You have ${s.current}.${s.newer.length > 1 ? ` ${s.newer.length} new versions since then.` : ''}`,
      releases: s.newer,
      actions: true,
    });
  },

  // The notes for the version in use (and the ones before it). `since` marks the versions new since then.
  async showInstalled({ since } = {}) {
    let data;
    try {
      data = await neko.whatsNew();
    } catch (e) {
      return toast('Couldn\'t load what\'s new', { type: 'error', message: e.message });
    }
    const fresh = since !== undefined ? data.releases.filter((r) => (since ? Updates.newerThan(r.version, since) : r.version === data.current)) : [];
    Updates.modal({
      title: since !== undefined ? `NEKO was updated to ${data.current}` : 'What\'s new',
      intro: since ? `Here's what changed since ${since}.` : since === null ? 'Here\'s what changed.' : `You have NEKO ${data.current}.`,
      releases: fresh.length ? fresh : data.releases,
      empty: 'No release notes yet.',
    });
  },

  newerThan(a, b) {
    const pa = String(a).split(/[.-]/).map(Number);
    const pb = String(b).split(/[.-]/).map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  },

  modal({ title, intro = '', releases = [], actions = false, empty = '' }) {
    $('.modal--updates')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'modal modal--updates';
    wrap.innerHTML = `
      <div class="modal__box modal__box--wide card" role="dialog" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        ${intro ? `<p class="modal__hint">${esc(intro)}</p>` : ''}
        <div class="release-notes">
          ${releases.length ? releases.map((r) => `
            <section class="release">
              <div class="release__head">
                <b>${esc(r.name)}</b>
                ${r.date ? `<span>${esc(new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}
                <button class="btn btn--ghost btn--sm" data-url="${esc(r.url)}">${Icons.external} GitHub</button>
              </div>
              <div class="release__body">${r.notes.trim() ? Updates.markdown(r.notes) : '<p class="release__none">No notes for this version.</p>'}</div>
            </section>`).join('') : `<p class="release__none">${esc(empty)}</p>`}
        </div>
        <div class="modal__actions">
          ${actions ? '<div class="update-actions" data-update-actions></div>' : ''}
          <button type="button" class="btn ${actions ? 'btn--ghost' : 'btn--primary'}" data-close>${actions ? 'Later' : 'Close'}</button>
        </div>
      </div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      Updates.onClick(e);
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(wrap);
    Updates.paint();
    $('[data-close]', wrap).focus();
  },

  // Clicks on update buttons anywhere (Settings card, What's new window). Links ([data-url]) are opened by the app's own click handler.
  onClick(e) {
    const act = e.target.closest('[data-update]')?.dataset.update;
    if (act === 'download') Updates.download();
    else if (act === 'install') Updates.install();
    else if (act === 'show') neko.showUpdateFile();
    else if (act === 'page') neko.openReleasePage();
    else if (act === 'new') Updates.showNew();
  },

  // ---------- Buttons and status ----------
  // What can be done with the newest version right now.
  actionsHTML(s, { notes = false } = {}) {
    if (!s?.latest) return '';
    const d = s.download?.version === s.latest.version ? s.download : null;
    const notesBtn = notes ? `<button class="btn btn--ghost btn--sm" data-update="new">What's new in ${esc(s.latest.version)}</button>` : '';
    if (!s.canDownload) return `${notesBtn}<button class="btn btn--primary btn--sm" data-update="page">${Icons.external} Get it on GitHub</button>`;
    if (d?.error) return `${notesBtn}<span class="update-error">${esc(d.error)}</span><button class="btn btn--primary btn--sm" data-update="download">${Icons.download} Try again</button>`;
    if (d && !d.done) {
      const pct = d.total ? Math.floor((d.received / d.total) * 100) : 0;
      return `${notesBtn}<span class="update-progress"><i style="width:${pct}%"></i></span><span class="update-pct">Downloading ${pct}%</span>`;
    }
    if (d?.done && d.kind === 'installer') return `${notesBtn}<button class="btn btn--primary btn--sm" data-update="install">${Icons.check} Install and restart</button>`;
    if (d?.done) return `${notesBtn}<span class="update-note">Saved. Close NEKO and open the new file.</span><button class="btn btn--primary btn--sm" data-update="show">${Icons.folder} Show in folder</button>`;
    return `${notesBtn}<button class="btn btn--primary btn--sm" data-update="download">${Icons.download} Download ${esc(s.latest.version)}</button>`;
  },

  statusText(s) {
    if (!s) return 'Checking…';
    if (s.latest) return `NEKO ${s.latest.version} is available. You have ${s.current}.`;
    if (!s.lastCheck) return `You have NEKO ${s.current}. Not checked for updates yet.`;
    return `You have NEKO ${s.current}, the newest version. Checked ${relTime(Math.floor(s.lastCheck / 1000))}.`;
  },

  // Redraws whatever update UI is on screen.
  paint() {
    const s = Updates.state;
    $$('[data-update-actions]').forEach((el) => { el.innerHTML = Updates.actionsHTML(s); });
    const card = $('#updCard');
    if (!card) return;
    $('#appVersion').textContent = s ? `v${s.current}` : '';
    $('#updStatus').textContent = Updates.statusText(s);
    $('#updStatus').classList.toggle('is-new', !!s?.latest);
    $('#updActions').innerHTML = Updates.actionsHTML(s, { notes: true });
    $('#updActions').hidden = !s?.latest;
    if (s) $('#updAuto').checked = s.auto;
  },

  // The Updates part of Settings → About the app.
  cardHTML() {
    return `
      <div class="update-box" id="updCard">
        <p class="update-status" id="updStatus">Checking…</p>
        <div class="update-actions" id="updActions" hidden></div>
        <div class="toolbar">
          <button class="btn btn--ghost btn--sm" id="updCheck">${Icons.refresh} Check for updates</button>
          <button class="btn btn--ghost btn--sm" id="updNotes">${Icons.info} What's new</button>
        </div>
        <div class="toggle-row">
          <div><b>Check for updates automatically</b><span>When NEKO starts and every few hours. Updates are only installed when you choose.</span></div>
          <label class="switch"><input type="checkbox" id="updAuto" checked><i></i></label>
        </div>
      </div>`;
  },

  bindCard(root) {
    $('#updCheck', root).addEventListener('click', () => Updates.check());
    $('#updNotes', root).addEventListener('click', () => Updates.showInstalled());
    $('#updActions', root).addEventListener('click', Updates.onClick);
    $('#updAuto', root).addEventListener('change', async (e) => {
      try {
        Updates.set(await neko.setAutoUpdateCheck(e.target.checked));
      } catch (err) {
        toast('Couldn\'t change the setting', { type: 'error', message: err.message });
      }
    });
    Updates.paint();
    neko.updateStatus().then(Updates.set, () => {});
  },

  // ---------- Release notes ----------
  // A small, safe Markdown renderer for GitHub release notes: everything is escaped first, then headings,
  // lists, paragraphs, **bold**, *italic*, `code` and [links](https://…) are added back. Links open in the browser.
  markdown(md) {
    const inline = (text) => {
      const codes = [];
      let h = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
      h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="#" data-url="${url}">${label}</a>`)
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => `${pre}<a href="#" data-url="${url}">${url}</a>`)
        .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<b>${a || b}</b>`)
        .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
        .replace(/(^|[^\w_])_([^_\s][^_]*?)_(?!\w)/g, '$1<i>$2</i>');
      return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
    };
    const out = [];
    let para = [];
    let list = null;
    const flush = () => {
      if (para.length) out.push(`<p>${para.map(inline).join(' ')}</p>`);
      para = [];
      if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
      list = null;
    };
    for (const raw of String(md).replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) flush();
      else if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) {
        flush();
        out.push(`<h4 class="md-h${m[1].length}">${inline(m[2].replace(/\s+#+$/, ''))}</h4>`);
      } else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flush();
        out.push('<hr>');
      } else if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (para.length || (list && list.tag !== tag)) flush();
        if (!list) list = { tag, items: [] };
        list.items.push(m[2]);
      } else if (list && /^\s{2,}\S/.test(raw)) {
        list.items[list.items.length - 1] += ` ${line.trim()}`;
      } else {
        if (list) flush();
        para.push(line.trim());
      }
    }
    flush();
    return out.join('');
  },
};
