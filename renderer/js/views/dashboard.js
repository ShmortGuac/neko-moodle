Views.dashboard = {
  title: () => 'Dashboard',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML();
    const [courses, events] = await Promise.all([App.getCourses(params.force), App.getEvents(params.force)]);
    if (!ctx.isCurrent()) return;
    App.updateBadge(events);

    const now = Date.now() / 1000;
    const overdue = events.filter((e) => e.timesort < now);
    const week = events.filter((e) => e.timesort >= now && e.timesort - now < 7 * 86400);
    const withProgress = courses.filter((c) => c.progress !== null && c.progress !== undefined);
    const avgProgress = withProgress.length
      ? Math.round(withProgress.reduce((s, c) => s + c.progress, 0) / withProgress.length)
      : null;

    // Values a theme can use in hero templates, e.g. "Hello, {name}!" or "There is {overdue} overdue".
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    const today = startOfDay().getTime() / 1000;
    const vars = {
      name: givenName(App.user),
      fullname: displayName(App.user),
      greeting: t(`greet${part}`),
      eyebrow: t(`eyebrow${part}`),
      courses: courses.length,
      due_week: week.length,
      due_today: events.filter((e) => e.timesort >= now && e.timesort < today + 86400).length,
      overdue: overdue.length,
      and_overdue: overdue.length ? ` and ${overdue.length} overdue` : '',
      site: brandName(),
    };
    const hero = Theme.cfg.hero;
    const subtitle = typeof hero.subtitle === 'string'
      ? hero.subtitle
      : hero.subtitle[week.length ? 'due' : overdue.length ? 'overdueOnly' : 'clear'];
    const eyebrow = fill(hero.eyebrow, vars);
    const stripes = hero.stripes && Theme.cfg.decorations.stripes;
    const textWidth = hero.textWidth ?? (hero.elements.length ? 54 : 100);
    const soon = events.slice(0, 6);

    root.innerHTML = `
      <section class="hero ${stripes ? 'hero--stripes' : ''}">
        ${hero.overlay ? '<div class="hero__overlay"></div>' : ''}
        ${elementsHTML(hero.elements, vars)}
        <div class="hero__text" style="max-width:${esc(cssLen(textWidth))}">
          ${eyebrow ? `<div class="hero__eyebrow">${esc(eyebrow)}</div>` : ''}
          <h1>${esc(fill(hero.title, vars))}</h1>
          <p>${esc(fill(subtitle, vars))}</p>
          <div class="hero__actions">
            <button class="btn btn--light" data-nav="deadlines">${Icons.clock} View deadlines</button>
            <button class="btn btn--ghost" data-nav="courses">${Icons.book} My courses</button>
          </div>
        </div>
      </section>

      <div class="dash-grid">
        <div class="card">
          <div class="card__head">
            <h3 class="card__title">${Icons.clock} Due soon</h3>
            <button class="btn btn--ghost btn--sm" data-nav="deadlines">See all</button>
          </div>
          <div class="card__body">
            ${soon.length
              ? `<div class="deadline-list">${soon.map(App.ui.deadline).join('')}</div>`
              : emptyHTML(t('allCaughtUp'), t('allCaughtUpText'))}
          </div>
        </div>
        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.star} At a glance</h3></div>
          <div class="card__body">
            <div class="stats">
              <div class="stat stat--pink"><div class="stat__num">${courses.length}</div><div class="stat__label">Courses</div></div>
              <div class="stat stat--accent"><div class="stat__num">${week.length}</div><div class="stat__label">Due in 7 days</div></div>
              <div class="stat stat--danger"><div class="stat__num">${overdue.length}</div><div class="stat__label">Overdue</div></div>
              <div class="stat stat--purple"><div class="stat__num">${avgProgress === null ? '–' : `${avgProgress}%`}</div><div class="stat__label">Avg. progress</div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card dash-news">
        <div class="card__head">
          <h3 class="card__title">${Icons.megaphone} Latest announcements</h3>
          <button class="btn btn--ghost btn--sm" data-nav="announcements">See all</button>
        </div>
        <div class="card__body" id="dashNews">${loadingHTML('forum')}</div>
      </div>

      <div class="section-title">
        <h2>${Icons.book} Recently visited</h2>
        <button class="btn btn--ghost btn--sm" data-nav="courses">All courses</button>
      </div>
      ${courses.length
        ? `<div class="course-grid">${courses.slice(0, 8).map(App.ui.courseCard).join('')}</div>`
        : emptyHTML('No courses yet', 'Once you are enrolled, your courses show up here.')}`;

    // Announcements load after the rest so they never hold up the dashboard.
    App.getAnnouncements().then((list) => {
      if (!ctx.isCurrent()) return;
      App.updateNewsBadge(list);
      $('#dashNews', root).innerHTML = list.length
        ? `<div class="discussion-list">${list.slice(0, 3).map((d) => App.ui.discussion(d, { showCourse: true, from: 'announcements' })).join('')}</div>`
        : emptyHTML(t('noAnnouncements'), t('noAnnouncementsText'));
    }).catch((e) => {
      if (ctx.isCurrent() && !App.handleAuthError(e)) $('.dash-news', root)?.remove();
    });
  },
};
