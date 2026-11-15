const SVG_NS = "http://www.w3.org/2000/svg";
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  return fill(el, attrs, kids);
}
function s(tag, attrs = {}, ...kids) {
  return fill(document.createElementNS(SVG_NS, tag), attrs, kids);
}
function fill(el, attrs, kids) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}
function statusMark(status) {
  const shape = {
    silent: s("circle", { cx: 8, cy: 8, r: 5 }),
    "still-working": s("path", { d: "M8 1.5 14.5 8 8 14.5 1.5 8Z", class: "solid" }),
    drifting: s("path", { d: "M3 13 8 2.5 13 13 8 10.5Z" })
  }[status];
  return s("svg", { viewBox: "0 0 16 16", class: `mark mark-${status}`, "aria-hidden": "true" }, shape);
}
function scrambleIn(elements, ms = 520) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now();
  const targets = [...elements].map((el) => ({ el, text: el.textContent }));
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    for (const { el, text } of targets) {
      if (el.textContent !== text && !el.dataset.scrambling) continue;
      const settled = Math.floor(text.length * k);
      el.dataset.scrambling = "1";
      el.textContent = text.slice(0, settled) + text.slice(settled).replace(/\d/g, () => String(Math.random() * 10 | 0));
      if (k === 1) {
        el.textContent = text;
        delete el.dataset.scrambling;
      }
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export {
  h,
  s,
  scrambleIn,
  statusMark
};
