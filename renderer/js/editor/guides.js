// Grid and smart guides for moving things in the preview (toggles in the stage bar).
//   Guides   while dragging, snaps to the middle and edges of the area and of the other elements, with pink lines
//   Grid     shows lines every N px over the area being edited (the login page or the dashboard banner); moves snap to it
// Hold Alt while dragging to move freely. The switches are remembered on this computer.
// Everything is in the container's own pixels (unscaled), like transform.js.

const Guides = {
  SIZES: [8, 10, 16, 20, 40],
  KEY: 'neko.editor.layout',
  THRESHOLD: 6, // screen px
  prefs: { guides: true, grid: false, size: 20 },
  active: null,

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(Guides.KEY) || '{}');
      if (typeof saved.guides === 'boolean') Guides.prefs.guides = saved.guides;
      if (typeof saved.grid === 'boolean') Guides.prefs.grid = saved.grid;
      if (Guides.SIZES.includes(saved.size)) Guides.prefs.size = saved.size;
    } catch {}
  },

  set(key, value) {
    Guides.prefs[key] = value;
    try {
      localStorage.setItem(Guides.KEY, JSON.stringify(Guides.prefs));
    } catch {}
    Guides.refresh();
  },

  overlay() {
    let el = document.getElementById('edGuides');
    if (!el) {
      el = document.createElement('div');
      el.id = 'edGuides';
      el.className = 'ed-guides';
      el.innerHTML = '<div class="ed-guides__grid"></div><div class="ed-guides__lines"></div>';
      $('#edViewport').append(el);
    }
    return el;
  },

  // The area things are placed in: where the selected thing lives, or the page's login area / banner.
  container() {
    return Transform.target()?.container || $('#app .login') || $('#app .hero');
  },

  // A box in container px. getBoundingClientRect covers rotated things too.
  box(node, c, s) {
    const r = node.getBoundingClientRect();
    return { l: (r.left - c.left) / s, t: (r.top - c.top) / s, r: (r.right - c.left) / s, b: (r.bottom - c.top) / s };
  },

  // Lays the overlay over the area, with the grid when it's on.
  refresh() {
    const el = Guides.overlay();
    const node = Guides.container();
    const show = node && (Guides.prefs.grid || Guides.active);
    el.hidden = !show;
    if (!show) return;
    const s = Editor.scale || 1;
    const vp = $('#edViewport').getBoundingClientRect();
    const c = node.getBoundingClientRect();
    Object.assign(el.style, { left: `${(c.left - vp.left) / s}px`, top: `${(c.top - vp.top) / s}px`, width: `${c.width / s}px`, height: `${c.height / s}px` });
    const grid = el.querySelector('.ed-guides__grid');
    grid.hidden = !Guides.prefs.grid;
    grid.style.setProperty('--ed-grid', `${Guides.prefs.size}px`);
  },

  // Called when a move starts: remembers where the thing was and the lines it can snap to.
  start(t) {
    const s = Editor.scale || 1;
    const c = t.container.getBoundingClientRect();
    const W = c.width / s;
    const H = c.height / s;
    const xs = [{ v: 0 }, { v: W / 2, mid: true }, { v: W }];
    const ys = [{ v: 0 }, { v: H / 2, mid: true }, { v: H }];
    const others = [...t.container.querySelectorAll('.el, .login__slot')]
      .filter((n) => n !== t.node && !t.node.contains(n) && !n.contains(t.node) && n.offsetWidth && n.offsetHeight);
    for (const n of others) {
      const b = Guides.box(n, c, s);
      xs.push({ v: b.l }, { v: (b.l + b.r) / 2 }, { v: b.r });
      ys.push({ v: b.t }, { v: (b.t + b.b) / 2 }, { v: b.b });
    }
    Guides.active = { box: Guides.box(t.node, c, s), xs, ys, s };
    Guides.refresh();
  },

  stop() {
    Guides.active = null;
    Guides.overlay().querySelector('.ed-guides__lines').innerHTML = '';
    Guides.refresh();
  },

  // Nearest snap along one axis for the moved box's edges and middle: [start, middle, end].
  nearest(points, lines, limit) {
    let best = null;
    for (const p of points) {
      for (const line of lines) {
        const d = line.v - p;
        if (Math.abs(d) <= limit && (!best || Math.abs(d) < Math.abs(best.d) - 0.01)) best = { d, at: [line] };
        else if (best && Math.abs(d - best.d) < 0.01 && !best.at.includes(line)) best.at.push(line);
      }
    }
    return best;
  },

  // Takes the drag distance and returns it snapped, drawing the guides it lines up with.
  snapMove(dx, dy, ev) {
    const a = Guides.active;
    const lines = Guides.overlay().querySelector('.ed-guides__lines');
    if (!a || ev.altKey || (!Guides.prefs.guides && !Guides.prefs.grid)) {
      if (lines) lines.innerHTML = '';
      return { x: dx, y: dy };
    }
    const limit = Guides.THRESHOLD / a.s;
    const b = { l: a.box.l + dx, t: a.box.t + dy, r: a.box.r + dx, b: a.box.b + dy };
    const pts = { x: [b.l, (b.l + b.r) / 2, b.r], y: [b.t, (b.t + b.b) / 2, b.b] };
    const out = { x: dx, y: dy };
    const drawn = [];
    for (const axis of ['x', 'y']) {
      let hit = Guides.prefs.guides ? Guides.nearest(pts[axis], a[`${axis}s`], limit) : null;
      if (hit) {
        out[axis] += hit.d;
        // One line per spot (the area's middle and a centred card can be the same line).
        const spots = new Map();
        hit.at.forEach((line) => spots.set(Math.round(line.v * 10), spots.get(Math.round(line.v * 10))?.mid ? spots.get(Math.round(line.v * 10)) : line));
        spots.forEach((line) => drawn.push(`<i class="ed-guide ed-guide--${axis} ${line.mid ? 'ed-guide--mid' : ''}" style="${axis === 'x' ? 'left' : 'top'}:${line.v}px"></i>`));
      } else if (Guides.prefs.grid) {
        // The box's left/top edge lands on a grid line.
        const g = Guides.prefs.size;
        const edge = pts[axis][0];
        out[axis] += Math.round(edge / g) * g - edge;
      }
    }
    lines.innerHTML = drawn.join('');
    return out;
  },
};

Guides.load();
