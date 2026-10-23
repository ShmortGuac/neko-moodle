Views.settings = {
  title: () => 'Settings',

  render(root) {
    const u = App.user;
    const profile = Site.current();
    const toggle = (key, title, desc) => `
      <div class="toggle-row">
        <div><b>${esc(title)}</b><span>${esc(desc)}</span></div>
        <label class="switch"><input type="checkbox" data-pref="${key}" ${App.prefs[key] ? 'checked' : ''}><i></i></label>
      </div>`;

    // Variant preview: the variant's picture, or a swatch strip for themes without art.
    const preview = (pack, v) => (v.preview
      ? `<img src="${esc(Theme.url(pack, v.preview))}" alt="">`
      : `<div class="theme-card__plain" style="background:linear-gradient(135deg, ${(v.swatches || []).map(esc).join(', ') || 'var(--surface-2), var(--surface-2)'})"></div>`);

    const decorations = [
      Theme.cfg.sidebar.mascot ? toggle('mascot', t('mascotName'), 'Show the theme\'s mascot in the sidebar and on course pages') : '',
      Theme.cfg.decorations.watermark ? toggle('watermark', t('watermarkName'), `The big "${Theme.cfg.decorations.watermark}" text behind everything`) : '',
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
        <div class="card__head"><h3 class="card__title">${Icons.heart} Theme</h3></div>
        <div class="card__body">
          ${Theme.packs.map((pack) => `
            <div class="theme-pack">
              <div class="theme-pack__head"><b>${esc(pack.name)}</b><span>${esc(pack.description || '')}</span></div>
              <div class="theme-grid">
                ${pack.variants.map((v) => `
                  <button class="theme-card ${Theme.pack.id === pack.id && Theme.variant.id === v.id ? 'is-active' : ''}" data-pack="${esc(pack.id)}" data-variant="${esc(v.id)}">
                    ${preview(pack, v)}
                    <div class="theme-card__swatches">${(v.swatches || []).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</div>
                    <span class="theme-card__check">${Icons.check}</span>
                    <div class="theme-card__label">${esc(v.name)} <small>${esc(v.subtitle || '')}</small></div>
                  </button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="settings-grid">
        ${decorations ? `
          <div class="card">
            <div class="card__head"><h3 class="card__title">${Icons.star} Decorations</h3></div>
            <div class="card__body">${decorations}</div>
          </div>` : ''}

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
              <span style="font-size:12px">Variant: ${esc(Theme.variant.name)}</span>
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
              An unofficial desktop client for Moodle sites.
              ${profile?.disclaimer ? esc(profile.disclaimer) : ''}
            </div>
          </div>
        </div>
      </div>`;

    $$('[data-pack]', root).forEach((b) => b.addEventListener('click', () => {
      App.prefs.theme = b.dataset.pack;
      App.prefs.variant = b.dataset.variant;
      App.savePrefs();
      App.reloadTheme();
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
