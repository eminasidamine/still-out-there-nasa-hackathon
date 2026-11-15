import { lang, t } from "./i18n.js";
const db = { artifacts: [], sources: new Map(), ephemeris: {}, game: null, narration: null };
async function json(path, optional = false) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return await res.json();
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}
function overlay(game, text) {
  const out = structuredClone(game);
  Object.assign(out.ui, text.ui || {});
  Object.assign(out.ending, text.ending || {});
  (text.turns || []).forEach((tt, i) => {
    const turn = out.turns[i];
    if (!turn || !tt) return;
    if (tt.situation) turn.situation = tt.situation;
    if (tt.outcome) turn.outcome = tt.outcome;
    (tt.choices || []).forEach((c, k) => {
      if (turn.choices[k] && c) Object.assign(turn.choices[k], c);
    });
  });
  return out;
}
async function loadData() {
  const [artifacts, sources, pioneer10, kepler, game, narration] = await Promise.all([
    json("data/artifacts.json"),
    json("data/sources.json"),
    json("data/pioneer10_ephemeris.json", true),
    json("data/kepler_ephemeris.json", true),
    json("data/game/opportunity.json", true),
    json(`data/narration/${lang}.json`, true)
  ]);
  const gameText = lang === "en" ? null : await json(`data/game/opportunity.${lang}.json`, true);
  db.sources = new Map(sources.map((s) => [s.id, s]));
  db.ephemeris = { pioneer10, kepler };
  db.game = game && gameText ? overlay(game, gameText) : game;
  db.narration = narration;
  for (const a of artifacts) a.facts = a.facts.filter((f) => f.verified === true && db.sources.has(f.source_id));
  db.artifacts = artifacts;
}
const artifact = (id) => db.artifacts.find((a) => a.id === id);
const byBody = (body) => db.artifacts.filter((a) => a.body === body);
const factsOf = (a, ids = []) => ids.map((id) => a.facts.find((f) => f.id === id)).filter(Boolean);
const CHAPTERS = ["why", "how", "found", "lastDay", "carriesOn"];
const placeOf = (a) => {
  const k = `place.${a.id}`, v = t(k);
  return v === k ? a.location.label : v;
};
const noteOf = (a) => {
  if (!a.location.note) return null;
  const k = `note.${a.id}`, v = t(k);
  return v === k ? a.location.note : v;
};
export {
  CHAPTERS,
  artifact,
  byBody,
  db,
  factsOf,
  loadData,
  noteOf,
  placeOf
};
