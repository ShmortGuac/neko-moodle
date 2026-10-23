// Emoji per Moodle activity type. Unknown types fall back to ⭐.
const MOD_ICONS = {
  resource: '📄', folder: '📁', url: '🔗', assign: '📝', quiz: '❓', forum: '💬', page: '📃',
  book: '📚', choice: '☑️', feedback: '📊', lesson: '🎓', workshop: '🛠️', glossary: '📖',
  wiki: '🌐', chat: '💭', data: '🗃️', scorm: '🎮', h5pactivity: '🎮', lti: '🧩',
  attendance: '🙋', zoom: '🎥', bigbluebuttonbn: '🎥', choicegroup: '👥', label: '🏷️',
};

Views.course = {
  nav: 'courses',
  title: () => 'Course',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('course');
    const [courses, sections] = await Promise.all([
      App.getCourses(),
      App.call('core_course_get_contents', { courseid: params.id }),
    ]);
    if (!ctx.isCurrent()) return;

    const course = courses.find((c) => c.id === params.id) || { id: params.id, fullname: 'Course', shortname: `course-${params.id}` };
    const parsed = parseCourse(course);
    const mascots = Theme.cfg.courseBanner.mascots || [];
    const courseFolder = stripHtml(course.shortname) || `course-${course.id}`;
    ctx.setTitle(`${parsed.code} · ${parsed.title}`);

    // Every downloadable file in the course, so buttons can refer to them by index.
    const files = [];
    const addFile = (file, folder) => files.push({ file, folder }) - 1;

    const moduleHTML = (m, sectionName) => {
      if (m.modname === 'label') {
        const text = htmlToText(m.description);
        return text ? `<div class="module module--label">${linkify(text)}</div>` : '';
      }
      const hidden = m.uservisible === false;
      const contents = (m.contents || []).filter((c) => c.type === 'file');
      const icon = MOD_ICONS[m.modname] || '⭐';
      let meta = m.modplural || m.modname;
      let actions = '';
      let extra = '';

      if (hidden) {
        meta = stripHtml(m.availabilityinfo) || 'Not available yet';
      } else if (m.modname === 'resource' && contents.length) {
        const f = contents[0];
        const i = addFile(f, [courseFolder, sectionName]);
        meta = [f.filename.split('.').pop().toUpperCase(), fmtSize(f.filesize)].filter(Boolean).join(' · ');
        actions = `<button class="btn btn--primary btn--sm" data-dl="${i}">${Icons.download} Download</button>`;
      } else if (m.modname === 'folder' && contents.length) {
        const indices = contents.map((f) => addFile(f, [courseFolder, sectionName, m.name, f.filepath]));
        meta = `${contents.length} file${contents.length > 1 ? 's' : ''}`;
        actions = `<button class="btn btn--primary btn--sm" data-dlmany="${indices.join(',')}">${Icons.download} All</button>`;
        extra = `<div class="files">${contents.map((f, k) => `
          <div class="file">
            <span class="file__name">${esc((f.filepath || '/').slice(1) + f.filename)}</span>
            <span class="file__size">${fmtSize(f.filesize)}</span>
            <button class="btn btn--ghost btn--sm btn--icon" style="width:30px;height:30px" title="Download" data-dl="${indices[k]}">${Icons.download}</button>
          </div>`).join('')}</div>`;
      } else if (m.modname === 'url') {
        const target = (m.contents || [])[0]?.fileurl || m.url;
        meta = 'Link';
        actions = `<button class="btn btn--ghost btn--sm" data-url="${esc(target)}">${Icons.external} Open link</button>`;
      } else {
        const desc = stripHtml(m.description);
        if (desc) meta = `${meta} · ${desc.length > 110 ? desc.slice(0, 110) + '…' : desc}`;
      }
      if (!actions && m.url && !hidden) {
        actions = `<button class="btn btn--ghost btn--sm" data-url="${esc(m.url)}">${Icons.external} Open</button>`;
      }

      return `
        <div class="module ${hidden ? 'is-hidden' : ''}">
          <div class="module__icon">${icon}</div>
          <div style="min-width:0">
            <div class="module__name">${esc(stripHtml(m.name))}</div>
            <div class="module__meta">${esc(meta)}</div>
          </div>
          <div class="module__actions">${actions}</div>
          ${extra}
        </div>`;
    };

    const sectionsHTML = sections
      .filter((s) => s.uservisible !== false && (s.modules?.length || stripHtml(s.summary)))
      .map((s, idx) => {
        const name = stripHtml(s.name) || (s.section === 0 ? 'General' : `Topic ${s.section}`);
        const summary = htmlToText(s.summary);
        const modules = (s.modules || []).map((m) => moduleHTML(m, name)).join('');
        const count = (s.modules || []).filter((m) => m.modname !== 'label').length;
        return `
          <details class="section" ${idx < 4 ? 'open' : ''}>
            <summary>
              <span class="section__num">${s.section === 0 && Theme.cfg.motif ? motifHTML() : esc(s.section ?? idx)}</span>
              <span>${esc(name)}</span>
              ${count ? `<span class="chip">${count} item${count > 1 ? 's' : ''}</span>` : ''}
              <span class="chev">${Icons.chevron}</span>
            </summary>
            ${summary ? `<div class="section__summary" title="Click to expand">${linkify(summary)}</div>` : ''}
            <div class="modules">${modules}</div>
          </details>`;
      })
      .join('');

    root.innerHTML = `
      <section class="course-hero ${palette(course.id)}">
        ${motifHTML('course-hero__motif')}
        ${App.prefs.mascot && mascots.length ? `<img class="course-hero__art" src="${esc(mascots[course.id % mascots.length])}" alt="">` : ''}
        <span class="chip">${esc(courseTag(course))}</span>
        <h1>${esc(parsed.title)}</h1>
        <div class="course-hero__actions">
          <button class="btn btn--light" id="dlAll" ${files.length ? '' : 'disabled'}>${Icons.download} Download all files (${files.length})</button>
          <button class="btn btn--ghost" data-url="${esc(`${App.user.site}/course/view.php?id=${course.id}`)}">${Icons.external} Open on ${esc(brandName())}</button>
        </div>
      </section>
      <div class="sections">${sectionsHTML || emptyHTML('This course is empty', 'Your lecturer has not added anything yet.')}</div>`;

    root.addEventListener('click', (e) => {
      const summary = e.target.closest('.section__summary');
      if (summary && !e.target.closest('[data-url]')) summary.classList.toggle('is-open');
      const one = e.target.closest('[data-dl]');
      if (one) {
        const { file, folder } = files[Number(one.dataset.dl)];
        return App.downloadFile(file, folder);
      }
      const many = e.target.closest('[data-dlmany]');
      if (many) return downloadMany(many.dataset.dlmany.split(',').map(Number), many);
    });
    $('#dlAll', root).addEventListener('click', (e) => downloadMany(files.map((_, i) => i), e.currentTarget));

    async function downloadMany(indices, button) {
      button.disabled = true;
      const t = toast('Downloading files…', { message: `0 / ${indices.length}`, timeout: 0 });
      let saved = 0;
      let skipped = 0;
      let failed = 0;
      let lastPath = null;
      for (const [n, i] of indices.entries()) {
        const { file, folder } = files[i];
        t.update('Downloading files…', `${n + 1} / ${indices.length} · ${file.filename}`);
        try {
          const res = await italeem.download({ url: file.fileurl, filename: file.filename, folder, filesize: file.filesize });
          lastPath = res.path;
          res.skipped ? skipped++ : saved++;
        } catch (err) {
          if (App.handleAuthError(err)) return t.dismiss();
          failed++;
        }
      }
      t.dismiss();
      button.disabled = false;
      toast(failed ? 'Finished with some errors' : 'All done! ⚓', {
        type: failed ? 'error' : 'ok',
        message: `${saved} saved · ${skipped} already up to date${failed ? ` · ${failed} failed` : ''}`,
        timeout: 8000,
        actions: lastPath ? [{ label: 'Show in folder', onClick: () => italeem.showInFolder(lastPath) }] : [],
      });
    }
  },
};
