// App core: preferences, navigation, data loading and shared UI pieces.
// Looks come from the active theme (theme.js), institution quirks from site profiles (site.js).

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'courses', label: 'Courses', icon: 'book' },
  { id: 'deadlines', label: 'Deadlines', icon: 'clock' },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
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
    App.migrateThemePref();
    Theme.apply(App.prefs.theme, App.prefs.themeOptions[App.prefs.theme]);
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
  // Themes used to have variants: "default" + variant "dark" is now the theme "default-dark".
  migrateThemePref() {
    if (!('variant' in App.prefs) || !Theme.packs.length) return;
    const old = App.prefs.theme;
    const id = [`${old}-${App.prefs.variant}`, old].find((x) => Theme.packs.some((p) => p.id === x));
    if (id && id !== old) {
      App.prefs.theme = id;
      if (App.prefs.themeOptions[old]) App.prefs.themeOptions[id] = App.prefs.themeOptions[old];
    }
    delete App.prefs.variant;
    App.savePrefs();
  },

  reloadTheme() {
    App.applyTheme();
    if (!App.user || !App.current) return;
    const { name, params } = App.current;
    App.showShell();
    App.updateBadge(App.cache.events);
    App.updateNewsBadge(App.cache.announcements);
    return App.navigate(name, params, { push: false });
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
    App.getAnnouncements().then(App.updateNewsBadge).catch(() => {});
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
                ${n.id === 'announcements' ? '<span class="nav__badge" id="newsBadge" hidden></span>' : ''}
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
    Updates.init();
  },

  async navigate(name, params = {}, { push = true } = {}) {
    const view = Views[name];
    if (!view) return;
    if (push && App.current) App.history.push(App.current);
    App.current = { name, params };
    const token = ++App.navToken;

    const navId = (typeof view.nav === 'function' ? view.nav(params) : view.nav) || name;
    $$('.nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === navId));
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
    App.getAnnouncements().then(App.updateNewsBadge).catch(() => {});
  },

  // Moodle pages open in NEKO's in-app window (already signed in); other websites in the browser.
  openUrl(url) {
    let own = false;
    try {
      own = Boolean(App.user) && new URL(url).origin === new URL(App.user.site).origin;
    } catch {
      // not a valid URL
    }
    return (own ? neko.openWeb(url) : neko.openExternal(url)).catch((e) => toast('Could not open', { type: 'error', message: e.message }));
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

  async getCourseContents(courseid, force = false) {
    App.cache.contents ||= {};
    if (force || !App.cache.contents[courseid]) {
      App.cache.contents[courseid] = await App.call('core_course_get_contents', { courseid });
    }
    return App.cache.contents[courseid];
  },

  // Every forum in the user's courses. Announcements are the forums of type 'news'.
  async getForums() {
    if (App.cache.forums) return App.cache.forums;
    const courses = await App.getCourses();
    App.cache.forums = courses.length ? await App.call('mod_forum_get_forums_by_courses', { courseids: courses.map((c) => c.id) }) : [];
    return App.cache.forums;
  },

  // Every assignment in the user's courses, with its settings (due dates, what it accepts...).
  async getAssignments() {
    if (App.cache.assignments) return App.cache.assignments;
    const courses = await App.getCourses();
    const res = courses.length ? await App.call('mod_assign_get_assignments', { courseids: courses.map((c) => c.id) }) : {};
    App.cache.assignments = (res.courses || []).flatMap((c) => c.assignments || []);
    return App.cache.assignments;
  },

  // One page of a forum's discussions (pinned first, then latest activity), with avatars ready to show.
  async getDiscussions(forumid, page = 0, perpage = 25) {
    const { discussions = [] } = await App.call('mod_forum_get_forum_discussions', { forumid, page, perpage });
    const pics = await neko.tokenize(discussions.map((d) => d.userpictureurl || ''));
    discussions.forEach((d, i) => { d._picture = pics[i]; });
    return discussions;
  },

  // The newest announcements across all courses.
  async getAnnouncements() {
    if (App.cache.announcements) return App.cache.announcements;
    const [forums, courses] = await Promise.all([App.getForums(), App.getCourses()]);
    const lists = await Promise.all(forums.filter((f) => f.type === 'news').map((forum) =>
      App.getDiscussions(forum.id, 0, 5)
        .then((list) => list.map((d) => ({ ...d, _forum: forum, _course: courses.find((c) => c.id === forum.course) })))
        .catch(() => [])));
    App.cache.announcements = lists.flat().sort((a, b) => b.created - a.created).slice(0, 30);
    return App.cache.announcements;
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

  // Unread announcements.
  updateNewsBadge(list) {
    const badge = $('#newsBadge');
    if (!badge || !list) return;
    const n = list.filter((d) => d.numunread > 0).length;
    badge.hidden = n === 0;
    badge.textContent = n;
  },

  // PDFs open in NEKO's viewer; every file can still be downloaded.
  isPdf: (file) => /\.pdf$/i.test(file?.filename || '') || file?.mimetype === 'application/pdf',

  viewFile(file, folder) {
    return App.navigate('pdf', { file, folder });
  },

  // A file attached to a post or an assignment. PDFs open in the viewer and get a separate Download button.
  attachmentHTML(file, i) {
    const label = `<span>${esc(file.filename)}</span><small>${esc(fmtSize(file.filesize))}</small>`;
    if (!App.isPdf(file)) return `<button class="attachment" data-file="${i}" title="Download">${Icons.clip}${label}</button>`;
    return `<span class="attachment-pair"><button class="attachment" data-view-file="${i}" title="View in NEKO">${Icons.eye}${label}</button><button class="attachment attachment--icon" data-file="${i}" title="Download">${Icons.download}</button></span>`;
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
        if (link.dataset.url) App.openUrl(link.dataset.url);
        return;
      }
      const course = e.target.closest('[data-course]');
      if (course) return App.navigate('course', { id: Number(course.dataset.course) });
      const activity = e.target.closest('[data-open-activity]');
      if (activity) {
        const [courseId, cmid] = activity.dataset.openActivity.split(':').map(Number);
        return App.navigate('activity', { courseId, cmid });
      }
      const disc = e.target.closest('[data-discussion]');
      if (disc) {
        const { discussion, forum, courseId, from } = disc.dataset;
        return App.navigate('discussion', { discussionId: Number(discussion), forumId: Number(forum), courseId: Number(courseId), from });
      }
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
  const defaults = { theme: 'default-light', mascot: true, watermark: true, themeOptions: {}, site: '', username: '', courseFilter: 'current' };
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

  // A discussion in a forum list or the announcements feed. showCourse adds the course and a preview of the post.
  discussion(d, { showCourse = false, from = '' } = {}) {
    const course = d._course;
    const excerpt = showCourse ? stripHtml(d.message) : '';
    const replied = d.numreplies > 0 && d.timemodified > d.created;
    const meta = [
      showCourse && course ? `<b>${esc(parseCourse(course).code)}</b>` : '',
      esc(d.userfullname),
      esc(relTime(d.created)),
      !showCourse && replied ? `last reply ${esc(relTime(d.timemodified))}${d.usermodifiedfullname ? ` by ${esc(d.usermodifiedfullname)}` : ''}` : '',
    ].filter(Boolean).join(' · ');
    return `
      <button class="discussion ${d.numunread ? 'is-unread' : ''}" data-discussion="${d.discussion}" data-forum="${d.forum ?? d._forum?.id ?? ''}" data-course-id="${course?.id ?? d._forum?.course ?? ''}" data-from="${esc(from)}">
        <img class="avatar" src="${esc(d._picture || '')}" alt="" data-fallback>
        <div class="discussion__main">
          <div class="discussion__title">${d.pinned ? `<span class="discussion__flag" title="Pinned">${Icons.pin}</span>` : ''}${d.locked ? `<span class="discussion__flag" title="Locked">${Icons.lock}</span>` : ''}${esc(stripHtml(d.name || d.subject))}</div>
          <div class="discussion__meta">${meta}</div>
          ${excerpt ? `<div class="discussion__excerpt">${esc(excerpt.length > 220 ? `${excerpt.slice(0, 220)}…` : excerpt)}</div>` : ''}
        </div>
        <div class="discussion__side">
          ${d.numunread ? `<span class="chip chip--pink">${d.numunread} new</span>` : ''}
          ${d.numreplies ? `<span class="chip">${Icons.chat} ${d.numreplies}</span>` : ''}
        </div>
      </button>`;
  },

  deadline(e) {
    const now = Date.now() / 1000;
    const overdue = e.timesort < now;
    const soon = !overdue && e.timesort - now < 2 * 86400;
    const d = new Date(e.timesort * 1000);
    const month = d.toLocaleString('en-MY', { month: 'short' });
    // Activities NEKO can show itself open in the app; the rest on the website.
    let cmid = 0;
    try {
      cmid = NATIVE_MODS.has(e.modulename) ? Number(new URL(e.url).searchParams.get('id')) || 0 : 0;
    } catch {
      // no usable URL
    }
    const target = cmid && e.course?.id ? `data-open-activity="${e.course.id}:${cmid}"` : `data-url="${esc(e.action?.url || e.url || '')}" title="Open on ${esc(brandName())}"`;
    const chip = overdue
      ? '<span class="chip chip--danger">Overdue</span>'
      : `<span class="chip ${soon ? 'chip--pink' : ''}">${esc(relTime(e.timesort))}</span>`;
    return `
      <button class="deadline" ${target}>
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
