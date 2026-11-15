import { LANGUAGES, preferredLanguage, chooseLanguage } from "../i18n.js";
const intro = document.getElementById("intro");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
if (intro) {
  const sky = document.createElement("div");
  sky.className = "intro-stars";
  sky.setAttribute("aria-hidden", "true");
  const n = Math.round(Math.min(220, innerWidth * innerHeight / 7e3));
  for (let i = 0; i < n; i++) {
    const st = document.createElement("i");
    const big = Math.random() < 0.12;
    st.style.cssText = `left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;--s:${big ? 2.6 : 1 + Math.random() * 1.2}px;--d:${(2 + Math.random() * 4).toFixed(2)}s;--l:${(-Math.random() * 6).toFixed(2)}s`;
    sky.append(st);
  }
  intro.querySelector(".intro-sky")?.after(sky);
  const atStart = ["", "#", "#/", "#/start"].includes(location.hash);
  if (!atStart) intro.remove();
  else {
    document.documentElement.classList.add("has-intro");
    const NAMES = { en: "English", fr: "Français", ar: "العربية" };
    const pick = document.getElementById("intro-lang"), cur = preferredLanguage();
    for (const [code, label] of LANGUAGES) {
      const o = document.createElement("option");
      o.value = code;
      o.lang = code;
      o.textContent = NAMES[code] ?? label;
      pick?.append(o);
    }
    if (pick) {
      pick.value = cur;
      pick.onchange = () => {
        if (pick.value !== cur) chooseLanguage(pick.value);
      };
    }
    const booting = () => !!document.getElementById("boot");
    const shown = () => intro.classList.add("is-shown");
    if (booting()) new MutationObserver((_, ob) => {
      if (!booting()) {
        ob.disconnect();
        shown();
      }
    }).observe(document.body, { childList: true });
    else shown();
    let gone = false;
    const block = (e) => {
      if (!gone) e.preventDefault();
    };
    const leave = () => {
      if (gone || booting()) return;
      gone = true;
      removeEventListener("wheel", onWheel, { passive: false });
      removeEventListener("touchmove", block, { passive: false });
      removeEventListener("keydown", onKey);
      scrollTo(0, 0);
      intro.classList.add("is-leaving");
      document.documentElement.classList.remove("has-intro");
      setTimeout(() => intro.remove(), reduced() ? 0 : 1400);
    };
    const onWheel = (e) => {
      e.preventDefault();
      if (e.deltaY > 4) leave();
    };
    let y0 = null;
    const onKey = (e) => {
      if (e.target.closest?.("select")) return;
      if ([" ", "Enter", "ArrowDown", "PageDown", "ArrowRight", "ArrowLeft"].includes(e.key)) {
        e.preventDefault();
        leave();
      }
    };
    addEventListener("wheel", onWheel, { passive: false });
    addEventListener("touchstart", (e) => {
      y0 = e.touches[0].clientY;
    }, { passive: true });
    addEventListener("touchmove", block, { passive: false });
    addEventListener("touchend", (e) => {
      if (y0 != null && y0 - e.changedTouches[0].clientY > 30) leave();
      y0 = null;
    }, { passive: true });
    addEventListener("keydown", onKey);
    document.getElementById("intro-enter")?.addEventListener("click", leave);
    intro.focus?.();
  }
}
