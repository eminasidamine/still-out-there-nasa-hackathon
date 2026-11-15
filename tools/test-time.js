import { readFileSync } from "node:fs";
import vm from "node:vm";
import { marsState, marsLocal, formatHours } from "../js/time/marsTime.js";
import { moonSubsolar, moonSunElevation, nextMoonSunEvent } from "../js/time/moonTime.js";
import { distanceAt } from "../js/time/deepSpace.js";
const root = new URL("..", import.meta.url);
vm.runInThisContext(readFileSync(new URL("vendor/astronomy.browser.min.js", root), "utf8"));
const A = globalThis.Astronomy;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
{
  const d = new Date(9471168e5);
  const s = marsState(d), l = marsLocal(0, 0, d);
  check("Mars ex1 Δt", near(s.dt, 4.50074, 1e-5), s.dt.toFixed(5));
  check("Mars ex1 M", near(s.M, 21.74558, 1e-4), s.M.toFixed(5));
  check("Mars ex1 αFMS", near(s.alphaFMS, 272.74566, 1e-4), s.alphaFMS.toFixed(5));
  check("Mars ex1 PBS", near(s.pbs, 142e-5, 1e-5), s.pbs.toFixed(5));
  check("Mars ex1 ν−M", near(s.nuM, 4.44193, 1e-4), s.nuM.toFixed(5));
  check("Mars ex1 Ls", near(s.Ls, 277.18758, 1e-4), s.Ls.toFixed(5));
  check("Mars ex1 EOT", near(s.eot, -5.18774, 1e-4), s.eot.toFixed(5));
  check("Mars ex1 MST", formatHours(s.mst, true) === "23:59:39", formatHours(s.mst, true));
  check("Mars ex1 LTST", formatHours(l.ltst, true) === "23:38:54", formatHours(l.ltst, true));
  check("Mars ex1 subsolar lon", near(s.subsolarLonW, 174.726, 1e-3), s.subsolarLonW.toFixed(5));
  check("Mars ex1 declination", near(s.declination, -25.22825, 1e-4), s.declination.toFixed(5));
  check("Mars ex1 zenith angle", near(90 - l.elevation, 154.26182, 1e-3), (90 - l.elevation).toFixed(5));
}
{
  const d = new Date(1073137591e3);
  const s = marsState(d), l = marsLocal(-14.64, 360 - 184.702, d);
  check("Mars ex2 Ls", near(s.Ls, 327.32416, 1e-4), s.Ls.toFixed(5));
  check("Mars ex2 EOT", near(s.eot, -12.77553, 1e-4), s.eot.toFixed(5));
  check("Mars ex2 MST", formatHours(s.mst, true) === "13:09:55", formatHours(s.mst, true));
  check("Mars ex2 LMST", formatHours(l.lmst, true) === "00:51:07", formatHours(l.lmst, true));
  check("Mars ex2 LTST", ["00:00:00", "23:59:59", "00:00:01"].includes(formatHours(l.ltst, true)), formatHours(l.ltst, true));
  check("Mars ex2 zenith angle", near(90 - l.elevation, 151.93895, 1e-3), (90 - l.elevation).toFixed(5));
}
{
  const start = new Date("2026-11-01T00:00:00Z");
  const full = A.SearchMoonPhase(180, start, 40).date;
  const fresh = A.SearchMoonPhase(0, start, 40).date;
  const firstQ = A.SearchMoonPhase(90, start, 40).date;
  const lastQ = A.SearchMoonPhase(270, start, 40).date;
  const sf = moonSubsolar(full), sn = moonSubsolar(fresh), sq = moonSubsolar(firstQ), sl = moonSubsolar(lastQ);
  check("Full Moon: Sun over centre of near side", near(sf.lonEast, 0, 10), `lon ${sf.lonEast.toFixed(1)}°`);
  check("New Moon: Sun over far side", Math.abs(sn.lonEast) > 170, `lon ${sn.lonEast.toFixed(1)}°`);
  check("First quarter: Sun over east limb", near(sq.lonEast, 90, 10), `lon ${sq.lonEast.toFixed(1)}°`);
  check("Last quarter: Sun over west limb", near(sl.lonEast, -90, 10), `lon ${sl.lonEast.toFixed(1)}°`);
  check("Subsolar latitude stays within ±1.6°", [sf, sn, sq, sl].every((s) => Math.abs(s.lat) < 1.6));
  check("Full Moon: Tranquility Base in daylight", moonSunElevation(0.67416, 23.47314, full) > 0);
  check("New Moon: Tranquility Base in darkness", moonSunElevation(0.67416, 23.47314, fresh) < 0);
  const el = moonSunElevation(0.67416, 23.47314, new Date("1969-07-20T20:17:40Z"));
  check("Apollo 11 landing: low morning Sun", el > 8 && el < 13, `elevation ${el.toFixed(1)}°`);
  const rise = nextMoonSunEvent(0.67416, 23.47314, fresh);
  const set = nextMoonSunEvent(0.67416, 23.47314, new Date(rise.date.getTime() + 36e5));
  const days = (set.date - rise.date) / 864e5;
  check("Daylight at Tranquility lasts ~14.8 days", rise.type === "sunrise" && set.type === "sunset" && near(days, 14.77, 0.4), `${days.toFixed(2)} d`);
}
{
  const table = { start: "2026-11-01", stepDays: 1, au: [100, 102, 104] };
  check("Distance interpolates", near(distanceAt(table, new Date("2026-11-01T12:00:00Z")).au, 101, 1e-9));
  check("Outside table → null (widget hides)", distanceAt(table, new Date("2030-01-01")) === null && distanceAt(table, new Date("2020-01-01")) === null);
  check("Missing table → null", distanceAt(null) === null);
  try {
    const p10 = JSON.parse(readFileSync(new URL("data/pioneer10_ephemeris.json", root), "utf8"));
    const d = distanceAt(p10, new Date("2026-11-14T00:00:00Z"));
    check("Pioneer 10 table plausible vs NASA 2017 figure", d && d.au > 139 && d.au < 144, d && d.au.toFixed(3) + " AU");
  } catch (e) {
    check("Pioneer 10 table readable", false, e.message);
  }
}
console.log(failed ? `
${failed} check(s) FAILED` : "\nAll time checks passed");
process.exit(failed ? 1 : 0);
