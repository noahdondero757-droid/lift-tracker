// Recovery math (spec vitals.md V3–V4), ported from reference/current-app.html. Pure functions over
// the days served by the Google script: days[YYYY-MM-DD] = { hrv, rhr, rr, spo2, steps, vo2, weight, sleep }.

import { ymd } from "./logic.js";

// Newest first: [{date, hrv, ...}] and the nights with sleep [{date, deep, rem, light, awake, onset, wakeMin, wakes}].
export function lists(days) {
  const vitals = Object.keys(days || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().map(d => ({ date: d, ...days[d] }));
  const sleeps = vitals.filter(v => v.sleep && (v.sleep.deep + v.sleep.rem + v.sleep.light) >= 60).map(v => ({ date: v.date, ...v.sleep }));
  return { vitals, sleeps };
}

export const asleep = s => (s.deep || 0) + (s.rem || 0) + (s.light || 0);
export const today = () => ymd(new Date());
export const recent = d => d === today() || d === ymd(new Date(Date.now() - 864e5));

// Minutes after midnight, evening-anchored (a 1 a.m. bedtime counts as 25:00).
const onsetMin = s => { if (!s || !s.onset) return null; const d = new Date(s.onset); let m = d.getHours() * 60 + d.getMinutes(); if (m < 12 * 60) m += 1440; return m; };
function usualOnset(sleeps, date) {
  const prev = sleeps.filter(x => x.date < date && x.onset).slice(0, 13).map(onsetMin).filter(x => x != null).sort((a, b) => a - b);
  return prev.length >= 3 ? prev[Math.floor(prev.length / 2)] : null;
}

// Apple-style sleep score: Duration 50 · Bedtime 30 · Interruptions 20.
export function scoreParts(s, sleeps) {
  if (!s) return null;
  const t = asleep(s); if (!t) return null;
  // duration: full marks at 7h50m+, steeper loss the shorter you go
  const short = Math.max(0, (470 - t) / 60);
  let dl = short <= 1 ? 5.5 * short : short <= 2 ? 5.5 + 7.5 * (short - 1) : 13 + 18.5 * (short - 2);
  if ((s.deep || 0) / t < 0.10) dl += 5;
  if ((s.rem || 0) / t < 0.15) dl += 5;
  const dur = Math.max(0, 50 - dl);
  // bedtime: vs your median bedtime over the last 13 nights
  const on = onsetMin(s), us = usualOnset(sleeps, s.date);
  let bed = 30, late = null;
  if (on != null && us != null) {
    late = on - us;
    let bl = 0;
    if (late > 15) bl = late <= 60 ? (late - 15) / 45 * 10 : 10 + Math.min(20, (late - 60) / 90 * 20);
    else if (late < -60) bl = Math.min(6, (-late - 60) / 30);
    bed = Math.max(0, 30 - bl);
  }
  // interruptions: awake time after falling asleep and number of wake-ups
  const aw = s.wakeMin != null ? s.wakeMin : (s.awake || 0), n = s.wakes != null ? s.wakes : null;
  const il = Math.max(0, aw - 11) / 4 + (n != null ? Math.max(0, n - 2) / 2 : 0);
  const intr = Math.max(0, 20 - il);
  return { dur: Math.round(dur), bed: Math.round(bed), intr: Math.round(intr), total: Math.round(dur + bed + intr), late, bedKnown: on != null && us != null, aw, n };
}
export const sleepScore = (s, sleeps) => { const p = scoreParts(s, sleeps); return p ? p.total : null; };
export const scoreWord = n => n >= 96 ? "Very high" : n >= 81 ? "High" : n >= 61 ? "OK" : n >= 41 ? "Low" : "Very low";
export const scoreCls = n => n >= 81 ? "good" : n >= 61 ? "warn" : "bad";

// Average of metric k over n entries starting at index `from` (vitals newest first).
export function avgV(vitals, k, from, n) {
  const xs = vitals.slice(from, from + n).map(v => v[k]).filter(x => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
// Latest reading of k vs the 7 entries before it.
export function delta(vitals, k) {
  const i = vitals.findIndex(v => v[k] != null); if (i < 0) return null;
  const b = avgV(vitals, k, i + 1, 7);
  return b == null ? null : { v: vitals[i][k], b, d: vitals[i][k] - b, date: vitals[i].date };
}

const LV = [
  { cls: "bad", label: "Go easy", tip: "Cut the main lift to 3×5 and skip the finisher." },
  { cls: "warn", label: "Moderate", tip: "Hit your working sets. Skip any extra volume." },
  { cls: "good", label: "Ready", tip: "Push the main lift and hit every round." },
];
export function readiness(s, vitals, useFlags = true) {
  if (!s) return null;
  const t = asleep(s), d = s.deep || 0, notes = [];
  let lv = (t < 360 || d < 40) ? 0 : (t >= 450 && d >= 60) ? 2 : 1;
  if (useFlags) {
    const r = delta(vitals, "rhr"), h = delta(vitals, "hrv"), b = delta(vitals, "rr");
    const rUp = r && recent(r.date) && r.d >= 3, bUp = b && recent(b.date) && b.d >= 1, hDown = h && recent(h.date) && h.b && h.d / h.b <= -0.10;
    if (rUp && bUp) { lv = 0; notes.push(`Breathing rate up ${b.d.toFixed(1)}/min and resting HR up ${Math.round(r.d)} bpm. That combo often means you're fighting something off.`); }
    else {
      if (rUp) { lv--; notes.push(`Resting HR is up ${Math.round(r.d)} bpm on your week.`); }
      if (hDown) { lv--; notes.push(`HRV is ${Math.round(-h.d / h.b * 100)}% below your week.`); }
      if (bUp) notes.push(`Breathing rate is up ${b.d.toFixed(1)}/min. Watch for signs of getting sick.`);
    }
  }
  return { ...LV[Math.max(0, lv)], notes };
}

export function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
