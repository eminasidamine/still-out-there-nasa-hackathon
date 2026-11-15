// The journey as a fixed list of stops in four chapters. Each stop says where the camera goes
// (a "shot" in the 3D universe), which labels float in space, and builds the small card of words.
import { h, statusMark } from './v1/dom.js';
import { t, fmtNumber } from './i18n.js';
import { db, artifact, placeOf, noteOf } from './data.js';
import { tickerLine, liveSummary, daysSince, formatDate } from './live.js';
import { moonSurfaceKm } from './v1/beam.js';
import { lightTimes, planetLightSeconds, clock, C_KM_S } from './reach.js';
import { imageOf, audioOf, sentences } from './story.js';

export const CHAPTERS = [
  { id: 'moon', stops: ['moon', 'surveyor3', 'eagle', 'lrv', 'retro', 'echo'] },
  { id: 'mars', stops: ['mars', 'sojourner', 'opportunity', 'dust', 'insight', 'ingenuity'] },
  { id: 'deep', stops: ['deep', 'kepler', 'pioneer10'] },
  { id: 'finale', stops: ['finale'] },
];
export const SEQ = ['start', ...CHAPTERS.flatMap((c) => c.stops)];
export const MACHINES = ['surveyor3', 'eagle', 'lrv', 'retro', 'sojourner', 'opportunity', 'insight', 'ingenuity', 'kepler', 'pioneer10'];
export const chapterOf = (id) => CHAPTERS.find((c) => c.stops.includes(id)) ?? null;
export const isMachine = (id) => MACHINES.includes(id);
export const stopName = (id) => (artifact(id) ? artifact(id).name : t(`stop.${id}.name`));

/** Story length from the recorded clips, in minutes. */
function storyMinutes(id) {
  let sec = 0;
  for (const c of ['why', 'how', 'found', 'lastDay', 'carriesOn']) { const x = db.narration?.clips?.[`${id}.${c}`]; if (x?.sentences?.length) sec += x.sentences.at(-1)[1]; }
  return Math.max(1, Math.ceil(sec / 60));
}
function teaser(a) {
  let out = '';
  for (const x of t(`story.${a.id}.why`).match(/[^.!?…؟]+[.!?…؟]+["'’”»)]*/g) ?? []) { if (out.length > 70) break; out += x; }
  return out.trim();
}

/** Round photo bubbles for the machines on a world, at their real sites, like Google Earth (click one to go there). */
function pinsOn(U, body) {
  return CHAPTERS.find((c) => c.id === body).stops.filter(isMachine).map((id) => ({
    id, text: artifact(id).name, kind: `pin photo-pin status-${artifact(id).status}`, body, get: () => U.machinePos(id),
    photo: imageOf(artifact(id))?.src,
  }));
}

// ---- cards ---------------------------------------------------------------------------------
function startCard() {
  const hold = h('button', { type: 'button', class: 'hold', id: 'hold' },
    h('span', { class: 'hold-fill', 'aria-hidden': 'true' }), h('span', { class: 'hold-dot', 'aria-hidden': 'true' }), h('span', { class: 'hold-label' }, t('start.hold')));
  return h('section', { class: 'card card-start' },
    h('p', { class: 'eyebrow', id: 'now-line' }),
    h('h1', { tabindex: '-1' }, t('app.title')),
    h('p', { class: 'tagline' }, t('start.line')),
    h('div', { class: 'send' }, hold),
    h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', id: 'skip' }, t('start.skip'))));
}

function worldCard(body) {
  const now = new Date(), lt = lightTimes(now);
  const km = body === 'moon' ? moonSurfaceKm(now) : lt.mars * C_KM_S;
  const n = CHAPTERS.findIndex((c) => c.id === body) + 1;
  return h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, t('world.chapter', { n, total: 3 })),
    h('h1', { tabindex: '-1' }, t(`world.${body}`)),
    h('p', { class: 'stat' }, h('span', { class: 'stat-num num' }, clock(lt[body])), h('span', { class: 'stat-label' }, t('world.light'), ' · ', t('live.km', { km: fmtNumber(km) }))),
    h('p', { class: 'lead' }, t(`world.${body}.line`)),
    h('p', { class: 'hint' }, t('world.tapHint')));
}

function deepCard() {
  const lt = lightTimes();
  return h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, t('world.chapter', { n: 3, total: 3 })),
    h('h1', { tabindex: '-1' }, t('world.deep')),
    h('p', { class: 'stat' }, h('span', { class: 'stat-num num' }, clock(lt.pioneer10 ?? 0)), h('span', { class: 'stat-label' }, t('deep.farthest'))),
    h('p', { class: 'lead' }, t('world.deep.line')),
    info(h('p', {}, t('deep.note'))));
}

/** Extra detail (credits, notes) tucked behind a small "i" so the card stays short. */
function info(...kids) {
  return h('details', { class: 'info' }, h('summary', {}, h('span', { class: 'info-i', 'aria-hidden': 'true' }, 'i'), t('machine.info')), h('div', { class: 'info-body' }, kids));
}

/** The machine speaks: its first chapter, one sentence on screen at a time, in sync with the voice. */
function voice(id) {
  const parts = sentences(t(`story.${id}.why`)), clip = db.narration?.clips?.[`${id}.why`];
  // before playing: the opening sentences (about one line's worth); while playing: the sentence being spoken
  let opening = ''; for (const x of parts) { if (opening.length > 55) break; opening += (opening ? ' ' : '') + x; }
  const line = h('p', { class: 'voice-line' }, `“${opening}”`);
  const sec = clip?.sentences?.length ? Math.round(clip.sentences.at(-1)[1]) : 0;
  const label = h('span', { class: 'lbl' }, t('voice.listen'));
  let audio = null, raf = 0, shown = -1;
  const show = (i, text = parts[i]) => {
    if (i === shown) return; shown = i;
    line.classList.remove('in'); void line.offsetWidth;
    line.textContent = `“${text}”`; line.classList.add('in');
  };
  const stop = () => { audio?.pause(); audio = null; cancelAnimationFrame(raf); btn.setAttribute('aria-pressed', 'false'); label.textContent = t('voice.listen'); show(-1, opening); line.classList.remove('speaking'); };
  const btn = h('button', { type: 'button', class: 'btn btn-primary btn-voice', 'aria-pressed': 'false', onclick() {
    if (audio) { stop(); return; }
    if (!clip) { location.hash = `#/${id}/story`; return; }
    for (const x of document.querySelectorAll('audio')) x.pause();
    audio = new Audio(clip.src);
    btn.setAttribute('aria-pressed', 'true'); label.textContent = t('voice.stop'); line.classList.add('speaking');
    const times = clip.sentences.length === parts.length ? clip.sentences : null;
    const paint = () => {
      if (!audio) return;
      if (times) { const now = audio.currentTime; const i = times.findIndex((_, k) => now >= times[k][0] - 0.05 && now < (times[k + 1]?.[0] ?? Infinity)); if (i >= 0) show(i); }
      raf = requestAnimationFrame(paint);
    };
    audio.addEventListener('ended', stop);
    audio.play().then(() => { raf = requestAnimationFrame(paint); }, stop);
  } }, h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), label, sec ? h('span', { class: 'btn-meta' }, `${sec} s`) : null);
  return { el: h('div', { class: 'voice' }, line, btn), stop };
}

/** A real NASA recording, as one compact button. */
function realSound(m, id) {
  const audio = new Audio(m.src); audio.preload = 'none';
  const label = h('span', {}, t(m.title_key));
  const btn = h('button', { type: 'button', class: 'btn btn-sound', 'aria-pressed': 'false', onclick() {
    if (audio.paused) { for (const x of document.querySelectorAll('audio')) x.pause(); audio.play(); } else audio.pause();
  } }, h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), label);
  const set = (on) => { btn.setAttribute('aria-pressed', String(on)); if (id === 'insight') document.body.classList.toggle('is-quaking', on); };
  audio.addEventListener('play', () => set(true)); audio.addEventListener('pause', () => set(false)); audio.addEventListener('ended', () => set(false));
  return { el: btn, stop: () => audio.pause(), caption: h('p', {}, t(m.caption_key), ' ', t(m.transcript_key), ' ', h('span', { class: 'muted' }, t('media.audio.credit', { credit: m.credit }))) };
}

function machineCard(id, ctx) {
  const a = artifact(id), snd = audioOf(a), note = noteOf(a), img = imageOf(a);
  const days = daysSince(a.since.date);
  const v = voice(id), rs = snd ? realSound(snd, id) : null;
  const thumb = img ? h('button', { type: 'button', class: 'thumb', onclick: () => ctx.photo(a), 'aria-label': t('machine.view.photo') },
    h('img', { src: img.src, alt: t(img.alt_key) }), h('span', {}, t('media.real'), ' ↗')) : null;
  const el = h('section', { class: `card card-machine status-${a.status}` },
    h('p', { class: 'eyebrow' }, placeOf(a), ' · ', t(`kind.${a.type}`)),
    h('h1', { tabindex: '-1' }, a.name),
    h('p', { class: 'status-line' }, statusMark(a.status), h('strong', {}, t('status.' + a.status)),
      h('span', { class: 'muted' }, ' · '), h('span', { class: 'num', 'data-days': id }, fmtNumber(days)), h('span', { class: 'muted' }, ` ${t('machine.daysWord')}`)),
    h('p', { class: 'now', 'data-now': id }),
    v.el,
    h('div', { class: 'actions' },
      h('a', { class: 'btn', href: `#/${id}/story` }, t('voice.full'), h('span', { class: 'btn-meta' }, t('machine.storyMeta', { min: storyMinutes(id) }))),
      rs?.el, thumb),
    info(
      h('p', {}, t(`machine.since.${a.since.kind}`), ' ', formatDate(a.since.date), '.'),
      h('p', {}, t(ctx.U.modelNote?.(id) ?? (ctx.U.hasModel(id) ? (id === 'eagle' ? 'machine.modelEagle' : 'machine.model') : 'machine.photoInScene'))),
      note ? h('p', {}, note) : null,
      rs?.caption));
  el._stop = () => { v.stop(); rs?.stop(); document.body.classList.remove('is-quaking'); };
  return el;
}

function echoCard(ctx) {
  const clk = h('span', { class: 'clock num' }, '0.000 s');
  const result = h('p', { class: 'result', 'aria-live': 'polite' });
  const fire = h('button', { type: 'button', class: 'btn btn-primary', onclick() {
    const km = moonSurfaceKm(), rt = (2 * km) / C_KM_S, t0 = performance.now();
    fire.disabled = true; result.textContent = t('laser.travelling');
    ctx.U.laser(rt);
    const step = () => {
      const s = Math.min(rt, (performance.now() - t0) / 1000);
      clk.textContent = `${s.toFixed(3)} s`;
      if (s < rt) { requestAnimationFrame(step); return; }
      result.textContent = t('laser.result', { s: fmtNumber(rt, 2), km: fmtNumber(km) });
      fire.disabled = false; fire.lastChild.textContent = t('laser.again');
    };
    requestAnimationFrame(step);
  } }, h('span', { class: 'laser-dot', 'aria-hidden': 'true' }), h('span', {}, t('laser.button')));
  return h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, t('echo.kicker')),
    h('h1', { tabindex: '-1' }, t('echo.title')),
    h('p', { class: 'lead' }, t('echo.short')),
    h('div', { class: 'fire' }, fire, clk),
    result,
    info(h('p', {}, t('echo.body')), h('p', {}, t('laser.note'))));
}

function dustCard(ctx) {
  const tau = h('span', { class: 'tau-num num' }, '0.5');
  const cap = h('span', { class: 'tau-cap' }, t('dust.normal'));
  const set = (storm) => {
    tau.textContent = storm ? '10.8' : '0.5'; cap.textContent = t(storm ? 'dust.storm' : 'dust.normal');
    ctx.U.setDust(storm ? 1 : 0); document.body.classList.toggle('is-dusty', storm);
    for (const b of seg.children) b.setAttribute('aria-pressed', String((b.dataset.storm === '1') === storm));
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('dust.tau') },
    h('button', { type: 'button', 'data-storm': '0', 'aria-pressed': 'true', onclick: () => set(false) }, t('dust.before')),
    h('button', { type: 'button', 'data-storm': '1', 'aria-pressed': 'false', onclick: () => set(true) }, t('dust.after')));
  const el = h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, t('dust.kicker')),
    h('h1', { tabindex: '-1' }, t('dust.title')),
    h('p', { class: 'lead' }, t('dust.short')),
    h('div', { class: 'tau' }, h('span', { class: 'tau-label' }, t('dust.tau')), tau, cap), seg,
    h('p', {}, t('dust.end')),
    h('details', { class: 'myth' }, h('summary', {}, t('dust.myth'), ' ', h('em', {}, t('dust.quote'))), h('p', {}, t('dust.truth'))));
  el._set = set;
  return el;
}

function finaleCard() {
  return h('section', { class: 'card card-finale' },
    h('p', { class: 'eyebrow' }, t('finale.kicker')),
    h('h1', { tabindex: '-1' }, t('finale.title1'), h('br'), h('span', { class: 'muted' }, t('finale.title2'))),
    h('p', { class: 'lead' }, t('finale.lead')),
    h('div', { id: 'rollcall-mount' }),
    h('div', { class: 'payoff', id: 'payoff' }),
    h('p', { class: 'small muted' }, t('foot.method'), ' ', h('a', { href: '#/sources' }, t('about.title')), ' · ', t('foot.made')));
}

/** Builds stop `id`: { el, shot, labels, enter(), leave() }. ctx: { U, photo(a) } */
export function buildStop(id, ctx) {
  const U = ctx.U;
  if (id === 'start') return { el: startCard(), shot: { kind: 'home', frame: 'none' }, labels: [{ text: t('body.moon'), kind: 'world', get: () => U.bodyPos('moon') }], range: null, wide: true };
  if (id === 'moon' || id === 'mars') return { el: worldCard(id), shot: { kind: 'body', body: id }, labels: pinsOn(U, id), range: id };
  if (id === 'deep') {
    const lt = lightTimes();
    const L = (text, sub, get) => ({ text: sub ? `${text} · ${sub}` : text, kind: 'world', get });
    return { el: deepCard(), shot: { kind: 'overview' }, range: null, labels: [
      L(t('body.earth'), '', () => U.bodyPos('earth')),
      L(t('body.moon'), clock(lt.moon), () => U.bodyPos('moon')),
      L(t('body.mars'), clock(lt.mars), () => U.bodyPos('mars')),
      { id: 'kepler', text: `Kepler · ${clock(lt.kepler ?? 0)}`, kind: 'pin', get: () => U.deepPos('kepler') },
      { id: 'pioneer10', text: `Pioneer 10 · ${clock(lt.pioneer10 ?? 0)}`, kind: 'pin', get: () => U.deepPos('pioneer10') },
    ] };
  }
  if (id === 'echo') return { el: echoCard(ctx), shot: { kind: 'echo' }, range: null, labels: [
    { text: t('body.earth'), kind: 'world', get: () => U.bodyPos('earth') }, { text: t('stop.echo.mirror'), kind: 'pin status-still-working', get: () => U.machinePos('retro') }] };
  if (id === 'dust') {
    const el = dustCard(ctx);
    return { el, shot: { kind: 'machine', id: 'opportunity' }, focus: 'opportunity', labels: [],
      enter: () => setTimeout(() => { if (document.body.contains(el)) el._set(true); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200),
      leave: () => { U.setDust(0); document.body.classList.remove('is-dusty'); } };
  }
  if (id === 'finale') return { el: finaleCard(), shot: { kind: 'earthrise', frame: 'right' }, range: null, labels: [], orbit: true, side: true };
  const card = machineCard(id, ctx);
  return { el: card, shot: { kind: 'machine', id }, focus: id, labels: [], leave: () => card._stop() };
}

/** Live values that change every second. */
export function tickStop(root, now) {
  for (const el of root.querySelectorAll('[data-now]')) { const s2 = liveSummary(artifact(el.dataset.now), now); el.textContent = s2 ? `${t('now.label')} ${s2}` : ''; }
  for (const el of root.querySelectorAll('[data-live]')) {
    const line = tickerLine(artifact(el.dataset.live), now);
    el.textContent = line ? `${t('intro.rightNow')}, ${line}` : '';
  }
  for (const el of root.querySelectorAll('[data-summary]')) el.textContent = liveSummary(artifact(el.dataset.summary), now);
  for (const el of root.querySelectorAll('[data-days]')) el.textContent = fmtNumber(daysSince(artifact(el.dataset.days).since.date, now));
}
