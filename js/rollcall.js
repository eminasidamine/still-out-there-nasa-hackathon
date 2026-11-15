// The roll call: ten names in huge type. Each machine answers in its own recorded voice,
// in the order it went quiet, and then its name goes dark. The last one stays lit.
import { h, statusMark } from './v1/dom.js';
import { t, fmtNumber } from './i18n.js';
import { db } from './data.js';
import { daysSince } from './live.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lineup() {
  return [...db.artifacts].sort((a, b) =>
    (a.status === 'still-working') - (b.status === 'still-working') || a.since.date.localeCompare(b.since.date));
}

export function rollCall(mount, { onSpeak } = {}) {
  const order = lineup();
  const caption = h('p', { class: 'rc-caption', 'aria-live': 'polite' });
  const rows = order.map((a) => ({ a, el: h('li', { class: `rc-row status-${a.status}` },
    h('a', { href: `#/story/${a.id}`, class: 'rc-name' }, statusMark(a.status), h('span', {}, a.name)),
    h('span', { class: 'rc-year mono' }, a.status === 'still-working' ? t('status.still-working') : a.since.date.slice(0, 4))) }));
  const end = h('p', { class: 'rc-end', hidden: true, role: 'status' }, t('rollcall.end'));
  const label = h('span', {}, t('rollcall.start'));
  const button = h('button', { type: 'button', class: 'btn btn-big', 'aria-pressed': 'false', onclick: () => (button.getAttribute('aria-pressed') === 'true' ? stop() : play()) },
    h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), label);
  let run = 0, audio = null;

  const stop = () => { run++; audio?.pause(); button.setAttribute('aria-pressed', 'false'); label.textContent = t('rollcall.again'); mount.classList.remove('playing'); };

  async function play() {
    const id = ++run, live = () => id === run;
    for (const r of rows) r.el.classList.remove('speaking', 'done');
    end.hidden = true;
    button.setAttribute('aria-pressed', 'true'); label.textContent = t('rollcall.stop');
    mount.classList.add('playing');
    for (const x of document.querySelectorAll('audio')) x.pause();
    for (const r of rows) {
      if (!live()) return;
      r.el.classList.add('speaking');
      r.el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      const line = t(`rollcall.${r.a.id}`);
      caption.textContent = line;
      onSpeak?.(r.a);
      const clip = db.narration?.clips?.[`${r.a.id}.rollcall`];
      if (clip) {
        audio = new Audio(clip.src);
        await new Promise((done) => { audio.onended = done; audio.onerror = done; audio.play().catch(done); });
      } else await sleep(2600);
      if (!live()) return;
      r.el.classList.remove('speaking');
      r.el.classList.add('done');
      await sleep(350);
    }
    end.hidden = false;
    caption.textContent = '';
    stop();
  }

  mount.replaceChildren(
    h('div', { class: 'rc-controls' }, button, h('p', { class: 'fine' }, t('rollcall.note'))),
    h('ol', { class: 'rc-list' }, rows.map((r) => r.el)),
    caption, end);

  return {
    tick(now) {
      for (const r of rows) r.el.title = `${fmtNumber(daysSince(r.a.since.date, now))} ${t('unit.d')}`;
    },
    stop,
  };
}
