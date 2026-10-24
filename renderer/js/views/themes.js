// Every theme in a searchable grid (Settings → Show all). The theme cards are shared with Settings.

Views.themes = {
  nav: 'settings',
  title: () => 'Themes',
  // Kept while the app runs, so picking a theme (which redraws the page) doesn't reset the search.
  query: '',
  filter: 'all',

  // The theme's picture, or a gradient of its swatches for themes without art.
  // With `details`, themes the user made also get a delete button.
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
    if (!details || theme.source !== 'user') return card;
    return `<div class="theme-tile">${card}<button class="theme-card__delete" data-delete-theme="${esc(theme.id)}" title="Delete theme">${Icons.trash}</button></div>`;
  },

  // Asks first; the theme's folder goes to the Recycle Bin. Using it? Switch to Default Light.
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

  async create() {
    const name = await promptModal({ title: 'New theme', label: 'Name', value: 'My theme', okLabel: 'Create', hint: 'Starts from Default Light. You can change everything in the editor.' });
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
    Views.themes.bind(root);
    draw();
  },
};
