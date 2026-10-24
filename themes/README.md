# Making a theme

**The easy way:** Settings → **New theme** (or **Edit theme**) opens the theme editor, which has a live
preview with sample data, drag-to-place art, and everything below as form fields. This page is the
reference for what the editor writes, if you'd rather edit `theme.json` by hand.

Themes made in the editor are saved in your user folder (`%APPDATA%\NEKO\themes\<id>`).
Built-in themes live in the app's `themes/` folder; the built-in Default Light and Default Dark are
read-only, so "Customize" makes a copy.

A theme is a folder in `themes/` with a `theme.json`, an optional `theme.css`, and any images or fonts
it uses (usually in `assets/`). There's no code: themes are JSON, CSS and images only.

```
themes/my-theme/
  theme.json
  theme.css        optional extra CSS (e.g. a Google Fonts @import)
  assets/          images, GIFs, fonts
```

The folder name is the theme's id (lowercase letters, numbers, dashes). Paths like `"assets/pic.png"` are
relative to the theme folder. Press `Ctrl+R` in the app to reload after editing.

**Everything is optional.** Leave a setting out and the built-in default is used. One theme is one look:
a light and a dark version are two separate themes (like Default Light and Default Dark).

See `themes/default-light/theme.json` for a minimal theme, and the sections below for everything else.

> Older themes had a `variants` list (e.g. Light / Dark). Themes in your user folder are converted
> automatically: each variant becomes its own theme (`<id>-<variant>`), and the original folder is kept
> in `%APPDATA%\NEKO\themes-backup`.

---

## Theme info and About

```jsonc
"name": "My Theme",
"author": "You",
"version": "1.0.0",
"subtitle": "メイド",          // optional small text next to the name on the theme's card
"description": "One line shown on the Themes page",
"preview": "assets/preview.png",  // the picture on the theme's card
"swatches": ["#f3f4f9", "#4f5fe8", "#1f9e93"],  // the dots on the card
"about": "Shown in Settings → About this theme.\nNew lines and https:// links work.",
"aboutImage": "assets/me.png",
"links": [{ "label": "Homepage", "url": "https://example.com" }]
```

## Colours, fonts and corner radius: `tokens`

```jsonc
"tokens": {
  "bg": "#f3f4f9",            // page colour (also the title bar)
  "surface": "#ffffff",       // cards
  "surface-2": "#f6f7fb",     // rows inside cards
  "sidebar": "rgba(255,255,255,0.85)",
  "topbar": "#f3f4f9",        // optional: title-bar strip (solid colour)
  "text": "#1d2033", "text-muted": "#6b6f86",
  "primary": "#4f5fe8", "primary-2": "#7280f2", "primary-ink": "#ffffff",
  "accent": "#1f9e93", "accent-soft": "#dcf3f1", "purple": "#7c4ddb",
  "danger": "#d9415f", "warn": "#d9861f", "ok": "#1f9e6e",
  "border": "rgba(29,32,51,0.09)",
  "hero-from": "#5b6af0", "hero-to": "#7c4ddb", "hero-ink": "#ffffff",
  "shadow": "0 12px 30px -18px rgba(0,0,0,0.35)", "shadow-sm": "0 4px 14px -8px rgba(0,0,0,0.3)",
  "watermark": "rgba(255,255,255,0.5)", "stripe": "#5ccbf3", "star": "#3fbde9",

  "font": "\"Inter\", system-ui, sans-serif",
  "font-heading": "\"Playfair Display\", serif",   // titles; defaults to "font"

  "radius": "24px",          // containers: cards, sections, course cards
  "radius-sm": "16px",       // things inside them: rows, inputs, stats (small items scale from this)
  "radius-button": "999px",  // buttons, chips, filters (999px = pill)
  "radius-hero": "28px"      // dashboard + course banners; defaults to "radius"
}
```

Any CSS colour or gradient works. Set every `radius` to `"0px"` for a square look.

**Bundled fonts:**

```jsonc
"fonts": [{ "family": "My Font", "src": "assets/myfont.woff2", "weight": "400" }]
```

Or `@import` a Google Font at the top of `theme.css`.

## Backgrounds

A background can be any of:

```jsonc
"#102030"                                                   // solid
"linear-gradient(180deg, #102030, #304050)"                 // gradient
{ "image": "assets/bg.jpg", "size": "cover", "position": "center", "repeat": "no-repeat",
  "overlay": "rgba(0,0,0,0.3)", "color": "#102030" }        // image (+ optional overlay tint and base colour)
```

`"background"` at the top level is the whole app's background. The login page and dashboard banner
each have their own `background` (below).

## Decorations

```jsonc
"decorations": { "watermark": "BIG TEXT", "stripes": true, "stars": true },
"motif": "assets/logo.svg"
```

- **watermark:** huge faint text behind the app (colour: `watermark` token).
- **stripes:** diagonal stripes on the banner, course cards and window corners (colour: `stripe`).
- **stars:** floating stars (colour: `star`).
- **motif:** a single-colour SVG used as the logo tile and as watermarks on course cards and pages. It's
  recoloured automatically. A site's own logo (from its site profile) takes the logo tile's place.

## Elements (free placement)

The login page and the dashboard banner take a list of `elements`, each placed anywhere:

```jsonc
{ "type": "image", "src": "assets/girl.png",
  "x": 25, "y": 100,              // position, % of the area (or any CSS length: "40px", "calc(100% - 28px)")
  "align": "bottom",              // which point of the element sits at x/y:
                                  // top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right
  "width": 30, "height": 90,      // % or CSS length; give one to keep the aspect ratio
  "fit": "cover",                 // when both width and height are set
  "rotate": 0, "opacity": 1, "z": 2,
  "fade": "all",                  // soften edges: "all" | "sides"
  "dropShadow": "0 10px 18px rgba(0,0,0,0.2)",
  "animation": "rise" }           // none | rise | bob | float | pulse | spin

{ "type": "text", "text": "Hello!", "x": 5, "y": 12, "align": "top-left",
  "direction": "vertical",        // or "horizontal" (default)
  "size": 54, "weight": 900, "color": "#fff", "font": "Georgia, serif",
  "letterSpacing": 0.1, "shadow": "0 4px 0 #46c3f0", "textAlign": "center" }
```

Text elements on the dashboard banner can use the same `{placeholders}` as its title (below).

## Login page: `login`

```jsonc
"login": {
  "background": { "image": "assets/login-bg.jpg" },   // defaults to the app background
  "subtitle": "{site}",                                // {site} = the site's name once it responds
  "subtitleFallback": "Desktop client for Moodle",     // shown until then (or always, if no {site})
  "card":   { "x": 72, "y": 52, "width": 440, "background": "#fff", "color": "#222", "radius": "24px" },
  "button": { "background": "linear-gradient(135deg, #f48fdc, #ea5cc8)", "color": "#fff" },
  "badge":  { "image": "assets/chibi.png", "width": 130, "top": -92, "right": 14 },  // peeks over the card
  "elements": [ /* images and text, see above */ ]
}
```

The card's `x` / `y` is its centre, in % of the window.

## Loading screen: `loading`

```jsonc
"loading": {
  "spinner": { "color": "#ff66cc", "track": "#ffe0f5", "size": 44 },  // used when there's no image
  "image": "assets/loading.gif",     // replaces the spinner: PNG, GIF, animated WebP/SVG…
  "imageWidth": 170,
  "animation": "bob",                // none | bob | float | pulse | spin | rise
  "text": "Loading",                 // under the spinner
  "bootText": "Starting up", "courseText": "Opening course", "deadlinesText": "Checking your deadlines",
  "textColor": "#8a75a9"
}
```

## Dashboard banner: `hero`

```jsonc
"hero": {
  "background": "linear-gradient(120deg, #74d5f8, #3eb4ea)",  // or an image background
  "overlay": "linear-gradient(90deg, #3b1f4f 30%, transparent 78%)",  // over the background + z:0 elements
  "stripes": true,                 // only if decorations.stripes is on
  "textColor": "#fff",
  "textWidth": 54,                 // % of the banner the text may use (leave room for art)
  "eyebrow": "{eyebrow}",          // small line above the title ("" hides it)
  "title": "{greeting}, {name}!",
  "subtitle": {                    // or one string for every case
    "due": "You have {due_week} {due_week|thing|things} due this week{and_overdue}.",
    "overdueOnly": "There {overdue|is|are} {overdue} overdue",
    "clear": "Nothing due this week."
  },
  "elements": [ /* images and text, see above */ ]
}
```

**Placeholders:** `{name}` (given name), `{fullname}`, `{greeting}` (Good morning/afternoon/evening),
`{eyebrow}`, `{courses}`, `{due_week}`, `{due_today}`, `{overdue}`, `{and_overdue}` (" and 2 overdue" or
nothing), `{site}`.
**Plurals:** `{overdue|item|items}` picks the first word when the number is 1, otherwise the second.

Greetings and the eyebrow lines come from `strings` (`greetMorning`, `eyebrowMorning`, …).

## Course cards: `courseCard`

```jsonc
"courseCard": {
  "palette": [["#f7a6ea", "#e45cc6"], ["#8ddcfa", "#33aee6"]],  // cover gradients, picked per course
  "overlay": "assets/card-overlay.png",   // drawn over the course picture (replaces the default motif + stripe)
  "overlayFit": "cover",                  // cover | contain
  "overlayPosition": "center",
  "overlayOpacity": 1,                    // 0 = invisible, 1 = solid
  "imageBlend": "tint"                    // "tint" = course picture tinted into the palette, "normal" = as-is
}
```

Without an `overlay`, cards keep the default look.

## Sidebar, course banner, empty and error states

```jsonc
"sidebar": {
  "tagline": "my edition",               // small line under the site name
  "mascot": "assets/chibi.png",          // bottom of the sidebar (users can hide it)
  "mascotWidth": 150,
  "mascotLines": ["Hi!", "Don't forget your homework~"]   // speech bubbles when clicked
},
"courseBanner": { "mascots": ["assets/a.png", "assets/b.png"] },   // one per course page, picked per course
"states": { "empty": "assets/empty.png", "emptyWidth": 120, "error": "assets/error.png" }
```

## Other text: `strings`

```jsonc
"strings": {
  "greetMorning": "Good morning", "greetAfternoon": "Good afternoon", "greetEvening": "Good evening",
  "eyebrowMorning": "", "eyebrowAfternoon": "", "eyebrowEvening": "",
  "allCaughtUp": "All caught up!", "allCaughtUpText": "Nothing due right now.",
  "noCourses": "No courses here",
  "eyebrowCourses": "", "eyebrowDeadlines": "", "eyebrowSettings": "",   // small line above page titles
  "mascotName": "Mascot", "watermarkName": "Background text"             // labels for the Settings toggles
}
```

## Toggles in Settings: `options`

Each option becomes a switch in **Settings → Theme options**, next to the built-in mascot and
background-text switches. Users' choices are saved per theme.

```jsonc
"options": [
  {
    "id": "stars",                         // letters, numbers, dashes
    "label": "Floating stars",
    "description": "Little stars drifting in the background",
    "default": true,                       // optional, defaults to on
    "on":  { "decorations": { "stars": true } },    // settings applied while on
    "off": { "decorations": { "stars": false } }    // settings applied while off
  },
  {
    "id": "big-art", "label": "Bigger login art", "default": false,
    "on": { "login": { "elements": [ /* … */ ] } }
  }
]
```

`on` / `off` accept any part of the theme (tokens, strings, art, elements, backgrounds…), applied on
top of it; objects merge key by key, and lists (`elements`, `palette`…) replace the theme's list. While an option is on, the page has the class `opt-<id>`, so `theme.css`
can react too:

```css
.opt-compact .card__body { padding: 12px; }
```

## Theme card

`preview` is the picture on the theme's card in Settings and on the Themes page. Without one, the card
shows a gradient made from `swatches`.
