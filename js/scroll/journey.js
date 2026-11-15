import { h } from "../v1/dom.js";
import { t } from "../i18n.js";
import { createGlobe2d } from "./globe2d.js";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVGNS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
function createJourney(under, { onWorld } = {}) {
  const marsRoute = S("path", { class: "route route-mars" }), moonRoute = S("path", { class: "route route-moon" });
  const svg = S("svg", { class: "journey-routes", "aria-hidden": "true" }, marsRoute, moonRoute);
  const world = (id, link, opts) => {
    const canvas = h("canvas", { class: "world-canvas" });
    const label = h(
      link ? "button" : "span",
      { type: link ? "button" : null, class: `journey-label${link ? " is-link" : ""}`, "aria-hidden": link ? null : "true" },
      h("span", { class: "journey-name" }, t(`body.${id}`)),
      h("span", { class: "journey-sub" }, t(`journey.${id}`))
    );
    const pic = h("span", { class: "world-pic" }, canvas);
    const el2 = h(link ? "button" : "div", { type: link ? "button" : null, class: `world world-${id}`, "aria-hidden": "true", tabindex: link ? "-1" : null }, pic);
    if (link) {
      label.addEventListener("click", () => onWorld?.(id));
      el2.addEventListener("click", () => onWorld?.(id));
    }
    return { el: el2, label, pic, globe: createGlobe2d(canvas, id, opts) };
  };
  const earth = world("earth", false, { tilt: 23, gain: 1.2 }), moon = world("moon", true, { light: [-0.12, 0.1, 0.99] }), mars = world("mars", true, { tilt: 25 });
  const el = h("div", { class: "journey" }, svg, earth.el, moon.el, mars.el, earth.label, moon.label, mars.label);
  under.after(el);
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  const sizeGlobes = () => {
    for (const w of [earth, moon, mars]) w.globe.resize(w.el.clientWidth * dpr);
  };
  const centre = (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };
  let moonAngle = -0.6;
  function placeMoon() {
    const e = centre(earth.el);
    if (!e.r) return;
    const rx = e.r * 2.5, ry = e.r * 0.5, behind = Math.sin(moonAngle) < 0;
    const x = e.x + Math.cos(moonAngle) * rx, y = e.y + Math.sin(moonAngle) * ry - Math.cos(moonAngle) * e.r * 0.12;
    const k = 0.86 + 0.14 * Math.sin(moonAngle);
    const w = moon.el.offsetWidth;
    moon.el.style.transform = `translate(${x - w / 2}px, ${y - w / 2}px) scale(${k})`;
    moon.el.style.zIndex = behind ? 0 : 2;
  }
  function lay() {
    const W = innerWidth, H = innerHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const e = centre(earth.el), m = centre(moon.el), a = centre(mars.el);
    if (!e.r) return;
    const arc = (from, to, lift) => {
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const s = { x: from.x + Math.cos(ang) * from.r * 1.04, y: from.y + Math.sin(ang) * from.r * 1.04 };
      const f = { x: to.x - Math.cos(ang) * to.r * 1.15, y: to.y - Math.sin(ang) * to.r * 1.15 };
      const d = Math.hypot(f.x - s.x, f.y - s.y), up = Math.sign(lift) * Math.min(Math.abs(lift), d * 0.35);
      return `M ${s.x} ${s.y} Q ${(s.x + f.x) / 2} ${(s.y + f.y) / 2 - up} ${f.x} ${f.y}`;
    };
    marsRoute.setAttribute("d", arc(e, a, H * 0.22));
    moonRoute.setAttribute("d", arc(e, m, H * 0.05));
    moonRoute.style.opacity = moon.el.style.zIndex === "0" ? 0.25 : 1;
    const below = W < 760;
    for (const [w, c] of [[earth, e], [moon, m], [mars, a]]) {
      const right = c.x + c.r + 16;
      const under2 = below || w === earth || right + w.label.offsetWidth + 24 > W;
      w.label.classList.toggle("is-under", under2);
      w.label.style.transform = under2 ? `translate(${c.x}px, ${c.y + c.r + 12}px) translateX(-50%)` : `translate(${right}px, ${c.y}px) translateY(-50%)`;
    }
    moon.label.style.opacity = moon.el.style.zIndex === "0" ? 0.35 : 1;
  }
  const observer = new ResizeObserver(() => requestAnimationFrame(() => {
    sizeGlobes();
    placeMoon();
    lay();
  }));
  observer.observe(document.documentElement);
  let raf = 0, on = true, last = performance.now(), drawn = 0, clock = 0;
  const SPIN = { earth: 1 / 60, moon: 1 / 120, mars: 1 / 70 };
  const spun = { earth: 0.28, moon: 0, mars: 0.55 };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last) / 1e3;
    last = now;
    if (!on || document.hidden) return;
    const still = reduced();
    if (!still) {
      clock += dt;
      moonAngle += dt * (Math.PI * 2 / 40);
    }
    placeMoon();
    lay();
    if (now - drawn > 33) {
      const step = Math.min(0.2, (now - drawn) / 1e3);
      drawn = now;
      for (const [id, w] of [["earth", earth], ["moon", moon], ["mars", mars]]) {
        if (!still) spun[id] += SPIN[id] * step;
        w.globe.set(spun[id]);
      }
    }
  }
  raf = requestAnimationFrame(frame);
  const ready = Promise.all([earth, moon, mars].map((w) => w.globe.ready.catch(() => {
  }))).then(() => {
    sizeGlobes();
    placeMoon();
    lay();
  });
  return {
    ready,
    set(o) {
      el.style.opacity = o;
      el.style.visibility = o > 1e-3 ? "visible" : "hidden";
      on = o > 1e-3;
      el.style.pointerEvents = o > 0.6 ? "" : "none";
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      el.remove();
    }
  };
}
export {
  createJourney
};
