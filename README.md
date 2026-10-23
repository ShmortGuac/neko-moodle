# i-Taleem Desktop · あくあ edition ⚓

An unofficial, Minato Aqua themed desktop client for IIUM's i-Taleem (Moodle), built with Electron.
Not affiliated with IIUM or hololive.

## Run it

```
npm install
npm start
```

Click **Sign in with IIUM account**. A window opens IIUM's normal CAS login page, and once you're in, the app receives a
Moodle app token, the same way the official Moodle mobile app does. The token is encrypted with Windows' DPAPI and remembered.

## Features

- **Dashboard**: greeting, due-soon list, stats, recently visited courses
- **Courses**: search and current/past filter
- **Course page**: sections and activities, per-file download, **Download all files** (skips files you already have)
- **Deadlines**: grouped into Overdue / Today / Tomorrow / This week / Later; click one to open it on i-Taleem
- **Settings**: 4 themes (Maid Pink, Summer Aqua, Midnight, Halloween), toggle the chibi and kana background, sign out
- Files are saved to `Downloads\i-Taleem\<course>\<section>\`

## Customising

| What | Where |
|---|---|
| Colours of each theme | `renderer/styles/theme.css` |
| Which art each theme uses, new themes | `THEMES` in `renderer/js/app.js` |
| Things chibi Aqua says when clicked | `MASCOT_LINES` in `renderer/js/app.js` |
| Site quick-picks on the login screen | `SITE_PRESETS` in `renderer/js/app.js` |
| Layout and components | `renderer/styles/app.css` |
| Each page | `renderer/js/views/*.js` |
| Activity icons | `MOD_ICONS` in `renderer/js/views/course.js` |

No build step: edit a file, then press `Ctrl+R` in the app to reload (or restart `npm start` for files outside `renderer/`).

## How it works

```
main.js            Electron main process: window, IPC handlers
src/moodle.js      Moodle REST client (login/token.php, webservice/rest/server.php)
src/sso.js         CAS/SSO login via admin/tool/mobile/launch.php → moodlemobile://token=...
src/session.js     Encrypted token storage
src/downloads.js   File downloads
preload.js         Safe bridge exposed to the UI
renderer/          The UI (plain HTML/CSS/JS)
```

To add a feature, find the Moodle web service function you need
([list](https://docs.moodle.org/dev/Web_service_API_functions)) and call it from a view:

```js
const grades = await App.call('gradereport_overview_get_course_grades', {});
```

## Notes

- The Aqua artwork in `renderer/assets/` belongs to its original artists. Keep this for personal use, and ask the artists before publishing.
- Be gentle with the server: the app only fetches when you open a page or press refresh.
