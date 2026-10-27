// Dummy data for the theme editor's preview, so themes can be designed without signing in.

const PreviewData = {
  // Which deadline situation the dashboard shows: 'due' | 'overdue' | 'clear'
  state: 'due',

  user: {
    site: 'https://moodle.example.edu',
    sitename: 'Example University',
    userid: 1,
    username: 'alex',
    firstname: 'Alex',
    fullname: 'Alex Tan',
    userpicture: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#8a96ff"/><text x="20" y="26" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">AT</text></svg>')}`,
  },

  courses() {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    return [
      ['CS2101', 'Data Structures and Algorithms', 62, 2],
      ['CS2203', 'Operating Systems', 45, 3],
      ['MA1104', 'Discrete Mathematics', 80, 6],
      ['CS3301', 'Cross-Platform Software Development', 30, 9],
      ['HU1001', 'Academic Writing', null, 14],
      ['CS4321', 'Final Year Project I', 12, 20],
    ].map(([shortname, fullname, progress, ago], i) => ({
      id: 101 + i, shortname, fullname, progress, lastaccess: now - ago * day, enddate: 0, _image: null,
    }));
  },

  events() {
    const now = Math.floor(Date.now() / 1000);
    const h = 3600;
    const course = (i) => { const c = PreviewData.courses()[i]; return { fullname: c.fullname, shortname: c.shortname }; };
    const overdue = [
      { name: 'Lab 3 report is due', timesort: now - 30 * h, course: course(0) },
      { name: 'Reading quiz closes', timesort: now - 60 * h, course: course(4) },
    ];
    const upcoming = [
      { name: 'Assignment 2: Linked lists is due', timesort: now + 5 * h, course: { ...course(0), id: 101 }, modulename: 'assign', url: 'https://moodle.example.edu/mod/assign/view.php?id=9005' },
      { name: 'Quiz 4 closes', timesort: now + 28 * h, course: course(2) },
      { name: 'Project proposal is due', timesort: now + 4 * 24 * h, course: course(3) },
      { name: 'Essay draft is due', timesort: now + 12 * 24 * h, course: course(4) },
    ];
    if (PreviewData.state === 'clear') return [];
    if (PreviewData.state === 'overdue') return overdue;
    return [...overdue, ...upcoming].sort((a, b) => a.timesort - b.timesort);
  },

  // Answers for the Moodle web service calls the preview makes.
  ws(fn, params = {}) {
    if (fn === 'core_course_get_contents') return PreviewData.contents(params.courseid);
    if (fn === 'mod_forum_get_forums_by_courses') return PreviewData.forums();
    if (fn === 'mod_assign_get_assignments') return { courses: [{ id: 101, assignments: [PreviewData.assignment()] }] };
    if (fn === 'mod_assign_get_submission_status') return PreviewData.submission();
    if (fn === 'mod_forum_get_forum_discussions') return { discussions: PreviewData.discussions(params.forumid) };
    if (fn === 'mod_forum_get_discussion_posts') return PreviewData.posts(params.discussionid);
    if (fn.startsWith('mod_lesson_')) return PreviewData.lessonWs(fn, params);
    return {};
  },

  // A short lesson: a content page, a multiple-choice question, an essay, then the end. The page HTML follows
  // what Moodle sends (content in .contents, buttons as forms in .branchbuttoncontainer, questions as a form).
  // Nothing leaves the preview; answers are kept in lessonState so the preview (and tests) can see them.
  lessonState: { started: 0, last: 0, done: 0, answers: [] },

  lessonWs(fn, p) {
    const st = PreviewData.lessonState;
    const now = Math.floor(Date.now() / 1000);
    const hidden = (pageid, form) => `<input type="hidden" name="id" value="9006"><input type="hidden" name="pageid" value="${pageid}"><input type="hidden" name="sesskey" value="preview">${form ? `<input type="hidden" name="_qf__${form}" value="1">` : ''}`;
    const button = (pageid, jumpto, label) => `<form method="post" action="https://moodle.example.edu/mod/lesson/continue.php"><div>${hidden(pageid)}<input type="hidden" name="jumpto" value="${jumpto}"><button type="submit" class="btn btn-secondary" id="single_button${pageid}${jumpto}">${label}</button></div></form>`;
    const pages = {
      1: { qtype: 20, type: 1, title: 'What is recursion?', html: `<div class="box py-3 contents"><p>A <b>recursive</b> function calls itself on a smaller version of the same problem, until it reaches a case simple enough to answer directly: the <em>base case</em>.</p><pre>int fact(int n) {\n  if (n == 0) return 1;\n  return n * fact(n - 1);\n}</pre></div><div class="branchbuttoncontainer vertical">${button(1, -1, 'Next page')}</div>` },
      2: { qtype: 3, type: 0, title: 'Base case', html: `<form autocomplete="off" action="https://moodle.example.edu/mod/lesson/continue.php" method="post" accept-charset="utf-8" id="mform1" class="mform"><div style="display: none;">${hidden(2, 'lesson_display_answer_form_multichoice_singleanswer')}</div><fieldset class="clearfix collapsible" id="id_pageheader"><legend class="ftoggler"><a href="#" class="fheader">Base case</a></legend><div class="fcontainer clearfix"><div class="box contents"><p>What is the base case of <code>fact(n)</code>?</p></div>${[[11, 'n == 0, which returns 1'], [12, 'n == 1, which returns 0'], [13, 'There isn\'t one']].map(([id, text]) => `<div class="form-group row fitem"><div class="col-md-3 col-form-label"></div><div class="col-md-9 form-inline felement" data-fieldtype="radio"><div class="form-check"><input type="radio" class="form-check-input" name="answerid" id="id_answerid_${id}" value="${id}"><label class="form-check-label" for="id_answerid_${id}">${text}</label></div></div></div>`).join('')}</div></fieldset><div class="form-group row fitem" id="fitem_id_submitbutton"><div class="col-md-9 felement" data-fieldtype="submit"><input type="submit" class="btn btn-primary" name="submitbutton" id="id_submitbutton" value="Submit"></div></div></form>` },
      3: { qtype: 10, type: 0, title: 'In your own words', html: `<form autocomplete="off" action="https://moodle.example.edu/mod/lesson/continue.php" method="post" accept-charset="utf-8" id="mform2" class="mform"><div style="display: none;">${hidden(3, 'lesson_display_answer_form_essay')}</div><fieldset class="clearfix" id="id_pageheader"><legend class="ftoggler">In your own words</legend><div class="fcontainer clearfix"><div class="box contents"><p>Explain what would happen if <code>fact</code> had no base case.</p></div><div class="form-group row fitem" id="fitem_id_answer"><div class="col-md-3"><label class="col-form-label d-inline" for="id_answer">Your response</label></div><div class="col-md-9 felement" data-fieldtype="editor"><textarea id="id_answer" name="answer[text]" rows="15" cols="80" spellcheck="true"></textarea><input type="hidden" name="answer[format]" value="1"><input type="hidden" name="answer[itemid]" value="123456"></div></div></div></fieldset><div class="form-group row fitem"><div class="col-md-9 felement" data-fieldtype="submit"><input type="submit" class="btn btn-primary" name="submitbutton" id="id_submitbutton" value="Submit"></div></div></form>` },
    };
    const lesson = { id: 700, coursemodule: 9006, course: 101, name: 'Lesson 3: Recursion', intro: '<p>A short walk through recursion, with two questions at the end. About 10 minutes.</p>', grade: 10, practice: false, retake: true, review: true, timelimit: 0, progressbar: true, ongoing: false, available: 0, deadline: now + 3 * 86400 };
    if (fn === 'mod_lesson_get_lessons_by_courses') return { lessons: [lesson] };
    if (fn === 'mod_lesson_get_lesson_access_information') return { attemptscount: st.done, lastpageseen: st.last, firstpageid: 1, preventaccessreasons: [], leftduringtimedsession: false };
    if (fn === 'mod_lesson_get_user_grade') return { grade: 7.5, formattedgrade: '7.50' };
    if (fn === 'mod_lesson_get_user_timers') return { timers: [] };
    // Like Moodle: pageid 0 starts an attempt (and its timer); a page id continues one, which needs that timer.
    if (fn === 'mod_lesson_launch_attempt') {
      if (p.pageid && !st.timer) throw new Error('could not find lesson_timer records');
      if (!p.pageid) st.timer = true;
      st.started++;
      return { messages: [] };
    }
    if (fn === 'mod_lesson_get_page_data') {
      const page = pages[p.pageid];
      st.last = p.pageid;
      return { page: { id: p.pageid, lessonid: 700, qtype: page.qtype, type: page.type, title: page.title }, newpageid: p.pageid, pagecontent: page.html, progress: Math.round(((p.pageid - 1) / 3) * 100), messages: [], ongoingscore: '' };
    }
    if (fn === 'mod_lesson_process_page') {
      const data = Object.fromEntries((p.data || []).map((d) => [d.name, d.value]));
      st.answers.push({ pageid: p.pageid, data });
      if (p.pageid === 1) return { newpageid: Number(data.jumpto) === -1 ? 2 : Number(data.jumpto), inmediajump: true, nodefaultresponse: false, messages: [] };
      const box = '<div class="box generalbox boxaligncenter py-3"><p>(the question again)</p></div>';
      if (p.pageid === 2) {
        if (!data.answerid) return { newpageid: 2, noanswer: true, correctanswer: false, feedback: '', messages: [] };
        const correct = data.answerid === '11';
        return {
          newpageid: 3, correctanswer: correct, noanswer: false, isessayquestion: false, maxattemptsreached: false, attemptsremaining: correct ? 0 : 1, messages: [],
          feedback: `${box}<div class="correctanswer generalbox"><em>Your answer</em> : <div class="studentanswer mt-2 mb-2">${pages[2].html.match(new RegExp(`id_answerid_${data.answerid}">([^<]*)<`))?.[1] || ''}</div><div class="response">${correct ? 'Right: fact(0) is 1, and every other call works its way down to it.' : 'Not quite. Look at the first line of the function.'}</div></div>`,
        };
      }
      return { newpageid: -9, isessayquestion: true, correctanswer: false, noanswer: !(data['answer[text]'] || '').trim(), messages: [],
        feedback: `${box}<div class="correctanswer generalbox"><em>Your answer</em> : <div class="studentanswer mt-2 mb-2">${data['answer[text]'] || ''}</div></div>` };
    }
    if (fn === 'mod_lesson_finish_attempt') {
      st.done++;
      st.timer = false;
      st.last = 0;
      return { data: [
        { name: 'gradelesson', value: '1', message: '' },
        { name: 'numberofcorrectanswers', value: '1', message: 'Number of correct answers: 1' },
        { name: 'displayscorewithessays', value: '', message: 'You earned 1 out of 1 for the automatically graded questions. Your 1 essay question(s) will be graded and added into your final score at a later date.' },
        { name: 'progresscompleted', value: '100', message: 'You completed 100% of the lesson' },
      ], messages: [] };
    }
    return {};
  },

  // Each course has an announcements forum; the first course also has a Q&A forum.
  forums() {
    const list = PreviewData.courses().map((c, i) => ({ id: 500 + i, cmid: i ? 9100 + i : 9003, course: c.id, type: 'news', name: 'Announcements', intro: '', cancreatediscussions: false, numdiscussions: 2 }));
    list.push({ id: 600, cmid: 9004, course: 101, type: 'general', name: 'Q&A', intro: '<p>Ask anything about the course here. Be kind!</p>', cancreatediscussions: true, numdiscussions: 3 });
    return list;
  },

  discussions(forumid) {
    const now = Math.floor(Date.now() / 1000);
    const h = 3600;
    const avatar = (initials, color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${color}"/><text x="20" y="26" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`)}`;
    const d = (id, name, who, initials, color, ago, extra = {}) => ({
      id, discussion: id, forum: forumid, name, subject: name, userfullname: who, userpictureurl: avatar(initials, color),
      created: now - ago * h, timemodified: now - ago * h, numreplies: 0, numunread: 0, pinned: false, locked: false,
      message: '<p>Hello everyone, a quick update about this week. Please read the details below and reach out if you have questions.</p>', ...extra,
    });
    if (forumid === 600) {
      return [
        d(7001, 'How do we submit Lab 3?', 'Sam Lee', 'SL', '#f0a35e', 30, { numreplies: 2, timemodified: now - 2 * h, usermodifiedfullname: 'Dr. Mei Lin', pinned: true }),
        d(7002, 'Study group for the quiz', 'Priya Nair', 'PN', '#6cc5a1', 50, { numreplies: 4, numunread: 1, timemodified: now - 6 * h, usermodifiedfullname: 'Alex Tan' }),
        d(7003, 'Is the textbook required?', 'Jordan Wu', 'JW', '#8a96ff', 120),
      ];
    }
    const i = forumid - 500;
    return [
      d(8000 + i * 2, ['Lecture moved to Room 4.1', 'Quiz 4 is open', 'Midterm grades released', 'Guest talk on Friday', 'Essay rubric posted', 'Supervisor list'][i] || 'Welcome', 'Dr. Mei Lin', 'ML', '#ef6f9b', 4 + i * 9, { numunread: i < 2 ? 1 : 0 }),
      d(8001 + i * 2, 'Welcome to the course', 'Dr. Mei Lin', 'ML', '#ef6f9b', 200 + i * 10),
    ];
  },

  posts(discussionid) {
    const now = Math.floor(Date.now() / 1000);
    const all = [...PreviewData.discussions(600), ...PreviewData.forums().flatMap((f) => (f.id === 600 ? [] : PreviewData.discussions(f.id)))];
    const disc = all.find((x) => x.discussion === discussionid) || all[0];
    const author = (fullname, url) => ({ fullname, urls: { profileimage: url } });
    const post = (id, parentid, who, url, ago, message, extra = {}) => ({
      id, parentid, subject: parentid ? `Re: ${disc.name}` : disc.name, replysubject: `Re: ${disc.name}`, message, author: author(who, url),
      timecreated: now - ago * 3600, unread: false, isdeleted: false, capabilities: { reply: true }, attachments: [], ...extra,
    });
    const lecturer = PreviewData.discussions(500)[0].userpictureurl;
    const posts = [post(1, null, disc.userfullname, disc.userpictureurl, 30, disc.message, {
      attachments: [{ filename: 'lab-3-instructions.pdf', filesize: 240000, url: 'https://moodle.example.edu/pluginfile.php/1/mod_forum/attachment/1/lab-3-instructions.pdf' }],
    })];
    if (disc.numreplies) {
      posts.push(
        post(2, 1, 'Dr. Mei Lin', lecturer, 20, '<p>Upload a single PDF to the Lab 3 assignment. The deadline is Friday at 11:59 pm.</p>'),
        post(3, 2, PreviewData.user.fullname, PreviewData.user.userpicture, 2, '<p>Thank you! Can we include the code as an appendix?</p>', { unread: true }),
      );
    }
    return { posts, forumid: disc.forum, courseid: 101 };
  },

  assignment() {
    const now = Math.floor(Date.now() / 1000);
    const config = (plugin, name, value) => ({ plugin, subtype: 'assignsubmission', name, value });
    return {
      id: 300, cmid: 9005, course: 101, name: 'Assignment 2: Linked lists', duedate: now + 5 * 3600, cutoffdate: 0, allowsubmissionsfromdate: 0,
      submissiondrafts: 1, requiresubmissionstatement: 1, submissionstatement: 'This assignment is my own work, except where I have acknowledged the use of the works of other people.',
      intro: '<p>Implement a singly linked list with <b>insert</b>, <b>delete</b> and <b>reverse</b>. Include tests and a short report (max 2 pages).</p>',
      introattachments: [{ filename: 'assignment-2-brief.pdf', filesize: 310000, fileurl: 'https://moodle.example.edu/pluginfile.php/1/mod_assign/introattachment/0/assignment-2-brief.pdf' }],
      configs: [
        config('file', 'enabled', '1'), config('file', 'maxfilesubmissions', '3'), config('file', 'maxsubmissionsizebytes', '10485760'), config('file', 'filetypeslist', '.pdf,.zip'),
        config('onlinetext', 'enabled', '1'), config('onlinetext', 'wordlimitenabled', '1'), config('onlinetext', 'wordlimit', '200'),
      ],
    };
  },

  submission() {
    const now = Math.floor(Date.now() / 1000);
    return {
      lastattempt: {
        submission: {
          status: 'submitted', timemodified: now - 26 * 3600,
          plugins: [
            { type: 'file', fileareas: [{ area: 'submission_files', files: [{ filename: 'linked-list.zip', filesize: 48000, fileurl: 'https://moodle.example.edu/pluginfile.php/1/assignsubmission_file/submission_files/1/linked-list.zip' }] }] },
            { type: 'onlinetext', editorfields: [{ name: 'onlinetext', text: '<p>Repository: https://github.com/alex/linked-list</p>' }] },
          ],
        },
        submissionsenabled: true, canedit: true, cansubmit: false, gradingstatus: 'graded',
      },
      feedback: {
        gradefordisplay: '18.00 / 20.00', gradeddate: now - 3 * 3600,
        plugins: [{ type: 'comments', editorfields: [{ name: 'comments', text: '<p>Great work! Your reverse function is clean. Add more edge-case tests next time.</p>' }] }],
      },
    };
  },

  // Sample HTML for pages and book chapters in the preview.
  html(url) {
    const chapter = url.match(/chapter\/(\d+)/)?.[1];
    const title = chapter ? ['Welcome', 'Grading', 'Weekly plan'][chapter - 1] : 'Reading list';
    return `<p>This is sample content for <b>${title}</b>, shown the way NEKO shows pages and books.</p>
      <h3>What to read</h3>
      <ul><li><a href="https://example.com">Introduction to Algorithms</a>, chapters 1–3</li><li>Lecture notes for week 1</li></ul>
      <blockquote>Tip: links open in your browser, Moodle links open inside NEKO.</blockquote>
      <table><tr><th>Week</th><th>Topic</th></tr><tr><td>1</td><td>Arrays</td></tr><tr><td>2</td><td>Linked lists</td></tr></table>`;
  },

  contents() {
    const file = (filename, filesize) => ({ type: 'file', filename, filesize, filepath: '/', fileurl: 'https://moodle.example.edu/pluginfile.php/1/file' });
    return [
      {
        section: 0, name: 'General', summary: '<p>Welcome to the course! Lecture slides are posted every Monday.</p>',
        modules: [
          { id: 9003, modname: 'forum', modplural: 'Forums', name: 'Announcements', url: 'https://moodle.example.edu' },
          { id: 9004, modname: 'forum', modplural: 'Forums', name: 'Q&A', url: 'https://moodle.example.edu' },
          { modname: 'label', description: '<p>Lectures: Mon &amp; Wed, 10:00, Room 3.2</p><p>Discord: https://discord.gg/example</p>' },
        ],
      },
      {
        section: 1, name: 'Week 1: Introduction', summary: '',
        modules: [
          { modname: 'resource', modplural: 'Files', name: 'Lecture 1 slides', contents: [file('lecture-1.pdf', 2400000)] },
          { modname: 'folder', modplural: 'Folders', name: 'Lab materials', contents: [file('lab-1.pdf', 180000), file('starter-code.zip', 52000)] },
          { modname: 'url', modplural: 'URLs', name: 'Course GitHub', contents: [{ type: 'url', fileurl: 'https://github.com' }] },
          { id: 9005, modname: 'assign', modplural: 'Assignments', name: 'Assignment 2: Linked lists', description: '<p>Implement a singly linked list.</p>', url: 'https://moodle.example.edu' },
          { modname: 'quiz', modplural: 'Quizzes', name: 'Quiz 1', url: 'https://moodle.example.edu' },
          { id: 9006, modname: 'lesson', modplural: 'Lessons', name: 'Lesson 3: Recursion', description: '<p>A short walk through recursion.</p>', url: 'https://moodle.example.edu' },
        ],
      },
      {
        section: 2, name: 'Week 2: Arrays and lists', summary: '<p>Bring your laptop to the lab.</p>',
        modules: [
          { modname: 'resource', modplural: 'Files', name: 'Lecture 2 slides', contents: [file('lecture-2.pdf', 3100000)] },
          { id: 9001, modname: 'page', modplural: 'Pages', name: 'Reading list', url: 'https://moodle.example.edu',
            contents: [{ type: 'file', filename: 'index.html', filepath: '/', fileurl: 'https://moodle.example.edu/pluginfile.php/1/mod_page/content/1/index.html' }] },
          { id: 9002, modname: 'book', modplural: 'Books', name: 'Course handbook', url: 'https://moodle.example.edu',
            contents: [
              { type: 'content', filename: 'structure', content: JSON.stringify([{ title: 'Welcome', href: '1/index.html', level: 0, subitems: [{ title: 'Grading', href: '2/index.html', level: 1, subitems: [] }] }, { title: 'Weekly plan', href: '3/index.html', level: 0, subitems: [] }]) },
              ...[1, 2, 3].map((n) => ({ type: 'file', filename: 'index.html', filepath: `/${n}/`, fileurl: `https://moodle.example.edu/pluginfile.php/1/mod_book/chapter/${n}/index.html` })),
            ] },
        ],
      },
    ];
  },
};
