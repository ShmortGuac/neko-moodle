// Field controls for the theme editor. Every input carries data-bind="<path>" and data-kind="<how to parse>";
// Editor.onInput() reads them and writes the value into the theme.

const splitPath = (p) => String(p).split('.').filter(Boolean).map((k) => (/^\d+$/.test(k) ? Number(k) : k));

function getPath(obj, p) {
  return splitPath(p).reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function setPath(obj, p, value) {
  const keys = splitPath(p);
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] === null || typeof o[k] !== 'object') o[k] = typeof keys[i + 1] === 'number' ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

// Deletes a key and removes objects left empty above it, so theme.json stays tidy.
function deletePath(obj, p) {
  const keys = splitPath(p);
  const chain = [obj];
  for (const k of keys.slice(0, -1)) {
    const next = chain[chain.length - 1]?.[k];
    if (!next || typeof next !== 'object') return;
    chain.push(next);
  }
  delete chain[chain.length - 1][keys[keys.length - 1]];
  for (let i = chain.length - 1; i > 0; i--) {
    const node = chain[i];
    if (!Array.isArray(node) && Object.keys(node).length === 0) delete chain[i - 1][keys[i - 1]];
    else break;
  }
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const toHex6 = (v) => {
  if (!HEX.test(v || '')) return null;
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
};
const attr = (v) => esc(v ?? '');

const Fields = {
  // ---------- helpers ----------
  bind(path, kind) {
    return `data-bind="${attr(path)}" data-kind="${kind}"`;
  },

  wrap(def, inner) {
    return `
      <div class="ed-field" data-field="${attr(def.path)}">
        <div class="ed-field__head"><label>${esc(def.label)}</label></div>
        ${inner}
        ${def.hint ? `<div class="ed-hint">${esc(def.hint)}</div>` : ''}
      </div>`;
  },

  render(def) {
    const fn = Fields[`type_${def.type}`];
    return fn ? fn(def) : '';
  },

  value(def) {
    return Editor.valueOf(def.path);
  },

  // ---------- simple types ----------
  type_heading(def) {
    return `<div class="ed-heading">${esc(def.label)}${def.hint ? `<div class="ed-hint">${esc(def.hint)}</div>` : ''}</div>`;
  },

  type_text(def) {
    return Fields.wrap(def, `<input class="ed-input" ${Fields.bind(def.path, 'text')} value="${attr(Fields.value(def))}" placeholder="${attr(def.placeholder || Editor.defaultOf(def.path) || '')}" spellcheck="false">`);
  },

  type_textarea(def) {
    return Fields.wrap(def, `<textarea class="ed-input ed-textarea" ${Fields.bind(def.path, 'text')} rows="4">${esc(Fields.value(def) ?? '')}</textarea>`);
  },

  type_number(def) {
    const v = Fields.value(def);
    return Fields.wrap(def, `<input class="ed-input" type="number" ${Fields.bind(def.path, 'number')} value="${attr(v)}" placeholder="${attr(Editor.defaultOf(def.path))}"
      ${def.min !== undefined ? `min="${def.min}"` : ''} ${def.max !== undefined ? `max="${def.max}"` : ''} step="${def.step || 1}">`);
  },

  type_toggle(def) {
    const v = Fields.value(def);
    return Fields.wrap(def, `<label class="ed-switch"><input type="checkbox" ${Fields.bind(def.path, 'bool')} ${v ? 'checked' : ''}><i></i></label>`);
  },

  type_select(def) {
    const v = Fields.value(def) ?? Editor.defaultOf(def.path) ?? '';
    return Fields.wrap(def, `<select class="ed-input" ${Fields.bind(def.path, 'text')}>
      ${def.options.map((o) => `<option value="${attr(o)}" ${String(v) === String(o) ? 'selected' : ''}>${esc(o || '(none)')}</option>`).join('')}
    </select>`);
  },

  colorControl(path, value, { placeholder = '' } = {}) {
    return `
      <div class="ed-color">
        <button class="ed-color__swatch" data-action="color-pick" data-path="${attr(path)}" title="Pick a colour">
          <i style="background:${attr(value || placeholder || 'transparent')}"></i>
        </button>
        <input class="ed-input" ${Fields.bind(path, 'text')} value="${attr(value)}" placeholder="${attr(placeholder || 'default')}" spellcheck="false">
      </div>`;
  },

  type_color(def) {
    return Fields.wrap(def, Fields.colorControl(def.path, Fields.value(def), { placeholder: Editor.defaultOf(def.path) }));
  },

  type_length(def) {
    const v = Fields.value(def);
    const n = parseFloat(v);
    const max = def.max || 48;
    return Fields.wrap(def, `
      <div class="ed-length">
        <input type="range" min="0" max="${Math.min(max, 80)}" ${Fields.bind(def.path, 'px')} value="${Number.isFinite(n) ? Math.min(n, 80) : 0}">
        <input class="ed-input" ${Fields.bind(def.path, 'text')} value="${attr(v)}" placeholder="${attr(Editor.defaultOf(def.path) || 'default')}">
      </div>`);
  },

  // 0–1 value edited as a 0–100% slider
  type_opacity(def) {
    const v = Fields.value(def);
    const pct = v === undefined || v === null || v === '' ? 100 : Math.round(Number(v) * 100);
    return Fields.wrap(def, `
      <div class="ed-length ed-opacity">
        <input type="range" min="0" max="100" ${Fields.bind(def.path, 'pct')} value="${pct}">
        <label class="ed-cp__pct"><input class="ed-input" type="number" min="0" max="100" ${Fields.bind(def.path, 'pct')} value="${pct}">%</label>
      </div>`);
  },

  type_font(def) {
    return Fields.wrap(def, `<input class="ed-input" list="ed-fonts" ${Fields.bind(def.path, 'text')} value="${attr(Fields.value(def))}" placeholder="&quot;Segoe UI&quot;, system-ui, sans-serif" spellcheck="false">`);
  },

  type_lines(def) {
    const v = Fields.value(def);
    return Fields.wrap(def, `<textarea class="ed-input ed-textarea" ${Fields.bind(def.path, 'lines')} rows="5">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea>`);
  },

  // ---------- images ----------
  imageControl(path, value, { kind = 'image' } = {}) {
    const url = Editor.assetUrl(value);
    return `
      <div class="ed-image">
        <div class="ed-thumb">${url ? `<img src="${attr(url)}" alt="">` : '<span>none</span>'}</div>
        <div class="ed-image__side">
          <input class="ed-input" ${Fields.bind(path, 'text')} value="${attr(value)}" placeholder="assets/picture.png" spellcheck="false">
          <div class="ed-row">
            <button class="ed-btn ed-btn--sm" data-action="pick" data-path="${attr(path)}" data-asset="${kind}">Choose…</button>
            ${value ? `<button class="ed-btn ed-btn--sm ed-btn--ghost" data-action="clear" data-path="${attr(path)}">Remove</button>` : ''}
          </div>
        </div>
      </div>`;
  },

  type_image(def) {
    return Fields.wrap(def, Fields.imageControl(def.path, Fields.value(def)));
  },

  // The three dots on the theme's card in the picker.
  type_swatches(def) {
    const v = Fields.value(def) || [];
    return Fields.wrap(def, `<div class="ed-grid3">${[0, 1, 2].map((k) => Fields.colorControl(`${def.path}.${k}`, v[k])).join('')}</div>`);
  },

  // ---------- background ----------
  bgMode(v) {
    if (!v) return 'none';
    if (typeof v === 'string') return /gradient\(/.test(v) ? 'gradient' : 'solid';
    return 'image' in v ? 'image' : v.gradient ? 'gradient' : 'solid';
  },

  type_background(def) {
    const v = Fields.value(def);
    const mode = Fields.bgMode(v);
    const p = def.path;
    const modes = [['none', 'Default'], ['solid', 'Solid colour'], ['gradient', 'Gradient'], ['image', 'Image']];
    let body = '';
    if (mode === 'solid') body = Fields.colorControl(p, typeof v === 'string' ? v : v.color);
    if (mode === 'gradient') {
      const g = typeof v === 'string' ? v : v.gradient;
      body = `
        <div class="ed-gradient-preview" style="background:${attr(g)}"></div>
        <input class="ed-input" ${Fields.bind(p, 'text')} value="${attr(g)}" spellcheck="false">
        <div class="ed-row ed-row--wrap">
          ${['linear-gradient(135deg, #f7a6ea, #46c3f0)', 'linear-gradient(180deg, #1b1942, #3a3392)', 'linear-gradient(120deg, #fdfcfb, #e2d1c3)', 'radial-gradient(circle at 30% 20%, #ffd6e8, #c9e8ff)']
            .map((preset) => `<button class="ed-preset" data-action="set" data-path="${attr(p)}" data-value="${attr(preset)}" style="background:${attr(preset)}" title="${attr(preset)}"></button>`).join('')}
        </div>`;
    }
    if (mode === 'image') {
      body = `
        ${Fields.imageControl(`${p}.image`, v.image)}
        <div class="ed-grid2">
          <label class="ed-mini">Size
            <select class="ed-input" ${Fields.bind(`${p}.size`, 'text')}>
              ${['cover', 'contain', 'auto'].map((o) => `<option ${(v.size || 'cover') === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </label>
          <label class="ed-mini">Position <input class="ed-input" ${Fields.bind(`${p}.position`, 'text')} value="${attr(v.position)}" placeholder="center"></label>
        </div>
        <label class="ed-mini">Overlay tint ${Fields.colorControl(`${p}.overlay`, v.overlay, { placeholder: 'none' })}</label>
        <label class="ed-mini">Colour behind ${Fields.colorControl(`${p}.color`, v.color, { placeholder: 'none' })}</label>`;
    }
    return Fields.wrap(def, `
      <div class="ed-seg">
        ${modes.map(([m, label]) => `<button class="${m === mode ? 'is-on' : ''}" data-action="bg-mode" data-path="${attr(p)}" data-mode="${m}">${label}</button>`).join('')}
      </div>
      ${body}`);
  },

  // ---------- lists ----------
  listButtons(path, i, len) {
    return `
      <span class="ed-listbtns">
        <button class="ed-icon" data-action="list-move" data-path="${attr(path)}" data-index="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="ed-icon" data-action="list-move" data-path="${attr(path)}" data-index="${i}" data-dir="1" ${i === len - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="ed-icon" data-action="list-dup" data-path="${attr(path)}" data-index="${i}" title="Duplicate">⧉</button>
        <button class="ed-icon ed-icon--danger" data-action="list-del" data-path="${attr(path)}" data-index="${i}" title="Delete">✕</button>
      </span>`;
  },

  type_elements(def) {
    const list = Editor.valueOf(def.path) || [];
    const p = def.path;
    const len = (k, label, item, i) => `<label class="ed-mini">${label}<input class="ed-input" ${Fields.bind(`${p}.${i}.${k}`, 'len')} value="${attr(item[k])}"></label>`;
    const num = (k, label, item, i, step = 1) => `<label class="ed-mini">${label}<input class="ed-input" type="number" step="${step}" ${Fields.bind(`${p}.${i}.${k}`, 'number')} value="${attr(item[k])}"></label>`;
    const sel = (k, label, item, i, options) => `<label class="ed-mini">${label}<select class="ed-input" ${Fields.bind(`${p}.${i}.${k}`, 'text')}>${options.map((o) => `<option value="${attr(o)}" ${String(item[k] ?? '') === o ? 'selected' : ''}>${esc(o || 'none')}</option>`).join('')}</select></label>`;
    const txt = (k, label, item, i, ph = '') => `<label class="ed-mini">${label}<input class="ed-input" ${Fields.bind(`${p}.${i}.${k}`, 'text')} value="${attr(item[k])}" placeholder="${attr(ph)}"></label>`;
    const items = list.map((item, i) => {
      const selected = Editor.selected && Editor.selected.path === p && Editor.selected.index === i;
      const title = item.type === 'text' ? `Text · ${String(item.text || '').slice(0, 24)}` : `Image · ${String(item.src || '').split('/').pop() || 'no file'}`;
      const specific = item.type === 'text'
        ? `
          <label class="ed-mini ed-mini--full">Text<textarea class="ed-input ed-textarea" rows="2" ${Fields.bind(`${p}.${i}.text`, 'text')}>${esc(item.text ?? '')}</textarea></label>
          <div class="ed-grid3">
            ${sel('direction', 'Direction', item, i, ['', 'vertical'])}
            ${num('size', 'Size (px)', item, i)}
            ${txt('weight', 'Weight', item, i, '400–900')}
          </div>
          <label class="ed-mini">Colour ${Fields.colorControl(`${p}.${i}.color`, item.color, { placeholder: 'inherit' })}</label>
          <div class="ed-grid3">
            ${txt('font', 'Font', item, i)}
            ${num('letterSpacing', 'Spacing (em)', item, i, 0.01)}
            ${sel('textAlign', 'Align text', item, i, ['', 'left', 'center', 'right'])}
          </div>
          ${txt('shadow', 'Text shadow', item, i, '0 4px 0 #46c3f0')}`
        : `
          ${Fields.imageControl(`${p}.${i}.src`, item.src)}
          <div class="ed-grid3">
            ${sel('fit', 'Fit', item, i, ['', 'contain', 'cover'])}
            ${sel('fade', 'Fade edges', item, i, ['', 'all', 'sides'])}
            ${txt('dropShadow', 'Shadow', item, i, '0 10px 18px rgba(0,0,0,.2)')}
          </div>`;
      return `
        <details class="ed-item ${selected ? 'is-selected' : ''}" data-el-item="${i}" ${selected ? 'open' : ''}>
          <summary><span class="ed-item__title" data-action="select-el" data-path="${attr(p)}" data-index="${i}">${esc(title)}</span>${Fields.listButtons(p, i, list.length)}</summary>
          <div class="ed-item__body">
            ${specific}
            <div class="ed-grid3">
              ${len('x', 'X (%)', item, i)}
              ${len('y', 'Y (%)', item, i)}
              ${sel('align', 'Anchor', item, i, ALIGN_OPTIONS)}
            </div>
            <div class="ed-grid3">
              ${len('width', 'Width', item, i)}
              ${len('height', 'Height', item, i)}
              ${num('rotate', 'Rotate (°)', item, i)}
            </div>
            <div class="ed-grid3">
              ${num('opacity', 'Opacity', item, i, 0.05)}
              ${num('z', 'Layer (z)', item, i)}
              ${sel('animation', 'Animation', item, i, ANIMATIONS)}
            </div>
          </div>
        </details>`;
    }).join('');
    return Fields.wrap(def, `
      <div class="ed-list">${items || '<div class="ed-empty">No elements yet.</div>'}</div>
      <div class="ed-row">
        <button class="ed-btn ed-btn--sm" data-action="el-add" data-path="${attr(p)}" data-type="image">+ Image</button>
        <button class="ed-btn ed-btn--sm" data-action="el-add" data-path="${attr(p)}" data-type="text">+ Text</button>
      </div>
      <div class="ed-hint">X / Y and sizes are % of the area, or any CSS length like "40px". Drag elements in the preview to move them.</div>`);
  },

  type_imageList(def) {
    const list = Editor.valueOf(def.path) || [];
    return Fields.wrap(def, `
      <div class="ed-list">
        ${list.map((src, i) => `<div class="ed-item ed-item--flat">${Fields.imageControl(`${def.path}.${i}`, src)}${Fields.listButtons(def.path, i, list.length)}</div>`).join('') || '<div class="ed-empty">None.</div>'}
      </div>
      <button class="ed-btn ed-btn--sm" data-action="list-add-image" data-path="${attr(def.path)}">+ Add image</button>`);
  },

  type_palette(def) {
    const list = Editor.valueOf(def.path) || [];
    return Fields.wrap(def, `
      <div class="ed-list">
        ${list.map((pair, i) => `
          <div class="ed-item ed-item--flat ed-pair">
            <span class="ed-pair__preview" style="background:linear-gradient(135deg, ${attr(pair[0])}, ${attr(pair[1])})"></span>
            ${Fields.colorControl(`${def.path}.${i}.0`, pair[0])}
            ${Fields.colorControl(`${def.path}.${i}.1`, pair[1])}
            ${Fields.listButtons(def.path, i, list.length)}
          </div>`).join('') || '<div class="ed-empty">Using the default colours.</div>'}
      </div>
      <button class="ed-btn ed-btn--sm" data-action="list-add" data-path="${attr(def.path)}" data-item='${attr(JSON.stringify(['#8ddcfa', '#33aee6']))}'>+ Add colour pair</button>`);
  },

  type_links(def) {
    const list = Editor.valueOf(def.path) || [];
    return Fields.wrap(def, `
      <div class="ed-list">
        ${list.map((l, i) => `
          <div class="ed-item ed-item--flat ed-grid2">
            <input class="ed-input" ${Fields.bind(`${def.path}.${i}.label`, 'text')} value="${attr(l.label)}" placeholder="Label">
            <input class="ed-input" ${Fields.bind(`${def.path}.${i}.url`, 'text')} value="${attr(l.url)}" placeholder="https://">
            ${Fields.listButtons(def.path, i, list.length)}
          </div>`).join('')}
      </div>
      <button class="ed-btn ed-btn--sm" data-action="list-add" data-path="${attr(def.path)}" data-item='${attr(JSON.stringify({ label: 'Homepage', url: 'https://' }))}'>+ Add link</button>`);
  },

  type_fonts(def) {
    const list = Editor.valueOf(def.path) || [];
    return Fields.wrap(def, `
      <div class="ed-list">
        ${list.map((f, i) => `
          <div class="ed-item ed-item--flat">
            <div class="ed-grid3">
              <label class="ed-mini">Family<input class="ed-input" ${Fields.bind(`${def.path}.${i}.family`, 'text')} value="${attr(f.family)}"></label>
              <label class="ed-mini">Weight<input class="ed-input" ${Fields.bind(`${def.path}.${i}.weight`, 'text')} value="${attr(f.weight)}" placeholder="400"></label>
              <label class="ed-mini">Style<input class="ed-input" ${Fields.bind(`${def.path}.${i}.style`, 'text')} value="${attr(f.style)}" placeholder="normal"></label>
            </div>
            <div class="ed-hint">${esc(f.src || '')}</div>
            ${Fields.listButtons(def.path, i, list.length)}
          </div>`).join('')}
      </div>
      <button class="ed-btn ed-btn--sm" data-action="add-font" data-path="${attr(def.path)}">+ Add font file…</button>`);
  },

  type_options(def) {
    const list = Editor.valueOf(def.path) || [];
    const json = (v) => esc(v ? JSON.stringify(v, null, 2) : '');
    return Fields.wrap(def, `
      <div class="ed-list">
        ${list.map((o, i) => `
          <details class="ed-item" ${Editor.openItems.has(`opt-${i}`) ? 'open' : ''} data-open-key="opt-${i}">
            <summary><span class="ed-item__title">${esc(o.label || o.id || 'Option')}</span>${Fields.listButtons(def.path, i, list.length)}</summary>
            <div class="ed-item__body">
              <div class="ed-grid2">
                <label class="ed-mini">Id<input class="ed-input" ${Fields.bind(`${def.path}.${i}.id`, 'text')} value="${attr(o.id)}" placeholder="my-option"></label>
                <label class="ed-mini">Label<input class="ed-input" ${Fields.bind(`${def.path}.${i}.label`, 'text')} value="${attr(o.label)}"></label>
              </div>
              <label class="ed-mini ed-mini--full">Description<input class="ed-input" ${Fields.bind(`${def.path}.${i}.description`, 'text')} value="${attr(o.description)}"></label>
              <div class="ed-row">
                <label class="ed-check"><input type="checkbox" ${Fields.bind(`${def.path}.${i}.default`, 'boolDefaultOn')} ${o.default !== false ? 'checked' : ''}> On by default</label>
                <label class="ed-check"><input type="checkbox" data-action="opt-preview" data-id="${attr(o.id)}" ${Editor.optionPreview(o) ? 'checked' : ''}> On in preview</label>
              </div>
              <label class="ed-mini ed-mini--full">When on (JSON)<textarea class="ed-input ed-code" rows="4" ${Fields.bind(`${def.path}.${i}.on`, 'json')} placeholder='{ "decorations": { "stars": true } }'>${json(o.on)}</textarea></label>
              <label class="ed-mini ed-mini--full">When off (JSON)<textarea class="ed-input ed-code" rows="3" ${Fields.bind(`${def.path}.${i}.off`, 'json')}>${json(o.off)}</textarea></label>
            </div>
          </details>`).join('') || '<div class="ed-empty">No toggles yet.</div>'}
      </div>
      <button class="ed-btn ed-btn--sm" data-action="list-add" data-path="${attr(def.path)}" data-item='${attr(JSON.stringify({ id: 'my-option', label: 'My option', description: '', on: {}, off: {} }))}'>+ Add toggle</button>`);
  },
};
