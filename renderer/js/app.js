// App core: preferences, navigation, data loading and shared UI pieces.
// Looks come from the active theme (theme.js), institution quirks from site profiles (site.js).

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'courses', label: 'Courses', icon: 'book' },
  { id: 'deadlines', label: 'Deadlines', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const Views = {};

const App = {
  user: null,
  cache: {},
  history: [],
  current: null,
  navToken: 0,
  prefs: loadPrefs(),

  // ---------- Preferences & theme ----------
  savePrefs() {
    try {
      localStorage.setItem('prefs', JSON.stringify(App.prefs));
    } catch {
      // storage unavailable, prefs just won't persist
    }
  },

  applyTheme() {
    Theme.apply(App.prefs.theme, App.prefs.variant, App.prefs.themeOptions[App.prefs.theme]);
    const body = document.body;
    const { decorations, sidebar } = Theme.cfg;
    const watermark = decorations.watermark || '';
    body.classList.toggle('no-watermark', !watermark || !App.prefs.watermark);
    body.classList.toggle('no-mascot', !sidebar.mascot || !App.prefs.mascot);
    body.classList.toggle('has-stripes', Boolean(decorations.stripes));
    body.classList.toggle('has-stars', Boolean(decorations.stars));
    $('.watermark').innerHTML = watermark ? `<span>${esc(watermark)}</span>`.repeat(6) : '';
    const cs = getComputedStyle(document.documentElement);
    const bar = cs.getPropertyValue('--topbar').trim() || cs.getPropertyValue('--bg').trim();
    neko.setTitlebar(bar, cs.getPropertyValue('--text').trim()).catch(() => {});
  },

  // A different theme can change art and text everywhere, so redraw the shell and current page.
  reloadTheme() {
    App.applyTheme();
    if (!App.user || !App.current) return;
    const { name, params } = App.current;
    App.showShell();
    App.navigate(name, params, { push: false });
    App.updateBadge(App.cache.events);
  },

  // ---------- Boot & auth ----------
  async boot() {
    Theme.restoreCache();
    App.renderStars();
    App.bindGlobalEvents();
    try {
      await Promise.all([Theme.load(), Site.load()]);
    } catch (e) {
      $('#app').innerHTML = errorHTML(e);
      return;
    }
    App.applyTheme();
    // The theme editor saved something: reload packs and redraw.
    neko.onThemesChanged(async () => {
      await Theme.load();
      if (App.user) App.reloadTheme();
      else {
        App.applyTheme();
        if ($('.login')) App.showLogin();
      }
    });
    $('#app').innerHTML = loadingHTML('boot');
    try {
      const user = await neko.restore();
      if (user) return App.onSignedIn(user);
      App.showLogin();
    } catch (e) {
      App.showLogin(`Couldn't reach your Moodle site: ${e.message}`);
    }
  },

  onSignedIn(user) {
    App.user = user;
    App.cache = {};
    App.showShell();
    App.navigate('dashboard', {}, { push: false });
    App.getEvents().then(App.updateBadge).catch(() => {});
  },

  async signOut(message) {
    await neko.logout().catch(() => {});
    App.user = null;
    App.cache = {};
    App.history = [];
    App.current = null;
    App.showLogin(message);
  },

  handleAuthError(err) {
    if (err && err.code === 'invalidtoken') {
      App.signOut('Your session expired. Please sign in again.');
      return true;
    }
    return false;
  },

  showLogin(message) {
    App.navToken++;
    Views.login.render($('#app'), { message });
  },

  // ---------- Shell & navigation ----------
  showShell() {
    const u = App.user;
    $('#app').innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            ${brandTileHTML()}
            <div><div class="brand__name">${esc(brandName())}</div><div class="brand__sub">${esc(Theme.cfg.sidebar.tagline)}</div></div>
          </div>
          <nav class="nav">
            ${NAV.map((n) => `
              <button data-view="${n.id}">${Icons[n.icon]}<span>${n.label}</span>
                ${n.id === 'deadlines' ? '<span class="nav__badge" id="dueBadge" hidden></span>' : ''}
              </button>`).join('')}
          </nav>
          <div class="sidebar__mascot">
            <div class="sidebar__bubble" id="bubble"></div>
            <img src="${esc(Theme.cfg.sidebar.mascot || '')}" alt="${esc(t('mascotName'))}" id="mascot" title="Click me!" style="width:${esc(cssLen(Theme.cfg.sidebar.mascotWidth, 'px'))}">
          </div>
          <div class="me">
            <img class="avatar" src="${esc(u.userpicture)}" alt="" data-fallback>
            <div><div class="me__name" title="${esc(u.fullname)}">${esc(givenName(u))}</div><div class="me__site">${esc(stripHtml(u.sitename))}</div></div>
          </div>
        </aside>
        <section class="content">
          <header class="topbar">
            <button class="btn btn--icon" id="backBtn" title="Back" hidden>${Icons.back}</button>
            <div class="topbar__title" id="topTitle"></div>
            <div class="topbar__spacer"></div>
            <button class="btn btn--icon" id="refreshBtn" title="Refresh">${Icons.refresh}</button>
          </header>
          <div class="view" id="view"></div>
        </section>
      </div>`;

    $$('.nav button').forEach((b) => b.addEventListener('click', () => {
      App.history = [];
      App.navigate(b.dataset.view, {}, { push: false });
    }));
    $('#backBtn').addEventListener('click', App.back);
    $('#refreshBtn').addEventListener('click', App.refresh);
    $('#mascot').addEventListener('click', App.mascotSay);
    const view = $('#view');
    view.addEventListener('scroll', () => $('.topbar').classList.toggle('is-scrolled', view.scrollTop > 4));
  },

  async navigate(name, params = {}, { push = true } = {}) {
    const view = Views[name];
    if (!view) return;
    if (push && App.current) App.history.push(App.current);
    App.current = { name, params };
    const token = ++App.navToken;

    $$('.nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === (view.nav || name)));
    $('#backBtn').hidden = App.history.length === 0;
    const setTitle = (t) => { $('#topTitle').textContent = t; };
    setTitle(view.title ? view.title(params) : '');

    const host = $('#view');
    host.scrollTop = 0;
    const inner = document.createElement('div');
    inner.className = 'view__inner';
    host.replaceChildren(inner);

    const ctx = { isCurrent: () => token === App.navToken, setTitle };
    try {
      await view.render(inner, params, ctx);
    } catch (e) {
      if (ctx.isCurrent() && !App.handleAuthError(e)) inner.innerHTML = errorHTML(e);
    }
  },

  back() {
    const prev = App.history.pop();
    if (prev) App.navigate(prev.name, prev.params, { push: false });
  },

  refresh() {
    if (!App.current) return;
    const icon = $('#refreshBtn svg');
    icon?.classList.add('spin');
    App.cache = {};
    App.navigate(App.current.name, { ...App.current.params, force: true }, { push: false })
      .finally(() => icon?.classList.remove('spin'));
    App.getEvents().then(App.updateBadge).catch(() => {});
  },

  // ---------- Data ----------
  call(wsfunction, params) {
    return neko.call(wsfunction, params);
  },

  async getCourses(force = false) {
    if (!force && App.cache.courses) return App.cache.courses;
    const list = await App.call('core_enrol_get_users_courses', { userid: App.user.userid });
    const pickImage = (c) => {
      if (c.courseimage && !c.courseimage.startsWith('data:')) return c.courseimage;
      return c.overviewfiles?.find((f) => (f.mimetype || '').startsWith('image/'))?.fileurl || '';
    };
    const images = await neko.tokenize(list.map(pickImage));
    list.forEach((c, i) => { c._image = images[i] || null; });
    list.sort((a, b) => (b.lastaccess || 0) - (a.lastaccess || 0));
    App.cache.courses = list;
    return list;
  },

  // Upcoming action events (assignments, quizzes...). Includes the last 2 weeks so overdue items show.
  async getEvents(force = false) {
    if (!force && App.cache.events) return App.cache.events;
    const now = Math.floor(Date.now() / 1000);
    const res = await App.call('core_calendar_get_action_events_by_timesort', {
      timesortfrom: now - 14 * 86400,
      limitnum: 50,
    });
    App.cache.events = (res.events || []).sort((a, b) => a.timesort - b.timesort);
    return App.cache.events;
  },

  updateBadge(events) {
    const badge = $('#dueBadge');
    if (!badge || !events) return;
    const now = Date.now() / 1000;
    const n = events.filter((e) => e.timesort - now < 7 * 86400).length;
    badge.hidden = n === 0;
    badge.textContent = n;
  },

  async downloadFile(file, folder) {
    const t = toast('Downloading…', { message: file.filename, timeout: 0 });
    try {
      const res = await neko.download({ url: file.fileurl, filename: file.filename, folder, filesize: file.filesize });
      t.dismiss();
      toast(res.skipped ? 'Already downloaded' : 'Saved!', {
        type: 'ok',
        message: file.filename,
        timeout: 7000,
        actions: [
          { label: 'Open', onClick: () => neko.openPath(res.path).catch((e) => toast('Could not open file', { type: 'error', message: e.message })) },
          { label: 'Show in folder', onClick: () => neko.showInFolder(res.path) },
        ],
      });
      return res;
    } catch (e) {
      t.dismiss();
      if (!App.handleAuthError(e)) toast('Download failed', { type: 'error', message: e.message });
      return null;
    }
  },

  // ---------- Decoration ----------
  renderStars() {
    const spots = [
      [8, 14, 26], [22, 82, 18], [46, 6, 14], [70, 90, 30], [86, 24, 20], [60, 48, 12], [92, 70, 16],
    ];
    $('.stars').innerHTML = spots
      .map(([top, left, size], i) => `<span style="top:${top}%;left:${left}%;width:${size}px;height:${size}px;animation-delay:-${i * 0.9}s">${Icons.star}</span>`)
      .join('');
  },

  mascotSay() {
    const bubble = $('#bubble');
    const lines = Theme.cfg.sidebar.mascotLines;
    if (!Array.isArray(lines) || !lines.length) return;
    bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
    bubble.classList.add('is-on');
    clearTimeout(App._bubbleTimer);
    App._bubbleTimer = setTimeout(() => bubble.classList.remove('is-on'), 2600);
  },

  bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-url]');
      if (link) {
        e.preventDefault();
        if (link.dataset.url) neko.openExternal(link.dataset.url);
        return;
      }
      const course = e.target.closest('[data-course]');
      if (course) return App.navigate('course', { id: Number(course.dataset.course) });
      const nav = e.target.closest('[data-nav]');
      if (nav) return App.navigate(nav.dataset.nav);
      if (e.target.closest('[data-retry]')) App.refresh();
    });
    // Broken images (e.g. expired course image) just disappear.
    document.addEventListener('error', (e) => {
      if (e.target.tagName === 'IMG' && 'fallback' in e.target.dataset) e.target.style.visibility = 'hidden';
    }, true);
  },
};

function loadPrefs() {
  const defaults = { theme: 'default', variant: 'light', mascot: true, watermark: true, themeOptions: {}, site: '', username: '', courseFilter: 'current' };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('prefs') || '{}');
  } catch {
    // corrupted prefs: start fresh
  }
  // Before theme packs, "theme" held an Aqua variant and "kana" was the watermark toggle.
  if (['maid', 'summer', 'night', 'halloween'].includes(saved.theme)) {
    saved.variant = saved.theme;
    saved.theme = 'aqua';
  }
  if ('kana' in saved) {
    saved.watermark = saved.kana;
    delete saved.kana;
  }
  return { ...defaults, ...saved };
}

// Brand tile: the site's logo, else the theme's motif, else NEKO's own icon.
function brandTileHTML(profile = Site.current()) {
  const logo = profile?.logo || (!Theme.cfg.motif && 'neko.png');
  if (logo) return `<div class="brandmark__icon brandmark__icon--logo"><img src="${esc(logo)}" alt=""></div>`;
  return `<div class="brandmark__icon">${motifHTML()}</div>`;
}

// ---------- Shared UI pieces ----------
App.ui = {
  courseCard(c) {
    const cardCfg = Theme.cfg.courseCard;
    const overlay = cardCfg.overlay;
    const hasProgress = c.progress !== null && c.progress !== undefined;
    return `
      <button class="course-card" data-course="${c.id}" title="${esc(stripHtml(c.fullname))}">
        <div class="course-card__cover ${palette(c.id)} ${overlay ? 'course-card__cover--overlay' : ''}">
          ${c._image ? `<img class="course-card__img" src="${esc(c._image)}" alt="" loading="lazy" data-fallback>` : ''}
          ${overlay
            ? `<img class="course-card__overlay" src="${esc(overlay)}" alt="" style="${esc(`object-fit:${cardCfg.overlayFit};object-position:${cardCfg.overlayPosition};opacity:${cardCfg.overlayOpacity ?? 1}`)}">`
            : motifHTML('course-card__motif')}
          <span class="course-card__short">${esc(courseTag(c))}</span>
        </div>
        <div class="course-card__body">
          <div class="course-card__name">${esc(parseCourse(c).title)}</div>
          ${hasProgress ? `<div class="progress"><i style="width:${Math.round(c.progress)}%"></i></div>` : ''}
          <div class="course-card__foot">
            <span>${c.lastaccess ? `Visited ${relTime(c.lastaccess)}` : 'Not visited yet'}</span>
            <span>${hasProgress ? `${Math.round(c.progress)}%` : ''}</span>
          </div>
        </div>
      </button>`;
  },

  deadline(e) {
    const now = Date.now() / 1000;
    const overdue = e.timesort < now;
    const soon = !overdue && e.timesort - now < 2 * 86400;
    const d = new Date(e.timesort * 1000);
    const month = d.toLocaleString('en-MY', { month: 'short' });
    const chip = overdue
      ? '<span class="chip chip--danger">Overdue</span>'
      : `<span class="chip ${soon ? 'chip--pink' : ''}">${esc(relTime(e.timesort))}</span>`;
    return `
      <button class="deadline" data-url="${esc(e.action?.url || e.url || '')}" title="Open on ${esc(brandName())}">
        <div class="datebadge ${overdue ? 'datebadge--overdue' : soon ? 'datebadge--soon' : ''}"><b>${d.getDate()}</b><span>${month}</span></div>
        <div>
          <div class="deadline__name">${esc(e.activityname || e.name)}</div>
          <div class="deadline__meta">
            ${e.course ? `<b>${esc(parseCourse(e.course).code)}</b> ${esc(parseCourse(e.course).title)} · ` : ''}${esc(fmtDate(e.timesort, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}
          </div>
        </div>
        ${chip}
      </button>`;
  },
};
