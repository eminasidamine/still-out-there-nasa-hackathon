const RAD = Math.PI / 180;
const sin = (deg) => Math.sin(deg * RAD);
const cos = (deg) => Math.cos(deg * RAD);
const mod = (x, n) => (x % n + n) % n;
const LEAP_SECONDS = [
  ["1972-01-01", 10],
  ["1972-07-01", 11],
  ["1973-01-01", 12],
  ["1974-01-01", 13],
  ["1975-01-01", 14],
  ["1976-01-01", 15],
  ["1977-01-01", 16],
  ["1978-01-01", 17],
  ["1979-01-01", 18],
  ["1980-01-01", 19],
  ["1981-07-01", 20],
  ["1982-07-01", 21],
  ["1983-07-01", 22],
  ["1985-07-01", 23],
  ["1988-01-01", 24],
  ["1990-01-01", 25],
  ["1991-01-01", 26],
  ["1992-07-01", 27],
  ["1993-07-01", 28],
  ["1994-07-01", 29],
  ["1996-01-01", 30],
  ["1997-07-01", 31],
  ["1999-01-01", 32],
  ["2006-01-01", 33],
  ["2009-01-01", 34],
  ["2012-07-01", 35],
  ["2015-07-01", 36],
  ["2017-01-01", 37]
].map(([d, s]) => [Date.parse(d + "T00:00:00Z"), s]);
function ttMinusUtc(millis) {
  let tai = 10;
  for (const [from, s] of LEAP_SECONDS) if (millis >= from) tai = s;
  return tai + 32.184;
}
const PERTURBERS = [
  [71e-4, 2.2353, 49.409],
  [57e-4, 2.7543, 168.173],
  [39e-4, 1.1177, 191.837],
  [37e-4, 15.7866, 21.736],
  [21e-4, 2.1354, 15.704],
  [2e-3, 2.4694, 95.528],
  [18e-4, 32.8493, 49.095]
];
function marsState(date = new Date()) {
  const millis = date.getTime();
  const jdUT = 24405875e-1 + millis / 864e5;
  const jdTT = jdUT + ttMinusUtc(millis) / 86400;
  const dt = jdTT - 2451545;
  const M = 19.3871 + 0.52402073 * dt;
  const alphaFMS = 270.3871 + 0.524038496 * dt;
  let pbs = 0;
  for (const [A, tau, phi] of PERTURBERS) pbs += A * cos(0.985626 * dt / tau + phi);
  const nuM = (10.691 + 3e-7 * dt) * sin(M) + 0.623 * sin(2 * M) + 0.05 * sin(3 * M) + 5e-3 * sin(4 * M) + 5e-4 * sin(5 * M) + pbs;
  const Ls = mod(alphaFMS + nuM, 360);
  const eot = 2.861 * sin(2 * Ls) - 0.071 * sin(4 * Ls) + 2e-3 * sin(6 * Ls) - nuM;
  const mst = mod(24 * ((jdTT - 24515495e-1) / 1.0274912517 + 44796 - 9626e-7), 24);
  const subsolarLonW = mod(15 * mst + eot + 180, 360);
  const declination = Math.asin(0.42565 * sin(Ls)) / RAD + 0.25 * sin(Ls);
  return {
    jdTT,
    dt,
    M: mod(M, 360),
    alphaFMS: mod(alphaFMS, 360),
    pbs,
    nuM,
    Ls,
    eot,
    mst,
    subsolarLonW,
    declination,
    subsolar: { lat: declination, lonEast: mod(360 - subsolarLonW, 360) }
  };
}
function marsLocal(lat, lonEast, date = new Date()) {
  const s = marsState(date);
  const lonW = mod(360 - lonEast, 360);
  const lmst = mod(s.mst - lonW / 15, 24);
  const ltst = mod(lmst + s.eot / 15, 24);
  const H = lonW - s.subsolarLonW;
  const cosZ = sin(s.declination) * sin(lat) + cos(s.declination) * cos(lat) * cos(H);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  return { lmst, ltst, elevation, phase: dayPhase(elevation, ltst < 12), Ls: s.Ls };
}
function dayPhase(elevation, rising) {
  if (elevation >= 6) return "day";
  if (elevation > -6) return rising ? "dawn" : "dusk";
  return "night";
}
function marsSeason(Ls) {
  return ["spring", "summer", "autumn", "winter"][Math.floor(mod(Ls, 360) / 90)];
}
function formatHours(h, withSeconds = false) {
  const total = Math.round(mod(h, 24) * 3600) % 86400;
  const p = (n) => String(n).padStart(2, "0");
  const hh = Math.floor(total / 3600), mm = Math.floor(total % 3600 / 60), ss = total % 60;
  return withSeconds ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}`;
}
export {
  dayPhase,
  formatHours,
  marsLocal,
  marsSeason,
  marsState
};
