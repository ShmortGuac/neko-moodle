// Assignments inside NEKO: instructions, submission status, feedback, and adding or editing a submission
// (files and/or online text). Uploading happens in the main process; this only ever sees file ids.

const SUBMISSION_STATUS = {
  new: ['No submission', ''],
  draft: ['Draft (not submitted)', 'chip--warn'],
  submitted: ['Submitted for grading', 'chip--ok'],
  reopened: ['Reopened', 'chip--warn'],
};

Views.assign = {
  // Called by Views.activity for assignment modules, after it has drawn the loading state and the page head.
  async render(root, mod, head, params, ctx) {
    const assign = (await App.getAssignments()).find((a) => a.cmid === mod.id);
    if (!assign) throw new Error('This assignment could not be loaded.');
    const status = await App.call('mod_assign_get_submission_status', { assignid: assign.id });
    const course = (await App.getCourses()).find((c) => c.id === params.courseId);
    const last = status.lastattempt || {};
    const sub = last.teamsubmission || last.submission || null;
    const plugin = (list, type) => (list || []).find((p) => p.type === type);
    const areaFiles = (p) => (p?.fileareas || []).flatMap((a) => a.files || []);
    const current = {
      files: areaFiles(plugin(sub?.plugins, 'file')),
      text: plugin(sub?.plugins, 'onlinetext')?.editorfields?.[0]?.text || '',
    };
    const feedback = status.feedback;
    const feedbackText = plugin(feedback?.plugins, 'comments')?.editorfields?.[0]?.text || '';
    const feedbackFiles = areaFiles(plugin(feedback?.plugins, 'file'));
    const [intro, text, comments] = await Promise.all([assign.intro, current.text, feedbackText].map((h) => (h ? neko.rewriteHtml(h) : '')));
    if (!ctx.isCurrent()) return;
    App.call('mod_assign_view_submission_status', { assignid: assign.id }).catch(() => {});

    const rules = Views.assign.rules(assign);
    const folder = [stripHtml(course?.shortname) || `course-${params.courseId}`, stripHtml(assign.name)];
    const files = [];
    const fileButton = (f) => {
      const i = files.push({ fileurl: f.fileurl, filename: f.filename, filesize: f.filesize }) - 1;
      return `<button class="attachment" data-file="${i}" title="Download">${Icons.clip}<span>${esc(f.filename)}</span><small>${esc(fmtSize(f.filesize))}</small></button>`;
    };

    const now = Date.now() / 1000;
    const due = last.extensionduedate || assign.duedate;
    const subStatus = sub?.status || 'new';
    const [statusLabel, statusChip] = SUBMISSION_STATUS[subStatus] || [subStatus, ''];
    const submitted = subStatus === 'submitted';
    const late = submitted && due && sub.timemodified > due;
    const opens = assign.allowsubmissionsfromdate > now ? assign.allowsubmissionsfromdate : 0;
    const dueText = !due ? 'No due date'
      : submitted ? fmtDate(due)
      : due < now ? `Overdue · was due ${relTime(due)}`
      : `${fmtDate(due)} · ${relTime(due)}`;
    const graded = last.gradingstatus === 'graded' || Boolean(feedback?.gradefordisplay);
    const facts = [
      ['Due', dueText, !submitted && due && due < now ? 'is-danger' : ''],
      ['Status', `<span class="chip ${statusChip}">${esc(statusLabel)}</span>${late ? ' <span class="chip chip--danger">Late</span>' : ''}`, '', true],
      ['Grading', graded ? 'Graded' : 'Not graded yet', graded ? 'is-ok' : ''],
      ['Last changed', sub?.timemodified ? relTime(sub.timemodified) : '–', ''],
    ];
    if (last.extensionduedate) facts.push(['Extension', fmtDate(last.extensionduedate), 'is-ok']);
    if (assign.cutoffdate && !submitted) facts.push(['Closes', fmtDate(assign.cutoffdate), assign.cutoffdate < now ? 'is-danger' : '']);
    if (opens) facts.push(['Opens', fmtDate(opens), '']);

    const hasSubmission = current.files.length || stripHtml(current.text) || /<img/i.test(current.text);
    const canEdit = last.canedit && status.lastattempt?.submissionsenabled !== false && (rules.files || rules.text);
    root.innerHTML = `
      ${head}
      <div class="facts card">${facts.map(([label, value, cls, html]) => `
        <div class="fact ${cls}"><span>${esc(label)}</span><b>${html ? value : esc(value)}</b></div>`).join('')}
      </div>

      ${feedback ? `
        <article class="card assign-card assign-card--feedback">
          <div class="card__head"><h3 class="card__title">${Icons.star} Feedback</h3>${feedback.gradeddate ? `<span class="chip">${esc(relTime(feedback.gradeddate))}</span>` : ''}</div>
          <div class="card__body">
            ${feedback.gradefordisplay ? `<div class="grade"><span>Grade</span><b>${esc(stripHtml(feedback.gradefordisplay))}</b></div>` : ''}
            ${comments ? '<div id="feedbackBody"></div>' : ''}
            ${feedbackFiles.length ? `<div class="attachments">${feedbackFiles.map(fileButton).join('')}</div>` : ''}
          </div>
        </article>` : ''}

      <article class="card assign-card" id="subCard">
        <div class="card__head">
          <h3 class="card__title">${Icons.upload} Your submission</h3>
          <div class="assign-card__actions">
            ${canEdit ? `<button class="btn btn--primary btn--sm" id="editSub">${hasSubmission ? `${Icons.edit} Edit submission` : `${Icons.plus} Add submission`}</button>` : ''}
            ${last.cansubmit && subStatus !== 'submitted' && hasSubmission ? `<button class="btn btn--primary btn--sm" id="submitSub">${Icons.check} Submit for grading</button>` : ''}
          </div>
        </div>
        <div class="card__body" id="subBody">
          ${hasSubmission ? `
            ${current.files.length ? `<div class="attachments">${current.files.map(fileButton).join('')}</div>` : ''}
            ${current.text ? '<div class="assign-text" id="subText"></div>' : ''}`
            : `<p class="muted">${canEdit ? 'Nothing submitted yet.' : opens ? `Submissions open ${esc(relTime(opens))}.` : 'Nothing submitted.'}</p>`}
          ${subStatus === 'draft' && assign.submissiondrafts ? `<p class="assign-note">${Icons.info} This is still a draft. Your lecturer can't see it until you submit it for grading.</p>` : ''}
        </div>
      </article>

      ${stripHtml(assign.intro) || (assign.introattachments || []).length ? `
        <article class="card assign-card">
          <div class="card__head"><h3 class="card__title">${Icons.book} Instructions</h3></div>
          <div class="card__body">
            ${stripHtml(assign.intro) || /<img/i.test(assign.intro) ? '<div id="introBody"></div>' : ''}
            ${(assign.introattachments || []).length ? `<div class="attachments">${assign.introattachments.map(fileButton).join('')}</div>` : ''}
          </div>
        </article>` : ''}`;

    if ($('#introBody', root)) mountHtml($('#introBody', root), intro);
    if ($('#subText', root)) mountHtml($('#subText', root), text);
    if ($('#feedbackBody', root)) mountHtml($('#feedbackBody', root), comments);

    const reload = () => App.navigate('activity', { courseId: params.courseId, cmid: params.cmid }, { push: false });
    root.addEventListener('click', (e) => {
      const file = e.target.closest('[data-file]');
      if (file) App.downloadFile(files[file.dataset.file], folder);
    });
    $('#editSub', root)?.addEventListener('click', () => Views.assign.edit($('#subCard', root), assign, current, rules, reload));
    $('#submitSub', root)?.addEventListener('click', () => Views.assign.submit(assign, reload));
  },

  // What the assignment accepts, from its plugin settings.
  rules(assign) {
    const cfg = (plugin, name) => (assign.configs || []).find((c) => c.subtype === 'assignsubmission' && c.plugin === plugin && c.name === name)?.value;
    const types = String(cfg('file', 'filetypeslist') || '').split(/[\s,;]+/).filter(Boolean);
    // Only plain extensions (".pdf") are checked here; type groups ("document") are left to Moodle.
    const extensions = types.length && types.every((t) => t.startsWith('.')) ? types.map((t) => t.slice(1).toLowerCase()) : [];
    return {
      files: cfg('file', 'enabled') === '1',
      text: cfg('onlinetext', 'enabled') === '1',
      maxFiles: Number(cfg('file', 'maxfilesubmissions')) || 20,
      maxBytes: Number(cfg('file', 'maxsubmissionsizebytes')) || 0,
      types,
      extensions,
      wordLimit: cfg('onlinetext', 'wordlimitenabled') === '1' ? Number(cfg('onlinetext', 'wordlimit')) || 0 : 0,
    };
  },

  // Swaps the submission card for an editor. Saving uploads new files and re-sends the kept ones.
  edit(card, assign, current, rules, done) {
    const originalText = htmlToText(current.text);
    const draft = current.files.map((f) => ({ url: f.fileurl, name: f.filename, size: f.filesize }));
    const needsStatement = assign.requiresubmissionstatement && !assign.submissiondrafts;
    const limits = [
      rules.files && `Up to ${rules.maxFiles} file${rules.maxFiles === 1 ? '' : 's'}`,
      rules.files && rules.maxBytes && `${fmtSize(rules.maxBytes)} each`,
      rules.files && rules.types.length && `Accepted: ${rules.types.join(', ')}`,
    ].filter(Boolean).join(' · ');

    card.classList.add('is-editing');
    card.innerHTML = `
      <div class="card__head"><h3 class="card__title">${Icons.upload} Edit submission</h3></div>
      <div class="card__body sub-edit">
        ${rules.files ? `
          <div class="field">
            <span>Files</span>
            <div class="dropzone" id="dropzone">
              <div class="sub-files" id="subFiles"></div>
              <div class="dropzone__hint">${Icons.upload} Drop files here or <button type="button" class="btn btn--ghost btn--sm" id="addFiles">${Icons.plus} Add files</button></div>
              ${limits ? `<div class="dropzone__limits">${esc(limits)}</div>` : ''}
            </div>
          </div>` : ''}
        ${rules.text ? `
          <label class="field">
            <span>Online text</span>
            <textarea class="input input--area" id="subTextInput" rows="10">${esc(originalText)}</textarea>
            <small class="sub-words" id="subWords"></small>
            ${/<img/i.test(current.text) ? '<small class="sub-warn">Your current text has images. Editing it here keeps the words only; leave it unchanged to keep the images.</small>' : ''}
          </label>` : ''}
        ${needsStatement ? `<label class="statement"><input type="checkbox" id="subStatement"> <span>${esc(stripHtml(assign.submissionstatement) || 'This submission is my own work.')}</span></label>` : ''}
        <p class="modal__error" id="subError" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" id="subCancel">Cancel</button>
          <button type="button" class="btn btn--primary" id="subSave">${assign.submissiondrafts ? 'Save draft' : 'Submit'}</button>
        </div>
      </div>`;

    const error = $('#subError', card);
    const showError = (msg) => {
      error.textContent = msg;
      error.hidden = !msg;
    };
    const renderFiles = () => {
      const list = $('#subFiles', card);
      if (!list) return;
      list.innerHTML = draft.length
        ? draft.map((f, i) => `
            <div class="file ${f.id ? 'is-new' : ''}">
              <span class="file__name">${esc(f.name)}</span>
              <span class="file__size">${esc(fmtSize(f.size))}${f.id ? ' · new' : ''}</span>
              <button type="button" class="btn btn--ghost btn--sm btn--icon" style="width:30px;height:30px" title="Remove" data-remove="${i}">${Icons.close}</button>
            </div>`).join('')
        : '<div class="sub-files__empty">No files yet.</div>';
    };
    const addFiles = (picked) => {
      const problems = [];
      for (const f of picked) {
        const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
        if (draft.length >= rules.maxFiles) problems.push(`Only ${rules.maxFiles} file${rules.maxFiles === 1 ? '' : 's'} allowed.`);
        else if (rules.maxBytes && f.size > rules.maxBytes) problems.push(`${f.name} is larger than ${fmtSize(rules.maxBytes)}.`);
        else if (rules.extensions.length && !rules.extensions.includes(ext)) problems.push(`${f.name} isn't an accepted file type.`);
        else if (draft.some((d) => d.name === f.name)) problems.push(`There's already a file called ${f.name}.`);
        else draft.push(f);
      }
      showError([...new Set(problems)].join(' '));
      renderFiles();
    };
    const countWords = () => {
      const out = $('#subWords', card);
      if (!out) return;
      const n = ($('#subTextInput', card).value.match(/\S+/g) || []).length;
      out.textContent = rules.wordLimit ? `${n} / ${rules.wordLimit} words` : `${n} word${n === 1 ? '' : 's'}`;
      out.classList.toggle('is-over', Boolean(rules.wordLimit) && n > rules.wordLimit);
    };
    renderFiles();
    countWords();
    $('#subTextInput', card)?.addEventListener('input', countWords);

    $('#addFiles', card)?.addEventListener('click', async () => {
      try {
        addFiles(await neko.pickFiles({ extensions: rules.extensions }));
      } catch (e) {
        showError(e.message);
      }
    });
    const zone = $('#dropzone', card);
    if (zone) {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
        if (e.dataTransfer.files.length) addFiles(await neko.addDroppedFiles(e.dataTransfer.files));
      });
    }
    card.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      draft.splice(Number(remove.dataset.remove), 1);
      showError('');
      renderFiles();
    });
    $('#subCancel', card).addEventListener('click', done);
    $('#subSave', card).addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const textValue = $('#subTextInput', card)?.value ?? '';
      const textChanged = rules.text && textValue.trim() !== originalText.trim();
      const words = (textValue.match(/\S+/g) || []).length;
      if (!draft.length && !textValue.trim() && !(rules.text && !textChanged && /<img/i.test(current.text))) return showError('Add a file or some text first.');
      if (rules.wordLimit && words > rules.wordLimit) return showError(`The text is over the ${rules.wordLimit}-word limit.`);
      if (needsStatement && !$('#subStatement', card).checked) return showError('Please accept the statement first.');
      button.disabled = true;
      button.textContent = draft.some((f) => f.id) ? 'Uploading…' : 'Saving…';
      showError('');
      try {
        await neko.saveSubmission({
          assignid: assign.id,
          files: rules.files ? draft.map((f) => (f.id ? { id: f.id } : { url: f.url, name: f.name })) : null,
          // Unchanged text is sent back as the original HTML so its formatting survives.
          text: rules.text ? (textChanged ? (textValue.trim() ? textToHtml(textValue) : '') : current.text) : null,
        });
      } catch (err) {
        button.disabled = false;
        button.textContent = assign.submissiondrafts ? 'Save draft' : 'Submit';
        if (!App.handleAuthError(err)) showError(err.message);
        return;
      }
      toast(assign.submissiondrafts ? 'Draft saved' : 'Submitted', {
        type: 'ok',
        message: assign.submissiondrafts ? 'Submit it for grading when you\'re ready.' : stripHtml(assign.name),
        timeout: 7000,
      });
      done();
    });
  },

  async submit(assign, done) {
    const statement = assign.requiresubmissionstatement ? stripHtml(assign.submissionstatement) || 'This submission is my own work.' : '';
    const ok = await confirmModal({
      title: 'Submit for grading?',
      text: 'Once submitted, you can\'t change your submission unless your lecturer reopens it.',
      statement,
      okLabel: 'Submit',
      run: async () => {
        const warnings = await App.call('mod_assign_submit_for_grading', { assignmentid: assign.id, acceptsubmissionstatement: Boolean(statement) });
        if (Array.isArray(warnings) && warnings.length) throw new Error(warnings.map((w) => w.message).join(' '));
        return true;
      },
    });
    if (!ok) return;
    toast('Submitted for grading', { type: 'ok', message: stripHtml(assign.name), timeout: 7000 });
    done();
  },
};
