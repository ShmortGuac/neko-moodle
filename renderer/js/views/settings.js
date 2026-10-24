Views.settings = {
  title: () => 'Settings',

  // Switch the app to the theme so the change is visible, then open it in the editor.
  async openEditorFor(id) {
    try {
      await neko.openEditor(id);
    } catch (e) {
      toast('Could not open the editor', { type: 'error', message: e.message });
    }
  },

  render(root) {
    const u = App.user;
    const profile = Site.current();
    const toggle = (key, title, desc) => `
      <div class="toggle-row">
        <div><b>${esc(title)}</b><span>${esc(desc)}</span></div>
        <label class="switch"><input type="checkbox" data-pref="${key}" ${App.prefs[key] ? 'checked' : ''}><i></i></label>
      </div>`;

    // One scrolling row, the theme in use first. "Show all" opens the Themes page.
    const row = [Theme.pack, ...Theme.packs.filter((p) => p.id !== Theme.pack.id)];

    const decorations = [
      Theme.cfg.sidebar.mascot ? toggle('mascot', t('mascotName'), 'Show the theme\'s mascot in the sidebar and on course pages') : '',
      Theme.cfg.decorations.watermark ? toggle('watermark', t('watermarkName'), `The big "${Theme.cfg.decorations.watermark}" text behind everything`) : '',
      ...Theme.options.map((o) => `
        <div class="toggle-row">
          <div><b>${esc(o.label || o.id)}</b><span>${esc(o.description || '')}</span></div>
          <label class="switch"><input type="checkbox" data-option="${esc(o.id)}" ${o.value ? 'checked' : ''}><i></i></label>
        </div>`),
    ].join('');

    root.innerHTML = `
      <div class="page-head">
        <div>
          ${t('eyebrowSettings') ? `<div class="page-head__eyebrow">${esc(t('eyebrowSettings'))}</div>` : ''}
          <h1>Settings</h1>
          <p>Make it yours.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:22px">
        <div class="card__head">
          <h3 class="card__title">${Icons.heart} Theme</h3>
          <div class="toolbar">
            <button class="btn btn--ghost btn--sm" id="allThemes">${Icons.grid} Show all (${Theme.packs.length})</button>
            <button class="btn btn--ghost btn--sm" id="newTheme">${Icons.star} New theme</button>
            <button class="btn btn--ghost btn--sm" id="editTheme">${Icons.settings} ${Theme.pack.locked ? 'Customize' : 'Edit theme'}</button>
            ${Theme.pack.source === 'user' ? `<button class="btn btn--ghost btn--sm" id="deleteTheme" title="Delete this theme">${Icons.trash} Delete</button>` : ''}
          </div>
        </div>
        <div class="card__body">
          <div class="theme-row" id="themeRow">${row.map((p) => Views.themes.card(p)).join('')}</div>
        </div>
      </div>

      <div class="settings-grid">
        ${decorations ? `
          <div class="card">
            <div class="card__head"><h3 class="card__title">${Icons.star} Theme options</h3></div>
            <div class="card__body">${decorations}</div>
          </div>` : ''}

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.folder} Downloads</h3></div>
          <div class="card__body">
            <p style="margin:0 0 14px;color:var(--text-muted);font-size:13px;line-height:1.6">
              Files are saved to <b>Downloads\\NEKO\\&lt;course&gt;\\&lt;section&gt;</b>. Files you already have are skipped.
            </p>
            <button class="btn btn--ghost" id="openDl">${Icons.folder} Open downloads folder</button>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.user} Account</h3></div>
          <div class="card__body">
            <div class="account">
              <img class="avatar" src="${esc(u.userpicture)}" alt="" data-fallback>
              <div style="flex:1;min-width:0">
                <b>${esc(displayName(u))}</b>
                <div style="font-size:12px;color:var(--text-muted)">${esc(u.username)} · ${esc(u.site)}</div>
              </div>
              <button class="btn btn--ghost" id="logout">${Icons.logout} Sign out</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.heart} About this theme</h3></div>
          <div class="card__body about">
            <div>
              <b style="color:var(--text)">${esc(Theme.pack.name)}</b>${Theme.pack.version ? ` v${esc(Theme.pack.version)}` : ''}
              ${Theme.pack.author ? `· by ${esc(Theme.pack.author)}` : ''}<br>
              ${Theme.pack.description ? `<span style="font-size:12px">${esc(Theme.pack.description)}</span>` : ''}
              ${Theme.cfg.about ? `<div class="about__text" style="margin-top:8px">${linkify(Theme.cfg.about)}</div>` : ''}
              ${Theme.cfg.links.length ? `<div class="about__links">${Theme.cfg.links.map((l) => `<button class="btn btn--ghost btn--sm" data-url="${esc(l.url)}">${Icons.external} ${esc(l.label)}</button>`).join('')}</div>` : ''}
            </div>
            ${Theme.cfg.aboutImage ? `<img src="${esc(Theme.cfg.aboutImage)}" alt="">` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.info} About the app</h3></div>
          <div class="card__body about">
            <div>
              <b style="color:var(--text)">${esc(APP_NAME)}</b> v0.1.0<br>
              ${esc(APP_DESCRIPTION)}
              ${profile?.disclaimer ? esc(profile.disclaimer) : ''}
            </div>
            <img class="about__app-icon" src="neko.png" alt="NEKO">
          </div>
        </div>
      </div>`;

    Views.themes.bind($('#themeRow', root));
    $$('[data-pref]', root).forEach((input) => input.addEventListener('change', () => {
      App.prefs[input.dataset.pref] = input.checked;
      App.savePrefs();
      App.applyTheme();
    }));
    $$('[data-option]', root).forEach((input) => input.addEventListener('change', () => {
      const pack = Theme.pack.id;
      App.prefs.themeOptions = { ...App.prefs.themeOptions, [pack]: { ...App.prefs.themeOptions[pack], [input.dataset.option]: input.checked } };
      App.savePrefs();
      App.reloadTheme();
    }));
    $('#allThemes', root).addEventListener('click', () => App.navigate('themes'));
    $('#deleteTheme', root)?.addEventListener('click', () => Views.themes.remove(Theme.pack.id));
    $('#newTheme', root).addEventListener('click', () => Views.themes.create());
    $('#editTheme', root).addEventListener('click', async () => {
      if (!Theme.pack.locked) return Views.settings.openEditorFor(Theme.pack.id);
      const name = await promptModal({ title: `Customize ${Theme.pack.name}`, label: 'Name for your copy', value: `My ${Theme.pack.name}`, okLabel: 'Make a copy', hint: "Built-in themes can't be changed, so you'll edit a copy." });
      if (name) Views.settings.openEditorFor(await neko.createTheme({ name, from: Theme.pack.id }));
    });
    $('#openDl', root).addEventListener('click', () => neko.openDownloads());
    $('#logout', root).addEventListener('click', () => App.signOut());
  },
};
