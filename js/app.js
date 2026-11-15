// Still Out There v2: fly through one 3D universe, stopping at each of the ten machines.
// Address = place (#/start, #/mars, #/opportunity, #/opportunity/story/2), so Back, links and reloads work.
import { h, statusMark } from './v1/dom.js';
import { t, loadLanguage, preferredLanguage, chooseLanguage, LANGUAGES, lang, fmtDate } from './i18n.js';
import { db, loadData, artifact } from './data.js';
import { createUniverse } from './universe.js';
import { CHAPTERS, SEQ, MACHINES, chapterOf, stopName, buildStop, tickStop, isMachine } from './stops.js';
import { openStory, imageOf } from './story.js';
import { rollCall } from './rollcall.js';
import { lightTimes, clock, kmOf } from './reach.js';
import { startMusic, stopMusic, musicOn, setMusicOn } from './v1/ambience.js';

const gsap = globalThis.gsap;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rtl = () => document.documentElement.dir === 'rtl';
const $ = (id) => document.getElementById(id);
const KEY = 'still-out-there-v2:';
const store = {
  get(k) { try { return localStorage.getItem(KEY + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(KEY + k, v); } catch { /* private mode */ } },
};

let U = null, current = null, currentId = null, story = null, roll = null, busy = false;
let sentAt = Number(store.get('sent')) || null;
const visited = new Set((store.get('visited') || '').split(',').filter(Boolean));

// ---- chrome ---------------------------------------------------------------------------
function buildChrome() {
  $('chapters').replaceChildren(...CHAPTERS.map((c) => h('a', { href: `#/${c.stops[0]}`, class: 'chap', 'data-chapter': c.id },
    h('span', { class: 'chap-name' }, t(`chapter.${c.id}`)),
    h('span', { class: 'chap-track', 'aria-hidden': 'true' }, c.stops.map((id) => h('i', { 'data-dot': id }))))));
  document.querySelector('.langs').replaceChildren(...LANGUAGES.map(([code, label]) =>
    h('button', { type: 'button', lang: code, 'aria-pressed': String(code === lang), onclick: () => { if (code !== lang) chooseLanguage(code); } }, label)));
  $('map-btn').addEventListener('click', () => toggleMap());
  $('back').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
}

function paintChrome(id) {
  const ch = chapterOf(id);
  for (const a of document.querySelectorAll('.chap')) {
    const on = ch?.id === a.dataset.chapter;
    a.classList.toggle('is-current', on);
    if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
  }
  for (const d of document.querySelectorAll('[data-dot]')) { d.classList.toggle('is-here', d.dataset.dot === id); d.classList.toggle('is-seen', visited.has(d.dataset.dot)); }
  const i = SEQ.indexOf(id), prev = SEQ[i - 1], next = SEQ[i + 1];
  $('back').hidden = !prev;
  $('next').hidden = !next;
  if (next) $('next-name').textContent = id === 'start' ? t('pager.begin') : stopName(next);
  $('back').setAttribute('aria-label', prev ? `${t('pager.back')}: ${stopName(prev)}` : t('pager.back'));
  $('where').textContent = ch ? t('pager.where', { chapter: t(`chapter.${ch.id}`), n: ch.stops.indexOf(id) + 1, total: ch.stops.length }) : '';
  document.body.dataset.stop = id;
}

/** Next/Back step from the stop most recently asked for (the address), so quick presses during a flight are never lost. */
const step = (d) => {
  const asked = location.hash.split('/')[1];
  const i = SEQ.indexOf(SEQ.includes(asked) ? asked : currentId) + d;
  if (SEQ[i]) location.hash = `#/${SEQ[i]}`;
};

// ---- the flight between stops ------------------------------------------------------------
/** Real light time of a stop, for the flight readout. */
function lightOf(id, lt) {
  const a = artifact(id);
  if (a) return a.body === 'deep' ? lt[id] : lt[a.body];
  return { start: 0, moon: lt.moon, echo: lt.moon, mars: lt.mars, dust: lt.mars, deep: lt.mars, finale: null }[id] ?? null;
}

function flightReadout(fromId, toId) {
  const lt = lightTimes(), a = lightOf(fromId, lt) ?? 0, b = lightOf(toId, lt);
  const box = $('flight');
  if (b == null || Math.abs(b - a) < 1) return null;
  box.replaceChildren(h('p', { class: 'eyebrow' }, t('travel.to'), ' ', stopName(toId)), h('p', { class: 'flight-clock num' }, clock(a)), h('p', { class: 'flight-km num' }, ''), h('p', { class: 'flight-note' }, t('travel.note')));
  box.hidden = false;
  if (!reduced()) gsap.fromTo(box, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
  const clk = box.querySelector('.flight-clock'), km = box.querySelector('.flight-km');
  const la = Math.log10(a + 1), lb = Math.log10(b + 1);
  return {
    progress(u) { const s = Math.pow(10, la + (lb - la) * u) - 1; clk.textContent = clock(s); km.textContent = t('live.km', { km: kmOf(s) }); },
    done() { if (reduced()) { box.hidden = true; return; } gsap.to(box, { opacity: 0, duration: 0.6, delay: 0.5, onComplete: () => { box.hidden = true; } }); },
  };
}

async function show(id, { animate = true } = {}) {
  const fromId = currentId;
  const dir = SEQ.indexOf(id) >= SEQ.indexOf(fromId ?? 'start') ? 1 : -1;
  const cardBox = $('card');
  const old = cardBox.firstElementChild;
  if (old && animate && !reduced()) await gsap.to(old, { opacity: 0, y: 16, duration: 0.25, ease: 'power2.in' });
  current?.leave?.();
  roll?.stop?.(); roll = null;
  cardBox.replaceChildren();
  U.setLabels([]);

  currentId = id;
  visited.add(id); store.set('visited', [...visited].join(','));
  current = buildStop(id, { U, photo: openPhoto });
  paintChrome(id);
  document.title = id === 'start' ? t('app.title') : `${stopName(id)} · ${t('app.title')}`;
  document.body.classList.toggle('is-side', !!current.side);
  document.body.classList.toggle('is-wide', !!current.wide);

  // fly (the model starts loading now if it has not already)
  if (current.focus) U.ready(current.focus);
  music(id);
  U.focusMachine(current.focus ?? null);
  if (!current.focus) U.freeRange(current.range);
  const readout = animate && fromId ? flightReadout(fromId, id) : null;
  await U.fly(current.shot, { instant: !animate, onProgress: (u) => readout?.progress(u) });
  readout?.done();
  U.orbit(!!current.orbit || !!current.focus, current.focus ? 0.12 : 0.25);   // a slow drift so the scene breathes
  U.setLabels(current.labels || []);

  // the card
  cardBox.replaceChildren(current.el);
  cardBox.scrollTop = 0;
  tickStop(current.el, new Date());
  if (id === 'start') { $('now-line').textContent = nowLine(); gate(); }
  if (id === 'finale') { roll = rollCall($('rollcall-mount')); paintPayoff(new Date()); }
  current.enter?.();
  if (animate && !reduced()) gsap.from(current.el.children, { opacity: 0, y: 18, duration: 0.8, stagger: 0.05, ease: 'expo.out', clearProps: 'all' });
  current.el.querySelector('h1')?.focus({ preventScroll: true });
  // warm up the next stop's model
  const nxt = SEQ[SEQ.indexOf(id) + 1];
  if (nxt) U.ready(nxt);
}

// ---- music: a quiet loop per world, changing as you travel ---------------------------------
let musicWorld = null, heardGesture = false;
function music(id) {
  const ch = chapterOf(id)?.id;
  const want = { moon: 'moon', mars: 'mars', deep: 'deep', finale: 'deep' }[ch] ?? null;
  if (!heardGesture || !musicOn() || want === musicWorld) return;
  musicWorld = want;
  stopMusic();
  if (want) setTimeout(() => { if (musicWorld === want) startMusic(want); }, 1300);
}
function soundButton() {
  const btn = $('sound-btn');
  const paint = () => { btn.setAttribute('aria-pressed', String(musicOn())); btn.title = t(musicOn() ? 'sound.off' : 'sound.on'); };
  btn.addEventListener('click', () => {
    setMusicOn(!musicOn()); paint();
    if (musicOn()) { musicWorld = null; heardGesture = true; music(currentId); } else musicWorld = null;
  });
  paint();
  // browsers only allow sound after the first tap or key press
  const first = () => { heardGesture = true; music(currentId); };
  addEventListener('pointerdown', first, { once: true, capture: true });
  addEventListener('keydown', first, { once: true, capture: true });
}

const nowLine = (now = new Date()) => t('v2.now', { date: fmtDate(now), time: now.toISOString().slice(11, 19) });

// ---- the signal ---------------------------------------------------------------------------
function chirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
    setTimeout(() => ctx.close(), 900);
  } catch { /* silent is fine */ }
}

function gate() {
  const hold = $('hold'), skip = $('skip');
  if (!hold) return;
  const label = hold.querySelector('.hold-label');
  const MS = reduced() ? 300 : 1200;
  let t0 = 0, raf = 0, done = false;
  const set = (k) => hold.style.setProperty('--k', k);
  const tickHold = (n) => { const k = Math.min(1, (n - t0) / MS); set(k); if (k < 1) raf = requestAnimationFrame(tickHold); else fire(); };
  const down = (e) => {
    if (done || t0) return;
    if (e.type === 'keydown') { if (e.key !== ' ' && e.key !== 'Enter') return; e.preventDefault(); if (e.repeat) return; }
    t0 = performance.now(); hold.classList.add('is-holding'); label.textContent = t('start.holding');
    raf = requestAnimationFrame(tickHold);
  };
  const up = () => { if (done || !t0) return; cancelAnimationFrame(raf); t0 = 0; hold.classList.remove('is-holding'); label.textContent = t('start.hold'); set(0); };
  function fire() {
    done = true; sentAt = Date.now(); store.set('sent', String(sentAt));
    hold.classList.remove('is-holding'); hold.classList.add('is-sent'); label.textContent = t('start.sent');
    chirp(); paintSignal();
    setTimeout(() => { location.hash = '#/moon'; }, reduced() ? 0 : 700);
  }
  hold.addEventListener('pointerdown', (e) => { hold.setPointerCapture?.(e.pointerId); down(e); });
  hold.addEventListener('pointerup', up);
  hold.addEventListener('pointercancel', up);
  hold.addEventListener('keydown', down);
  hold.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  skip.addEventListener('click', () => { location.hash = '#/moon'; });
  if (sentAt) label.textContent = t('start.again');
}

function paintSignal(now = new Date()) {
  const chip = $('signal');
  if (!sentAt) { chip.hidden = true; paintPayoff(now); return; }
  const lt = lightTimes(now), out = (now - sentAt) / 1000;
  const targets = [['moon', t('body.moon')], ['mars', t('body.mars')], ['kepler', 'Kepler'], ['pioneer10', 'Pioneer 10']]
    .filter(([k]) => lt[k] != null).map(([k, name]) => ({ name, lt: lt[k] })).sort((a, b) => a.lt - b.lt);
  const next = targets.find((x) => x.lt > out);
  chip.hidden = false;
  chip.replaceChildren(h('i', { 'aria-hidden': 'true' }), h('span', { class: 'sig-label' }, t('signal.label')),
    h('span', {}, next ? t('signal.next', { name: next.name, when: clock(next.lt - out) }) : t('signal.done')));
  chip.title = t('hud.out', { km: kmOf(out) });
  paintPayoff(now);
}

function paintPayoff(now) {
  const box = $('payoff');
  if (!box) return;
  const p = lightTimes(now).pioneer10;
  if (p == null) { box.hidden = true; return; }
  const loc = lang === 'ar' ? 'ar-u-nu-latn' : lang;
  if (!sentAt) {
    if (box.dataset.text === 'none') return;
    box.dataset.text = 'none';
    box.replaceChildren(h('p', { class: 'eyebrow' }, t('eta.kicker')), h('p', { class: 'payoff-line' }, t('eta.none', { time: clock(p) })), h('a', { class: 'btn', href: '#/start' }, t('eta.send')));
    return;
  }
  const at = new Date(sentAt + p * 1000), arrived = now >= at;
  const text = t(arrived ? 'signal.arrived' : 'eta.at', { day: at.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }), time: at.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) });
  if (box.dataset.text === text) return;
  box.dataset.text = text;
  box.replaceChildren(h('p', { class: 'eyebrow' }, t('eta.kicker')), h('p', { class: 'payoff-line' }, text), h('p', { class: 'muted' }, t('eta.come')));
}

// ---- map --------------------------------------------------------------------------------
function toggleMap(open = $('map').hidden) {
  const map = $('map'), btn = $('map-btn');
  btn.setAttribute('aria-expanded', String(open));
  if (!open) { if (reduced()) map.hidden = true; else gsap.to(map, { opacity: 0, duration: 0.25, onComplete: () => { map.hidden = true; } }); return; }
  map.replaceChildren(
    h('div', { class: 'map-head' }, h('h2', { id: 'map-title' }, t('map.title')), h('p', { class: 'muted' }, t('map.lead')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('map.close'), onclick: () => toggleMap(false) }, '×')),
    h('div', { class: 'map-grid' }, CHAPTERS.map((c, ci) => h('section', { class: 'map-col' },
      h('h3', {}, h('span', { class: 'num muted' }, `0${ci + 1}`), ' ', t(`chapter.${c.id}`)),
      h('ol', {}, c.stops.map((id) => {
        const a = artifact(id), img = a && imageOf(a);
        return h('li', {}, h('a', { href: `#/${id}`, class: `map-stop${id === currentId ? ' is-here' : ''}`, onclick: () => toggleMap(false) },
          img ? h('img', { src: img.src, alt: '', loading: 'lazy' }) : h('span', { class: 'map-thumb', 'aria-hidden': 'true' }),
          h('span', { class: 'map-name' }, stopName(id)),
          h('span', { class: 'map-meta' }, a ? [statusMark(a.status), ' ', t('status.' + a.status)] : t(`stop.${id}.kind`)),
          id === currentId ? h('span', { class: 'map-tag here' }, t('map.here')) : visited.has(id) ? h('span', { class: 'map-tag', title: t('map.seen') }, '✓') : null));
      }))))));
  map.hidden = false;
  if (!reduced()) { gsap.fromTo(map, { opacity: 0 }, { opacity: 1, duration: 0.3 }); gsap.from(map.querySelectorAll('.map-col'), { y: 24, opacity: 0, stagger: 0.06, duration: 0.6, ease: 'expo.out' }); }
  map.querySelector('.is-here')?.focus();
}

// ---- overlays: story, photo, sources ------------------------------------------------------
function openLayer(build) {
  const layer = $('layer'), opening = layer.hidden;
  layer.hidden = false;
  document.body.classList.add('layer-open');
  build(layer);
  if (opening && !reduced()) gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
}
function closeLayer() {
  const layer = $('layer');
  story?.destroy(); story = null;
  if (layer.hidden) return;
  const done = () => { layer.hidden = true; layer.replaceChildren(); document.body.classList.remove('layer-open'); current?.el.querySelector('h1')?.focus({ preventScroll: true }); };
  if (reduced()) done(); else gsap.to(layer, { opacity: 0, duration: 0.3, onComplete: () => { gsap.set(layer, { clearProps: 'opacity' }); done(); } });
}

function openPhoto(a) {
  const img = imageOf(a);
  openLayer((layer) => {
    layer.replaceChildren(h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t(img.caption_key) },
      h('button', { type: 'button', class: 'icon-btn lightbox-close', 'aria-label': t('sources.close'), onclick: closeLayer }, '×'),
      h('figure', {}, h('img', { src: img.src, alt: t(img.alt_key), class: a.id === 'opportunity' ? 'pixelated' : '' }),
        h('figcaption', {}, t(img.caption_key), ' ', h('span', { class: 'muted' }, t('media.credit', { credit: img.credit }))))));
    layer.querySelector('.lightbox-close').focus();
  });
}

function sourcesView() {
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'src-title' },
    h('div', { class: 'sheet-head' }, h('p', { class: 'eyebrow' }, t('app.title')),
      h('a', { class: 'icon-btn', href: `#/${currentId || 'start'}`, 'aria-label': t('sources.close') }, '×')),
    h('div', { class: 'sheet-body' },
      h('h1', { id: 'src-title', tabindex: '-1' }, t('sources.title')),
      h('p', { class: 'lead' }, t('about.lead')),
      h('h2', {}, t('about.why.title')), h('p', {}, t('about.why')),
      h('h2', {}, t('about.live')),
      h('ul', { class: 'bullets' }, ['mars', 'moon', 'deep'].map((k) => h('li', {}, t(`about.live.${k}`)))),
      h('p', {}, t('about.sorted')),
      h('h2', {}, t('about.models')), h('p', {}, t('about.models.body')),
      h('h2', {}, t('about.scale')), h('p', {}, t('about.scale.body')),
      h('h2', {}, t('about.all')),
      h('ol', { class: 'src-list' }, [...db.sources.values()].map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title),
        h('span', { class: 'muted' }, ` · ${s.publisher}`), s.official_resource ? h('span', { class: 'tag' }, t('story.official')) : null))),
      h('p', { class: 'muted small' }, t('app.notNasa'))));
}

// ---- router -------------------------------------------------------------------------------
async function route() {
  if (busy) return;
  const [, id = 'start', sub, n] = location.hash.split('/');
  if (id === 'sources') { openLayer((layer) => { layer.replaceChildren(sourcesView()); layer.querySelector('h1').focus(); }); return; }
  const target = SEQ.includes(id) ? id : 'start';
  if (!$('map').hidden) toggleMap(false);
  if (target !== currentId) {
    if (!$('layer').hidden) closeLayer();
    busy = true;
    try { await show(target, { animate: currentId != null }); } finally { busy = false; }
    const latest = location.hash.split('/')[1];
    if (latest && latest !== target) { route(); return; }
  }
  if (sub === 'story' && isMachine(target)) {
    openLayer((layer) => {
      story?.destroy();
      story = openStory(layer, target, n ? Math.max(0, parseInt(n, 10) - 1) : 0, MACHINES, { onClose: () => { location.hash = `#/${target}`; } });
    });
  } else if (!$('layer').hidden && !location.hash.includes('sources')) closeLayer();
}

function keys(e) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Escape') {
    if (!$('map').hidden) toggleMap(false);
    else if (!$('layer').hidden && !story) { if (location.hash.includes('sources')) location.hash = `#/${currentId}`; else closeLayer(); }
    return;
  }
  if (!$('layer').hidden) return;
  if (e.target.closest('input, textarea, select, [contenteditable], .hold, audio')) return;
  const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight', back = rtl() ? 'ArrowRight' : 'ArrowLeft';
  if (e.key === fwd) { e.preventDefault(); step(1); }
  else if (e.key === back) { e.preventDefault(); step(-1); }
  else if (e.key === 'm' || e.key === 'M') toggleMap();
}

function swipes() {
  let x0 = null, y0 = 0;
  addEventListener('touchstart', (e) => { if (e.target.closest('canvas, .hold, input, .card')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (x0 == null || !$('layer').hidden) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) step((dx < 0) !== rtl() ? 1 : -1);
    x0 = null;
  }, { passive: true });
}

async function start() {
  try {
    await loadLanguage(preferredLanguage());
    await loadData();
  } catch (err) {
    console.error(err);
    $('card').replaceChildren(h('p', { class: 'loading', role: 'alert' }, 'The data could not be loaded. Run a small web server (see README).'));
    return;
  }
  buildChrome();
  U = createUniverse($('space'), { onPick: (id) => { location.hash = `#/${id}`; } });
  for (const id of MACHINES) U.addMachine(artifact(id), imageOf(artifact(id))?.src);
  soundButton();
  U.pause(true);
  // wait for the first textures (or 8 s at most) so nothing pops in, then lift the curtain
  const boot = $('boot');
  boot.querySelector('.boot-text').textContent = t('boot.loading');
  const firstStop = location.hash.split('/')[1] || 'start';
  const firstWorld = { moon: 'moon', mars: 'mars' }[chapterOf(firstStop)?.id] ?? 'earth';
  await Promise.race([U.loaded(['stars', firstWorld]), new Promise((r) => setTimeout(r, 3000))]);
  if (new URLSearchParams(location.search).has('debug')) window.__sot = { U, liveData: (await import('./live.js')).liveData, artifact };
  addEventListener('hashchange', route);
  addEventListener('keydown', keys);
  swipes();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/start');
  await route();
  U.pause(false);
  U.warm();
  document.body.classList.add('is-ready');
  if (reduced()) boot.remove(); else gsap.to(boot, { opacity: 0, duration: 0.9, ease: 'power2.out', onComplete: () => boot.remove() });
  paintSignal();
  setInterval(() => {
    if (document.hidden) return;
    const now = new Date();
    if (current) tickStop(current.el, now);
    if (currentId === 'start') { const el = $('now-line'); if (el) el.textContent = nowLine(now); }
    roll?.tick(now);
    paintSignal(now);
  }, 1000);
  setInterval(() => U.updateSun(new Date()), 60e3);
}

start();
