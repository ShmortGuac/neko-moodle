# Roadmap

Where NEKO is heading. Tick items off as they ship, and move them between sections as plans change.

**Status:** `[ ]` planned · `[~]` in progress · `[x]` done

---

## Done

- [x] **0.1.0**: sign in (password or browser/SSO), dashboard, courses, files, pages and books, forums and
      announcements, assignments with submitting, deadlines, in-app Moodle window, themes and the theme editor,
      Windows installer and portable build
- [x] **0.1.1**: choose the download folder; import themes; open the themes folder
- [x] **0.1.2**: PDF viewer, lessons, theme export, update checks with What's new, theme editor guides and grid

---

## 0.2: Stay in the loop (notifications and background)

NEKO only knows about new things while it's open. This release lets it keep watch in the background and tell you.

- [ ] **Tray icon**: closing the window hides NEKO to the system tray instead of quitting (Settings toggle).
      The tray menu has Open, Check now, Pause notifications, Quit.
- [ ] **Open on startup**: Settings toggle to start NEKO when you sign in to Windows
      (`app.setLoginItemSettings`), optionally straight to the tray.
- [ ] **Background check**: every N minutes (default 15, adjustable), fetch announcements, forum
      discussions, assignments and upcoming events, then compare them with what was seen last time (kept in
      `userData`).
- [ ] **System notifications** (Windows toasts, `Notification` with `app.setAppUserModelId`):
  - [ ] New announcement (course + title; click opens it in NEKO)
  - [ ] New assignment or quiz added to a course
  - [ ] Deadline reminders: e.g. 1 day and 1 hour before (times adjustable), skipped if already submitted
  - [ ] Assignment graded or feedback given
  - [ ] Replies in discussions you posted in
- [ ] **Notification settings**: one switch per type, quiet hours, per-course mute
- [ ] **Badge count** on the taskbar icon (`win.setOverlayIcon`) for unread announcements and overdue work
- [ ] Notification history panel in the app (the bell), so a missed toast isn't lost

Notes: polling uses the same web-service calls the app already makes, so nothing extra is needed on the
Moodle side. Keep checks light (only changed courses, back off when offline or the token expires).

---

## 0.3: More of Moodle inside NEKO

- [~] **Lessons**: overview (status, grade, deadline, attempts), content pages, questions (Moodle's own form,
      sent back as Moodle would), feedback with Try again, time limits, end-of-lesson summary. Pages NEKO can't
      read hand over to the website at the same page. Not yet tried on a real lesson attempt.
- [ ] **Quizzes, stage 1**: quiz page with details, your attempts, best grade, feedback and read-only review;
      **Start attempt** still opens Moodle's own quiz page
- [ ] **Quizzes, stage 2**: taking quizzes in NEKO for common question types, with the website as the fallback for
      other types and for quizzes needing Safe Exam Browser, a secure window or campus-only access
- [ ] **Grades**: per-course grade report and an overview across courses (`gradereport_user_*`,
      `gradereport_overview_*`)
- [ ] **Calendar view**: month and week views of all events, not just upcoming deadlines
- [ ] **Messages**: Moodle's private messages and notifications (`core_message_*`)
- [ ] **Search**: one search box across courses, activities, files and forum posts
- [ ] **Course participants and profiles**
- [ ] **Other activities** that often show up: choices/polls, feedback, glossary, lessons, URL resources

---

## 0.4: Integrations with other apps

- [ ] **Calendar sync**: export deadlines as an `.ics` file, or a live subscription link for Google
      Calendar, Outlook and Apple Calendar (using Moodle's calendar export, so it updates on its own)
- [ ] **To-do apps**: send assignments to Microsoft To Do, Todoist or Google Tasks (due date, link back)
- [ ] **Discord Rich Presence** (optional): "Studying <course>" while NEKO is open
- [ ] **Notes apps**: "Copy as Markdown" for pages, books and forum posts, and export to Obsidian/Notion
- [ ] **Cloud folders**: point the download folder at OneDrive / Google Drive / Dropbox (works already
      with 0.1.1; add a "sync this course" option that keeps its files up to date)
- [ ] **Open files with**: choose which app opens which file type (e.g. PDFs in a specific reader)
- [ ] **Deep links**: `neko://` links that open a course, assignment or post in NEKO (for sharing and for
      the integrations above)

Integrations are off until switched on, and each says exactly what it sends where.

---

## Quality of life

- [x] **Update checks** from GitHub Releases, with "What's new" (release notes) and one-click download and install
- [ ] Silent background updates (`electron-updater`, needs code signing to be smooth)
- [ ] **Offline mode**: cache course contents, pages and downloaded files so they open without internet
- [ ] **Keyboard shortcuts** (Ctrl+K command palette, Ctrl+1–9 for pages) and a shortcut list
- [ ] **Multiple accounts / sites** and quick switching
- [ ] **Sync all courses**: download new files from every course on a schedule
- [ ] **Accessibility**: screen-reader labels, focus outlines, reduced motion, larger text option
- [ ] **Languages**: move UI text into translation files

## Themes

- [ ] **Theme gallery**: browse and install community themes from inside NEKO
- [x] **Export theme**: one-click `.zip` of a theme for sharing (the other half of Import)
- [ ] **Follow Windows**: switch between a light and a dark theme with the system setting
- [ ] Per-course colours or banners

## Distribution

- [ ] **Code signing**, so Windows SmartScreen stops warning
- [ ] **macOS and Linux builds**
- [ ] Listing on winget / Microsoft Store

---

## Ideas (not planned yet)

- Study timer (Pomodoro) that logs time per course
- Weekly summary: what's due, what's new, what you finished
- Widgets: small always-on-top deadline list
- Mobile companion that shares themes

Add ideas here, and move them into a release when they're picked up.
