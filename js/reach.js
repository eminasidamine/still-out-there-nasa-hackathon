// How far each stop is right now, as light travel time. Everything is computed for this
// second: the Moon and Mars with Astronomy Engine, Kepler and Pioneer 10 from JPL Horizons tables.
import { db } from './data.js';
import { distanceAt, AU_KM } from './time/deepSpace.js';
import { moonSurfaceKm, marsLightSeconds } from './v1/beam.js';
import { t, fmtNumber } from './i18n.js';

export const C_KM_S = 299792.458;

/** { moon, mars, kepler, pioneer10 } in light seconds (null when it cannot be computed). */
export function lightTimes(now = new Date()) {
  const safe = (fn) => { try { const v = fn(); return Number.isFinite(v) ? v : null; } catch { return null; } };
  return {
    moon: safe(() => moonSurfaceKm(now) / C_KM_S),
    mars: safe(() => marsLightSeconds(now)),
    kepler: distanceAt(db.ephemeris.kepler, now)?.lightSeconds ?? null,
    pioneer10: distanceAt(db.ephemeris.pioneer10, now)?.lightSeconds ?? null,
  };
}

/** Light seconds to the distance of a planet right now (used as milestones on the way to Pioneer 10). */
export function planetLightSeconds(name, now = new Date()) {
  const A = globalThis.Astronomy;
  const v = A.GeoVector(A.Body[name], now, true);
  return (Math.hypot(v.x, v.y, v.z) * AU_KM) / C_KM_S;
}

/** The clock in the corner: "1.28 s", "11 min 04 s", "19 h 35 min". */
export function clock(s) {
  if (s < 60) return `${fmtNumber(s, 2)} ${t('unit.s')}`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h === 0) return `${m} ${t('unit.min')} ${String(sec).padStart(2, '0')} ${t('unit.s')}`;
  return `${h} ${t('unit.h')} ${String(m).padStart(2, '0')} ${t('unit.min')}`;
}

export const kmOf = (s) => fmtNumber(s * C_KM_S);
