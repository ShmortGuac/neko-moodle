// Every theme in a searchable grid (Settings → Show all). The theme cards are shared with Settings.

Views.themes = {
  nav: 'settings',
  title: () => 'Themes',
  // Kept while the app runs, so picking a theme (which redraws the page) doesn't reset the search.
  query: '',
  filter: 'all',

  // The theme's picture, or a gradient of its swatches for themes without art.
  // With `details`, every theme gets an export button, and themes the user made a delete button too.
  card(theme, { details = false } = {}) {
    const swatches = theme.swatches || [];
    const preview = theme.preview
      ? `<img src="${esc(Theme.url(theme, theme.preview))}" alt="">`
      : `<div class="theme-card__plain" style="background:linear-gradient(135deg, ${swatches.map(esc).join(', ') || 'var(--surface-2), var(--surface-2)'})"></div>`;
    const by = theme.source === 'user' ? 'Made by you' : theme.author || 'Built in';
    const card = `
      <button class="theme-card ${Theme.pack.id === theme.id ? 'is-active' : ''}" data-use-theme="${esc(theme.id)}" title="${esc(theme.name || theme.id)}">
        ${preview}
        <div class="theme-card__swatches">${swatches.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</div>
        <span class="theme-card__check">${Icons.check}</span>
        <div class="theme-card__label"><span>${esc(theme.name || theme.id)}</span>${theme.subtitle ? `<small>${esc(theme.subtitle)}</small>` : ''}</div>
        ${details ? `<div class="theme-card__meta"><b>${esc(by)}</b>${theme.description ? ` · ${esc(theme.description)}` : ''}</div>` : ''}
      </button>`;
    if (!details) return card;
    const del = theme.source === 'user' ? `<button class="theme-card__action theme-card__action--danger" data-delete-theme="${esc(theme.id)}" title="Delete theme">${Icons.trash}</button>` : '';
    return `<div class="theme-tile">${card}<div class="theme-card__actions"><button class="theme-card__action" data-export-theme="${esc(theme.id)}" title="Export as .zip">${Icons.download}</button>${del}</div></div>`;
  },

  // Asks first; the theme's folder goes to the Recycle Bin. Using it? Switch to Light.
  async remove(id) {
    const theme = Theme.packs.find((p) => p.id === id);
    if (!theme || theme.source !== 'user') return;
    const deleted = await confirmModal({
      title: `Delete "${theme.name || id}"?`,
      text: 'The theme and its pictures go to the Recycle Bin, so you can restore them from there.',
      okLabel: 'Delete',
      run: async () => {
        await neko.deleteTheme(id);
        return true;
      },
    });
    if (!deleted) return;
    if (App.prefs.theme === id) App.prefs.theme = 'default-light';
    delete App.prefs.themeOptions[id];
    App.savePrefs();
    Theme.packs = Theme.packs.filter((p) => p.id !== id);
    App.reloadTheme();
    toast('Theme deleted', { type: 'ok', message: 'It\'s in the Recycle Bin if you change your mind.' });
  },

  // Clicking any theme card switches to that theme. The page redraws, so keep the scroll position.
  bind(root) {
    root.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delete-theme]');
      if (del) return Views.themes.remove(del.dataset.deleteTheme);
      const exp = e.target.closest('[data-export-theme]');
      if (exp) return Views.themes.exportTheme(exp.dataset.exportTheme);
      const card = e.target.closest('[data-use-theme]');
      if (!card || card.dataset.useTheme === Theme.pack.id) return;
      const view = $('#view');
      const scroll = view?.scrollTop || 0;
      App.prefs.theme = card.dataset.useTheme;
      App.savePrefs();
      await App.reloadTheme();
      if ($('#view')) $('#view').scrollTop = scroll;
    });
  },

  // Picks a theme.json or .zip to add. The themes list redraws by itself (themes:changed).
  async importThemes() {
    let res;
    try {
      res = await neko.importThemes();
    } catch (e) {
      return toast('Could not import', { type: 'error', message: e.message });
    }
    if (!res) return;
    if (res.ids.length) {
      await Theme.load();
      const names = res.ids.map((id) => Theme.packs.find((p) => p.id === id)?.name || id);
      const use = async () => {
        App.prefs.theme = res.ids[0];
        App.savePrefs();
        await App.reloadTheme();
      };
      toast(res.ids.length === 1 ? 'Theme imported' : `${res.ids.length} themes imported`, {
        type: 'ok',
        message: names.join(', '),
        actions: res.ids.length === 1 ? [{ label: 'Use it', onClick: use }] : [],
      });
    }
    if (res.errors.length) toast(res.ids.length ? 'Some files weren\'t imported' : 'Nothing was imported', { type: 'error', message: res.errors.join(' · '), timeout: 9000 });
  },

  // Saves the theme as a .zip that Import theme reads back (on this PC or someone else's).
  async exportTheme(id) {
    let file;
    try {
      file = await neko.exportTheme(id);
    } catch (e) {
      if (e.code !== 'cancelled') toast('Could not export', { type: 'error', message: e.message });
      return;
    }
    if (!file) return;
    const theme = Theme.packs.find((p) => p.id === id);
    toast('Theme exported', {
      type: 'ok',
      message: `${theme?.name || id} was saved as ${file.split(/[\\/]/).pop()}. Share it, and import it with Import theme.`,
      actions: [{ label: 'Show in folder', onClick: () => neko.showInFolder(file) }],
    });
  },

  async openFolder() {
    try {
      await neko.openThemesFolder();
    } catch (e) {
      toast('Could not open the themes folder', { type: 'error', message: e.message });
    }
  },

  async create() {
    const name = await promptModal({ title: 'New theme', label: 'Name', value: 'My theme', okLabel: 'Create', hint: 'Starts from Light. You can change everything in the editor.' });
    if (name) Views.settings.openEditorFor(await neko.createTheme({ name }));
  },

  render(root) {
    const all = Theme.packs;
    const mine = all.filter((th) => th.source === 'user').length;
    root.innerHTML = `
      <div class="page-head">
        <div>
          ${t('eyebrowSettings') ? `<div class="page-head__eyebrow">${esc(t('eyebrowSettings'))}</div>` : ''}
          <h1>Themes</h1>
          <p>${all.length} theme${all.length === 1 ? '' : 's'}${mine ? `, ${mine} made by you` : ''}. Click one to use it.</p>
        </div>
        <div class="toolbar">
          <div class="search">${Icons.search}<input class="input" id="q" placeholder="Search themes…" spellcheck="false"></div>
          <div class="seg" id="seg">
            <button data-f="all">All</button>
            <button data-f="builtin">Built in</button>
            <button data-f="user">Mine</button>
          </div>
          <button class="btn btn--ghost" id="importTheme" title="Add a theme.json or .zip someone shared">${Icons.upload} Import</button>
          <button class="btn btn--ghost" id="themesFolder" title="Open the folder your themes are kept in">${Icons.folder} Open folder</button>
          <button class="btn btn--ghost" id="newTheme">${Icons.star} New theme</button>
        </div>
      </div>
      <div class="theme-grid" id="themeGrid"></div>`;

    const draw = () => {
      const q = Views.themes.query.trim().toLowerCase();
      const list = all
        .filter((th) => Views.themes.filter === 'all' || th.source === Views.themes.filter)
        .filter((th) => !q || [th.name, th.subtitle, th.author, th.description].join(' ').toLowerCase().includes(q));
      $$('#seg button', root).forEach((b) => b.classList.toggle('is-active', b.dataset.f === Views.themes.filter));
      $('#themeGrid', root).innerHTML = list.length
        ? list.map((th) => Views.themes.card(th, { details: true })).join('')
        : `<div style="grid-column:1/-1">${emptyHTML('No themes found', Views.themes.filter === 'user' && !q ? 'Make one with "New theme".' : 'Try a different search.')}</div>`;
    };
    const input = $('#q', root);
    input.value = Views.themes.query;
    input.addEventListener('input', () => {
      Views.themes.query = input.value;
      draw();
    });
    $$('#seg button', root).forEach((b) => b.addEventListener('click', () => {
      Views.themes.filter = b.dataset.f;
      draw();
    }));
    $('#newTheme', root).addEventListener('click', () => Views.themes.create());
    $('#importTheme', root).addEventListener('click', () => Views.themes.importThemes());
    $('#themesFolder', root).addEventListener('click', () => Views.themes.openFolder());
    Views.themes.bind(root);
    draw();
  },
};
