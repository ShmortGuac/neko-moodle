# NEKO

<img src="build/icon.png" width="96" alt="NEKO">

NEKO is a Moodle Client for desktops with supports for themes and customizability.
It talks to Moodle through the same web services the official mobile app uses, so it works with any site that has
mobile app access enabled. Built with Electron.

## Run it

```
npm install
npm start
```

Pick or type your Moodle site, then **Sign in with browser** (SSO) or use a username and password.
The app gets a Moodle app token the same way the official app does, and stores it encrypted with the OS keychain.

## Features

- **Dashboard**: greeting, due-soon list, stats, recently visited courses
- **Courses**: search and current/past filter
- **Course page**: sections and activities, clickable links, per-file download, **Download all files** (skips files you already have)
- **Deadlines**: grouped into Overdue / Today / Tomorrow / This week / Later
- **Settings**: theme picker, theme options, theme editor, sign out
- Files are saved to `Downloads\NEKO\<course>\<section>\`

## The three layers

| Layer | Where | What it controls |
|---|---|---|
| **Theme packs** | `themes/<id>/` | Colours, fonts, artwork, decorations, wording |
| **Site profiles** | `sites/<id>.json` | One institution's quirks: quick-pick URLs, SSO button label, course-name and person-name parsing |
| **Core app** | `main.js`, `src/`, `renderer/` | Talking to Moodle, pages, downloads |

Built in: the neutral **Default** theme (Light / Dark). Make your own themes in the theme editor, or drop a
theme folder into `themes/`.

### Theme packs

A theme is data only, with no code: `theme.json`, an optional `theme.css`, and an `assets/` folder.
Files are served to the UI from `theme://<id>/...`, which can only read inside that theme's folder.
Themes control colours, fonts, corner radius, backgrounds, the login page layout, the loading screen,
the dashboard banner and its text, course card overlays, mascots and the About text.

Themes are made in the built-in **theme editor** (Settings → New theme / Edit theme): a separate window
with every option as a form field and a live preview of the real pages on sample data. The full format
is in [`themes/README.md`](themes/README.md).

### Site profiles

Optional per-site tweaks (name, logo, quick picks, sign-in label, course-name tidying) in `sites/<id>.json`.
See [`sites/README.md`](sites/README.md). Without a matching profile, NEKO uses plain Moodle names and labels.

## Developing

No build step: edit a file, then press `Ctrl+R` in the app to reload (restart `npm start` for `main.js` / `src/`).

```
main.js            Electron main process: window, IPC handlers
src/moodle.js      Moodle REST client (login/token.php, webservice/rest/server.php)
src/sso.js         SSO login via admin/tool/mobile/launch.php → moodlemobile://token=...
src/session.js     Encrypted token storage
src/downloads.js   File downloads
src/packs.js       Loads theme packs and site profiles, serves theme:// files
preload.js         Safe bridge exposed to the UI
renderer/js/       theme.js (theme engine), site.js (profiles), app.js (core), views/ (pages)
```

To add a feature, find the Moodle web service function you need
([list](https://docs.moodle.org/dev/Web_service_API_functions)) and call it from a view:

```js
const grades = await App.call('gradereport_overview_get_course_grades', {});
```

## Notes

- NEKO is unofficial and not affiliated with Moodle HQ or any institution.
- Be gentle with the server: the app only fetches when you open a page or press refresh.
