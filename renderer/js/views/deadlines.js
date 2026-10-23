Views.deadlines = {
  title: () => 'Deadlines',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('Checking your deadlines');
    const events = await App.getEvents(params.force);
    if (!ctx.isCurrent()) return;
    App.updateBadge(events);

    const now = Date.now() / 1000;
    const today = startOfDay().getTime() / 1000;
    const day = 86400;
    const groups = [
      { label: 'Overdue', test: (t) => t < now },
      { label: 'Today', test: (t) => t < today + day },
      { label: 'Tomorrow', test: (t) => t < today + 2 * day },
      { label: 'This week', test: (t) => t < today + 7 * day },
      { label: 'Later', test: () => true },
    ].map((g) => ({ ...g, items: [] }));
    for (const e of events) groups.find((g) => g.test(e.timesort)).items.push(e);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <div class="page-head__jp">しめきり</div>
          <h1>Deadlines</h1>
          <p>Assignments, quizzes and anything else waiting on you. Click one to open it on i-Taleem.</p>
        </div>
      </div>
      ${events.length
        ? groups.filter((g) => g.items.length).map((g) => `
            <div class="deadline-group">
              <h3>${g.label} <span class="chip ${g.label === 'Overdue' ? 'chip--danger' : ''}">${g.items.length}</span></h3>
              <div class="deadline-list">${g.items.map(App.ui.deadline).join('')}</div>
            </div>`).join('')
        : `<div class="card"><div class="card__body">${emptyHTML('All caught up!', 'Nothing due. Aqua is proud of you ⚓')}</div></div>`}`;
  },
};
