import { dayPhase } from "./marsTime.js";
const RAD = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function moonSubsolar(date = new Date()) {
  const A = globalThis.Astronomy;
  const t = A.MakeTime(date);
  const axis = A.RotationAxis(A.Body.Moon, t);
  const sun = A.GeoVector(A.Body.Sun, t, true);
  const moon = A.GeoMoon(t);
  let s = [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z];
  const len = Math.hypot(...s);
  s = s.map((v) => v / len);
  const z = [axis.north.x, axis.north.y, axis.north.z];
  const a0 = axis.ra * 15 * RAD;
  const node = [-Math.sin(a0), Math.cos(a0), 0];
  const y0 = cross(z, node);
  const W = axis.spin * RAD;
  const x = node.map((v, i) => v * Math.cos(W) + y0[i] * Math.sin(W));
  const y = cross(z, x);
  return { lat: Math.asin(dot(s, z)) / RAD, lonEast: Math.atan2(dot(s, y), dot(s, x)) / RAD };
}
function elevationFrom(sub, lat, lonEast) {
  const c = Math.sin(lat * RAD) * Math.sin(sub.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sub.lat * RAD) * Math.cos((lonEast - sub.lonEast) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, c))) / RAD;
}
function moonSunElevation(lat, lonEast, date = new Date()) {
  return elevationFrom(moonSubsolar(date), lat, lonEast);
}
function nextMoonSunEvent(lat, lonEast, date = new Date()) {
  const HOUR = 36e5;
  const el = (ms) => moonSunElevation(lat, lonEast, new Date(ms));
  let t0 = date.getTime(), e0 = el(t0);
  for (let i = 0; i < 32 * 8; i++) {
    const t1 = t0 + 3 * HOUR, e1 = el(t1);
    if (e0 < 0 !== e1 < 0) {
      let a = t0, b = t1;
      for (let k = 0; k < 20; k++) {
        const m = (a + b) / 2;
        if (el(m) < 0 === e0 < 0) a = m;
        else b = m;
      }
      return { type: e0 < 0 ? "sunrise" : "sunset", date: new Date((a + b) / 2) };
    }
    t0 = t1;
    e0 = e1;
  }
  return null;
}
function moonLocal(lat, lonEast, date = new Date()) {
  const elevation = moonSunElevation(lat, lonEast, date);
  const later = moonSunElevation(lat, lonEast, new Date(date.getTime() + 36e5));
  const next = nextMoonSunEvent(lat, lonEast, date);
  return { elevation, phase: dayPhase(elevation, later > elevation), next };
}
export {
  elevationFrom,
  moonLocal,
  moonSubsolar,
  moonSunElevation,
  nextMoonSunEvent
};
