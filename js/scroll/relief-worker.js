// Prepares a clearer Moon or Mars map off the main thread (see relief.js).
// The result is flipped vertically, because WebGL does not flip an ImageBitmap for us.
import { enhance } from './relief.js';

self.onmessage = async (e) => {
  const { id, url, kind } = e.data;
  try {
    const blob = await (await fetch(url)).blob();
    const src = await createImageBitmap(blob);
    const w = src.width, hgt = src.height;
    const c = new OffscreenCanvas(w, hgt), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    src.close?.();
    const data = g.getImageData(0, 0, w, hgt);
    enhance(data.data, w, hgt, kind);
    g.putImageData(data, 0, 0);
    const out = new OffscreenCanvas(w, hgt), o = out.getContext('2d');
    o.translate(0, hgt); o.scale(1, -1);
    o.drawImage(c, 0, 0);
    const bitmap = out.transferToImageBitmap();
    self.postMessage({ id, bitmap }, [bitmap]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
