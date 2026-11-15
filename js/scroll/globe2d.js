import { enhance } from "./relief.js";
const loadImage = (src) => new Promise((ok, fail) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = fail;
  i.src = src;
});
async function mapPixels(kind) {
  const base = await loadImage(`assets/maps/2k/${kind}.jpg`);
  const c = document.createElement("canvas");
  c.width = base.naturalWidth;
  c.height = base.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(base, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  if (kind === "earth") {
    try {
      const cl = await loadImage("assets/maps/2k/earth-clouds.jpg");
      const c2 = document.createElement("canvas");
      c2.width = c.width;
      c2.height = c.height;
      const g2 = c2.getContext("2d", { willReadFrequently: true });
      g2.drawImage(cl, 0, 0, c.width, c.height);
      const a = g2.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        const k = a[i] / 255 * 0.85;
        d[i] += (255 - d[i]) * k;
        d[i + 1] += (255 - d[i + 1]) * k;
        d[i + 2] += (255 - d[i + 2]) * k;
      }
    } catch {
    }
  }
  if (kind === "mars") enhance(d, c.width, c.height, kind);
  if (kind === "moon" || kind === "earth") {
    const hist = new Uint32Array(256), n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) hist[0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] | 0]++;
    const pick = (f) => {
      let a = 0;
      for (let v = 0; v < 256; v++) {
        a += hist[v];
        if (a >= n * f) return v;
      }
      return 255;
    };
    const lo = pick(kind === "moon" ? 0.01 : 2e-3), hi = pick(0.995), k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, Math.max(0, (d[i + j] - lo) * k));
    if (kind === "moon") for (let i = 0; i < d.length; i += 4) {
      const v = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v * 0.98;
    }
  }
  return { w: c.width, h: c.height, px: new Uint32Array(d.buffer) };
}
function createGlobe2d(canvas, kind, { tilt = 0, light = [-0.3, 0.25, 0.92], gain = 1 } = {}) {
  const ctx = canvas.getContext("2d");
  let map = null, size = 0, out = null, lut = null;
  const L = Math.hypot(...light), lx = light[0] / L, ly = light[1] / L, lz = light[2] / L;
  const ct = Math.cos(tilt * Math.PI / 180), st = Math.sin(tilt * Math.PI / 180);
  function build() {
    const n = size * size;
    lut = { idx: new Int32Array(n).fill(-1), col: new Float32Array(n), row: new Int32Array(n), shade: new Float32Array(n), alpha: new Float32Array(n) };
    const R = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - R) / R, ny = (R - y - 0.5) / R, r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const i = y * size + x, nz = Math.sqrt(1 - r2);
        const tx = nx * ct + ny * st, ty = -nx * st + ny * ct;
        const lat = Math.asin(Math.max(-1, Math.min(1, ty)));
        const lon = Math.atan2(tx, nz);
        lut.idx[i] = i;
        lut.col[i] = (lon / (2 * Math.PI) + 0.5) * map.w;
        lut.row[i] = Math.min(map.h - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * map.h)));
        const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
        lut.shade[i] = Math.min(1.4, (0.06 + 1.12 * Math.pow(ndl, 0.75)) * (0.82 + 0.18 * nz) * gain);
        lut.alpha[i] = Math.min(1, (1 - Math.sqrt(r2)) * R * 1.2);
      }
    }
    out = ctx.createImageData(size, size);
  }
  let turn = 0;
  function draw() {
    if (!map || !lut) return;
    const o = new Uint32Array(out.data.buffer), px = map.px, W = map.w, shift = turn * W;
    const { col, row, shade, alpha, idx } = lut;
    for (let i = 0; i < idx.length; i++) {
      if (idx[i] < 0) {
        o[i] = 0;
        continue;
      }
      let u = (col[i] + shift) % W;
      if (u < 0) u += W;
      const p = px[row[i] * W + (u | 0)], s = shade[i];
      const r = Math.min(255, (p & 255) * s), g = Math.min(255, (p >>> 8 & 255) * s), b = Math.min(255, (p >>> 16 & 255) * s);
      o[i] = alpha[i] * 255 << 24 | b << 16 | g << 8 | r;
    }
    ctx.putImageData(out, 0, 0);
  }
  const ready = mapPixels(kind).then((m) => {
    map = m;
    if (size) {
      build();
      draw();
    }
  });
  return {
    ready,
    resize(px) {
      px = Math.max(16, Math.round(px));
      if (px === size) return;
      size = px;
      canvas.width = canvas.height = px;
      if (map) {
        build();
        draw();
      }
    },
    set(t) {
      turn = t;
      draw();
    }
  };
}
export {
  createGlobe2d
};
