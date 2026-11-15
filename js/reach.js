import { db } from "./data.js";
import { distanceAt, AU_KM } from "./time/deepSpace.js";
import { moonSurfaceKm, marsLightSeconds } from "./v1/beam.js";
import { t, fmtNumber } from "./i18n.js";
const C_KM_S = 299792.458;
function lightTimes(now = new Date()) {
  const safe = (fn) => {
    try {
      const v = fn();
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };
  return {
    moon: safe(() => moonSurfaceKm(now) / C_KM_S),
    mars: safe(() => marsLightSeconds(now)),
    kepler: distanceAt(db.ephemeris.kepler, now)?.lightSeconds ?? null,
    pioneer10: distanceAt(db.ephemeris.pioneer10, now)?.lightSeconds ?? null
  };
}
function planetLightSeconds(name, now = new Date()) {
  const A = globalThis.Astronomy;
  const v = A.GeoVector(A.Body[name], now, true);
  return Math.hypot(v.x, v.y, v.z) * AU_KM / C_KM_S;
}
function clock(s) {
  if (s < 60) return `${fmtNumber(s, 2)} ${t("unit.s")}`;
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60);
  if (h === 0) return `${m} ${t("unit.min")} ${String(sec).padStart(2, "0")} ${t("unit.s")}`;
  return `${h} ${t("unit.h")} ${String(m).padStart(2, "0")} ${t("unit.min")}`;
}
const kmOf = (s) => fmtNumber(s * C_KM_S);
export {
  C_KM_S,
  clock,
  kmOf,
  lightTimes,
  planetLightSeconds
};
