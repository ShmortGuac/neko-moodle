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

    const hour = new Date().getHours();
    const [jp, en] = hour < 12 ? ['おはよう〜!', 'Good morning'] : hour < 18 ? ['こんにちは!', 'Good afternoon'] : ['こんばんは〜!', 'Good evening'];
    const summary = week.length
      ? `You have ${week.length} thing${week.length > 1 ? 's' : ''} due this week${overdue.length ? ` and ${overdue.length} overdue` : ''}. Ganbatte!`
      : overdue.length
        ? `Nothing new this week, but ${overdue.length} overdue item${overdue.length > 1 ? 's' : ''} need love.`
        : 'Nothing due this week. Time for a stream break~';

    const theme = App.theme();
    const soon = events.slice(0, 6);

    root.innerHTML = `
      <section class="hero ${theme.banner ? 'hero--banner' : ''}">
        ${theme.banner
          ? `<img class="hero__banner" src="${theme.banner}" alt="">`
          : `<div class="hero__sign">あくあ</div>
             <img class="hero__art" src="${theme.hero}" alt="" style="width:${theme.heroWidth}px;top:${theme.heroTop}px">`}
        <div class="hero__text">
          <div class="hero__eyebrow">${jp}</div>
          <h1>${en}, ${esc(givenName(App.user))}!</h1>
          <p>${esc(summary)}</p>
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
              : emptyHTML('All caught up!', 'Nothing due. Aqua is proud of you ⚓')}
          </div>
        </div>
        <div class="card">
          <div class="card__head"><h3 class="card__title">${Icons.star} At a glance</h3></div>
          <div class="card__body">
            <div class="stats">
              <div class="stat stat--pink"><div class="stat__num">${courses.length}</div><div class="stat__label">Courses</div></div>
              <div class="stat stat--aqua"><div class="stat__num">${week.length}</div><div class="stat__label">Due in 7 days</div></div>
              <div class="stat stat--danger"><div class="stat__num">${overdue.length}</div><div class="stat__label">Overdue</div></div>
              <div class="stat stat--purple"><div class="stat__num">${avgProgress === null ? '–' : `${avgProgress}%`}</div><div class="stat__label">Avg. progress</div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="section-title">
        <h2>${Icons.book} Recently visited</h2>
        <button class="btn btn--ghost btn--sm" data-nav="courses">All courses</button>
      </div>
      ${courses.length
        ? `<div class="course-grid">${courses.slice(0, 8).map(App.ui.courseCard).join('')}</div>`
        : emptyHTML('No courses yet', 'Once you are enrolled, your courses show up here.')}`;
  },
};
