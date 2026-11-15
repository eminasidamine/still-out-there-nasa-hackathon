const KEY = "still-out-there-v2:scroll-sound";
const LOOP_S = { moon: 6779977 / 44100, mars: 9400612 / 44100, deep: 4310265 / 44100 };
const MUSIC = 0.2;
const REAL = { ascent: "apollo11-ascent-onboard", cruise: "perseverance-cruise-loop", wind: "mars-wind-sol4-loop", devil: "mars-dust-devil" };
const CAPTIONS = [
  [0.3, 9.6, "Aldrin", "9, 8, 7, 6, 5, Abort Stage, Engine Arm, Ascent, Proceed."],
  [9.6, 13.4, "Aldrin", "We’re off. Look at that stuff go all over the place."],
  [13.4, 15.2, "Aldrin", "Look at that shadow. Beautiful."],
  [15.2, 17.3, "Aldrin", "26, 36 feet per second up."],
  [17.3, 19.5, "Armstrong", "The Eagle has wings."],
  [28.8, 31, "Aldrin", "Very quiet ride."]
];
let ctx = null, nodes = null, last = null, lastMile = "", lastCall = false;
let ascentPlay = null, prevLift = 0, prevDust = 0, onCaption = () => {
};
const captions = (fn) => {
  onCaption = fn;
};
const soundOn = () => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};
async function setSound(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
  }
  if (!on) {
    if (ctx) await ctx.suspend();
    return;
  }
  if (!ctx) await build();
  await ctx.resume();
  if (last) mix(...last);
}
async function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const out = ctx.createDynamicsCompressor();
  out.connect(ctx.destination);
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise.buffer = buf;
  noise.loop = true;
  noise.start();
  const gainOf = (v = 0) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (type, f, q = 0.7) => {
    const x = ctx.createBiquadFilter();
    x.type = type;
    x.frequency.value = f;
    x.Q.value = q;
    return x;
  };
  const rumble = gainOf();
  noise.connect(filter("lowpass", 140)).connect(filter("lowpass", 90)).connect(rumble).connect(out);
  const windF = filter("bandpass", 420, 0.8), wind = gainOf(), gust = gainOf(0.6);
  const lfo = ctx.createOscillator(), lfoAmt = gainOf(0.35);
  lfo.frequency.value = 0.13;
  lfo.connect(lfoAmt).connect(gust.gain);
  lfo.start();
  noise.connect(windF).connect(gust).connect(wind).connect(out);
  const hiss = gainOf();
  noise.connect(filter("highpass", 2800)).connect(filter("lowpass", 7e3)).connect(hiss).connect(out);
  const muffle = filter("lowpass", 18e3), music = gainOf(1);
  muffle.connect(music).connect(out);
  const loops = {};
  for (const w of Object.keys(LOOP_S)) {
    const g = gainOf();
    g.connect(muffle);
    loops[w] = g;
    fetch(`assets/audio/music/${w}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => {
      const s = ctx.createBufferSource(), offset = b.duration > LOOP_S[w] + 0.02 ? 1105 / 44100 : 0;
      s.buffer = b;
      s.loop = true;
      s.loopStart = offset;
      s.loopEnd = Math.min(offset + LOOP_S[w], b.duration);
      s.connect(g);
      s.start(0, offset);
    }).catch((err) => console.warn("music unavailable", err));
  }
  const buffers = {}, real = { cruise: gainOf(), wind: gainOf() };
  real.cruise.connect(out);
  real.wind.connect(out);
  await Promise.all(Object.entries(REAL).map(([k, name]) => fetch(`assets/audio/scroll/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => {
    buffers[k] = b;
  }).catch((err) => console.warn("sound unavailable", name, err))));
  for (const k of ["cruise", "wind"]) {
    if (!buffers[k]) continue;
    const s = ctx.createBufferSource();
    s.buffer = buffers[k];
    s.loop = true;
    s.connect(real[k]);
    s.start();
  }
  nodes = { rumble, wind, windF, hiss, muffle, music, loops, out, real, buffers };
  document.addEventListener("visibilitychange", () => {
    if (!soundOn()) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
}
const set = (param, v, k = 0.08) => param.setTargetAtTime(v, ctx.currentTime, k);
function oneShot(name, level = 1) {
  const b = nodes?.buffers[name];
  if (!b) return null;
  const s = ctx.createBufferSource(), g = ctx.createGain(), t0 = ctx.currentTime;
  s.buffer = b;
  g.gain.value = level;
  s.connect(g).connect(nodes.out);
  s.start();
  return { s, g, t0, stop() {
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    s.stop(ctx.currentTime + 0.8);
  } };
}
function startAscent() {
  ascentPlay?.stop();
  const p = oneShot("ascent", 1);
  if (!p) return;
  ascentPlay = p;
  let shown = -1;
  const tick = () => {
    if (ascentPlay !== p) return;
    const t = ctx.currentTime - p.t0, i = CAPTIONS.findIndex(([a, b]) => t >= a && t < b);
    if (i !== shown) {
      shown = i;
      onCaption(i < 0 ? null : { who: CAPTIONS[i][2], text: CAPTIONS[i][3] });
    }
    if (t < p.s.buffer.duration) requestAnimationFrame(tick);
    else {
      ascentPlay = null;
      onCaption(null);
      if (last) mix(...last);
    }
  };
  p.s.onended = () => {
    if (ascentPlay === p) {
      ascentPlay = null;
      onCaption(null);
      if (last) mix(...last);
    }
  };
  tick();
}
function stopAscent() {
  if (!ascentPlay) return;
  ascentPlay.stop();
  ascentPlay = null;
  onCaption(null);
}
function blip(freq = 880, level = 0.05, dur = 0.18) {
  if (!ctx || ctx.state !== "running") return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime;
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(level, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
  o.connect(g).connect(nodes.out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function mix(m) {
  last = [m];
  if (!nodes || ctx.state !== "running") return;
  const n = nodes, { music, hush = 0, engine = 0, dust = 0, hiss = 0, cruise = 0, lift = -1, devil = 0, mile = "", call = false } = m;
  if (lift >= 0.02 && lift <= 1 && prevLift < 0.02) startAscent();
  if (lift < 0 || lift > 2) stopAscent();
  prevLift = lift;
  const duck = (1 - 0.65 * engine) * (1 - hush) * (ascentPlay ? 0.4 : 1);
  for (const w of Object.keys(n.loops)) set(n.loops[w].gain, MUSIC * (music[w] || 0) * duck, 0.25);
  set(n.muffle.frequency, 18e3 * (1 - dust) ** 3 + 650, 0.2);
  set(n.rumble.gain, 0.5 * engine, 0.05);
  set(n.real.wind.gain, 1.1 * dust ** 1.2, 0.25);
  set(n.wind.gain, 0.16 * dust ** 1.4, 0.2);
  set(n.windF.frequency, 380 + 520 * dust, 0.4);
  set(n.hiss.gain, 0.035 * hiss, 0.15);
  set(n.real.cruise.gain, 1.2 * cruise, 0.3);
  if (devil >= 0.6 && prevDust < 0.6) oneShot("devil", 0.9);
  prevDust = devil;
  if (mile && mile !== lastMile) blip(1320, 0.04, 0.12);
  lastMile = mile;
  if (call && !lastCall) {
    blip(660, 0.05, 0.5);
    setTimeout(() => blip(660, 0.025, 0.6), 700);
  }
  lastCall = call;
}
function levels() {
  if (!nodes) return null;
  const n = nodes;
  return { state: ctx.state, ascent: !!ascentPlay, cruise: n.real.cruise.gain.value, realWind: n.real.wind.gain.value, loaded: Object.keys(n.buffers), moon: n.loops.moon.gain.value, mars: n.loops.mars.gain.value, deep: n.loops.deep.gain.value, muffle: n.muffle.frequency.value, rumble: n.rumble.gain.value, wind: n.wind.gain.value, hiss: n.hiss.gain.value };
}
export {
  captions,
  levels,
  mix,
  setSound,
  soundOn
};
