// The NEKO website, built to static files for GitHub Pages.
// A project site lives under /neko-moodle/, so every link and asset goes through import.meta.env.BASE_URL.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://shmortguac.github.io',
  base: '/neko-moodle/',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
});
