// Start screen: the Earth, the Moon and Mars as turning globes (drawn from the real maps, lit like full-disc
// photos). The Moon goes round the Earth. Dashed routes lead from the Earth to each, and a space shuttle, drawn
// here, keeps flying them. It sits on top of the big 3D scene and fades away as the page scrolls toward the Moon.
// Sizes and distances are not to scale: the picture is about the journey.
import { h } from '../v1/dom.js';
import { t } from '../i18n.js';
import { createGlobe2d } from './globe2d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };

/** A space shuttle seen from above, nose up, on a blue flame (local units: about 40 tall). */
function shuttle(scale) {
  const flame = S('g', { class: 'sh-flame' },
    S('ellipse', { cx: 0, cy: 34, rx: 5.5, ry: 20, fill: 'url(#sh-glow)' }),
    S('ellipse', { cx: 0, cy: 24, rx: 2.4, ry: 10, fill: '#ffffff' }));
  return S('g', { class: 'shuttle' }, S('g', { transform: `scale(${scale})` },
    flame,
    S('path', { d: 'M0 -22 C3 -20 4 -14 4 -8 L4 10 L15 15 L15 18 L4 17 L3 20 L-3 20 L-4 17 L-15 18 L-15 15 L-4 10 L-4 -8 C-4 -14 -3 -20 0 -22 Z', fill: '#eef2f7', stroke: '#9aa6b5', 'stroke-width': 0.6 }),
    S('path', { d: 'M0 -22 C2 -21 3 -18 3.2 -15 L-3.2 -15 C-3 -18 -2 -21 0 -22 Z', fill: '#1d2430' }),          // black nose
    S('path', { d: 'M-15 15 L-4 10 L-4 13 L-14 17 Z M15 15 L4 10 L4 13 L14 17 Z', fill: '#2a3140', opacity: 0.85 }),   // dark wing edges
    S('rect', { x: -1, y: -2, width: 2, height: 13, fill: '#c9d2dd' }),                                    // payload-bay line
    S('path', { d: 'M-3 20 L-2 23 L2 23 L3 20 Z', fill: '#58616e' })));                                    // engines
}

/** onWorld(id) is called when someone clicks the Moon or Mars. */
export function createJourney(under, { onWorld } = {}) {
  const defs = S('defs', {}, S('radialGradient', { id: 'sh-glow', cx: '50%', cy: '30%', r: '60%' },
    S('stop', { offset: '0%', 'stop-color': '#ffffff' }), S('stop', { offset: '35%', 'stop-color': '#9fd2ff' }),
    S('stop', { offset: '100%', 'stop-color': '#2f7bff', 'stop-opacity': 0 })));
  const marsRoute = S('path', { class: 'route route-mars' }), moonRoute = S('path', { class: 'route route-moon' });
  const ships = [];                                  // no shuttles on the routes (removed on request)
  const svg = S('svg', { class: 'journey-routes', 'aria-hidden': 'true' }, defs, marsRoute, moonRoute, ...ships.map((s) => s.g));

  const world = (id, link, opts) => {
    const canvas = h('canvas', { class: 'world-canvas' });
    const label = h(link ? 'button' : 'span', { type: link ? 'button' : null, class: `journey-label${link ? ' is-link' : ''}`, 'aria-hidden': link ? null : 'true' },
      h('span', { class: 'journey-name' }, t(`body.${id}`)), h('span', { class: 'journey-sub' }, t(`journey.${id}`)));
    const pic = h('span', { class: 'world-pic' }, canvas);
    const el = h(link ? 'button' : 'div', { type: link ? 'button' : null, class: `world world-${id}`, 'aria-hidden': 'true', tabindex: link ? '-1' : null }, pic);
    if (link) { label.addEventListener('click', () => onWorld?.(id)); el.addEventListener('click', () => onWorld?.(id)); }
    return { el, label, pic, globe: createGlobe2d(canvas, id, opts) };
  };
  const earth = world('earth', false, { tilt: 23, gain: 1.2 }), moon = world('moon', true, { light: [-0.12, 0.1, 0.99] }), mars = world('mars', true, { tilt: 25 });
  const el = h('div', { class: 'journey' }, svg, earth.el, moon.el, mars.el, earth.label, moon.label, mars.label);
  under.after(el);

  // sharpness: draw each globe at its on-screen size × screen density (capped, so it stays fast)
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  const sizeGlobes = () => { for (const w of [earth, moon, mars]) w.globe.resize(w.el.clientWidth * dpr); };

  const centre = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
  // the Moon goes round the Earth on a tilted ellipse, passing behind it
  let moonAngle = -0.6;
  function placeMoon() {
    const e = centre(earth.el);
    if (!e.r) return;
    const rx = e.r * 2.5, ry = e.r * 0.5, behind = Math.sin(moonAngle) < 0;
    const x = e.x + Math.cos(moonAngle) * rx, y = e.y + Math.sin(moonAngle) * ry - Math.cos(moonAngle) * e.r * 0.12;
    const k = 0.86 + 0.14 * Math.sin(moonAngle);                       // a little smaller when farther away
    const w = moon.el.offsetWidth;
    moon.el.style.transform = `translate(${x - w / 2}px, ${y - w / 2}px) scale(${k})`;
    moon.el.style.zIndex = behind ? 0 : 2;
  }
  function lay() {
    const W = innerWidth, H = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const e = centre(earth.el), m = centre(moon.el), a = centre(mars.el);
    if (!e.r) return;
    const arc = (from, to, lift) => {
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const s = { x: from.x + Math.cos(ang) * from.r * 1.04, y: from.y + Math.sin(ang) * from.r * 1.04 };
      const f = { x: to.x - Math.cos(ang) * to.r * 1.15, y: to.y - Math.sin(ang) * to.r * 1.15 };
      const d = Math.hypot(f.x - s.x, f.y - s.y), up = Math.sign(lift) * Math.min(Math.abs(lift), d * 0.35);
      return `M ${s.x} ${s.y} Q ${(s.x + f.x) / 2} ${(s.y + f.y) / 2 - up} ${f.x} ${f.y}`;
    };
    marsRoute.setAttribute('d', arc(e, a, H * 0.22));
    moonRoute.setAttribute('d', arc(e, m, H * 0.05));
    moonRoute.style.opacity = moon.el.style.zIndex === '0' ? 0.25 : 1;
    const below = W < 760;
    for (const [w, c] of [[earth, e], [moon, m], [mars, a]]) {
      const right = c.x + c.r + 16;
      const under = below || w === earth || right + w.label.offsetWidth + 24 > W;
      w.label.classList.toggle('is-under', under);
      w.label.style.transform = under ? `translate(${c.x}px, ${c.y + c.r + 12}px) translateX(-50%)` : `translate(${right}px, ${c.y}px) translateY(-50%)`;
    }
    moon.label.style.opacity = moon.el.style.zIndex === '0' ? 0.35 : 1;
  }
  const observer = new ResizeObserver(() => requestAnimationFrame(() => { sizeGlobes(); placeMoon(); lay(); }));
  observer.observe(document.documentElement);

  // turn the globes (about 30 frames a second is plenty), move the Moon and the shuttles
  let raf = 0, on = true, last = performance.now(), drawn = 0, clock = 0;
  const SPIN = { earth: 1 / 60, moon: 1 / 120, mars: 1 / 70 };              // turns per second
  const spun = { earth: 0.28, moon: 0, mars: 0.55 };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last) / 1000; last = now;
    if (!on || document.hidden) return;
    const still = reduced();
    if (!still) { clock += dt; moonAngle += dt * (Math.PI * 2 / 40); }
    placeMoon(); lay();
    if (now - drawn > 33) {
      const step = Math.min(0.2, (now - drawn) / 1000);
      drawn = now;
      for (const [id, w] of [['earth', earth], ['moon', moon], ['mars', mars]]) {
        if (!still) spun[id] += SPIN[id] * step;
        w.globe.set(spun[id]);
      }
    }
    for (const s of ships) {
      const len = s.route.getTotalLength?.() || 0;
      if (!len || still) { s.g.style.opacity = 0; continue; }
      const k = ((clock * 1000 / s.period + s.offset) % 1 + 1) % 1;
      const p = s.route.getPointAtLength(k * len), q = s.route.getPointAtLength(Math.min(len, k * len + 2));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
      s.g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${ang})`);
      s.g.style.opacity = Math.min(1, k * 7, (1 - k) * 7);
    }
  }
  raf = requestAnimationFrame(frame);

  const ready = Promise.all([earth, moon, mars].map((w) => w.globe.ready.catch(() => {}))).then(() => { sizeGlobes(); placeMoon(); lay(); });

  return {
    /** Resolves when the three maps are ready. */
    ready,
    /** 0 = hidden, 1 = fully shown. Stops drawing while hidden. */
    set(o) {
      el.style.opacity = o;
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      on = o > 0.001;
      el.style.pointerEvents = o > 0.6 ? '' : 'none';
    },
    destroy() { cancelAnimationFrame(raf); observer.disconnect(); el.remove(); },
  };
}
