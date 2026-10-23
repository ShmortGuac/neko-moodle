const DEFAULT_FOOTER = "Unofficial client. You sign in on your site's own login page.";

Views.login = {
  render(root, { message } = {}) {
    const cfg = Theme.cfg.login;
    const card = cfg.card;
    const badge = cfg.badge;
    const startSite = App.prefs.site || Site.presets()[0]?.url || '';
    const profile = Site.forUrl(startSite);
    const presets = Site.presets();
    const subtitleFor = (site) => (site || !cfg.subtitle.includes('{site}') ? fill(cfg.subtitle, { site }) : cfg.subtitleFallback);
    root.innerHTML = `
      <div class="login">
        ${elementsHTML(cfg.elements)}
        <div class="login__slot" style="${esc(`left:${cssLen(card.x)};top:${cssLen(card.y)};width:min(${cssLen(card.width, 'px')}, calc(100% - 40px))`)}">
        <div class="card login__panel">
          ${badge.image ? `<img class="login__badge" src="${esc(badge.image)}" alt="" style="${esc(`width:${cssLen(badge.width, 'px')};top:${cssLen(badge.top, 'px')};right:${cssLen(badge.right, 'px')}`)}">` : ''}
          <div class="brandmark">
            <span id="brandTile">${brandTileHTML(profile)}</span>
            <h1 id="brand">${esc(profile?.brand || APP_NAME)}</h1>
          </div>
          <p class="login__sub" id="siteLine">${esc(subtitleFor(null))}</p>

          <div class="field" style="margin-bottom:16px">
            <label for="site">Site</label>
            ${presets.length ? `
              <div class="site-picks" id="sitePicks">
                ${presets.map((p) => `<button type="button" class="chip" data-site="${esc(p.url)}">${esc(p.label)}</button>`).join('')}
              </div>` : ''}
            <input class="input" id="site" value="${esc(startSite)}" placeholder="yourschool.edu/moodle" spellcheck="false">
          </div>

          <div id="error">${message ? `<div class="notice notice--error">${esc(message)}</div>` : ''}</div>

          <button class="btn btn--primary btn--block" id="ssoBtn">${Icons.key} <span id="ssoLabel">${esc(profile?.ssoLabel || 'Sign in with browser')}</span></button>

          <details id="pwBox" style="margin-top:14px">
            <summary>${Icons.chevron} Use username &amp; password instead</summary>
            <form id="loginForm" autocomplete="on">
              <div class="field">
                <label for="username">Username</label>
                <input class="input" id="username" autocomplete="username" required value="${esc(App.prefs.username)}">
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input class="input" id="password" type="password" autocomplete="current-password" required>
              </div>
              <button class="btn btn--ghost btn--block" type="submit" id="loginBtn">Sign in ${motifHTML('motif--inline')}</button>
            </form>
          </details>

          <div class="login__foot" id="loginFoot">${esc(profile?.loginFooter || DEFAULT_FOOTER)}</div>
        </div>
        </div>
      </div>`;

    const form = $('#loginForm', root);
    const loginBtn = $('#loginBtn', root);
    const ssoBtn = $('#ssoBtn', root);
    const siteInput = $('#site', root);
    const pwBox = $('#pwBox', root);
    let publicConfig = null;

    const showError = (text) => {
      $('#error', root).innerHTML = text ? `<div class="notice notice--error" style="margin-bottom:14px">${esc(text)}</div>` : '';
    };

    const busy = (btn, on, label) => {
      loginBtn.disabled = ssoBtn.disabled = on;
      if (on) {
        btn.dataset.label = btn.innerHTML;
        btn.innerHTML = `<span class="spin" style="display:inline-flex">${Icons.refresh}</span> ${esc(label)}`;
      } else if (btn.dataset.label) {
        btn.innerHTML = btn.dataset.label;
      }
    };

    const explain = (err) => {
      if (['enablewsdescription', 'servicenotavailable'].includes(err.code)) {
        return 'This site has app access (mobile web services) turned off, so third-party clients can\'t sign in.';
      }
      if (err.code === 'invalidlogin') {
        return publicConfig?.typeoflogin === 1
          ? 'Wrong username or password. Please try again.'
          : `Password sign-in was rejected. This site uses single sign-on, so try "${$('#ssoLabel', root).textContent}".`;
      }
      return err.message;
    };

    const markPreset = () => {
      const value = siteInput.value.trim().replace(/\/+$/, '');
      $$('[data-site]', root).forEach((b) => b.classList.toggle('chip--pink', b.dataset.site === value));
      const p = Site.forUrl(value);
      $('#brand', root).textContent = p?.brand || APP_NAME;
      $('#brandTile', root).innerHTML = brandTileHTML(p);
      $('#ssoLabel', root).textContent = p?.ssoLabel || 'Sign in with browser';
      $('#loginFoot', root).textContent = p?.loginFooter || DEFAULT_FOOTER;
    };

    // Ask the site how it wants us to log in and show its real name.
    let probeId = 0;
    const probe = async () => {
      const id = ++probeId;
      markPreset();
      publicConfig = null;
      $('#siteLine', root).textContent = subtitleFor(null);
      let config = null;
      try {
        config = await italeem.getPublicConfig(siteInput.value);
      } catch {
        // invalid address: the login attempt will show a proper error
      }
      if (id !== probeId || !config) return; // a newer lookup took over
      publicConfig = config;
      $('#siteLine', root).textContent = subtitleFor(stripHtml(publicConfig.sitename));
      if (publicConfig.typeoflogin === 1) pwBox.open = true;
    };
    siteInput.addEventListener('change', probe);
    $$('[data-site]', root).forEach((b) => b.addEventListener('click', () => {
      siteInput.value = b.dataset.site;
      probe();
    }));
    probe();

    const remember = () => {
      App.prefs.site = siteInput.value.trim();
      App.prefs.username = $('#username', root).value.trim();
      App.savePrefs();
    };

    ssoBtn.addEventListener('click', async () => {
      showError('');
      busy(ssoBtn, true, 'Finish signing in in the new window…');
      try {
        const user = await italeem.loginSSO(siteInput.value, publicConfig?.launchurl);
        remember();
        App.onSignedIn(user);
      } catch (err) {
        busy(ssoBtn, false);
        if (err.code !== 'cancelled') showError(explain(err));
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');
      busy(loginBtn, true, 'Signing in');
      try {
        const user = await italeem.login(siteInput.value, $('#username', root).value.trim(), $('#password', root).value);
        remember();
        App.onSignedIn(user);
      } catch (err) {
        busy(loginBtn, false);
        showError(explain(err));
      }
    });
  },
};
