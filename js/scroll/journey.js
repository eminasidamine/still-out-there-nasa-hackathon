// Start screen: photos of the Earth, the Moon and Mars, with dashed routes from the Earth to each and small lights
// that keep travelling along them. Each world floats gently and glows. It sits on top of the big 3D scene and fades
// away as the page scrolls toward the Moon. Sizes and distances are not to scale: the picture is about the journey.
import { h } from '../v1/dom.js';
import { t } from '../i18n.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';

/** onWorld(id) is called when someone clicks the Moon or Mars. */
export function createJourney(under, { onWorld } = {}) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'journey-routes');
  svg.setAttribute('aria-hidden', 'true');
  const path = (cls) => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('class', cls); svg.append(p); return p; };
  const marsRoute = path('route route-mars'), moonRoute = path('route route-moon');
  const lights = [
    { route: marsRoute, period: 9000, offset: 0 }, { route: marsRoute, period: 9000, offset: 0.5 },
    { route: moonRoute, period: 4500, offset: 0.2 },
  ].map((l) => { const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('r', '3.5'); c.setAttribute('class', 'route-light'); svg.append(c); return { ...l, c }; });

  const world = (id, link) => {
    const pic = h('img', { src: `assets/img/home/${id}.jpg`, alt: '', decoding: 'async', draggable: 'false' });
    const label = h(link ? 'button' : 'span', { type: link ? 'button' : null, class: `journey-label${link ? ' is-link' : ''}`, 'aria-hidden': link ? null : 'true' },
      h('span', { class: 'journey-name' }, t(`body.${id}`)), h('span', { class: 'journey-sub' }, t(`journey.${id}`)));
    const el = h(link ? 'button' : 'div', { type: link ? 'button' : null, class: `world world-${id}`, 'aria-hidden': 'true', tabindex: link ? '-1' : null }, h('span', { class: 'world-pic' }, pic));
    if (link) { label.addEventListener('click', () => onWorld?.(id)); el.addEventListener('click', () => onWorld?.(id)); }
    return { el, label, pic };
  };
  const earth = world('earth', false), moon = world('moon', true), mars = world('mars', true);
  const el = h('div', { class: 'journey' }, svg, earth.el, moon.el, mars.el, earth.label, moon.label, mars.label);
  under.after(el);

  // routes follow the worlds wherever the layout puts them
  const centre = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
  function lay() {
    const W = innerWidth, H = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const e = centre(earth.pic), m = centre(moon.pic), a = centre(mars.pic);
    if (!e.r) return;
    const arc = (from, to, lift) => {
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const s = { x: from.x + Math.cos(ang) * from.r * 1.05, y: from.y + Math.sin(ang) * from.r * 1.05 };
      const f = { x: to.x - Math.cos(ang) * to.r * 1.1, y: to.y - Math.sin(ang) * to.r * 1.1 };
      const d = Math.hypot(f.x - s.x, f.y - s.y), up = Math.sign(lift) * Math.min(Math.abs(lift), d * 0.35);
      const mid = { x: (s.x + f.x) / 2, y: (s.y + f.y) / 2 - up };
      return `M ${s.x} ${s.y} Q ${mid.x} ${mid.y} ${f.x} ${f.y}`;
    };
    marsRoute.setAttribute('d', arc(e, a, H * 0.22));
    moonRoute.setAttribute('d', arc(e, m, -H * 0.04));
    // names beside each world (to the right, or below on narrow screens)
    const below = W < 760;
    for (const [w, c] of [[earth, e], [moon, m], [mars, a]]) {
      const right = c.x + c.r + 16;
      const leftSide = !below && right + w.label.offsetWidth + 24 > W;
      // no room on the right: under the world, centred
      w.label.classList.toggle('is-under', below || leftSide);
      w.label.style.transform = below || leftSide
        ? `translate(${c.x}px, ${c.y + c.r + 12}px) translateX(-50%)`
        : `translate(${right}px, ${c.y}px) translateY(-50%)`;
    }
  }
  const observer = new ResizeObserver(() => requestAnimationFrame(lay));
  observer.observe(document.documentElement);

  // the lights travel the routes, appearing at the Earth and fading at arrival
  let raf = 0, on = true, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!on || document.hidden) return;
    if (now - last > 250) { last = now; lay(); }                    // the worlds float, so the routes follow them
    for (const l of lights) {
      const len = l.route.getTotalLength?.() || 0;
      if (!len || reduced()) { l.c.style.opacity = 0; continue; }
      const k = ((now / l.period + l.offset) % 1 + 1) % 1;
      const p = l.route.getPointAtLength(k * len);
      l.c.setAttribute('cx', p.x); l.c.setAttribute('cy', p.y);
      l.c.style.opacity = Math.min(1, k * 8, (1 - k) * 8);
    }
  }
  raf = requestAnimationFrame(frame);

  const ready = Promise.all([earth, moon, mars].map((w) => (w.pic.complete ? null : new Promise((r) => { w.pic.addEventListener('load', r); w.pic.addEventListener('error', r); }))))
    .then(() => requestAnimationFrame(lay));

  return {
    /** Resolves when the three photos have arrived. */
    ready,
    /** 0 = hidden, 1 = fully shown. */
    set(o) {
      el.style.opacity = o;
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      on = o > 0.001;
      el.style.pointerEvents = o > 0.6 ? '' : 'none';
    },
    destroy() { cancelAnimationFrame(raf); observer.disconnect(); el.remove(); },
  };
}
