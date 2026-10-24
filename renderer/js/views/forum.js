// Forums inside NEKO: a forum's discussions, a discussion's posts (threaded) with replies, and the
// announcements feed across all courses. Posts are Moodle HTML, shown with mountHtml like pages are.

const PER_PAGE = 25;

Views.forum = {
  // Called by Views.activity for forum modules, after it has drawn the loading state and the page head.
  async renderList(root, mod, head, params, ctx) {
    const forum = (await App.getForums()).find((f) => f.cmid === mod.id);
    if (!forum) throw new Error('This forum could not be loaded.');
    let discussions = await App.getDiscussions(forum.id, 0, PER_PAGE);
    if (!ctx.isCurrent()) return;

    const course = (await App.getCourses()).find((c) => c.id === params.courseId);
    discussions.forEach((d) => { d._course = course; });
    const intro = forum.type !== 'news' ? htmlToText(forum.intro) : '';
    root.innerHTML = `
      ${head}
      ${intro ? `<div class="card forum__intro">${linkify(intro)}</div>` : ''}
      <div class="section-title">
        <h2>${Icons.chat} ${forum.numdiscussions ?? discussions.length} discussion${(forum.numdiscussions ?? discussions.length) === 1 ? '' : 's'}</h2>
        ${forum.cancreatediscussions ? `<button class="btn btn--primary btn--sm" id="newDiscussion">${Icons.plus} New discussion</button>` : ''}
      </div>
      <div class="card"><div class="card__body">
        ${discussions.length
          ? `<div class="discussion-list" id="discussions">${discussions.map((d) => App.ui.discussion(d)).join('')}</div>
             ${discussions.length === PER_PAGE ? `<button class="btn btn--ghost btn--sm forum__more" id="more">Load more</button>` : ''}`
          : emptyHTML('No discussions yet', forum.cancreatediscussions ? 'Start one with "New discussion".' : '')}
      </div></div>`;

    let page = 0;
    $('#more', root)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const next = await App.getDiscussions(forum.id, ++page, PER_PAGE);
        next.forEach((d) => { d._course = course; });
        discussions = discussions.concat(next);
        $('#discussions', root).insertAdjacentHTML('beforeend', next.map((d) => App.ui.discussion(d)).join(''));
        if (next.length < PER_PAGE) btn.remove();
        else btn.disabled = false;
      } catch (err) {
        page--;
        btn.disabled = false;
        if (!App.handleAuthError(err)) toast('Could not load more', { type: 'error', message: err.message });
      }
    });
    $('#newDiscussion', root)?.addEventListener('click', async () => {
      const id = await composeModal({
        title: `New discussion in ${stripHtml(forum.name)}`,
        send: async ({ subject, message }) => (await App.call('mod_forum_add_discussion', { forumid: forum.id, subject, message: textToHtml(message) })).discussionid,
      });
      if (!id) return;
      toast('Discussion posted', { type: 'ok' });
      App.navigate('discussion', { discussionId: id, forumId: forum.id, courseId: params.courseId });
    });
  },
};

Views.discussion = {
  nav: (p) => (p.from === 'announcements' ? 'announcements' : 'courses'),
  title: () => 'Discussion',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('forum');
    const [res, forums, courses] = await Promise.all([
      App.call('mod_forum_get_discussion_posts', { discussionid: params.discussionId, sortby: 'created', sortdirection: 'ASC' }),
      App.getForums(),
      App.getCourses(),
    ]);
    const posts = res.posts || [];
    if (!posts.length) throw new Error('This discussion is empty or no longer exists.');
    const forum = forums.find((f) => f.id === (res.forumid || params.forumId));
    const course = courses.find((c) => c.id === (res.courseid || forum?.course || params.courseId));
    const [pictures, messages] = await Promise.all([
      neko.tokenize(posts.map((p) => p.author?.urls?.profileimage || '')),
      Promise.all(posts.map((p) => neko.rewriteHtml(p.message || ''))),
    ]);
    if (!ctx.isCurrent()) return;
    App.call('mod_forum_view_discussion', { discussionid: params.discussionId }).catch(() => {});

    const first = posts.find((p) => !p.parentid) || posts[0];
    const subject = stripHtml(first.subject);
    ctx.setTitle(subject);
    const folder = [stripHtml(course?.shortname) || `course-${course?.id ?? ''}`, stripHtml(forum?.name) || 'Forum'];

    // Replies nest under the post they answer; indentation stops growing after a few levels.
    const children = new Map();
    posts.forEach((p, i) => {
      p._i = i;
      if (p !== first) {
        const parent = posts.some((q) => q.id === p.parentid) ? p.parentid : first.id;
        children.set(parent, [...(children.get(parent) || []), p]);
      }
    });
    const files = [];
    const postHTML = (p, depth) => {
      const title = stripHtml(p.subject);
      const showTitle = p !== first && title && title !== subject && title !== `Re: ${subject}`;
      const attachments = (p.attachments || []).map((a) => {
        const i = files.push({ fileurl: a.url || a.fileurl, filename: a.filename, filesize: a.filesize }) - 1;
        return `<button class="attachment" data-file="${i}" title="Download">${Icons.clip}<span>${esc(a.filename)}</span><small>${esc(fmtSize(a.filesize))}</small></button>`;
      }).join('');
      return `
        <article class="post card ${p.unread ? 'is-unread' : ''}" style="--depth:${Math.min(depth, 4)}" id="post-${p.id}">
          <header class="post__head">
            <img class="avatar" src="${esc(pictures[p._i] || '')}" alt="" data-fallback>
            <div>
              <div class="post__author">${esc(p.author?.fullname || 'Someone')}</div>
              <div class="post__time" title="${esc(fmtDate(p.timecreated))}">${esc(relTime(p.timecreated))}${p.isprivatereply ? ' · private reply' : ''}</div>
            </div>
            ${p.unread ? '<span class="chip chip--pink">New</span>' : ''}
          </header>
          ${showTitle ? `<h3 class="post__subject">${esc(title)}</h3>` : ''}
          <div class="post__body" data-msg="${p._i}">${p.isdeleted ? '<p class="post__deleted">This post was deleted.</p>' : ''}</div>
          ${attachments ? `<div class="attachments">${attachments}</div>` : ''}
          ${p.capabilities?.reply && !p.isdeleted ? `<footer class="post__actions"><button class="btn btn--ghost btn--sm" data-reply="${p._i}">${Icons.reply} Reply</button></footer>` : ''}
        </article>
        ${(children.get(p.id) || []).map((c) => postHTML(c, depth + 1)).join('')}`;
    };

    root.innerHTML = `
      <div class="page-head">
        <div>
          <div class="page-head__eyebrow">${esc([course && courseTag(course), forum && stripHtml(forum.name)].filter(Boolean).join(' · '))}</div>
          <h1>${esc(subject)}</h1>
          <p>${posts.length - 1 ? `${posts.length - 1} repl${posts.length === 2 ? 'y' : 'ies'}` : 'No replies yet'}</p>
        </div>
        <button class="btn btn--ghost" data-url="${esc(`${App.user.site}/mod/forum/discuss.php?d=${params.discussionId}`)}">${Icons.external} Open on ${esc(brandName())}</button>
      </div>
      <div class="thread">${postHTML(first, 0)}</div>`;
    $$('[data-msg]', root).forEach((el) => {
      if (!posts[el.dataset.msg].isdeleted) mountHtml(el, messages[el.dataset.msg]);
    });

    root.addEventListener('click', async (e) => {
      const file = e.target.closest('[data-file]');
      if (file) return App.downloadFile(files[file.dataset.file], folder);
      const reply = e.target.closest('[data-reply]');
      if (!reply) return;
      const to = posts[reply.dataset.reply];
      const posted = await composeModal({
        title: `Reply to ${to.author?.fullname || 'this post'}`,
        subject: stripHtml(to.replysubject) || `Re: ${subject}`,
        withSubject: false,
        okLabel: 'Post reply',
        send: async ({ subject: s, message }) => App.call('mod_forum_add_discussion_post', { postid: to.id, subject: s, message: textToHtml(message) }),
      });
      if (!posted) return;
      toast('Reply posted', { type: 'ok' });
      delete App.cache.announcements;
      App.navigate('discussion', { ...params, force: true }, { push: false });
    });
  },
};

Views.announcements = {
  title: () => 'Announcements',

  async render(root, params, ctx) {
    root.innerHTML = loadingHTML('forum');
    const list = await App.getAnnouncements();
    if (!ctx.isCurrent()) return;
    App.updateNewsBadge(list);
    root.innerHTML = `
      <div class="page-head">
        <div>
          ${t('eyebrowAnnouncements') ? `<div class="page-head__eyebrow">${esc(t('eyebrowAnnouncements'))}</div>` : ''}
          <h1>Announcements</h1>
          <p>The latest news from all your courses.</p>
        </div>
      </div>
      <div class="card"><div class="card__body">
        ${list.length
          ? `<div class="discussion-list">${list.map((d) => App.ui.discussion(d, { showCourse: true, from: 'announcements' })).join('')}</div>`
          : emptyHTML(t('noAnnouncements'), t('noAnnouncementsText'))}
      </div></div>`;
  },
};
