// App core: themes, preferences, navigation, data loading and shared UI pieces.

const DEFAULT_SITE = 'https://italeemc.iium.edu.my';

// Shown as quick picks on the login screen. Older sessions live on archive sites.
const SITE_PRESETS = [
  { label: 'Current session', url: 'https://italeemc.iium.edu.my' },
  { label: '2025 archive', url: 'https://italeemc.iium.edu.my/2025' },
  { label: '2024 archive', url: 'https://italeemc-arc.iium.edu.my/2024' },
];

// Each theme pairs a colour block in styles/theme.css with artwork from assets/.
//   login     art on the sign-in screen (loginFade: 'all' or 'sides' softens hard crop edges)
//   hero      cutout on the dashboard banner; heroWidth/heroTop position it (px)
//   banner    alternative: a full-bleed picture behind the dashboard banner
const THEMES = {
  maid: {
    name: 'Maid Pink', jp: 'メイド',
    preview: 'assets/banner-maid.png',
    login: 'assets/aqua-maid-full.png',
    hero: 'assets/aqua-casual.png', heroWidth: 300, heroTop: -16,
    swatches: ['#f4a7ea', '#46c3f0', '#2f2b6e'],
  },
  summer: {
    name: 'Summer Aqua', jp: 'なつ',
    preview: 'assets/banner-summer.png',
    login: 'assets/aqua-summer-full.png', loginFade: 'sides',
    hero: 'assets/aqua-summer-full.png', heroWidth: 330, heroTop: -40,
    swatches: ['#a5e2f9', '#ec66cc', '#213a6b'],
  },
  night: {
    name: 'Midnight', jp: 'よる',
    preview: 'assets/aqua-cat.jpg',
    login: 'assets/aqua-maid.png', loginFade: 'all',
    hero: 'assets/aqua-maid-full.png', heroWidth: 240, heroTop: -10,
    swatches: ['#1b1942', '#f47fd9', '#63d2fb'],
  },
  halloween: {
    name: 'Halloween', jp: 'ハロウィン',
    preview: 'assets/banner-halloween.jpg',
    login: 'assets/aqua-casual.png', loginFade: 'all',
    banner: 'assets/banner-halloween.jpg',
    swatches: ['#2a1838', '#ff9440', '#c38bff'],
  },
};

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'courses', label: 'Courses', icon: 'book' },
  { id: 'deadlines', label: 'Deadlines', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// Things Aqua says when you click her in the sidebar. Add your own!
const MASCOT_LINES = [
  'がんばって! ⚓', 'Don\'t forget your assignments~', 'あくあ〜!', 'Aqua believes in you!',
  'One more chapter, then games?', 'Did you drink water today?', 'Deadline? What deadline... 😳',
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
  theme() {
    return THEMES[App.prefs.theme] || THEMES.maid;
  },

  savePrefs() {
    try {
      localStorage.setItem('prefs', JSON.stringify(App.prefs));
    } catch {
      // storage unavailable, prefs just won't persist
    }
  },

  applyTheme() {
    const root = document.documentElement;
    root.dataset.theme = THEMES[App.prefs.theme] ? App.prefs.theme : 'maid';
    document.body.classList.toggle('no-kana', !App.prefs.kana);
    document.body.classList.toggle('no-mascot', !App.prefs.mascot);
    const cs = getComputedStyle(root);
    italeem.setTitlebar(cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--text').trim()).catch(() => {});
  },

  // ---------- Boot & auth ----------
  async boot() {
    App.applyTheme();
    App.renderStars();
    App.bindGlobalEvents();
    $('#app').innerHTML = loadingHTML('Waking Aqua up');
    try {
      const user = await italeem.restore();
      if (user) return App.onSignedIn(user);
      App.showLogin();
    } catch (e) {
      App.showLogin(`Couldn't reach i-Taleem: ${e.message}`);
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
    await italeem.logout().catch(() => {});
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
            <div class="brandmark__icon">${Icons.anchorFill}</div>
            <div><div class="brand__name">i-Taleem</div><div class="brand__sub">あくあ edition</div></div>
          </div>
          <nav class="nav">
            ${NAV.map((n) => `
              <button data-view="${n.id}">${Icons[n.icon]}<span>${n.label}</span>
                ${n.id === 'deadlines' ? '<span class="nav__badge" id="dueBadge" hidden></span>' : ''}
              </button>`).join('')}
          </nav>
          <div class="sidebar__mascot">
            <div class="sidebar__bubble" id="bubble"></div>
            <img src="assets/aqua-chibi.png" alt="Aqua" id="mascot" title="Click me!">
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
    return italeem.call(wsfunction, params);
  },

  async getCourses(force = false) {
    if (!force && App.cache.courses) return App.cache.courses;
    const list = await App.call('core_enrol_get_users_courses', { userid: App.user.userid });
    const pickImage = (c) => {
      if (c.courseimage && !c.courseimage.startsWith('data:')) return c.courseimage;
      return c.overviewfiles?.find((f) => (f.mimetype || '').startsWith('image/'))?.fileurl || '';
    };
    const images = await italeem.tokenize(list.map(pickImage));
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
      const res = await italeem.download({ url: file.fileurl, filename: file.filename, folder, filesize: file.filesize });
      t.dismiss();
      toast(res.skipped ? 'Already downloaded' : 'Saved!', {
        type: 'ok',
        message: file.filename,
        timeout: 7000,
        actions: [
          { label: 'Open', onClick: () => italeem.openPath(res.path).catch((e) => toast('Could not open file', { type: 'error', message: e.message })) },
          { label: 'Show in folder', onClick: () => italeem.showInFolder(res.path) },
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
    bubble.textContent = MASCOT_LINES[Math.floor(Math.random() * MASCOT_LINES.length)];
    bubble.classList.add('is-on');
    clearTimeout(App._bubbleTimer);
    App._bubbleTimer = setTimeout(() => bubble.classList.remove('is-on'), 2600);
  },

  bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-url]');
      if (link) {
        e.preventDefault();
        if (link.dataset.url) italeem.openExternal(link.dataset.url);
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
  const defaults = { theme: 'maid', mascot: true, kana: true, site: DEFAULT_SITE, username: '', courseFilter: 'current' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('prefs') || '{}') };
  } catch {
    return defaults;
  }
}

// ---------- Shared UI pieces ----------
App.ui = {
  courseCard(c) {
    const hasProgress = c.progress !== null && c.progress !== undefined;
    return `
      <button class="course-card" data-course="${c.id}" title="${esc(stripHtml(c.fullname))}">
        <div class="course-card__cover ${palette(c.id)}">
          ${c._image ? `<img src="${esc(c._image)}" alt="" loading="lazy" data-fallback>` : ''}
          <span class="course-card__anchor">${Icons.anchorFill}</span>
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
      <button class="deadline" data-url="${esc(e.action?.url || e.url || '')}" title="Open on i-Taleem">
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
