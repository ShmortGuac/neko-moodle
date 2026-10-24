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
