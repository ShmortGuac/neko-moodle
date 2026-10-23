Views.courses = {
  title: () => 'Courses',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML();
    const courses = await App.getCourses(params.force);
    if (!ctx.isCurrent()) return;

    root.innerHTML = `
      <div class="page-head">
        <div>
          ${t('eyebrowCourses') ? `<div class="page-head__eyebrow">${esc(t('eyebrowCourses'))}</div>` : ''}
          <h1>My courses</h1>
          <p>${courses.length} enrolled</p>
        </div>
        <div class="toolbar">
          <div class="search">${Icons.search}<input class="input" id="q" placeholder="Search courses…" spellcheck="false"></div>
          <div class="seg" id="seg">
            <button data-f="current">Current</button>
            <button data-f="all">All</button>
            <button data-f="past">Past</button>
          </div>
        </div>
      </div>
      <div class="course-grid" id="grid"></div>`;

    const now = Date.now() / 1000;
    const isPast = (c) => c.enddate && c.enddate < now;
    let query = '';

    const draw = () => {
      const filter = App.prefs.courseFilter;
      const q = query.toLowerCase();
      const list = courses
        .filter((c) => filter === 'all' || (filter === 'past' ? isPast(c) : !isPast(c)))
        .filter((c) => !q || `${c.fullname} ${c.shortname}`.toLowerCase().includes(q));
      $$('#seg button', root).forEach((b) => b.classList.toggle('is-active', b.dataset.f === filter));
      $('#grid', root).innerHTML = list.length
        ? list.map(App.ui.courseCard).join('')
        : `<div style="grid-column:1/-1">${emptyHTML(t('noCourses'), q ? 'Try a different search.' : 'Try the "All" filter.')}</div>`;
    };

    $('#q', root).addEventListener('input', (e) => {
      query = e.target.value.trim();
      draw();
    });
    $$('#seg button', root).forEach((b) => b.addEventListener('click', () => {
      App.prefs.courseFilter = b.dataset.f;
      App.savePrefs();
      draw();
    }));
    draw();
  },
};
