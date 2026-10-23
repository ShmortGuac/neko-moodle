// Colour picker with an alpha channel: saturation/brightness square, hue and alpha sliders, a text box,
// an eyedropper and the theme's own colours as swatches. Values come out as #rrggbb, or rgba() when see-through.

const ColorPicker = {
  el: null,
  hsv: { h: 0, s: 0, v: 0, a: 1 },
  onChange: null,

  // Any CSS colour (hex, rgb[a], hsl, names) -> { r, g, b, a }, or null for gradients and other values.
  parse(value) {
    const str = String(value || '').trim();
    if (!str || /gradient\(|var\(|url\(/i.test(str)) return null;
    const ctx = ColorPicker.ctx || (ColorPicker.ctx = document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#010203';
    ctx.fillStyle = str;
    const out = ctx.fillStyle;
    if (out === '#010203' && str.toLowerCase() !== '#010203') return null;
    if (out.startsWith('#')) return { r: parseInt(out.slice(1, 3), 16), g: parseInt(out.slice(3, 5), 16), b: parseInt(out.slice(5, 7), 16), a: 1 };
    const [r, g, b, a = 1] = out.match(/[\d.]+/g).map(Number);
    return { r, g, b, a };
  },

  format({ r, g, b, a }) {
    const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
    return a >= 0.995 ? `#${hex(r)}${hex(g)}${hex(b)}` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 100) / 100})`;
  },

  toHsv({ r, g, b, a }) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B);
    const d = max - Math.min(R, G, B);
    let h = 0;
    if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max, a };
  },

  toRgb({ h, s, v, a }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
    };
    return { r: f(5), g: f(3), b: f(1), a };
  },

  // Distinct solid colours from the current variant, offered as swatches.
  themeSwatches() {
    const tokens = { ...(Editor.layers().packCfg.tokens || {}), ...(Editor.layers().variantCfg.tokens || {}) };
    const seen = new Set();
    return Object.values(tokens).map(ColorPicker.parse).filter(Boolean).map(ColorPicker.format)
      .filter((c) => !seen.has(c) && seen.add(c)).slice(0, 16);
  },

  open(anchor, value, onChange) {
    ColorPicker.close();
    ColorPicker.anchor = anchor;
    ColorPicker.onChange = onChange;
    ColorPicker.hsv = ColorPicker.toHsv(ColorPicker.parse(value) || { r: 0, g: 0, b: 0, a: 1 });
    const el = document.createElement('div');
    el.className = 'ed-cp';
    el.innerHTML = `
      <div class="ed-cp__sv" data-drag="sv"><span class="ed-cp__dot"></span></div>
      <div class="ed-cp__mid">
        ${'EyeDropper' in window ? '<button class="ed-icon ed-cp__pick" data-cp="eyedropper" title="Pick from screen">⌖</button>' : ''}
        <div class="ed-cp__sliders">
          <div class="ed-cp__hue" data-drag="hue"><span class="ed-cp__knob"></span></div>
          <div class="ed-cp__alpha" data-drag="alpha"><i></i><span class="ed-cp__knob"></span></div>
        </div>
        <span class="ed-cp__preview"><i></i></span>
      </div>
      <div class="ed-cp__inputs">
        <input class="ed-input" data-cp="text" spellcheck="false">
        <label class="ed-cp__pct"><input class="ed-input" data-cp="alpha" type="number" min="0" max="100">%</label>
      </div>
      <div class="ed-cp__swatches">${ColorPicker.themeSwatches().map((c) => `<button class="ed-cp__sw" data-cp="swatch" data-color="${esc(c)}" title="${esc(c)}"><i style="background:${esc(c)}"></i></button>`).join('')}</div>`;
    document.body.append(el);
    ColorPicker.el = el;

    const r = anchor.getBoundingClientRect();
    const w = 248;
    el.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left))}px`;
    el.style.top = `${r.bottom + 6 + 330 > window.innerHeight ? Math.max(8, r.top - 330 - 6) : r.bottom + 6}px`;

    el.addEventListener('pointerdown', ColorPicker.onPointerDown);
    el.addEventListener('input', ColorPicker.onInput);
    el.addEventListener('click', ColorPicker.onClick);
    setTimeout(() => {
      document.addEventListener('pointerdown', ColorPicker.onOutside, true);
      document.addEventListener('keydown', ColorPicker.onKey, true);
    });
    ColorPicker.paint(true);
  },

  close() {
    if (!ColorPicker.el) return;
    ColorPicker.el.remove();
    ColorPicker.el = null;
    ColorPicker.anchor = null;
    document.removeEventListener('pointerdown', ColorPicker.onOutside, true);
    document.removeEventListener('keydown', ColorPicker.onKey, true);
  },

  onOutside(e) {
    if (ColorPicker.el && !ColorPicker.el.contains(e.target) && !e.target.closest('[data-action="color-pick"]')) ColorPicker.close();
  },

  onKey(e) {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.target.dataset?.cp)) {
      e.stopPropagation();
      ColorPicker.close();
    }
  },

  // Redraws the picker; syncText also rewrites the text boxes (skipped while the user types in them).
  paint(syncText) {
    const el = ColorPicker.el;
    if (!el) return;
    const { h, s, v, a } = ColorPicker.hsv;
    const rgb = ColorPicker.toRgb(ColorPicker.hsv);
    const solid = ColorPicker.format({ ...rgb, a: 1 });
    const value = ColorPicker.format(rgb);
    el.querySelector('.ed-cp__sv').style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h}, 100%, 50%)`;
    Object.assign(el.querySelector('.ed-cp__dot').style, { left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: solid });
    el.querySelector('.ed-cp__hue .ed-cp__knob').style.left = `${(h / 360) * 100}%`;
    el.querySelector('.ed-cp__alpha i').style.background = `linear-gradient(to right, transparent, ${solid})`;
    el.querySelector('.ed-cp__alpha .ed-cp__knob').style.left = `${a * 100}%`;
    el.querySelector('.ed-cp__preview i').style.background = value;
    if (syncText) {
      el.querySelector('[data-cp="text"]').value = value;
      el.querySelector('[data-cp="alpha"]').value = Math.round(a * 100);
    }
  },

  emit() {
    ColorPicker.onChange?.(ColorPicker.format(ColorPicker.toRgb(ColorPicker.hsv)));
  },

  onPointerDown(e) {
    const area = e.target.closest('[data-drag]');
    if (!area) return;
    e.preventDefault();
    const kind = area.dataset.drag;
    const update = (ev) => {
      const r = area.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      if (kind === 'sv') Object.assign(ColorPicker.hsv, { s: x, v: 1 - y });
      if (kind === 'hue') ColorPicker.hsv.h = x * 360;
      if (kind === 'alpha') ColorPicker.hsv.a = Math.round(x * 100) / 100;
      ColorPicker.paint(true);
      ColorPicker.emit();
    };
    try {
      area.setPointerCapture(e.pointerId); // keep tracking when the pointer leaves the slider
    } catch {
      // no live pointer (e.g. synthetic events)
    }
    update(e);
    const up = () => {
      area.removeEventListener('pointermove', update);
      area.removeEventListener('pointerup', up);
    };
    area.addEventListener('pointermove', update);
    area.addEventListener('pointerup', up);
  },

  onInput(e) {
    const kind = e.target.dataset.cp;
    if (kind === 'text') {
      const c = ColorPicker.parse(e.target.value);
      if (!c) return;
      ColorPicker.hsv = ColorPicker.toHsv(c);
      ColorPicker.paint(false);
      ColorPicker.el.querySelector('[data-cp="alpha"]').value = Math.round(c.a * 100);
    } else if (kind === 'alpha') {
      ColorPicker.hsv.a = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
      ColorPicker.paint(false);
      ColorPicker.el.querySelector('[data-cp="text"]').value = ColorPicker.format(ColorPicker.toRgb(ColorPicker.hsv));
    } else return;
    ColorPicker.emit();
  },

  async onClick(e) {
    const btn = e.target.closest('[data-cp]');
    if (!btn) return;
    if (btn.dataset.cp === 'swatch') {
      ColorPicker.hsv = ColorPicker.toHsv(ColorPicker.parse(btn.dataset.color));
    } else if (btn.dataset.cp === 'eyedropper') {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        const a = ColorPicker.hsv.a;
        ColorPicker.hsv = { ...ColorPicker.toHsv(ColorPicker.parse(sRGBHex)), a };
      } catch {
        return; // cancelled
      }
    } else return;
    ColorPicker.paint(true);
    ColorPicker.emit();
  },
};
