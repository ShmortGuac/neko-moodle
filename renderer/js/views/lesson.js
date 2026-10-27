// Lessons inside NEKO: Moodle's lesson pages one at a time, with NEKO's own buttons. Moodle keeps the attempt
// (the page you're on, your answers, the grade), so a lesson started here can always be finished on the website.
//
// Pages come from Moodle as HTML (mod_lesson_get_page_data with returncontents), like in the official Moodle app:
// content pages carry their navigation buttons as small forms, and question pages are a Moodle form. NEKO shows
// the form in a locked-down frame (no scripts) and sends its values back with mod_lesson_process_page.

const LESSON_EOL = -9; // Moodle's page id for "end of lesson"
const LESSON_QUESTION_TYPES = new Set([1, 2, 3, 5, 8, 10]); // short answer, true/false, multiple choice, matching, numerical, essay

// Moodle's form layout CSS isn't loaded in the frame, so style what a lesson question uses.
const lessonFormCss = (v) => `
  form { margin: 0; } fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  legend, .ftoggler, .collapsible-actions, .fdescription.required, .invalid-feedback, .form-control-feedback, img.icon, i.icon,
  input[type=submit], button[type=submit], .fitem_actionbuttons, #fgroup_id_buttonar { display: none !important; }
  .accesshide, .sr-only, .visually-hidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .d-none, [hidden] { display: none !important; }
  .contents { margin-bottom: 18px; }
  .fitem, .form-group { margin: 0 0 12px; }
  label { cursor: pointer; }
  .form-check, label:has(> input[type=radio]), label:has(> input[type=checkbox]) {
    display: flex; align-items: center; gap: 10px; margin: 0 0 8px; padding: 10px 14px; border: 1.5px solid ${v('--border', '#ddd')};
    border-radius: 12px; background: ${v('--surface-2', '#f5f5f5')}; font-weight: 600; }
  .form-check label, label:has(> input) label { margin: 0; padding: 0; border: 0; background: none; }
  .form-check:has(input:checked), label:has(> input:checked) { border-color: ${v('--primary', '#6b5bd2')}; }
  input[type=radio], input[type=checkbox] { width: 18px; height: 18px; margin: 0; flex: none; accent-color: ${v('--primary', '#6b5bd2')}; }
  input[type=text], input[type=number], textarea, select {
    font: inherit; color: inherit; background: ${v('--surface-2', '#f5f5f5')}; border: 1.5px solid ${v('--border', '#ddd')};
    border-radius: 10px; padding: 9px 12px; max-width: 100%; box-sizing: border-box; outline: none; }
  input:focus, textarea:focus, select:focus { border-color: ${v('--primary', '#6b5bd2')}; }
  input[type=text], input[type=number] { width: min(100%, 420px); }
  textarea { display: block; width: 100%; min-height: 220px; resize: vertical; }
  .col-form-label, .fitemtitle label { display: block; margin-bottom: 4px; font-weight: 800; }`;

const fmtMinutes = (sec) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

Views.lesson = {
  // Lesson passwords typed in this run of the app, by lesson id.
  passwords: {},

  // Called by Views.activity for lesson modules: the overview, with Start / Continue.
  async render(root, mod, head, params, ctx) {
    const { lessons = [] } = await App.call('mod_lesson_get_lessons_by_courses', { courseids: [params.courseId] });
    const lesson = lessons.find((l) => l.coursemodule === mod.id);
    if (!lesson) throw new Error('This lesson could not be loaded.');
    const access = await App.call('mod_lesson_get_lesson_access_information', { lessonid: lesson.id });
    const graded = Boolean(lesson.grade) && !lesson.practice;
    const done = access.attemptscount > 0;
    const grade = graded && done ? await App.call('mod_lesson_get_user_grade', { lessonid: lesson.id }).catch(() => null) : null;
    const intro = stripHtml(lesson.intro) || /<img/i.test(lesson.intro || '') ? await neko.rewriteHtml(lesson.intro) : '';
    if (!ctx.isCurrent()) return;
    App.call('mod_lesson_view_lesson', { lessonid: lesson.id, password: Views.lesson.passwords[lesson.id] || '' }).catch(() => {});

    const now = Date.now() / 1000;
    const inProgress = access.lastpageseen > 0; // "end of lesson" is negative
    const [statusLabel, statusChip] = inProgress ? ['In progress', 'chip--warn']
      : done ? [access.attemptscount > 1 ? `Completed ${access.attemptscount} times` : 'Completed', 'chip--ok']
      : ['Not started', ''];
    const facts = [
      ['Status', `<span class="chip ${statusChip}">${esc(statusLabel)}</span>`, '', true],
      ['Grade', !graded ? 'Not graded' : grade ? `${grade.formattedgrade}${lesson.grade > 0 ? ` / ${lesson.grade}` : ''}` : 'Not graded yet', grade ? 'is-ok' : ''],
      ['Deadline', lesson.deadline ? `${fmtDate(lesson.deadline)} · ${relTime(lesson.deadline)}` : 'No deadline', lesson.deadline && lesson.deadline < now && !done ? 'is-danger' : ''],
      ['Attempts', lesson.retake ? 'Retakes allowed' : 'One attempt only', ''],
    ];
    if (lesson.timelimit) facts.push(['Time limit', fmtMinutes(lesson.timelimit), '']);
    if (lesson.available > now) facts.push(['Opens', fmtDate(lesson.available), '']);

    // Why Moodle won't let you in (not open yet, closed, already done...). A password is asked for on Start.
    const reasons = access.preventaccessreasons || [];
    const needsPassword = reasons.some((r) => r.reason === 'passwordprotectedlesson');
    const blockers = reasons.filter((r) => r.reason !== 'passwordprotectedlesson');
    const oneShot = graded && !lesson.retake && !done;
    const startText = inProgress
      ? 'You\'ve already started this lesson. Carry on from the last page you saw, or go back to the first page. Your answers so far are kept.'
      : `${oneShot ? 'You can only do this lesson once, and it counts towards your grade. ' : ''}Moodle saves your progress after every page, so you can stop and come back later.`;
    const buttons = inProgress
      ? `<button class="btn btn--primary" data-start="${access.lastpageseen}">${Icons.chevron} Continue</button>
         <button class="btn btn--ghost" data-start="${access.firstpageid}">${Icons.back} Start from the first page</button>`
      : `<button class="btn btn--primary" data-start="${access.firstpageid}">${Icons.chevron} ${done ? 'Retake lesson' : 'Start lesson'}</button>`;

    root.innerHTML = `
      ${head}
      <div class="facts card">${facts.map(([label, value, cls, html]) => `
        <div class="fact ${cls}"><span>${esc(label)}</span><b>${html ? value : esc(value)}</b></div>`).join('')}
      </div>
      <article class="card assign-card">
        <div class="card__head"><h3 class="card__title">${Icons.book} ${blockers.length ? 'Not available' : inProgress ? 'Pick up where you left off' : done ? 'Take it again' : 'Ready when you are'}</h3></div>
        <div class="card__body">
          ${blockers.length ? Views.lesson.notesHTML(blockers.map((r) => r.message)) : `
            <p class="muted lesson-start__text">${esc(startText)}</p>
            <div class="toolbar">${buttons}</div>`}
        </div>
      </article>
      ${intro ? `
        <article class="card assign-card">
          <div class="card__head"><h3 class="card__title">${Icons.info} About this lesson</h3></div>
          <div class="card__body"><div id="lessonIntro"></div></div>
        </article>` : ''}`;
    if (intro) mountHtml($('#lessonIntro', root), intro);

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-start]');
      if (!btn) return;
      if (oneShot && !inProgress) {
        const go = await confirmModal({
          title: `Start "${stripHtml(lesson.name)}"?`,
          text: 'You can only do this lesson once, and it counts towards your grade. Your progress is saved after every page.',
          okLabel: 'Start lesson',
          run: async () => true,
        });
        if (!go) return;
      }
      if (needsPassword && !Views.lesson.passwords[lesson.id]) {
        const pw = await promptModal({ title: 'This lesson has a password', label: 'Password', okLabel: 'Continue', hint: 'Your lecturer gives this out.' });
        if (!pw) return;
        Views.lesson.passwords[lesson.id] = pw;
      }
      Views.lesson.start({ root, ctx, lesson, mod, head, params, messages: [], resuming: inProgress }, Number(btn.dataset.start), btn);
    });
  },

  notesHTML(messages) {
    const list = messages.map(stripHtml).filter(Boolean);
    return list.length ? `<ul class="lesson-notes">${list.map((m) => `<li>${Icons.info}<span>${esc(m)}</span></li>`).join('')}</ul>` : '';
  },

  async start(s, pageId, button) {
    s.password = Views.lesson.passwords[s.lesson.id] || '';
    if (button) button.disabled = true;
    try {
      // A new attempt is pageid 0 (Moodle starts its timer); a page id means "continue the running attempt from here".
      const res = await App.call('mod_lesson_launch_attempt', { lessonid: s.lesson.id, password: s.password, pageid: s.resuming ? pageId : 0, review: false });
      s.messages = (res.messages || []).map((m) => m.message);
    } catch (e) {
      if (button) button.disabled = false;
      if (App.handleAuthError(e)) return;
      if (e.code === 'loginfail' || /password/i.test(e.message)) delete Views.lesson.passwords[s.lesson.id];
      return toast('Could not start the lesson', { type: 'error', message: e.message });
    }
    if (s.lesson.timelimit) {
      const { timers = [] } = await App.call('mod_lesson_get_user_timers', { lessonid: s.lesson.id }).catch(() => ({}));
      const timer = timers[timers.length - 1];
      s.endsAt = (timer ? timer.starttime : Date.now() / 1000) + s.lesson.timelimit;
    }
    return Views.lesson.loadPage(s, pageId);
  },

  // The lesson's page frame: notes, progress and time left above a card.
  show(s, { title = '', chip = '', body = '', actions = '', notes = [], progress = null } = {}) {
    const timer = s.endsAt ? `<span class="chip chip--warn" id="lessonTimer">${Icons.clock} ${Views.lesson.timeLeft(s)}</span>` : '';
    s.root.innerHTML = `
      ${s.head}
      ${progress !== null || timer ? `
        <div class="lesson-bar">
          ${progress !== null ? `<div class="progress" title="${progress}% done"><i style="width:${progress}%"></i></div><span>${progress}%</span>` : '<span></span>'}
          ${timer}
        </div>` : ''}
      ${Views.lesson.notesHTML(notes)}
      <article class="card lesson-page">
        <div class="card__head"><h3 class="card__title">${esc(title || stripHtml(s.lesson.name))}</h3>${chip}</div>
        <div class="card__body">
          ${body}
          <div class="lesson-actions" id="lessonActions">${actions}</div>
        </div>
      </article>`;
    if (s.endsAt && !s.tick) {
      s.tick = setInterval(() => {
        const el = $('#lessonTimer', s.root);
        if (!s.root.isConnected || !s.ctx.isCurrent()) return clearInterval(s.tick);
        if (el) el.lastChild.textContent = ` ${Views.lesson.timeLeft(s)}`;
        if (Date.now() / 1000 >= s.endsAt && !s.finishing) Views.lesson.finish(s, true);
      }, 1000);
    }
  },

  timeLeft(s) {
    const left = Math.max(0, Math.round(s.endsAt - Date.now() / 1000));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`;
  },

  busy(s, text) {
    const actions = $('#lessonActions', s.root);
    if (!actions) return Views.lesson.show(s, { body: loadingHTML() });
    $$('button', actions).forEach((b) => { b.disabled = true; });
    if (text) actions.insertAdjacentHTML('beforeend', `<span class="lesson-actions__busy">${esc(text)}</span>`);
  },

  // Something went wrong: say so, and offer to try again or carry on on Moodle (the attempt is kept there).
  fail(s, err, retry) {
    if (!s.ctx.isCurrent() || App.handleAuthError(err)) return;
    Views.lesson.show(s, {
      title: 'Something went wrong',
      body: `<p class="muted">${esc(err.message || String(err))}</p>`,
      actions: `<button class="btn btn--primary" id="lessonRetry">${Icons.refresh} Try again</button>${Views.lesson.webButton(s)}`,
    });
    $('#lessonRetry', s.root).addEventListener('click', retry);
  },

  webButton(s) {
    const url = `${App.user.site}/mod/lesson/view.php?id=${s.mod.id}${s.pageId > 0 ? `&pageid=${s.pageId}` : ''}`;
    return `<button class="btn btn--ghost" data-url="${esc(url)}">${Icons.external} Continue on ${esc(brandName())}</button>`;
  },

  // A content page's buttons, read from the small forms Moodle puts under it.
  pageButtons(doc) {
    let box = doc.querySelector('.branchbuttoncontainer');
    if (!box && doc.querySelector('form input[type="submit"], form button[type="submit"]')) box = doc.body;
    return box ? $$('form', box).map((form) => {
      const button = form.querySelector('input[type="submit"], button[type="submit"]');
      if (!button) return null;
      const label = (button.tagName === 'INPUT' ? button.value : button.textContent).trim() || 'Continue';
      const data = $$('input', form).filter((i) => i.name && i.type !== 'submit').map((i) => ({ name: i.name, value: i.value }));
      return { label, data };
    }).filter(Boolean) : [];
  },

  async loadPage(s, pageId) {
    if (pageId === LESSON_EOL) return Views.lesson.finish(s);
    Views.lesson.busy(s);
    let data;
    try {
      data = await App.call('mod_lesson_get_page_data', { lessonid: s.lesson.id, pageid: pageId, password: s.password, review: false, returncontents: true });
    } catch (e) {
      return Views.lesson.fail(s, e, () => Views.lesson.loadPage(s, pageId));
    }
    if (!s.ctx.isCurrent()) return;
    if (data.newpageid === LESSON_EOL) return Views.lesson.finish(s);
    const page = data.page || {};
    s.pageId = page.id || pageId;
    const html = await neko.rewriteHtml(data.pagecontent || '');
    if (!s.ctx.isCurrent()) return;
    // An inert copy of the page, only read (nothing in it runs or loads).
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, noscript').forEach((el) => el.remove());

    const notes = [...s.messages, ...(data.messages || []).map((m) => m.message)];
    if (s.lesson.ongoing && data.ongoingscore) notes.push(data.ongoingscore);
    s.messages = [];
    const progress = s.lesson.progressbar && Number.isFinite(data.progress) ? data.progress : null;
    const isQuestion = LESSON_QUESTION_TYPES.has(page.qtype);
    const form = isQuestion ? doc.querySelector('form') : null;

    if (isQuestion && form) {
      const submit = form.querySelector('input[type="submit"], button[type="submit"]');
      const label = (submit?.tagName === 'INPUT' ? submit.value : submit?.textContent || '').trim() || 'Submit';
      Views.lesson.show(s, {
        title: page.title, chip: '<span class="chip chip--pink">Question</span>', notes, progress,
        body: '<div id="lessonBody"></div>',
        actions: `<button class="btn btn--primary" id="lessonSubmit">${Icons.check} ${esc(label)}</button>`,
      });
      const frame = mountHtml($('#lessonBody', s.root), form.outerHTML, { css: lessonFormCss });
      const send = () => Views.lesson.process(s, Views.lesson.formValues(frame));
      $('#lessonSubmit', s.root).addEventListener('click', send);
      // Enter in a one-line answer submits, as on Moodle (the frame's own form can't submit).
      frame.addEventListener('load', () => frame.contentDocument.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="number"]')) {
          e.preventDefault();
          send();
        }
      }));
      return;
    }

    let buttons = isQuestion ? [] : Views.lesson.pageButtons(doc);
    if (!isQuestion && !buttons.length && data.newpageid && data.newpageid !== s.pageId) buttons = [{ label: 'Continue', pageId: data.newpageid }];
    if (!buttons.length) {
      // Nothing NEKO knows how to answer: carry on on Moodle, which resumes the same attempt.
      Views.lesson.show(s, {
        title: page.title, notes, progress,
        body: '<p class="muted">NEKO can\'t show this kind of lesson page yet. Your progress is saved, so you can carry on on the website.</p>',
        actions: Views.lesson.webButton(s),
      });
      return;
    }
    const contents = doc.querySelector('.contents');
    if (!contents) doc.querySelectorAll('form, .branchbuttoncontainer').forEach((el) => el.remove());
    const body = (contents || doc.body).innerHTML.trim();
    Views.lesson.show(s, {
      title: page.title, notes, progress,
      body: body ? '<div id="lessonBody"></div>' : '',
      actions: buttons.map((b, i) => `<button class="btn ${buttons.length === 1 ? 'btn--primary' : 'btn--ghost'}" data-lesson-button="${i}">${esc(b.label)}${buttons.length === 1 ? ` ${Icons.chevron}` : ''}</button>`).join(''),
    });
    if (body) mountHtml($('#lessonBody', s.root), body);
    $('#lessonActions', s.root).addEventListener('click', (e) => {
      const b = buttons[e.target.closest('[data-lesson-button]')?.dataset.lessonButton];
      if (!b) return;
      if (b.pageId) Views.lesson.loadPage(s, b.pageId);
      else Views.lesson.process(s, b.data);
    });
  },

  // The answers in the question frame, as Moodle's form would post them.
  formValues(frame) {
    const form = frame.contentDocument?.querySelector('form');
    if (!form) return [];
    return [...new FormData(form)].filter(([, v]) => typeof v === 'string').map(([name, value]) => ({ name, value }));
  },

  async process(s, data) {
    Views.lesson.busy(s, 'Saving…');
    let res;
    try {
      res = await App.call('mod_lesson_process_page', { lessonid: s.lesson.id, pageid: s.pageId, data, password: s.password, review: false });
    } catch (e) {
      if (App.handleAuthError(e)) return;
      // Keep the page (and the answer typed in it); just let them try again.
      $$('#lessonActions button', s.root).forEach((b) => { b.disabled = false; });
      $('.lesson-actions__busy', s.root)?.remove();
      return toast('Could not save your answer', { type: 'error', message: e.message });
    }
    if (!s.ctx.isCurrent()) return;
    if (res.nodefaultresponse || res.inmediajump) {
      s.messages = (res.messages || []).map((m) => m.message);
      return Views.lesson.loadPage(s, res.newpageid);
    }

    // Feedback on the answer, then where to go next (as Moodle decides it).
    const wrongButCanRetry = s.lesson.review && !res.correctanswer && !res.noanswer && !res.isessayquestion && !res.maxattemptsreached;
    const [verdict, verdictCls] = res.noanswer ? ['You didn\'t answer the question.', 'is-warn']
      : res.isessayquestion ? ['Answer saved. Your lecturer will grade it.', 'is-ok']
      : res.correctanswer ? ['Correct!', 'is-ok']
      : ['Not quite.', 'is-danger'];
    const notes = (res.messages || []).map((m) => m.message);
    if (wrongButCanRetry && res.attemptsremaining > 0) notes.push(`You have ${res.attemptsremaining} more ${res.attemptsremaining === 1 ? 'try' : 'tries'} at this question.`);
    const next = [];
    if (wrongButCanRetry && !res.reviewmode) next.push(['Try again', s.pageId, 'btn--primary']);
    if (!wrongButCanRetry || s.pageId !== res.newpageid) {
      next.push([wrongButCanRetry ? 'Continue without retrying' : res.newpageid === s.pageId ? 'Back to the question' : 'Continue', res.newpageid, next.length ? 'btn--ghost' : 'btn--primary']);
    }
    // Moodle repeats the question in its feedback; only "your answer" and the response matter here.
    const doc = new DOMParser().parseFromString(await neko.rewriteHtml(res.feedback || ''), 'text/html');
    doc.querySelectorAll('script, noscript, .generalbox:not(.correctanswer):not(.feedback)').forEach((el) => el.remove());
    const feedback = doc.body.innerHTML.trim();
    if (!s.ctx.isCurrent()) return;
    Views.lesson.show(s, {
      title: verdict, notes,
      body: `<div class="lesson-verdict ${verdictCls}">${Icons[verdictCls === 'is-ok' ? 'check' : verdictCls === 'is-danger' ? 'alert' : 'info']}<b>${esc(verdict)}</b></div>${feedback ? '<div id="lessonBody"></div>' : ''}`,
      actions: next.map(([label, id, cls]) => `<button class="btn ${cls}" data-goto="${id}">${esc(label)}</button>`).join(''),
    });
    if (feedback) mountHtml($('#lessonBody', s.root), feedback);
    $('#lessonActions', s.root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b) Views.lesson.loadPage(s, Number(b.dataset.goto));
    });
  },

  async finish(s, outoftime = false) {
    s.finishing = true;
    clearInterval(s.tick);
    Views.lesson.busy(s, 'Finishing…');
    let res;
    try {
      res = await App.call('mod_lesson_finish_attempt', { lessonid: s.lesson.id, password: s.password, outoftime, review: false });
    } catch (e) {
      s.finishing = false;
      return Views.lesson.fail(s, e, () => Views.lesson.finish(s, outoftime));
    }
    if (!s.ctx.isCurrent()) return;
    // Moodle sends the end-of-lesson summary as ready-made sentences (score, pages seen, essays to grade...).
    const lines = (res.data || []).map((d) => stripHtml(d.message || '')).filter(Boolean);
    Views.lesson.show(s, {
      title: outoftime ? 'Time\'s up' : 'Lesson finished',
      notes: (res.messages || []).map((m) => m.message),
      body: `<div class="lesson-verdict is-ok">${Icons.check}<b>${outoftime ? 'Your time ran out, so the lesson was finished for you.' : 'Well done, you reached the end of the lesson.'}</b></div>
        ${lines.length ? `<ul class="lesson-summary">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`,
      actions: `<button class="btn btn--primary" id="lessonDone">${Icons.back} Back to the course</button>
        <button class="btn btn--ghost" id="lessonOverview">Lesson overview</button>`,
    });
    $('#lessonDone', s.root).addEventListener('click', () => App.navigate('course', { id: s.params.courseId }));
    $('#lessonOverview', s.root).addEventListener('click', () => App.navigate('activity', { courseId: s.params.courseId, cmid: s.params.cmid }, { push: false }));
  },
};
