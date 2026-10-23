// Transform tool for the editor preview: a box with handles around the selected element.
//   drag inside   move            corner handles   resize (keeps aspect; Shift = free for images)
//   rotate knob   rotate (Shift snaps to 15°)       edge handles     stretch one side
//   arrow keys    nudge (Shift = 5%)               Delete            remove the element
// Geometry is worked out in the container's own pixels (unscaled), then written back as % values.

const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
const rotate2d = ({ x, y }, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};
const round1 = (v) => Math.round(v * 10) / 10;

const Transform = {
  overlay() {
    let el = document.getElementById('edTf');
    if (!el) {
      el = document.createElement('div');
      el.id = 'edTf';
      el.className = 'ed-tf';
      el.innerHTML = `
        <div class="ed-tf__box" data-tf="move"></div>
        ${HANDLES.map(([pos, sx, sy]) => `<span class="ed-tf__h ed-tf__h--${pos}" data-tf="scale" data-sx="${sx}" data-sy="${sy}"></span>`).join('')}
        <span class="ed-tf__rot" data-tf="rotate" title="Rotate (Shift snaps to 15°)"></span>
        <span class="ed-tf__info"></span>`;
      el.addEventListener('pointerdown', Transform.onOverlayDown);
      $('#edViewport').append(el);
    }
    return el;
  },

  // The selected thing in the preview: an element of login/hero, or the login card.
  target() {
    const sel = Editor.selected;
    if (!sel) return null;
    if (sel.path === 'login.card') {
      const node = $('#app .login__slot');
      return node && { kind: 'card', node, container: node.parentElement, path: sel.path, item: {} };
    }
    const container = $(sel.path.startsWith('login') ? '#app .login' : '#app .hero');
    const node = container?.querySelector(`.el[data-el="${sel.index}"]`);
    if (!node) return null;
    return { kind: 'el', node, container, path: sel.path, index: sel.index, item: (Editor.valueOf(sel.path) || [])[sel.index] || {} };
  },

  measure(t) {
    const [ax, ay] = t.kind === 'card' ? [-50, -50] : ALIGN[t.item.align] || ALIGN.center;
    const isText = t.kind === 'el' && t.item.type === 'text';
    return {
      W: t.node.offsetWidth,
      H: t.node.offsetHeight,
      L: t.node.offsetLeft, // the anchor point (style left/top) in container px
      T: t.node.offsetTop,
      fx: -ax / 100,
      fy: -ay / 100,
      r: t.kind === 'card' ? 0 : Number(t.item.rotate) || 0,
      cW: t.container.clientWidth,
      cH: t.container.clientHeight,
      size: isText ? Number(t.item.size) || parseFloat(getComputedStyle(t.node).fontSize) : null,
    };
  },

  center: (g) => ({ x: g.L - g.fx * g.W + g.W / 2, y: g.T - g.fy * g.H + g.H / 2 }),

  update() {
    const t = Transform.target();
    const el = Transform.overlay();
    if (!t) {
      el.hidden = true;
      return;
    }
    Transform.draw(t, Transform.measure(t));
  },

  draw(t, g) {
    const el = Transform.overlay();
    const vp = $('#edViewport').getBoundingClientRect();
    const c = t.container.getBoundingClientRect();
    const s = Editor.scale || 1;
    const ctr = Transform.center(g);
    el.hidden = false;
    el.className = `ed-tf ed-tf--${t.kind === 'card' ? 'card' : t.item.type === 'text' ? 'text' : 'image'}`;
    Object.assign(el.style, {
      left: `${(c.left - vp.left) / s + ctr.x - g.W / 2}px`,
      top: `${(c.top - vp.top) / s + ctr.y - g.H / 2}px`,
      width: `${g.W}px`,
      height: `${g.H}px`,
      transform: `rotate(${g.r}deg)`,
    });
    el.querySelector('.ed-tf__info').textContent = t.kind === 'card'
      ? `${Math.round(g.W)} px wide`
      : `${Math.round(g.W)} × ${Math.round(g.H)}${g.r ? ` · ${round1(g.r)}°` : ''}`;
  },

  applyLive(t, g) {
    const st = t.node.style;
    st.left = `${g.L}px`;
    st.top = `${g.T}px`;
    if (t.kind === 'card') {
      st.width = `${g.W}px`;
      return;
    }
    const [ax, ay] = ALIGN[t.item.align] || ALIGN.center;
    st.transform = `translate(${ax}%, ${ay}%) rotate(${g.r}deg)`;
    if (t.item.type === 'text') st.fontSize = `${g.size}px`;
    else if (t.item.width !== undefined && t.item.height !== undefined) Object.assign(st, { width: `${g.W}px`, height: `${g.H}px` });
    else if (t.item.height !== undefined) st.height = `${g.H}px`;
    else st.width = `${g.W}px`;
  },

  // ---------- pointer ----------
  // Pointerdown anywhere in the preview: select + move an element or the login card, or deselect.
  onAppPointerDown(e) {
    const elNode = e.target.closest('.el');
    const panel = !elNode && e.target.closest('.login__panel');
    const interactive = panel && e.target.closest('input, button, select, textarea, summary, a, label, details, .chip');
    if ((!elNode && !panel) || interactive) {
      if (Editor.selected) {
        Editor.selected = null;
        Transform.update();
        Editor.renderPanel();
      }
      return;
    }
    const container = elNode ? elNode.closest('.login, .hero') : panel.closest('.login');
    if (!container) return;
    e.preventDefault();
    e.stopPropagation();
    Editor.selected = elNode
      ? { path: container.classList.contains('login') ? 'login.elements' : 'hero.elements', index: Number(elNode.dataset.el) }
      : { path: 'login.card' };
    Transform.update();
    Transform.begin(e, 'move');
  },

  onOverlayDown(e) {
    const part = e.target.closest('[data-tf]');
    if (!part) return;
    e.preventDefault();
    e.stopPropagation();
    Transform.begin(e, part.dataset.tf, Number(part.dataset.sx || 0), Number(part.dataset.sy || 0));
  },

  begin(e, mode, sx = 0, sy = 0) {
    const t = Transform.target();
    if (!t) return;
    const g = Transform.measure(t);
    const s = Editor.scale || 1;
    const c = t.container.getBoundingClientRect();
    const toC = (ev) => ({ x: (ev.clientX - c.left) / s, y: (ev.clientY - c.top) / s });
    const p0 = toC(e);
    const C = Transform.center(g);
    const bothSizes = t.item.width !== undefined && t.item.height !== undefined;
    let next = null;

    const move = (ev) => {
      const p = toC(ev);
      next = { ...g };
      if (mode === 'move') {
        next.L = g.L + p.x - p0.x;
        next.T = g.T + p.y - p0.y;
      } else if (mode === 'rotate') {
        const a0 = Math.atan2(p0.y - C.y, p0.x - C.x);
        const a = Math.atan2(p.y - C.y, p.x - C.x);
        let r = g.r + ((a - a0) * 180) / Math.PI;
        if (ev.shiftKey) r = Math.round(r / 15) * 15;
        next.r = ((((r + 180) % 360) + 360) % 360) - 180;
      } else {
        const local = rotate2d({ x: p.x - C.x, y: p.y - C.y }, -g.r);
        let W2 = sx ? Math.max(8, sx * local.x + g.W / 2) : g.W;
        let H2 = sy ? Math.max(8, sy * local.y + g.H / 2) : g.H;
        if (t.kind === 'card') H2 = g.H; // the card's height follows its content
        const lock = t.kind === 'el' && (t.item.type === 'text' || !bothSizes || (sx && sy && !ev.shiftKey));
        if (lock) {
          const k = sx && sy ? Math.max(W2 / g.W, H2 / g.H) : sx ? W2 / g.W : H2 / g.H;
          W2 = g.W * k;
          H2 = g.H * k;
        }
        // Keep the opposite side (or corner) where it was, in the element's rotated frame.
        const shift = rotate2d({ x: sx ? (sx * (W2 - g.W)) / 2 : 0, y: sy ? (sy * (H2 - g.H)) / 2 : 0 }, g.r);
        const C2 = { x: C.x + shift.x, y: C.y + shift.y };
        Object.assign(next, { W: W2, H: H2, L: C2.x - W2 / 2 + g.fx * W2, T: C2.y - H2 / 2 + g.fy * H2 });
        if (g.size) next.size = (g.size * W2) / g.W;
      }
      Transform.applyLive(t, next);
      Transform.draw(t, next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (next) Transform.commit(t, g, next, mode);
      else if (t.kind === 'el') Editor.revealItem(t.path, t.index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  // Writes the final geometry back into the theme.
  commit(t, g, n, mode) {
    const base = t.kind === 'card' ? 'login.card' : `${t.path}.${t.index}`;
    Editor.snapshot(true);
    if (mode !== 'rotate') {
      Editor.write(`${base}.x`, round1((n.L / g.cW) * 100));
      Editor.write(`${base}.y`, round1((n.T / g.cH) * 100));
    }
    if (mode === 'rotate') Editor.write(`${base}.rotate`, round1(n.r) || undefined);
    if (mode === 'scale') {
      const it = t.item;
      if (t.kind === 'card') Editor.write(`${base}.width`, Math.round(n.W));
      else if (it.type === 'text') Editor.write(`${base}.size`, Math.round(n.size));
      else if (it.width !== undefined && it.height !== undefined) {
        Editor.write(`${base}.width`, round1((n.W / g.cW) * 100));
        Editor.write(`${base}.height`, round1((n.H / g.cH) * 100));
      } else if (it.height !== undefined) Editor.write(`${base}.height`, round1((n.H / g.cH) * 100));
      else Editor.write(`${base}.width`, round1((n.W / g.cW) * 100));
    }
    Editor.afterChange();
    Editor.renderPanel();
  },

  // ---------- keyboard ----------
  nudge(dx, dy) {
    const t = Transform.target();
    if (!t) return false;
    const g = Transform.measure(t);
    Transform.commit(t, g, { ...g, L: g.L + (dx / 100) * g.cW, T: g.T + (dy / 100) * g.cH }, 'move');
    return true;
  },

  remove() {
    const sel = Editor.selected;
    if (!sel || sel.path === 'login.card') return false;
    const list = clone(Editor.valueOf(sel.path)) || [];
    list.splice(sel.index, 1);
    Editor.selected = null;
    Editor.setValue(sel.path, list.length ? list : undefined, false, { structural: true });
    Editor.renderPanel();
    return true;
  },
};
