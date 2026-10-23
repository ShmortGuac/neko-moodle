Views.settings = {
  title: () => 'Settings',

  render(root) {
    const u = App.user;
    const toggle = (key, title, desc) => `
      <div class="toggle-row">
        <div><b>${title}</b><span>${desc}</span></div>
        <label class="switch"><input type="checkbox" data-pref="${key}" ${App.prefs[key] ? 'checked' : ''}><i></i></label>
      </div>`;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <div class="page-head__jp">せってい</div>
          <h1>Settings</h1>
          <p>Make it yours.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:22px">
        <div class="card__head"><h3 class="card__title">${Icons.heart} Theme</h3></div>
        <div class="card__body">
          <div class="theme-grid">
            ${Object.entries(THEMES).map(([id, t]) => `
              <button class="theme-card ${App.prefs.theme === id ? 'is-active' : ''}" data-theme-id="${id}">
                <img src="${t.preview}" alt="">
                <div class="theme-card__swatches">${t.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
                <span class="theme-card__check">${Icons.check}</span>
                <div class="theme-card__label">${esc(t.name)} <small>${esc(t.jp)}</small></div>
              </button>`).join('')}
          </div>
        </div>
      </div>

      <div class="settings-grid">
        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.star} Decorations</h3></div>
          <div class="card__body">
            ${toggle('mascot', 'Chibi Aqua', 'Show Aqua in the sidebar and course pages')}
            ${toggle('kana', 'Kana background', 'The big 湊あくあ text behind everything')}
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.folder} Downloads</h3></div>
          <div class="card__body">
            <p style="margin:0 0 14px;color:var(--text-muted);font-size:13px;line-height:1.6">
              Files are saved to <b>Downloads\\i-Taleem\\&lt;course&gt;\\&lt;section&gt;</b>. Files you already have are skipped.
            </p>
            <button class="btn btn--ghost" id="openDl">${Icons.folder} Open downloads folder</button>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.anchor} Account</h3></div>
          <div class="card__body">
            <div class="account">
              <img class="avatar" src="${esc(u.userpicture)}" alt="" data-fallback>
              <div style="flex:1;min-width:0">
                <b>${esc(titleCase(stripHtml(u.fullname)))}</b>
                <div style="font-size:12px;color:var(--text-muted)">${esc(u.username)} · ${esc(u.site)}</div>
              </div>
              <button class="btn btn--ghost" id="logout">${Icons.logout} Sign out</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.info} About</h3></div>
          <div class="card__body about">
            <div>
              <b style="color:var(--text)">i-Taleem Desktop</b> v0.1.0<br>
              An unofficial fan-made client. It is not affiliated with IIUM or hololive.
              Minato Aqua artwork belongs to its original artists.
            </div>
            <img src="assets/aqua-portrait.jpg" alt="">
          </div>
        </div>
      </div>`;

    $$('[data-theme-id]', root).forEach((b) => b.addEventListener('click', () => {
      App.prefs.theme = b.dataset.themeId;
      App.savePrefs();
      App.applyTheme();
      $$('[data-theme-id]', root).forEach((x) => x.classList.toggle('is-active', x === b));
    }));
    $$('[data-pref]', root).forEach((input) => input.addEventListener('change', () => {
      App.prefs[input.dataset.pref] = input.checked;
      App.savePrefs();
      App.applyTheme();
    }));
    $('#openDl', root).addEventListener('click', () => italeem.openDownloads());
    $('#logout', root).addEventListener('click', () => App.signOut());
  },
};
