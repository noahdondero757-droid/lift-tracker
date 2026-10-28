// Pure training logic: no DOM, no storage. Ported from reference/current-app.html.

export const MAIN = [["squat", "Squat"], ["bench", "Bench"], ["trapbar", "Trap bar DL"], ["pullup", "Pull-up"]];

export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
export const e1rm = (w, r) => w * (1 + r / 30);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Monday of the week containing date string s, as YYYY-MM-DD.
export function weekOf(s) {
  const d = parseD(s), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

// Newest first: by date, then by save time.
export function sortWorkouts(ws) {
  return ws.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
}

export function nextDay(workouts, program) {
  const last = workouts[0], n = program.days.length;
  return last ? (last.day % n) + 1 : program.days[0].n;
}

export const dayOf = (program, n) => program.days.find(d => d.n === n);
export const itemsOf = day => day.blocks.flatMap(b => b.items);
export const mainItem = day => itemsOf(day).find(i => i.t === "sets") || null;

// True if `w` was logged before `ref` ({date, ts, id}).
function before(w, ref) {
  if (!ref) return true;
  if (w.id === ref.id) return false;
  if (w.date !== ref.date) return w.date < ref.date;
  return (w.ts || 0) < (ref.ts || 0);
}

// Last logged sets for an item (with at least one done set). `workouts` newest first.
export function lastSets(workouts, id, ref) {
  for (const w of workouts) {
    if (!before(w, ref)) continue;
    const e = w.ex && w.ex[id];
    if (e && e.sets && e.sets.some(s => s.r !== "" && s.r != null)) return e.sets;
  }
  return null;
}

// Weight logged last time on a rounds item (e.g. a carry), or "".
export function lastWeight(workouts, id, ref) {
  for (const w of workouts) {
    if (!before(w, ref)) continue;
    const e = w.ex && w.ex[id];
    if (e && e.w) return e.w;
  }
  return "";
}

export function topSet(sets) {
  let best = null;
  for (const s of sets || []) {
    const w = num(s.w), r = num(s.r);
    if (r == null) continue;
    const v = e1rm(w || 0, r);
    if (!best || v > best.v) best = { w: w || 0, r, v };
  }
  return best;
}

// Did these sets hit all prescribed sets × reps at the top working weight?
function judge(sets, item) {
  const done = sets.filter(x => num(x.r) != null), top = Math.max(0, ...done.map(x => num(x.w) || 0));
  if (!top) return null;
  const work = done.filter(x => (num(x.w) || 0) >= top);
  return { top, hit: work.length >= item.sets && work.every(x => num(x.r) >= item.reps) };
}

// Progression target for a sets item. Returns null for non-progression lifts or no history.
export function target(workouts, program, item) {
  const inc = program.progression && program.progression[item.id];
  if (!inc || item.t !== "sets") return null;
  const results = [];
  for (const w of workouts) {
    const e = w.ex && w.ex[item.id];
    if (!e || !e.sets || !e.sets.some(s => s.r !== "" && s.r != null)) continue;
    const j = judge(e.sets, item);
    if (j) results.push(j);
    if (results.length === 2) break;
  }
  const last = results[0];
  if (!last) return null;
  if (last.hit) return { w: last.top + inc, up: true, last: last.top, inc };
  const prev = results[1];
  const deload = prev && !prev.hit && prev.top === last.top ? Math.round(last.top * 0.9 / 5) * 5 : null;
  return { w: last.top, up: false, last: last.top, inc, deload };
}

// Turn a stored workout into an editable form (rounds as arrays of booleans).
export function toForm(w) {
  const ex = {};
  for (const [id, e] of Object.entries(w.ex || {})) {
    if (e.sets) ex[id] = { sets: e.sets.map(s => ({ w: String(s.w ?? ""), r: String(s.r ?? "") })) };
    else if (e.rounds != null) ex[id] = { rounds: Array.from({ length: Math.max(e.of || 0, e.rounds) }, (_, i) => i < e.rounds), w: String(e.w ?? "") };
    else ex[id] = { done: !!e.done, w: String(e.w ?? "") };
  }
  return { id: w.id, day: w.day, date: w.date, ts: w.ts, mins: w.mins, note: w.note || "", ex };
}

// Fill missing entries for a day's items so the form has an input for each.
export function fillForm(form, day) {
  for (const it of itemsOf(day)) {
    if (form.ex[it.id]) continue;
    if (it.t === "sets") form.ex[it.id] = { sets: Array.from({ length: it.sets || 1 }, () => ({ w: "", r: "" })) };
    else if (it.t === "rounds") form.ex[it.id] = { rounds: Array(it.rounds || 1).fill(false), w: "" };
    else form.ex[it.id] = { done: false, w: "" };
  }
  return form;
}

export function newDraft(program, n) {
  return fillForm({ day: n, date: today(), start: Date.now(), ex: {}, note: "" }, dayOf(program, n));
}

// Editable form → stored workout shape. Empty items are left out.
export function fromForm(form) {
  const ex = {};
  for (const [id, e] of Object.entries(form.ex)) {
    if (e.sets) { const s = e.sets.filter(x => x.r !== "" || x.w !== ""); if (s.length) ex[id] = { sets: s }; }
    else if (e.rounds) { const n = e.rounds.filter(Boolean).length; if (n || e.w) ex[id] = { rounds: n, of: e.rounds.length, ...(e.w ? { w: e.w } : {}) }; }
    else if (e.done || e.w) ex[id] = { done: !!e.done, ...(e.w ? { w: e.w } : {}) };
  }
  return { ex };
}

// Volume = sum of weight × reps over done sets.
export function volume(sets) {
  let v = 0;
  for (const s of sets || []) { const w = num(s.w), r = num(s.r); if (w != null && r != null) v += w * r; }
  return v;
}

// Last N week keys (Mondays), oldest first, ending with the current week.
export function lastWeeks(n) {
  const out = [], d = parseD(weekOf(today()));
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i * 7); out.push(ymd(x)); }
  return out;
}

// Pair watch workouts (from Google Health) with logged sessions. A session's time window is
// [finished − mins, finished]; the watch workout overlapping it most wins. Sessions without a save
// time (imported history) fall back to the longest watch workout on the same date.
// Returns { byId: {sessionId: watchWorkout}, unmatched: [watchWorkout] }.
const isWalk = x => /walk|hike|sleep/i.test(x.type || "");
export function matchWatch(workouts, watch) {
  const byId = {}, used = new Set();
  const list = watch.filter(x => x && x.start && x.end);
  for (const w of workouts) {
    let best = null, score = 0;
    if (w.ts && w.mins) {
      const a = w.ts - w.mins * 6e4, b = w.ts;
      for (const x of list) {
        if (used.has(x.start)) continue;
        const o = Math.min(b, +new Date(x.end)) - Math.max(a, +new Date(x.start));
        if (o > score) { score = o; best = x; }
      }
    }
    if (!best) for (const x of list) if (!used.has(x.start) && x.date === w.date && !isWalk(x) && (!best || x.mins > best.mins)) best = x;
    if (best) { byId[w.id] = best; used.add(best.start); }
  }
  const unmatched = list.filter(x => !used.has(x.start) && !isWalk(x) && x.mins >= 15).sort((a, b) => a.start < b.start ? 1 : -1);
  return { byId, unmatched };
}
