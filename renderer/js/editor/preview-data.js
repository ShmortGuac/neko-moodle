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
      { name: 'Assignment 2: Linked lists is due', timesort: now + 5 * h, course: course(0) },
      { name: 'Quiz 4 closes', timesort: now + 28 * h, course: course(2) },
      { name: 'Project proposal is due', timesort: now + 4 * 24 * h, course: course(3) },
      { name: 'Essay draft is due', timesort: now + 12 * 24 * h, course: course(4) },
    ];
    if (PreviewData.state === 'clear') return [];
    if (PreviewData.state === 'overdue') return overdue;
    return [...overdue, ...upcoming].sort((a, b) => a.timesort - b.timesort);
  },

  contents() {
    const file = (filename, filesize) => ({ type: 'file', filename, filesize, filepath: '/', fileurl: 'https://moodle.example.edu/pluginfile.php/1/file' });
    return [
      {
        section: 0, name: 'General', summary: '<p>Welcome to the course! Lecture slides are posted every Monday.</p>',
        modules: [
          { modname: 'forum', modplural: 'Forums', name: 'Announcements', url: 'https://moodle.example.edu' },
          { modname: 'label', description: '<p>Lectures: Mon &amp; Wed, 10:00, Room 3.2</p><p>Discord: https://discord.gg/example</p>' },
        ],
      },
      {
        section: 1, name: 'Week 1: Introduction', summary: '',
        modules: [
          { modname: 'resource', modplural: 'Files', name: 'Lecture 1 slides', contents: [file('lecture-1.pdf', 2400000)] },
          { modname: 'folder', modplural: 'Folders', name: 'Lab materials', contents: [file('lab-1.pdf', 180000), file('starter-code.zip', 52000)] },
          { modname: 'url', modplural: 'URLs', name: 'Course GitHub', contents: [{ type: 'url', fileurl: 'https://github.com' }] },
          { modname: 'assign', modplural: 'Assignments', name: 'Assignment 1', description: '<p>Implement a stack and a queue.</p>', url: 'https://moodle.example.edu' },
          { modname: 'quiz', modplural: 'Quizzes', name: 'Quiz 1', url: 'https://moodle.example.edu' },
        ],
      },
      {
        section: 2, name: 'Week 2: Arrays and lists', summary: '<p>Bring your laptop to the lab.</p>',
        modules: [
          { modname: 'resource', modplural: 'Files', name: 'Lecture 2 slides', contents: [file('lecture-2.pdf', 3100000)] },
          { modname: 'page', modplural: 'Pages', name: 'Reading list', url: 'https://moodle.example.edu' },
        ],
      },
    ];
  },
};
