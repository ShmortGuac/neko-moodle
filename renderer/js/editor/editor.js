// Theme editor: edits a theme.json draft and previews it live on the app's real pages with dummy data.

const PREVIEW_PAGES = [
  ['login', 'Login'], ['loading', 'Loading'], ['dashboard', 'Dashboard'], ['courses', 'Courses'],
  ['course', 'Course page'], ['deadlines', 'Deadlines'], ['announcements', 'Announcements'], ['settings', 'Settings'],
];
const VIEW_W = 1320;
const VIEW_H = 840;
const FONT_SUGGESTIONS = ['"Segoe UI", system-ui, sans-serif', '"M PLUS Rounded 1c", sans-serif', '"Inter", sans-serif', '"Poppins", sans-serif', '"Nunito", sans-serif', 'Georgia, serif', '"Times New Roman", serif', '"Courier New", monospace'];

const Editor = {
  id: null,
  draft: null,
  css: '',
  locked: false,
  folder: '',
  page: 'dashboard',
  loadingKind: '',
  openSections: new Set(['colours']),
  openItems: new Set(),
  selected: null,
  optionValues: {},
  dirty: false,
  history: [],
  future: [],
  lastSnapshot: 0,

  // ---------- boot ----------
  async boot() {
    Theme.editorMode = true;
    document.documentElement.classList.add('editing');
    Editor.id = new URLSearchParams(location.search).get('theme');
    try {
      await Promise.all([Site.load(), Theme.load()]);
      const data = await neko.readTheme(Editor.id);
      Editor.draft = data.theme;
      Editor.css = data.css || '';
      Editor.locked = data.locked;
      Editor.folder = data.folder;
    } catch (e) {
      document.body.innerHTML = `<div class="ed-fatal">Couldn't open the theme: ${esc(e.message)}</div>`;
      return;
    }
    Editor.installMocks();
    App.renderStars();
    App.bindGlobalEvents();
    Editor.renderStageBar();
    Editor.renderPanel();
    Editor.bindEvents();
    Editor.fitViewport();
    Editor.renderPreview({ animate: true });
  },

  // The preview runs the real app with fake data; nothing reaches Moodle or the user's settings.
  installMocks() {
    App.user = PreviewData.user;
    App.prefs = { theme: Editor.id, mascot: true, watermark: true, themeOptions: {}, site: PreviewData.user.site, username: 'alex', courseFilter: 'all' };
    App.savePrefs = () => {};
    App.getCourses = async () => PreviewData.courses();
    App.getEvents = async () => PreviewData.events();
    App.call = async (fn, params) => {
      if (/^mod_forum_add_|^mod_assign_(save|submit)_/.test(fn)) throw new Error('Posting is off in the theme editor.');
      return PreviewData.ws(fn, params);
    };
    const previewOnly = (what) => async () => {
      toast('Preview only', { message: `${what} is off in the theme editor.` });
      throw Object.assign(new Error(`${what} is off in the theme editor.`), { code: 'cancelled' });
    };
    App.downloadFile = async () => toast('Preview only', { message: 'Downloads are off in the theme editor.' });
    App.signOut = async () => toast('Preview only', { message: 'Signing out is off in the theme editor.' });
    neko.download = previewOnly('Downloading');
    neko.openWeb = async () => toast('Preview only', { message: 'Moodle pages open in an in-app window in the real app.' });
    neko.fetchHtml = async (url) => PreviewData.html(url);
    neko.rewriteHtml = async (html) => html;
    neko.tokenize = async (urls) => urls;
    neko.pickFiles = async () => [{ id: 'preview', name: 'my-report.pdf', size: 820000 }];
    neko.addDroppedFiles = async () => [];
    neko.saveSubmission = async () => { throw new Error('Submitting is off in the theme editor.'); };
    App.getCourseContents = async () => PreviewData.contents();
    neko.login = previewOnly('Signing in');
    neko.loginSSO = previewOnly('Signing in');
    neko.createTheme = previewOnly('Creating themes');
    neko.deleteTheme = previewOnly('Deleting themes');
    neko.importThemes = previewOnly('Importing themes');
    neko.openThemesFolder = async () => {};
    neko.downloadFolder = async () => ({ folder: 'C:\\Users\\you\\Downloads\\NEKO', custom: false, default: 'C:\\Users\\you\\Downloads\\NEKO' });
    neko.chooseDownloadFolder = previewOnly('Changing the download folder');
    neko.resetDownloadFolder = previewOnly('Changing the download folder');
    neko.openEditor = previewOnly('Opening the editor');
    neko.openExternal = async () => toast('Preview only', { message: 'Links don\'t open from the preview.' });
    neko.openDownloads = async () => {};
    neko.getPublicConfig = async () => ({ sitename: PreviewData.user.sitename, typeoflogin: 2 });
    neko.setTitlebar = async () => {};

    // Keep the editor's page tabs in sync when the preview itself navigates. The preview only ever shows
    // the theme being edited, so picking another theme in the preview's Settings just redraws.
    const navigate = App.navigate;
    App.navigate = (name, params, opts) => {
      Editor.page = name;
      Editor.updateStageBar();
      return navigate(name, params, opts);
    };
    App.reloadTheme = () => Editor.renderPreview();
  },

  // ---------- values ----------
  // The value the theme sets at `path`, without built-in defaults.
  valueOf(path) {
    return getPath(Editor.draft, path);
  },

  defaultOf(path) {
    const v = getPath(THEME_DEFAULTS, path);
    return v === null || typeof v === 'object' ? '' : String(v ?? '');
  },

  write(path, value) {
    const lastKey = splitPath(path).pop();
    if (value === undefined && typeof lastKey !== 'number') deletePath(Editor.draft, path);
    else setPath(Editor.draft, path, value ?? '');
  },

  setValue(path, value, { structural = false } = {}) {
    Editor.snapshot(structural);
    Editor.write(path, value);
    Editor.afterChange();
  },

  assetUrl(value) {
    if (!value) return '';
    return /^(https?:|data:|theme:)/i.test(value) ? value : Theme.url({ id: Editor.id }, value);
  },

  optionPreview(o) {
    return Editor.optionValues[o.id] ?? o.default !== false;
  },

  // ---------- history ----------
  snapshot(force = false) {
    const now = Date.now();
    const coalesce = !force && now - Editor.lastSnapshot < 700; // typing in one field = one undo step
    Editor.lastSnapshot = now;
    if (coalesce) return;
    Editor.history.push(JSON.stringify({ draft: Editor.draft, css: Editor.css }));
    if (Editor.history.length > 150) Editor.history.shift();
    Editor.future = [];
  },

  restore(state) {
    const s = JSON.parse(state);
    Editor.draft = s.draft;
    Editor.css = s.css;
    Editor.lastSnapshot = 0;
    Editor.renderPanel();
    Editor.afterChange();
  },

  undo() {
    if (!Editor.history.length) return;
    Editor.future.push(JSON.stringify({ draft: Editor.draft, css: Editor.css }));
    Editor.restore(Editor.history.pop());
  },

  redo() {
    if (!Editor.future.length) return;
    Editor.history.push(JSON.stringify({ draft: Editor.draft, css: Editor.css }));
    Editor.restore(Editor.future.pop());
  },

  afterChange() {
    Editor.dirty = true;
    Editor.updateHead();
    clearTimeout(Editor.previewTimer);
    Editor.previewTimer = setTimeout(Editor.renderPreview, 120);
  },

  async save() {
    if (Editor.locked) return toast('Read-only theme', { type: 'error', message: 'Built-in themes can\'t be changed. Make a copy from Settings → Customize.' });
    const problem = Editor.validate();
    if (problem) return toast('Can\'t save yet', { type: 'error', message: problem });
    try {
      await neko.saveTheme({ id: Editor.id, theme: Editor.draft, css: Editor.css });
      Editor.dirty = false;
      Editor.updateHead();
      toast('Saved', { type: 'ok', message: 'The app now uses the new version.' });
    } catch (e) {
      toast('Save failed', { type: 'error', message: e.message });
    }
  },

  validate() {
    const opts = Editor.draft.options || [];
    if (opts.some((o) => !OPTION_ID.test(o.id || ''))) return 'Every toggle needs an id (letters, numbers, dashes).';
    return null;
  },

  // ---------- preview ----------
  applyPreview() {
    Theme.packs = [{ ...Editor.draft, id: Editor.id, hasCss: false }];
    Theme.draftCss = Editor.css;
    App.prefs.theme = Editor.id;
    App.prefs.themeOptions = { [Editor.id]: Editor.optionValues };
    App.applyTheme();
  },

  // Edits re-render quietly (no entrance animations); switching page plays them.
  async renderPreview({ animate = false } = {}) {
    $('#edViewport').classList.toggle('ed-quiet', !animate);
    Editor.applyPreview();
    const app = $('#app');
    const page = Editor.page;
    if (page === 'login') {
      App.navToken++;
      Views.login.render(app, {});
    } else if (page === 'loading') {
      App.navToken++;
      app.innerHTML = `<div class="ed-loading-page">${loadingHTML(Editor.loadingKind)}</div>`;
    } else {
      const scroll = $('#view')?.scrollTop || 0;
      const samePage = App.current?.name === page && $('.shell');
      App.showShell();
      await App.navigate(page, page === 'course' ? { id: 101 } : {}, { push: false });
      if (samePage) $('#view').scrollTop = scroll;
    }
    Editor.markSelected();
  },

  markSelected() {
    Transform.update();
  },

  showPage(page) {
    if (Editor.page === page) return;
    Editor.page = page;
    Editor.updateStageBar();
    Editor.renderPreview({ animate: true });
  },

  fitViewport() {
    const canvas = $('#edCanvas');
    const vp = $('#edViewport');
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const scale = Math.min((width - 32) / VIEW_W, (height - 32) / VIEW_H, 1);
      Editor.scale = scale;
      vp.style.transform = `scale(${scale})`;
      vp.style.setProperty('--inv', 1 / scale); // keeps transform handles the same size on screen
      vp.style.left = `${Math.max(16, (width - VIEW_W * scale) / 2)}px`;
      vp.style.top = `${Math.max(16, (height - VIEW_H * scale) / 2)}px`;
      $('#edZoom').textContent = `${Math.round(scale * 100)}%`;
      Transform.update();
    };
    Editor.fit = fit;
    new ResizeObserver(fit).observe(canvas);
    fit();
  },

  // ---------- chrome ----------
  renderStageBar() {
    $('#edStageBar').innerHTML = `
      <div class="ed-tabs">${PREVIEW_PAGES.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join('')}</div>
      <div class="ed-row">
        <label class="ed-inline" id="edLoadingKind">Text
          <select class="ed-input ed-input--sm">
            <option value="">General</option><option value="boot">Starting up</option><option value="course">Course</option><option value="deadlines">Deadlines</option>
          </select>
        </label>
        <label class="ed-inline">Deadlines
          <select class="ed-input ed-input--sm" id="edState">
            <option value="due">Some due</option><option value="overdue">Only overdue</option><option value="clear">Nothing due</option>
          </select>
        </label>
        <span class="ed-zoom" id="edZoom"></span>
      </div>`;
    Editor.updateStageBar();
  },

  updateStageBar() {
    $$('#edStageBar [data-page]').forEach((b) => b.classList.toggle('is-on', b.dataset.page === Editor.page));
    const kind = $('#edLoadingKind');
    if (kind) kind.hidden = Editor.page !== 'loading';
  },

  updateHead() {
    document.title = `${Editor.draft.name || Editor.id} · NEKO theme editor${Editor.dirty ? ' •' : ''}`;
    const save = $('#edSave');
    if (save) {
      save.disabled = Editor.locked;
      save.textContent = Editor.dirty ? 'Save •' : 'Saved';
    }
    $('#edUndo') && ($('#edUndo').disabled = !Editor.history.length);
    $('#edRedo') && ($('#edRedo').disabled = !Editor.future.length);
  },

  renderPanel() {
    const list = $('#edSections');
    const scroll = list?.scrollTop || 0;
    const d = Editor.draft;
    const fonts = [...FONT_SUGGESTIONS, ...(Editor.valueOf('fonts') || []).map((f) => `"${f.family}"`)];
    $('#edPanel').innerHTML = `
      <header class="ed-head">
        <div class="ed-head__title">
          <b id="edName">${esc(d.name || Editor.id)}</b>
          <span class="ed-muted">${Editor.locked ? 'read-only' : esc(Editor.id)}</span>
        </div>
        <div class="ed-row">
          <span class="ed-spacer"></span>
          <button class="ed-btn ed-btn--ghost ed-btn--sm" id="edUndo" title="Undo (Ctrl+Z)">Undo</button>
          <button class="ed-btn ed-btn--ghost ed-btn--sm" id="edRedo" title="Redo (Ctrl+Y)">Redo</button>
          <button class="ed-btn ed-btn--ghost ed-btn--sm" id="edFolder" title="Open the theme folder">Folder</button>
          <button class="ed-btn ed-btn--primary ed-btn--sm" id="edSave" title="Save (Ctrl+S)">Saved</button>
        </div>
        ${Editor.locked ? '<div class="ed-notice">Built-in theme: you can look around, but saving is off. Use Settings → Customize to make an editable copy.</div>' : ''}
      </header>
      <datalist id="ed-fonts">${fonts.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="ed-sections" id="edSections">
        ${EDITOR_SECTIONS.map((sec) => `
          <details class="ed-section" data-section="${sec.id}" ${Editor.openSections.has(sec.id) ? 'open' : ''}>
            <summary>${esc(sec.title)}</summary>
            <div class="ed-section__body">${sec.custom ? Editor[`section_${sec.custom}`]() : sec.fields.map((f) => Fields.render(f)).join('')}</div>
          </details>`).join('')}
      </div>`;
    $('#edSections').scrollTop = scroll;
    Editor.updateHead();
  },

    section_css() {
    return `
      <textarea class="ed-input ed-code" id="edCss" rows="16" spellcheck="false" placeholder="/* Extra CSS for this theme */">${esc(Editor.css)}</textarea>
      <div class="ed-hint">Saved as theme.css. Use .opt-&lt;id&gt; to style a toggle, and theme://${esc(Editor.id)}/assets/… for images.</div>`;
  },

  // ---------- events ----------
  bindEvents() {
    const panel = $('#edPanel');
    panel.addEventListener('input', Editor.onInput);
    panel.addEventListener('click', Editor.onClick);
    // Re-rendering fires "toggle" for sections that were already open, so only act on real changes.
    panel.addEventListener('toggle', (e) => {
      const sec = e.target.closest?.('.ed-section');
      if (sec && e.target === sec && sec.open !== Editor.openSections.has(sec.dataset.section)) {
        if (sec.open) {
          Editor.openSections.add(sec.dataset.section);
          const def = EDITOR_SECTIONS.find((s) => s.id === sec.dataset.section);
          if (def?.page) Editor.showPage(def.page);
        } else {
          Editor.openSections.delete(sec.dataset.section);
        }
      }
      const key = e.target.dataset?.openKey;
      if (key) e.target.open ? Editor.openItems.add(key) : Editor.openItems.delete(key);
    }, true);

    $('#edStageBar').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-page]');
      if (tab) Editor.showPage(tab.dataset.page);
    });
    $('#edStageBar').addEventListener('change', (e) => {
      if (e.target.id === 'edState') {
        PreviewData.state = e.target.value;
        Editor.renderPreview();
      } else if (e.target.closest('#edLoadingKind')) {
        Editor.loadingKind = e.target.value;
        Editor.renderPreview();
      }
    });

    $('#app').addEventListener('pointerdown', Transform.onAppPointerDown, true);
    $('#app').addEventListener('scroll', () => Transform.update(), true);

    window.addEventListener('keydown', (e) => {
      const typing = e.target.matches?.('input, textarea, select');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); Editor.save(); }
      else if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); Editor.undo(); }
      else if ((e.ctrlKey || e.metaKey) && !typing && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); Editor.redo(); }
      else if (!typing && Editor.selected && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 5 : 0.5;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (Transform.nudge(dx, dy)) e.preventDefault();
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && Transform.remove()) e.preventDefault();
      else if (!typing && e.key === 'Escape' && Editor.selected) { Editor.selected = null; Transform.update(); Editor.renderPanel(); }
    });
    window.addEventListener('beforeunload', (e) => {
      if (Editor.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  onInput(e) {
    const el = e.target;
    if (el.id === 'edCss') {
      Editor.snapshot();
      Editor.css = el.value;
      Editor.afterChange();
      return;
    }
    if (el.dataset.action === 'opt-preview') {
      Editor.optionValues[el.dataset.id] = el.checked;
      Editor.renderPreview();
      return;
    }
    const path = el.dataset.bind;
    if (!path) return;
    const raw = el.value;
    let v;
    switch (el.dataset.kind) {
      case 'number': v = raw === '' ? undefined : Number(raw); break;
      case 'len': v = raw.trim() === '' ? undefined : /^-?\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : raw.trim(); break;
      case 'px': v = `${raw}px`; break;
      case 'pct': v = raw === '' ? undefined : Math.min(100, Math.max(0, Number(raw))) / 100; break;
      case 'color': v = raw; break;
      case 'bool': v = el.checked; break;
      case 'boolDefaultOn': v = el.checked ? undefined : false; break;
      case 'lines': v = raw.split('\n').map((s) => s.trim()).filter(Boolean); if (!v.length) v = undefined; break;
      case 'json':
        if (!raw.trim()) v = undefined;
        else {
          try {
            v = JSON.parse(raw);
            el.classList.remove('is-invalid');
          } catch {
            el.classList.add('is-invalid');
            return;
          }
        }
        break;
      default: v = raw.trim() === '' ? undefined : raw;
    }
    Editor.setValue(path, v);

    // Keep paired controls (colour picker + text, slider + text) in step.
    const field = el.closest('.ed-color, .ed-length');
    if (field) {
      field.querySelectorAll(`[data-bind="${CSS.escape(path)}"]`).forEach((other) => {
        if (other === el) return;
        if (other.dataset.kind === 'pct') other.value = Math.round((v ?? 1) * 100);
        else if (other.type === 'range') other.value = parseFloat(v) || 0;
        else other.value = v ?? '';
      });
      const swatch = field.querySelector('.ed-color__swatch i');
      if (swatch) swatch.style.background = v || 'transparent';
    }
    const gradient = el.closest('.ed-field')?.querySelector('.ed-gradient-preview');
    if (gradient) gradient.style.background = v || '';
    if (path === 'name') $('#edName').textContent = v || Editor.id;
  },

  async onClick(e) {
    const btn = e.target.closest('button, [data-action]');
    if (!btn) return;
    if (btn.id === 'edSave') return Editor.save();
    if (btn.id === 'edUndo') return Editor.undo();
    if (btn.id === 'edRedo') return Editor.redo();
    if (btn.id === 'edFolder') return neko.revealTheme(Editor.id);
    const { action, path, index } = btn.dataset;
    if (!action) return;
    if (btn.tagName === 'BUTTON' || action === 'select-el') e.preventDefault();
    const i = Number(index);
    const list = () => clone(Editor.valueOf(path)) || [];
    const setList = (arr) => Editor.setValue(path, arr.length ? arr : undefined, { structural: true });

    switch (action) {
      case 'color-pick': {
        if (ColorPicker.el && ColorPicker.anchor === btn) return ColorPicker.close();
        const text = btn.parentElement.querySelector('input.ed-input');
        const swatch = btn.querySelector('i');
        ColorPicker.open(btn, text.value || text.placeholder, (v) => {
          text.value = v;
          swatch.style.background = v;
          Editor.setValue(path, v);
        });
        return;
      }
      case 'pick': {
        const file = await Editor.pickAsset(btn.dataset.asset);
        if (file) Editor.setValue(path, file, { structural: true });
        break;
      }
      case 'clear': Editor.setValue(path, undefined, { structural: true }); break;
      case 'set': Editor.setValue(path, btn.dataset.value, { structural: true }); break;
      case 'bg-mode': {
        const current = Editor.valueOf(path);
        const color = typeof current === 'string' && !/gradient\(/.test(current) ? current : current?.color;
        const value = {
          none: undefined,
          solid: color || '#ffffff',
          gradient: 'linear-gradient(135deg, #f7a6ea, #46c3f0)',
          image: { image: null, size: 'cover', position: 'center' },
        }[btn.dataset.mode];
        Editor.setValue(path, value, { structural: true });
        break;
      }
      case 'list-move': {
        const arr = list();
        const j = i + Number(btn.dataset.dir);
        [arr[i], arr[j]] = [arr[j], arr[i]];
        Editor.selected = null;
        setList(arr);
        break;
      }
      case 'list-dup': { const arr = list(); arr.splice(i + 1, 0, clone(arr[i])); setList(arr); break; }
      case 'list-del': { const arr = list(); arr.splice(i, 1); Editor.selected = null; setList(arr); break; }
      case 'list-add': { const arr = list(); arr.push(JSON.parse(btn.dataset.item)); setList(arr); break; }
      case 'list-add-image': {
        const file = await Editor.pickAsset('image');
        if (file) { const arr = list(); arr.push(file); setList(arr); }
        break;
      }
      case 'add-font': {
        const file = await Editor.pickAsset('font');
        if (file) {
          const arr = list();
          arr.push({ family: file.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), src: file, weight: '400' });
          setList(arr);
        }
        break;
      }
      case 'el-add': {
        let item = { type: 'text', text: 'Hello!', x: 50, y: 50, size: 36, weight: 800, color: '#ffffff' };
        if (btn.dataset.type === 'image') {
          const file = await Editor.pickAsset('image');
          if (!file) return;
          item = { type: 'image', src: file, x: 50, y: 50, width: 25 };
        }
        const arr = list();
        arr.push(item);
        Editor.selected = { path, index: arr.length - 1 };
        setList(arr);
        Editor.showPage(path.startsWith('login') ? 'login' : 'dashboard');
        break;
      }
      case 'select-el':
        Editor.selected = { path, index: i };
        Editor.showPage(path.startsWith('login') ? 'login' : 'dashboard');
        Editor.markSelected();
        return;
      default:
        return;
    }
    Editor.renderPanel();
  },

  async pickAsset(kind) {
    try {
      return await neko.importThemeAsset({ id: Editor.id, kind });
    } catch (e) {
      toast('Couldn\'t add the file', { type: 'error', message: e.message });
      return null;
    }
  },

  // Opens the panel section and list item for an element clicked in the preview.
  revealItem(path, index) {
    Editor.openSections.add(path.startsWith('login') ? 'login' : 'hero');
    Editor.renderPanel();
    const item = $(`.ed-field[data-field="${CSS.escape(path)}"] [data-el-item="${index}"]`);
    item?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
};
