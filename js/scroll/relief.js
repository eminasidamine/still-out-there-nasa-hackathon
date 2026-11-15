// Clearer Moon and Mars maps. The source maps are flat colour mosaics: pale, low in contrast, no shadows.
// This makes a copy with the grey levels stretched to the full range and a light emboss that brings out crater
// rims and valleys, like a shaded-relief map (light from the upper left). Positions on the map are unchanged.
// The work runs in a worker where the browser allows it, so the page never freezes while a 4K map is prepared.

/** Stretch + relief, in place, on RGBA pixels. kind 'moon': grey, a touch warm. kind 'mars': keeps its colours. */
export function enhance(d, w, hgt, kind) {
  const n = w * hgt, L = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    L[i] = v; hist[v | 0]++;
  }
  // levels: ignore the darkest 1% and brightest 0.5% when choosing the range
  const pick = (f) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * f) return v; } return 255; };
  const lo = pick(0.01), hi = pick(0.995), span = Math.max(1, hi - lo);
  const S = new Float32Array(n);
  const gamma = kind === 'moon' ? 1.25 : 1.1;
  for (let i = 0; i < n; i++) S[i] = Math.pow(Math.min(1, Math.max(0, (L[i] - lo) / span)), gamma);
  const k = kind === 'moon' ? 1.4 : 1.0;                    // how strong the relief is
  for (let y = 0; y < hgt; y++) {
    const up = Math.max(0, y - 1) * w, down = Math.min(hgt - 1, y + 1) * w, row = y * w;
    for (let x = 0; x < w; x++) {
      const xl = x === 0 ? w - 1 : x - 1, xr = x === w - 1 ? 0 : x + 1;      // the map wraps east–west
      const relief = (S[up + xl] - S[down + xr]) * k;
      const i = row + x, j = i * 4;
      if (kind === 'moon') {
        const v = Math.min(1, Math.max(0, S[i] * 0.85 + relief + 0.16));
        d[j] = v * 255; d[j + 1] = v * 250; d[j + 2] = v * 244;
      } else {
        // Mars: scale each channel by the new brightness, so the reds, ochres and dark basalts stay as they are
        const target = Math.min(1, Math.max(0, S[i] * 0.9 + relief + 0.12)) * 255;
        const f = target / Math.max(4, L[i]);
        d[j] = Math.min(255, d[j] * f); d[j + 1] = Math.min(255, d[j + 1] * f); d[j + 2] = Math.min(255, d[j + 2] * f);
      }
    }
  }
}

let worker = null, seq = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    if (typeof OffscreenCanvas !== 'function') throw new Error('no OffscreenCanvas');
    worker = new Worker(new URL('./relief-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); e.data.bitmap ? w.ok(e.data.bitmap) : w.fail(new Error(e.data.error)); };
    worker.onerror = () => { worker = false; for (const w of waiting.values()) w.retry(); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}

/** On the page itself (no worker): returns a canvas, the right way up for an ordinary texture (flipY = true). */
function onPage(url, kind) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      enhance(data.data, c.width, c.height, kind);
      g.putImageData(data, 0, 0);
      ok({ image: c, flipY: true });
    };
    img.onerror = fail;
    img.src = url;
  });
}

/** The clearer map, as { image, flipY } ready to put in a THREE.Texture. */
export function reliefMap(url, kind) {
  const w = getWorker();
  if (!w) return onPage(url, kind);
  return new Promise((ok, fail) => {
    const id = ++seq;
    waiting.set(id, { ok: (bitmap) => ok({ image: bitmap, flipY: false }), fail: () => onPage(url, kind).then(ok, fail), retry: () => onPage(url, kind).then(ok, fail) });
    w.postMessage({ id, url: new URL(url, location.href).href, kind });
  });
}
