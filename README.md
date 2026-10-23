# Desktop client for Moodle

An unofficial, themeable desktop client for Moodle sites, built with Electron.
It talks to Moodle through the same web services the official mobile app uses, so it works with any site that has
mobile app access enabled.

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
- **Settings**: theme picker, decorations, sign out

## The three layers

| Layer | Where | What it controls |
|---|---|---|
| **Theme packs** | `themes/<id>/` | Colours, fonts, artwork, decorations, wording |
| **Site profiles** | `sites/<id>.json` | One institution's quirks: quick-pick URLs, SSO button label, course-name and person-name parsing |
| **Core app** | `main.js`, `src/`, `renderer/` | Talking to Moodle, pages, downloads |

Built in: the neutral **Default** theme (Light / Dark), the **Minato Aqua** theme (Maid Pink, Summer Aqua, Midnight,
Halloween) and the **IIUM i-Taleem** site profile.

### Theme packs

A theme is data only, with no code: `theme.json`, an optional `theme.css`, and an `assets/` folder.
Files are served to the UI from `theme://<id>/...`, which can only read inside that theme's folder.
Themes control colours, fonts, corner radius, backgrounds, the login page layout, the loading screen,
the dashboard banner and its text, course card overlays, mascots and the About text.

**The full format is in [`themes/README.md`](themes/README.md).**

### Site profiles

`sites/<id>.json` applies when the signed-in site's host is listed in `hosts`. See `sites/iium.json`.
Without a matching profile, the app uses plain Moodle names and labels.

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

- The Minato Aqua artwork in `themes/aqua/` and `reference/` belongs to its original artists. It's for personal use;
  leave it out of anything you publish.
- Be gentle with the server: the app only fetches when you open a page or press refresh.
