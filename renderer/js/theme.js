// Theme engine: loads theme packs, merges core defaults + pack + variant into Theme.cfg,
// turns colours/backgrounds/radii into CSS variables and renders theme elements and text templates.
// The full format is documented in themes/README.md.

// What every theme starts from. Packs and variants override any part of it.
const THEME_DEFAULTS = {
  tokens: {},
  background: null,
  decorations: { watermark: '', stripes: false, stars: false },
  motif: null,
  fonts: [],
  strings: {
    greetMorning: 'Good morning',
    greetAfternoon: 'Good afternoon',
    greetEvening: 'Good evening',
    eyebrowMorning: '',
    eyebrowAfternoon: '',
    eyebrowEvening: '',
    allCaughtUp: 'All caught up!',
    allCaughtUpText: 'Nothing due right now.',
    noCourses: 'No courses here',
    eyebrowCourses: '',
    eyebrowDeadlines: '',
    eyebrowSettings: '',
    mascotName: 'Mascot',
    watermarkName: 'Background text',
  },
  sidebar: { tagline: '', mascot: null, mascotWidth: 150, mascotLines: [] },
  login: {
    background: null,
    // {site} = the site's own name once it responds; subtitleFallback is shown until then.
    subtitle: '{site}',
    subtitleFallback: 'Desktop client for Moodle',
    card: { x: 50, y: 50, width: 440 },
    button: {},
    badge: { image: null, width: 130, top: -92, right: 14 },
    elements: [],
  },
  loading: {
    image: null,
    imageWidth: 170,
    animation: 'bob',
    spinner: { size: 44, color: null, track: null },
    text: 'Loading',
    bootText: 'Starting up',
    courseText: 'Opening course',
    deadlinesText: 'Checking your deadlines',
    textColor: null,
  },
  hero: {
    background: null,
    overlay: null,
    stripes: true,
    textColor: null,
    textWidth: null,
    eyebrow: '{eyebrow}',
    title: '{greeting}, {name}!',
    subtitle: {
      due: 'You have {due_week} {due_week|thing|things} due this week{and_overdue}.',
      overdueOnly: 'Nothing new this week, but {overdue} overdue {overdue|item|items} need attention.',
      clear: 'Nothing due this week.',
    },
    elements: [],
  },
  courseCard: { overlay: null, overlayFit: 'cover', overlayPosition: 'center', overlayOpacity: 1, imageBlend: 'tint', palette: [] },
  courseBanner: { mascots: [] },
  states: { empty: null, emptyWidth: 120, error: null },
  about: '',
  aboutImage: null,
  links: [],
  options: [],
};

const OPTION_ID = /^[a-z0-9][a-z0-9-]*$/i;
const ASSET_PATH = /\.(png|jpe?g|gif|webp|svg|avif|apng|woff2?|ttf|otf)$/i;
// Which point of an element sits at its x/y. Values are the translate() offsets in %.
const ALIGN = {
  'top-left': [0, 0], top: [-50, 0], 'top-right': [-100, 0],
  left: [0, -50], center: [-50, -50], right: [-100, -50],
  'bottom-left': [0, -100], bottom: [-50, -100], 'bottom-right': [-100, -100],
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Objects merge key by key; arrays and plain values replace.
function deepMerge(...layers) {
  const out = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer || {})) {
      out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
    }
  }
  return out;
}

const Theme = {
  packs: [],
  pack: null,
  variant: null,
  cfg: deepMerge(THEME_DEFAULTS),
  options: [],
  // Set by the theme editor: don't touch the startup cache, and use unsaved CSS instead of theme.css.
  editorMode: false,
  draftCss: null,

  async load() {
    Theme.packs = await italeem.listThemes();
  },

  find(packId, variantId) {
    const pack = Theme.packs.find((p) => p.id === packId) || Theme.packs.find((p) => p.id === 'default') || Theme.packs[0];
    const variant = pack.variants.find((v) => v.id === variantId) || pack.variants[0];
    return { pack, variant };
  },

  // "assets/x.png" inside a pack -> theme://<pack>/assets/x.png
  url(pack, file) {
    return `theme://${pack.id}/${String(file).replace(/^\.?\//, '')}`;
  },

  // Rewrites every relative asset path anywhere in the config to a theme:// URL.
  resolveAssets(pack, value) {
    if (Array.isArray(value)) return value.map((v) => Theme.resolveAssets(pack, v));
    if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Theme.resolveAssets(pack, v)]));
    if (typeof value === 'string' && ASSET_PATH.test(value) && !/^(https?:|data:|theme:)/i.test(value)) return Theme.url(pack, value);
    return value;
  },

  // optionValues: the user's saved toggles for this pack, { [optionId]: true/false }.
  apply(packId, variantId, optionValues = {}) {
    const { pack, variant } = Theme.find(packId, variantId);
    const { variants, id, hasCss, ...packCfg } = pack;
    const { id: _v, name: _n, subtitle: _s, preview: _p, swatches: _w, ...variantCfg } = variant;
    Theme.pack = pack;
    Theme.variant = variant;

    // Theme options are toggles that layer extra settings on top ("on" / "off").
    let merged = deepMerge(THEME_DEFAULTS, packCfg, variantCfg);
    const options = (merged.options || []).filter((o) => o && OPTION_ID.test(o.id || ''));
    Theme.options = options.map((o) => ({ ...o, value: optionValues[o.id] ?? o.default !== false }));
    for (const o of Theme.options) {
      const { options: _ignored, ...layer } = (o.value ? o.on : o.off) || {};
      merged = deepMerge(merged, layer);
    }
    Theme.cfg = Theme.resolveAssets(pack, merged);
    const cfg = Theme.cfg;

    const vars = { ...cfg.tokens };
    const setVar = (name, value) => { if (value !== null && value !== undefined && value !== '') vars[name] = value; };
    setVar('motif', cfg.motif && `url("${cfg.motif}")`);
    setVar('app-bg', backgroundCss(cfg.background));
    setVar('login-bg', backgroundCss(cfg.login.background));
    setVar('login-card-bg', cfg.login.card.background);
    setVar('login-card-ink', cfg.login.card.color);
    setVar('login-card-radius', cfg.login.card.radius);
    setVar('login-btn-bg', cfg.login.button.background);
    setVar('login-btn-ink', cfg.login.button.color);
    setVar('hero-bg', backgroundCss(cfg.hero.background));
    setVar('hero-overlay', cfg.hero.overlay);
    setVar('hero-ink', cfg.hero.textColor);
    setVar('spinner', cfg.loading.spinner.color);
    setVar('spinner-track', cfg.loading.spinner.track);
    setVar('loading-ink', cfg.loading.textColor);
    if (cfg.courseCard.imageBlend === 'normal') {
      setVar('cover-img-blend', 'normal');
      setVar('cover-img-opacity', '1');
    }

    const palette = cfg.courseCard.palette.length ? cfg.courseCard.palette : (cfg.coverPalette || []);
    Theme.paletteSize = palette.length || 1;
    const fontFaces = (cfg.fonts || []).map((f) => `@font-face{font-family:${JSON.stringify(f.family)};src:url("${f.src}");font-weight:${f.weight || 'normal'};font-style:${f.style || 'normal'};font-display:swap;}`);
    const css = [
      ...fontFaces,
      `:root{${Object.entries(vars).map(([k, v]) => `--${k}:${v};`).join('')}}`,
      ...palette.map(([a, b], i) => `.pal-${i}{--c1:${a};--c2:${b};}`),
    ].join('\n');
    Theme.setTokens(css);
    if (!Theme.editorMode) {
      try {
        localStorage.setItem('themeCache', css);
      } catch {
        // only used to avoid a colour flash on the next launch
      }
    }

    let link = document.getElementById('theme-css');
    if (Theme.draftCss !== null) {
      link?.remove();
      let style = document.getElementById('theme-draft-css');
      if (!style) {
        style = document.createElement('style');
        style.id = 'theme-draft-css';
        document.head.append(style);
      }
      style.textContent = Theme.draftCss;
    } else if (hasCss) {
      if (!link) {
        link = document.createElement('link');
        link.id = 'theme-css';
        link.rel = 'stylesheet';
        document.head.append(link);
      }
      const href = Theme.url(pack, 'theme.css');
      if (link.getAttribute('href') !== href) link.href = href;
    } else {
      link?.remove();
    }

    const root = document.documentElement;
    root.dataset.theme = pack.id;
    root.dataset.variant = variant.id;
    root.classList.toggle('has-motif', Boolean(cfg.motif));
    // opt-<id> classes let theme.css react to options
    [...root.classList].filter((c) => c.startsWith('opt-')).forEach((c) => root.classList.remove(c));
    Theme.options.filter((o) => o.value).forEach((o) => root.classList.add(`opt-${o.id}`));
  },

  setTokens(css) {
    let style = document.getElementById('theme-tokens');
    if (!style) {
      style = document.createElement('style');
      style.id = 'theme-tokens';
      document.head.append(style);
    }
    style.textContent = css;
  },

  // Re-applies the last theme's colours instantly at startup, before packs finish loading.
  restoreCache() {
    try {
      const css = localStorage.getItem('themeCache');
      if (css) Theme.setTokens(css);
    } catch {
      // first launch
    }
  },
};

// background: "#hex" | "linear-gradient(...)" | { color, gradient, image, size, position, repeat, overlay }
function backgroundCss(bg) {
  if (!bg) return null;
  if (typeof bg === 'string') return bg;
  const layers = [];
  if (bg.overlay) layers.push(/gradient\(/.test(bg.overlay) ? bg.overlay : `linear-gradient(${bg.overlay}, ${bg.overlay})`);
  if (bg.image) layers.push(`url("${bg.image}") ${bg.position || 'center'} / ${bg.size || 'cover'} ${bg.repeat || 'no-repeat'}`);
  if (bg.gradient) layers.push(bg.gradient);
  if (bg.color) layers.push(bg.color);
  return layers.join(', ') || null;
}

// Theme text lookup: t('noCourses').
function t(key) {
  return Theme.cfg.strings[key] ?? THEME_DEFAULTS.strings[key] ?? key;
}

// Fills "{name}" and plural forms "{overdue|item|items}" from vars.
function fill(template, vars = {}) {
  return String(template ?? '').replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_, key, one, many) => {
    if (one !== undefined) return Number(vars[key]) === 1 ? one : many;
    return vars[key] ?? '';
  });
}

const cssLen = (v, unit = '%') => (typeof v === 'number' ? `${v}${unit}` : v);

// Renders theme elements: [{ type: "image" | "text", x, y, width, height, align, rotate, ... }].
// x / y / width / height are % of the container (numbers) or any CSS length (strings).
function elementsHTML(list = [], vars = {}) {
  return list.map((el, i) => {
    const [ax, ay] = ALIGN[el.align] || ALIGN.center;
    const style = [
      el.x !== undefined && `left:${cssLen(el.x)}`,
      el.y !== undefined && `top:${cssLen(el.y)}`,
      el.width !== undefined && `width:${cssLen(el.width)}`,
      el.height !== undefined && `height:${cssLen(el.height)}`,
      `transform:translate(${ax}%, ${ay}%) rotate(${Number(el.rotate) || 0}deg)`,
      el.opacity !== undefined && `opacity:${el.opacity}`,
      `z-index:${el.z ?? 2}`,
    ];
    const anim = el.animation && el.animation !== 'none' ? `anim-${el.animation}` : '';
    if (el.type === 'text') {
      style.push(
        el.size !== undefined && `font-size:${cssLen(el.size, 'px')}`,
        el.color && `color:${el.color}`,
        el.weight && `font-weight:${el.weight}`,
        el.font && `font-family:${el.font}`,
        el.shadow && `text-shadow:${el.shadow}`,
        el.letterSpacing !== undefined && `letter-spacing:${cssLen(el.letterSpacing, 'em')}`,
        el.direction === 'vertical' && 'writing-mode:vertical-rl',
        el.textAlign && `text-align:${el.textAlign}`,
      );
      return `<div class="el el--text ${anim}" data-el="${i}" style="${esc(style.filter(Boolean).join(';'))}">${esc(fill(el.text, vars))}</div>`;
    }
    const sized = el.width !== undefined && el.height !== undefined ? 'el--wh' : el.height !== undefined ? 'el--h' : 'el--w';
    const imgStyle = [el.fit && `object-fit:${el.fit}`, el.dropShadow && `filter:drop-shadow(${el.dropShadow})`].filter(Boolean).join(';');
    return `<div class="el el--image ${sized} ${el.fade ? `el--fade-${el.fade}` : ''}" data-el="${i}" style="${esc(style.filter(Boolean).join(';'))}">`
      + `<img class="${anim}" src="${esc(el.src)}" alt="" style="${esc(imgStyle)}"></div>`;
  }).join('');
}

// The theme's motif (e.g. Aqua's anchor) as an element coloured by currentColor; hidden when the theme has none.
const motifHTML = (cls = '') => `<span class="motif ${cls}"></span>`;
