// Rest and block timers. Phase boundaries are absolute timestamps, so the countdown is right
// after the phone sleeps: each tick works out where "now" falls in the schedule.

import { pad } from "./logic.js";

let T = null, actx = null, lock = null, h = null, onChange = () => {};
const $ = s => document.querySelector(s);

function audio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== "running") actx.resume();
  } catch {}
}

function beep(f = 880, d = 0.18) {
  try {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = f; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.3, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d);
    o.start(); o.stop(actx.currentTime + d);
  } catch {}
}

async function wake() {
  try { if (T && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } } catch {}
}

// phases: [[label, seconds], ...] already expanded for repeats; per = phases per round.
export function startTimer(label, phases, per) {
  audio();
  const start = Date.now(), ends = [];
  let acc = start;
  for (const p of phases) { acc += p[1] * 1000; ends.push(acc); }
  T = { label, phases, per: per || phases.length, start, ends, i: 0 };
  onChange(T);
  begin();
}

function begin() {
  $("#timer").hidden = false;
  document.body.classList.add("timing");
  wake();
  clearInterval(h); tick(); h = setInterval(tick, 250);
}

export function stopTimer() {
  clearInterval(h); h = null;
  try { lock && lock.release(); } catch {}
  lock = null; T = null;
  $("#timer").hidden = true; $("#timer").classList.remove("flash");
  document.body.classList.remove("timing");
  onChange(null);
}

function tick() {
  if (!T) return;
  const now = Date.now();
  let i = T.ends.findIndex(e => e > now);
  if (i === -1) {
    if (T.i < T.phases.length) beep(660, 0.6);
    T.i = T.phases.length;
    $("#tT").textContent = "0:00";
    $("#tL").textContent = `${T.label} · done`;
    $("#tR").textContent = "";
    $("#tP").style.transform = "scaleX(0)";
    $("#timer").classList.add("flash");
    clearInterval(h);
    setTimeout(() => { if (T && T.i >= T.phases.length) stopTimer(); }, 3000);
    return;
  }
  if (i !== T.i) { T.i = i; beep(); }
  const left = Math.ceil((T.ends[i] - now) / 1000), from = i ? T.ends[i - 1] : T.start;
  $("#tP").style.transform = `scaleX(${Math.max(0, (T.ends[i] - now) / (T.ends[i] - from))})`;
  $("#timer").classList.toggle("flash", left <= 3);
  $("#tT").textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  $("#tL").textContent = T.phases.length > 1 ? T.phases[i][0] : T.label;
  const rounds = T.phases.length / T.per;
  $("#tR").textContent = rounds > 1 ? `Round ${Math.floor(i / T.per) + 1} of ${rounds}` : "";
}

// Restore a timer saved before a reload. `saved` is what onChange last received.
export function initTimer(saved, cb) {
  onChange = cb;
  if (saved && saved.ends && saved.ends[saved.ends.length - 1] > Date.now()) {
    T = { ...saved };
    begin();
  }
}

// Unlock audio on any tap (iOS needs a gesture), and re-take the wake lock when the app returns.
document.addEventListener("pointerdown", () => { if (T) audio(); }, { passive: true });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && T) { tick(); wake(); } });
