import { h, statusMark } from "./v1/dom.js";
import { t, lang } from "./i18n.js";
import { db, artifact, factsOf, CHAPTERS, placeOf } from "./data.js";
import { startMusic, stopMusic } from "./v1/ambience.js";
const gsap = globalThis.gsap;
const ROMAN = ["I", "II", "III", "IV", "V"];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sentences = (text) => text.match(/[^.!?…؟]+[.!?…؟]+["'’”»)]*\s*|[^.!?…؟]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
const clipFor = (key) => db.narration?.clips?.[key] ?? null;
const imageOf = (a) => a.media?.find((m) => m.kind === "image");
const audioOf = (a) => a.media?.find((m) => m.kind === "audio");
function sourceLink(id) {
  const s = db.sources.get(id);
  if (!s) return null;
  return h(
    "a",
    { href: s.url, target: "_blank", rel: "noopener" },
    `${s.publisher}: ${s.title}`,
    s.official_resource ? h("span", { class: "tag" }, t("story.official")) : null
  );
}
function narration(key, text) {
  return h(
    "p",
    { class: "narr", "data-clip": key },
    ...sentences(text).flatMap((x, i) => [i ? " " : "", h("span", { class: "sentence" }, x)])
  );
}
function playClip(block, clip, alive, onAudio) {
  const spans = [...block.querySelectorAll(".sentence")];
  const times = clip.sentences.length === spans.length ? clip.sentences : null;
  const audio = new Audio(clip.src);
  onAudio(audio);
  return new Promise((done) => {
    let raf = 0;
    const paint = () => {
      if (!alive()) {
        audio.pause();
        done(false);
        return;
      }
      if (times) {
        const now = audio.currentTime;
        const i = times.findIndex((_, k) => now >= times[k][0] - 0.05 && now < (times[k + 1]?.[0] ?? Infinity));
        spans.forEach((x, k) => {
          x.classList.toggle("reading", k === i);
          x.classList.toggle("read", k < i);
        });
      }
      raf = requestAnimationFrame(paint);
    };
    const end = (ok) => {
      cancelAnimationFrame(raf);
      spans.forEach((x) => x.classList.remove("reading", "read"));
      done(ok);
    };
    audio.addEventListener("ended", () => end(true));
    audio.addEventListener("error", () => end(false));
    audio.play().then(() => {
      raf = requestAnimationFrame(paint);
    }, () => end(false));
  });
}
async function speak(block, alive) {
  if (!("speechSynthesis" in window)) return false;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(lang));
  if (!voice) return false;
  for (const span of block.querySelectorAll(".sentence")) {
    if (!alive()) return false;
    span.classList.add("reading");
    const ok = await new Promise((done) => {
      const u = new SpeechSynthesisUtterance(span.textContent);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.92;
      u.onend = () => done(true);
      u.onerror = () => done(false);
      speechSynthesis.speak(u);
    });
    span.classList.remove("reading");
    if (!ok) return false;
  }
  return true;
}
function openStory(layer, id, start, order, { onClose, onChapter }) {
  const a = artifact(id);
  if (!a) return null;
  let index = Math.max(0, Math.min(CHAPTERS.length, start));
  let run = 0, audio = null, listening = false;
  const alive = (r) => () => r === run;
  const stage = h("div", { class: "story-stage" });
  const rail = h("ol", { class: "story-rail" }, CHAPTERS.map((c, i) => h(
    "li",
    {},
    h("button", { type: "button", onclick: () => go(i) }, h("span", { class: "rail-n" }, ROMAN[i]), h("span", { class: "rail-t" }, chapterTitle(a, c)))
  )));
  const listenBtn = h(
    "button",
    { type: "button", class: "btn btn-primary btn-listen", "aria-pressed": "false", onclick: toggleListen },
    h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    h("span", { class: "lbl" }, t("story.listen"))
  );
  const prev = h("button", { type: "button", class: "btn", onclick: () => go(index - 1) }, "← ", t("story.back"));
  const next = h("button", { type: "button", class: "btn", onclick: () => go(index + 1) }, h("span", { class: "lbl" }, t("story.next")), " →");
  const voice = db.narration?.voices?.[a.id];
  const el = h(
    "div",
    { class: `story story-${a.body}`, role: "dialog", "aria-modal": "true", "aria-label": a.name },
    h(
      "header",
      { class: "story-top" },
      h("button", { type: "button", class: "story-close", onclick: () => onClose() }, h("span", { "aria-hidden": "true" }, "← "), t("story.backTo", { name: a.name })),
      h("p", { class: "story-who" }, statusMark(a.status), h("span", {}, a.name), h("span", { class: "muted" }, " · ", placeOf(a)))
    ),
    h("div", { class: "story-body" }, rail, stage),
    h(
      "footer",
      { class: "story-controls" },
      prev,
      listenBtn,
      next,
      voice ? h("p", { class: "fine story-voice" }, t("story.aiVoice", { name: voice })) : null
    )
  );
  function chapterTitle(x, c) {
    return t(c === "lastDay" && x.status === "still-working" ? "story.lastDay.working" : `story.${c}`);
  }
  function chapterView(i) {
    const c = CHAPTERS[i];
    const facts = factsOf(a, a.chapters[c]?.fact_ids);
    const media = (a.media || []).filter((m) => m.chapter === c);
    const drawer = h(
      "div",
      { class: "facts", hidden: true },
      h("p", { class: "muted" }, t("story.realData.lead")),
      h("ul", {}, facts.map((f) => h("li", {}, h("p", {}, f.text), h("p", { class: "src" }, sourceLink(f.source_id))))),
      lang !== "en" ? h("p", { class: "fine" }, t("real.english")) : null
    );
    const toggle = h("button", { type: "button", class: "facts-toggle", "aria-expanded": "false", onclick() {
      const open = drawer.hidden;
      drawer.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.lastChild.textContent = t(open ? "story.factsHide" : "story.facts");
      if (open && !reduced()) gsap.from(drawer.children, { y: 16, opacity: 0, stagger: 0.06, duration: 0.5, ease: "power3.out" });
    } }, h("span", { class: "facts-n", "aria-hidden": "true" }, String(facts.length)), h("span", {}, t("story.facts")));
    const blocks = [narration(`${a.id}.${c}`, t(`story.${a.id}.${c}`))];
    if (a.id === "opportunity" && c === "carriesOn") blocks.push(h("aside", { class: "sister" }, h("h3", {}, t("story.sister")), narration("opportunity.sister", t("story.opportunity.sister"))));
    return h(
      "article",
      { class: "chapter" },
      h("p", { class: "chapter-num" }, h("span", { class: "roman" }, ROMAN[i]), t("story.chapter", { n: i + 1, total: CHAPTERS.length })),
      h("h1", { class: "chapter-title", tabindex: "-1" }, chapterTitle(a, c)),
      h("div", { class: "chapter-body" }, blocks),
      media.map((m) => m.kind === "image" ? h(
        "figure",
        { class: "chapter-media" },
        h("img", { src: m.src, width: m.width, height: m.height, alt: t(m.alt_key), loading: "lazy" }),
        h("figcaption", {}, t(m.caption_key), " ", h("span", { class: "dim" }, t("media.credit", { credit: m.credit })))
      ) : soundCard(m)),
      facts.length ? h("div", { class: "facts-wrap" }, toggle, drawer) : null
    );
  }
  function endView() {
    const pos = order.indexOf(a.id), nextId = order[(pos + 1) % order.length], n = artifact(nextId);
    return h(
      "article",
      { class: "chapter chapter-end" },
      h("p", { class: "chapter-num" }, statusMark(a.status), t("status." + a.status)),
      h("h1", { class: "chapter-title", tabindex: "-1" }, t("story.end.title")),
      h("p", { class: "end-tag" }, t("app.tagline")),
      h(
        "div",
        { class: "end-actions" },
        h("a", { class: "btn btn-primary", href: `#/${nextId}` }, t("story.nextMachine"), ": ", n.name, " →"),
        h("button", { type: "button", class: "btn", onclick: () => onClose(id) }, t("story.backTo", { name: a.name }))
      )
    );
  }
  function render(dir = 1, animate = true) {
    const view = index >= CHAPTERS.length ? endView() : chapterView(index);
    const old = stage.firstElementChild;
    [...rail.children].forEach((li, i) => {
      li.classList.toggle("done", i < index);
      li.classList.toggle("now", i === index);
      li.firstChild.setAttribute("aria-current", i === index ? "step" : "false");
    });
    prev.disabled = index === 0;
    next.hidden = index >= CHAPTERS.length;
    next.querySelector(".lbl").textContent = t(index === CHAPTERS.length - 1 ? "story.finish" : "story.next");
    listenBtn.hidden = index >= CHAPTERS.length;
    onChapter?.(index);
    if (!old || reduced() || !animate) {
      stage.replaceChildren(view);
      view.querySelector("h1")?.focus({ preventScroll: true });
      return;
    }
    stage.append(view);
    const flip = document.dir === "rtl" ? -1 : 1;
    gsap.to(old, { x: -40 * dir * flip, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => old.remove() });
    const tl = gsap.timeline();
    tl.from(view.querySelector(".chapter-num"), { x: 30 * dir * flip, opacity: 0, duration: 0.6, ease: "expo.out" }, 0.2).from(view.querySelector(".chapter-title"), { x: 40 * dir * flip, opacity: 0, duration: 0.8, ease: "expo.out" }, 0.25).from(view.querySelectorAll(".sentence, .end-tag, .end-actions"), { opacity: 0, duration: 0.6, stagger: 0.05, ease: "power1.out" }, 0.4).from(view.querySelectorAll(".chapter-media, .facts-wrap"), { opacity: 0, y: 16, duration: 0.6, stagger: 0.08, ease: "power2.out" }, 0.55);
    view.querySelector("h1")?.focus({ preventScroll: true });
  }
  function go(i, keepListening = false) {
    if (i < 0 || i > CHAPTERS.length || i === index) return;
    const dir = i > index ? 1 : -1;
    if (!keepListening) stopListen();
    index = i;
    stage.scrollTop = 0;
    render(dir);
  }
  function setListen(on) {
    listening = on;
    listenBtn.setAttribute("aria-pressed", String(on));
    listenBtn.querySelector(".lbl").textContent = t(on ? "story.stop" : "story.listen");
    el.classList.toggle("is-listening", on);
  }
  function stopListen() {
    run++;
    audio?.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    stopMusic();
    setListen(false);
  }
  async function toggleListen() {
    if (listening) {
      stopListen();
      return;
    }
    const r = ++run;
    setListen(true);
    for (const x of document.querySelectorAll("audio")) x.pause();
    startMusic(a.body === "deep" ? "deep" : a.body);
    while (r === run && index < CHAPTERS.length) {
      await new Promise((res) => setTimeout(res, 450));
      for (const block of stage.lastElementChild.querySelectorAll("[data-clip]")) {
        if (r !== run) return;
        block.scrollIntoView?.({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
        const clip = clipFor(block.dataset.clip);
        const ok = clip ? await playClip(block, clip, alive(r), (x) => {
          audio = x;
        }) : await speak(block, alive(r));
        if (!ok) {
          if (r === run) stopListen();
          return;
        }
      }
      if (r !== run) return;
      await new Promise((res) => setTimeout(res, 900));
      if (r !== run) return;
      go(index + 1, true);
    }
    if (r === run) stopListen();
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.target.closest("input, textarea, audio")) return;
    else if (e.key === (document.dir === "rtl" ? "ArrowLeft" : "ArrowRight")) go(index + 1);
    else if (e.key === (document.dir === "rtl" ? "ArrowRight" : "ArrowLeft")) go(index - 1);
  }
  document.addEventListener("keydown", onKey);
  layer.replaceChildren(el);
  render(1, false);
  return {
    el,
    goTo: (i) => go(i),
    get index() {
      return index;
    },
    destroy() {
      stopListen();
      document.removeEventListener("keydown", onKey);
    }
  };
}
function soundCard(m, { onPlay } = {}) {
  const audio = h("audio", { src: m.src, preload: "none" });
  const bars = h("span", { class: "sound-bars", "aria-hidden": "true" }, Array.from({ length: 28 }, (_, i) => h("i", { style: `--i:${i}` })));
  const btn = h("button", { type: "button", class: "btn btn-sound", "aria-pressed": "false", onclick() {
    if (audio.paused) {
      for (const x of document.querySelectorAll("audio")) if (x !== audio) x.pause();
      audio.play();
    } else audio.pause();
  } }, h("span", { class: "lbl" }, t("media.play")));
  const set = (on) => {
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector(".lbl").textContent = t(on ? "media.pause" : "media.play");
    card.classList.toggle("playing", on);
    onPlay?.(on, audio);
  };
  audio.addEventListener("play", () => set(true));
  audio.addEventListener("pause", () => set(false));
  audio.addEventListener("ended", () => set(false));
  const card = h(
    "figure",
    { class: "sound" },
    h("p", { class: "sound-kicker" }, t("media.realSound")),
    h("h3", {}, t(m.title_key)),
    h("div", { class: "sound-row" }, btn, bars),
    audio,
    h("figcaption", {}, t(m.caption_key)),
    h("details", {}, h("summary", {}, t("media.transcript")), h("p", {}, t(m.transcript_key))),
    h("p", { class: "fine" }, t("media.audio.credit", { credit: m.credit }))
  );
  return card;
}
export {
  audioOf,
  imageOf,
  openStory,
  sentences,
  soundCard
};
