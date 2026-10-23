Views.login = {
  render(root, { message } = {}) {
    const theme = App.theme();
    root.innerHTML = `
      <div class="login">
        <div class="login__art ${theme.loginFade ? `login__art--fade-${theme.loginFade}` : ''}">
          <div class="login__title-jp">湊あくあ</div>
          <img src="${theme.login}" alt="">
        </div>
        <div class="card login__panel">
          <img class="login__chibi" src="assets/aqua-chibi.png" alt="">
          <div class="brandmark">
            <div class="brandmark__icon">${Icons.anchorFill}</div>
            <h1>i-Taleem</h1>
          </div>
          <p class="login__sub" id="siteLine">Unofficial desktop client · あくあ edition</p>

          <div class="field" style="margin-bottom:16px">
            <label>Site</label>
            <div class="site-picks" id="sitePicks">
              ${SITE_PRESETS.map((p) => `<button type="button" class="chip" data-site="${esc(p.url)}">${esc(p.label)}</button>`).join('')}
            </div>
            <input class="input" id="site" value="${esc(App.prefs.site || DEFAULT_SITE)}" spellcheck="false">
          </div>

          <div id="error">${message ? `<div class="notice notice--error">${esc(message)}</div>` : ''}</div>

          <button class="btn btn--primary btn--block" id="ssoBtn">${Icons.key} Sign in with IIUM account</button>

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
              <button class="btn btn--ghost btn--block" type="submit" id="loginBtn">Sign in ${Icons.anchor}</button>
            </form>
          </details>

          <div class="login__foot">Not affiliated with IIUM. You sign in on IIUM's own login page.</div>
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
          : 'Password sign-in was rejected. i-Taleem uses IIUM single sign-on, so try "Sign in with IIUM account".';
      }
      return err.message;
    };

    const markPreset = () => {
      const value = siteInput.value.trim().replace(/\/+$/, '');
      $$('[data-site]', root).forEach((b) => b.classList.toggle('chip--pink', b.dataset.site === value));
    };

    // Ask the site how it wants us to log in and show its real name.
    const probe = async () => {
      markPreset();
      publicConfig = null;
      $('#siteLine', root).textContent = 'Unofficial desktop client · あくあ edition';
      try {
        publicConfig = await italeem.getPublicConfig(siteInput.value);
      } catch {
        // invalid address: the login attempt will show a proper error
      }
      if (!publicConfig) return;
      $('#siteLine', root).textContent = stripHtml(publicConfig.sitename) || 'i-Taleem';
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
