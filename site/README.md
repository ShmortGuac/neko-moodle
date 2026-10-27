# NEKO website

The landing page for NEKO, built with [Astro](https://astro.build) into static files for GitHub Pages.
It is separate from the app: nothing in this folder is packaged into NEKO.

```
cd site
npm install
npm run dev       # live preview at http://localhost:4321/neko-moodle/
npm run build     # static site in site/dist
npm run preview   # serve the built site
```

- `src/pages/index.astro`: the page (sections, features, FAQ) and the script that points Download at the newest release
- `src/components/AppMock.astro`: the live mock of NEKO's dashboard and its theme buttons
- `src/layouts/Base.astro`: head tags, colours (light and dark) and base styles
- `public/`: icon and favicon

The site is served from `/neko-moodle/` (see `base` in `astro.config.mjs`), so links and assets use
`import.meta.env.BASE_URL`.

## SEO

- `@astrojs/sitemap` writes `sitemap-index.xml` on build; the page links to it.
- `public/og.png` (1200×630) is the link preview for WhatsApp, Discord, X and so on.
- `src/layouts/Base.astro` has the meta tags and the `SoftwareApplication` structured data.
- `public/robots.txt` only takes effect on a custom domain (crawlers read it at a domain's root). Update its
  Sitemap line and `site`/`base` in `astro.config.mjs` when the site moves to one.
