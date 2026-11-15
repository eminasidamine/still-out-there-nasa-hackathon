const AU_KM = 1495978707e-1;
const LIGHT_SECONDS_PER_AU = 499.004784;
function distanceAt(table, date = new Date()) {
  if (!table || !Array.isArray(table.au)) return null;
  const start = Date.parse(table.start + "T00:00:00Z");
  const pos = (date.getTime() - start) / (table.stepDays * 864e5);
  const i = Math.floor(pos);
  if (!(pos >= 0) || i >= table.au.length - 1) return null;
  const au = table.au[i] + (table.au[i + 1] - table.au[i]) * (pos - i);
  return { au, km: au * AU_KM, lightSeconds: au * LIGHT_SECONDS_PER_AU };
}
function formatLightTime(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60);
  if (h === 0) return `${m} min ${Math.floor(seconds % 60)} s`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}
export {
  AU_KM,
  LIGHT_SECONDS_PER_AU,
  distanceAt,
  formatLightTime
};
