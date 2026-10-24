// Activities shown inside NEKO instead of the browser. Everything else opens in the in-app window.
const NATIVE_MODS = new Set(['page', 'book', 'forum', 'assign']);

Views.activity = {
  nav: 'courses',
  title: (p) => p.name || 'Reading',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('course');
    const [sections, courses] = await Promise.all([App.getCourseContents(params.courseId, params.force), App.getCourses()]);
    if (!ctx.isCurrent()) return;

    let mod = null;
    let sectionName = '';
    for (const s of sections) {
      const found = (s.modules || []).find((m) => m.id === params.cmid);
      if (found) {
        mod = found;
        sectionName = stripHtml(s.name);
      }
    }
    if (!mod) throw new Error('This activity is no longer in the course.');
    const course = courses.find((c) => c.id === params.courseId);
    const name = stripHtml(mod.name);
    ctx.setTitle(name);

    const head = `
      <div class="page-head">
        <div>
          <div class="page-head__eyebrow">${esc([course && courseTag(course), sectionName].filter(Boolean).join(' · '))}</div>
          <h1>${esc(name)}</h1>
        </div>
        ${mod.url ? `<button class="btn btn--ghost" data-url="${esc(mod.url)}">${Icons.external} Open on ${esc(brandName())}</button>` : ''}
      </div>`;
    if (mod.modname === 'assign') return Views.assign.render(root, mod, head, params, ctx);
    if (mod.modname === 'forum') return Views.forum.renderList(root, mod, head, params, ctx);
    if (mod.modname === 'book') return Views.activity.renderBook(root, mod, head, params, ctx);
    return Views.activity.renderPage(root, mod, head, ctx);
  },

  async renderPage(root, mod, head, ctx) {
    const files = (mod.contents || []).filter((c) => c.type === 'file');
    const file = files.find((c) => c.filename === 'index.html') || files.find((c) => /\.html?$/i.test(c.filename));
    if (!file) throw new Error('This page has no content.');
    const html = await neko.fetchHtml(file.fileurl);
    if (!ctx.isCurrent()) return;
    root.innerHTML = `${head}<article class="card reader"><div class="reader__body" id="readerBody"></div></article>`;
    mountHtml($('#readerBody', root), html);
  },

  async renderBook(root, mod, head, params, ctx) {
    const structure = JSON.parse((mod.contents || []).find((c) => c.filename === 'structure')?.content || '[]');
    const chapters = [];
    const walk = (list, level) => list.forEach((ch) => {
      if (String(ch.hidden) !== '1') chapters.push({ title: stripHtml(ch.title), href: ch.href, level });
      walk(ch.subitems || [], level + 1);
    });
    walk(structure, 0);
    if (!chapters.length) throw new Error('This book has no chapters yet.');

    const index = Math.min(Math.max(Number(params.chapter) || 0, 0), chapters.length - 1);
    const chapter = chapters[index];
    const file = (mod.contents || []).find((c) => c.type === 'file' && `${(c.filepath || '/').replace(/^\//, '')}${c.filename}` === chapter.href);
    if (!file) throw new Error('This chapter could not be found.');
    const html = await neko.fetchHtml(file.fileurl);
    if (!ctx.isCurrent()) return;

    const go = (i, label, cls = '') => `<button class="btn btn--ghost btn--sm ${cls}" data-chapter="${i}">${label}</button>`;
    root.innerHTML = `
      ${head}
      <div class="book">
        <nav class="card book__toc">
          <div class="book__toc-title">Chapters</div>
          ${chapters.map((c, i) => `<button class="book__chapter ${i === index ? 'is-active' : ''}" data-chapter="${i}" style="padding-left:${12 + c.level * 16}px">${esc(c.title)}</button>`).join('')}
        </nav>
        <article class="card reader">
          <div class="reader__body">
            <h2 class="reader__chapter">${esc(chapter.title)}</h2>
            <div id="readerBody"></div>
            <div class="reader__nav">
              ${index > 0 ? go(index - 1, `${Icons.back} ${esc(chapters[index - 1].title)}`) : '<span></span>'}
              ${index < chapters.length - 1 ? go(index + 1, `${esc(chapters[index + 1].title)} ${Icons.chevron}`) : ''}
            </div>
          </div>
        </article>
      </div>`;
    mountHtml($('#readerBody', root), html);
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chapter]');
      if (btn) App.navigate('activity', { ...params, chapter: Number(btn.dataset.chapter), force: false }, { push: false });
    });
  },
};
