Views.deadlines = {
  title: () => 'Deadlines',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('deadlines');
    const events = await App.getEvents(params.force);
    if (!ctx.isCurrent()) return;
    App.updateBadge(events);

    const now = Date.now() / 1000;
    const today = startOfDay().getTime() / 1000;
    const day = 86400;
    const groups = [
      { label: 'Overdue', test: (ts) => ts < now },
      { label: 'Today', test: (ts) => ts < today + day },
      { label: 'Tomorrow', test: (ts) => ts < today + 2 * day },
      { label: 'This week', test: (ts) => ts < today + 7 * day },
      { label: 'Later', test: () => true },
    ].map((g) => ({ ...g, items: [] }));
    for (const e of events) groups.find((g) => g.test(e.timesort)).items.push(e);

    root.innerHTML = `
      <div class="page-head">
        <div>
          ${t('eyebrowDeadlines') ? `<div class="page-head__eyebrow">${esc(t('eyebrowDeadlines'))}</div>` : ''}
          <h1>Deadlines</h1>
          <p>Assignments, quizzes and anything else waiting on you. Click one to open it on ${esc(brandName())}.</p>
        </div>
      </div>
      ${events.length
        ? groups.filter((g) => g.items.length).map((g) => `
            <div class="deadline-group">
              <h3>${g.label} <span class="chip ${g.label === 'Overdue' ? 'chip--danger' : ''}">${g.items.length}</span></h3>
              <div class="deadline-list">${g.items.map(App.ui.deadline).join('')}</div>
            </div>`).join('')
        : `<div class="card"><div class="card__body">${emptyHTML(t('allCaughtUp'), t('allCaughtUpText'))}</div></div>`}`;
  },
};
