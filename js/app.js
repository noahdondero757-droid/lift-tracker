import * as db from "./db.js";
import { startTimer, stopTimer, initTimer } from "./timer.js";
import { progressChart, barChart } from "./charts.js";
import {
  MAIN, pad, today, parseD, num, uid, weekOf, sortWorkouts, nextDay, dayOf, itemsOf, mainItem,
  lastSets, lastWeight, topSet, target, toForm, fillForm, newDraft, fromForm, volume, lastWeeks,
} from "./logic.js";

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = s => parseD(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const clone = o => JSON.parse(JSON.stringify(o));
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(s % 60); };
const lb = v => (Math.round(v * 10) / 10).toLocaleString();
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200); }

/* ---------- state ---------- */
const TABS = ["today", "train", "history", "settings"];
let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "today";
let program = null, defaultProgram = null, programEdited = false, names = {};
let workouts = [], draft = null, editing = null, ready = false, loadError = "";
let hist = { lift: "squat", range: "12", vol: "all" }, progDay = 1;
const howOpen = new Set(); // exercises whose "How to" is expanded

const persistDraft = () => db.kvSet("draft", draft ? clone(draft) : undefined).catch(() => toast("Couldn't save. Storage may be full."));
let progT;
function saveProgram() {
  programEdited = true;
  for (const d of program.days) for (const it of itemsOf(d)) names[it.id] = { n: it.n, t: it.t };
  clearTimeout(progT);
  progT = setTimeout(() => { db.kvSet("program", clone(program)); db.kvSet("names", names); }, 250);
}

function itemInfo(id) {
  for (const d of program.days) for (const it of itemsOf(d)) if (it.id === id) return it;
  return names[id] ? { id, ...names[id] } : null;
}

/* ---------- icons (SF Symbols look-alikes) ---------- */
const IC = {
  chev: `<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  play: `<svg class="ic" viewBox="0 0 12 14" aria-hidden="true"><path d="M1.5 1.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4c.6-.4.6-1.3 0-1.7L3.1.8C2.4.3 1.5.8 1.5 1.6z" fill="currentColor"/></svg>`,
  plus: `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M10 5.5v9M5.5 10h9" stroke="var(--card)" stroke-width="2" stroke-linecap="round"/></svg>`,
  up: `<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M2.5 6.5L7 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2.5 7.5L7 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg class="ic" viewBox="0 0 14 16" aria-hidden="true"><path d="M1 3.5h12M5 3.5V2h4v1.5M2.5 3.5l.8 10.2c.1.7.6 1.3 1.3 1.3h4.8c.7 0 1.2-.6 1.3-1.3l.8-10.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  share: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 12.5V3M6.5 6.2L10 2.7l3.5 3.5M6.5 9H5v8h10V9h-1.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  inbox: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5V12M6.5 8.5L10 12l3.5-3.5M6.5 9H5v8h10V9h-1.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowUp: `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M8 12V4.5M5 7.2L8 4.2l3 3" fill="none" stroke="var(--card)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  info: `<svg class="ic" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="5.2" r="1.1" fill="currentColor"/></svg>`,
  warn: `<svg class="ic" viewBox="0 0 16 15" aria-hidden="true"><path d="M6.6 1.2c.6-1.1 2.2-1.1 2.8 0l6.3 11.3c.6 1.1-.2 2.4-1.4 2.4H1.7C.5 14.9-.3 13.6.3 12.5z" fill="currentColor"/><path d="M8 5v4.2" stroke="var(--card)" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="var(--card)"/></svg>`,
};

/* ---------- building blocks ---------- */
const largeTitle = (title, sub = "", top = "") => `<header class="lt">${top}<h1>${title}</h1>${sub ? `<p class="lt-sub">${sub}</p>` : ""}</header>`;
// Inset grouped list, like the Settings app. `inner` is already-escaped HTML.
const group = (head, inner, { foot = "", right = "", cls = "" } = {}) =>
  `<section class="group">${head || right ? `<div class="gh"><span>${head}</span>${right}</div>` : ""}<div class="list ${cls}">${inner}</div>${foot ? `<p class="gf">${foot}</p>` : ""}</section>`;
const cell = ({ attrs = "", title, sub = "", detail = "", lead = "", chev = true, cls = "" }) =>
  `<button type="button" class="cell ${cls}" ${attrs}>${lead}<span class="cell-body"><span class="cell-title">${title}</span>${sub ? `<span class="cell-sub">${sub}</span>` : ""}</span>${detail ? `<span class="cell-detail">${detail}</span>` : ""}${chev ? IC.chev : ""}</button>`;
const seg = (opts, sel, act, extra = "") => `<div class="seg" role="tablist" style="--n:${opts.length}">${opts.map(([v, l]) => `<button type="button" role="tab" aria-selected="${String(sel) === String(v)}" data-act="${act}" ${extra} data-v="${v}">${l}</button>`).join("")}</div>`;

/* ---------- in-page confirmation (iOS action sheet) ---------- */
let askResolve = null;
function ask({ title, body = "", yes = "OK", danger = false }) {
  const el = $("#ask");
  el.innerHTML = `<div class="actionsheet" role="alertdialog" aria-modal="true" aria-labelledby="askT">
    <div class="as-group"><div class="as-head"><div class="as-title" id="askT">${esc(title)}</div>${body ? `<div class="as-msg">${esc(body)}</div>` : ""}</div>
      <button type="button" class="as-btn ${danger ? "destructive" : ""}" data-ask="1">${esc(yes)}</button></div>
    <div class="as-group"><button type="button" class="as-btn cancel" data-ask="0">Cancel</button></div></div>`;
  el.hidden = false;
  return new Promise(r => { askResolve = r; });
}
$("#ask").addEventListener("click", e => {
  const b = e.target.closest("[data-ask]");
  if (!b && e.target !== $("#ask")) return;
  $("#ask").hidden = true;
  const r = askResolve; askResolve = null;
  r && r(b ? b.dataset.ask === "1" : false);
});

/* ---------- render ---------- */
function render() {
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  if (!ready) { $("#app").innerHTML = `<div class="empty pad">${loadError ? esc(loadError) : "Loading…"}</div>`; return; }
  $("#app").innerHTML = { today: vToday, train: vTrain, history: vHistory, settings: vSettings }[tab]();
  const navTitle = { today: "Today", train: draft ? (dayOf(program, draft.day) || {}).name || "Workout" : "Train", history: "History", settings: "Settings" }[tab];
  $("#navTitle").textContent = navTitle;
  onScroll();
  const sh = $("#sheet");
  if (editing) {
    const opening = sh.hidden, st = opening ? 0 : sh.scrollTop;
    sh.innerHTML = vSheet(); sh.hidden = false; sh.scrollTop = st;
    if (opening) { sh.classList.remove("enter"); void sh.offsetWidth; sh.classList.add("enter"); }
    document.body.classList.add("locked");
  } else { sh.hidden = true; sh.innerHTML = ""; document.body.classList.remove("locked"); }
}
// Compact title bar fades in once the large title scrolls away.
function onScroll() { document.body.classList.toggle("scrolled", window.scrollY > 40); }
addEventListener("scroll", onScroll, { passive: true });

function targetText(it, tg) {
  if (!tg) return "";
  const main = tg.up ? `${IC.arrowUp}<span>Target ${lb(tg.w)} lb · +${tg.inc} after hitting all ${it.sets}×${it.reps}</span>` : `<span>Repeat ${lb(tg.w)} lb · finish all ${it.sets}×${it.reps} to move up</span>`;
  const dl = tg.deload ? `<div class="target warn">${IC.warn}<span>Missed reps at ${lb(tg.w)} twice in a row. Consider a deload to ${lb(tg.deload)} lb.</span></div>` : "";
  return `<div class="target ${tg.up ? "up" : ""}">${main}</div>${dl}`;
}

function vToday() {
  const n = draft ? draft.day : nextDay(workouts, program), d = dayOf(program, n) || program.days[0];
  const wk = weekOf(today()), done = workouts.filter(w => weekOf(w.date) === wk).length;
  const main = mainItem(d);
  let mainLine = "";
  if (main) {
    const tg = target(workouts, program, main), ts = topSet(lastSets(workouts, main.id));
    const val = tg ? `<span class="tnum ${tg.up ? "good" : ""}">${tg.up ? "Target" : "Repeat"} ${lb(tg.w)} lb${tg.up ? ` <span class="badge-inc">+${tg.inc}</span>` : ""}</span>` : ts ? `<span class="tnum">Last ${lb(ts.w)}×${ts.r}</span>` : `<span class="hl-none">First time logging it</span>`;
    mainLine = `<div class="hero-lift"><span>${esc(main.n)}</span>${val}</div>`;
  }
  const dots = [0, 1, 2, 3].map(i => `<span class="wkdot ${i < done ? "on" : ""}"></span>`).join("");
  const last = workouts[0];
  return `<section class="view">
    ${largeTitle("Today", esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })))}
    <div class="hero">
      <div class="hero-top"><span class="kicker">${draft ? "In Progress" : "Up Next"}</span><span class="wk" aria-label="${done} of 4 sessions this week">${dots}<span class="tnum">${done} of 4 this week</span></span></div>
      <div><div class="hero-day">Day ${d.n}</div><div class="hero-name">${esc(d.name)}</div></div>
      ${mainLine}
      <button class="btn filled large" data-act="${draft ? "tab" : "start"}" data-tab="train" data-day="${d.n}" type="button">${draft ? "Resume Workout" : "Start Workout"}</button>
    </div>
    ${draft ? "" : group("", cell({ attrs: `data-act="tab" data-tab="train"`, title: "Choose a Different Day" }))}
    ${last ? group("Last Session", cell({ attrs: `data-act="openw" data-id="${esc(last.id)}"`, title: `Day ${last.day} · ${esc((dayOf(program, last.day) || {}).name || "Workout")}`, sub: `${esc(fmtDate(last.date))}${last.mins ? ` · ${last.mins} min` : ""}${last.note ? ` · ${esc(last.note)}` : ""}` })) : ""}
  </section>`;
}

function vTrain() {
  if (!draft) {
    const nx = nextDay(workouts, program);
    return `<section class="view">${largeTitle("Train", esc(program.name || "Program"))}
      ${group("Choose a Day", program.days.map(d => {
        const items = itemsOf(d).filter(i => i.t !== "check"), main = mainItem(d), tg = main && target(workouts, program, main);
        const sub = tg ? `<span class="${tg.up ? "good" : ""}">${esc(main.n)} · ${tg.up ? "target" : "repeat"} ${lb(tg.w)} lb</span>` : items.slice(0, 3).map(i => esc(i.n)).join(" · ");
        return cell({ attrs: `data-act="start" data-day="${d.n}"`, lead: `<span class="daybadge ${d.n === nx ? "on" : ""}">${d.n}</span>`, title: esc(d.name), sub, detail: d.n === nx ? "Next" : "", cls: "daycell" });
      }).join(""))}</section>`;
  }
  const d = dayOf(program, draft.day);
  fillForm(draft, d);
  const top = `<div class="lt-top"><span class="lt-sub">Day ${d.n} · <span class="tnum" id="elapsed">${fmtClock(Date.now() - draft.start)}</span></span><button class="link destructive" type="button" data-act="discard">Discard</button></div>`;
  return `<section class="view">
    ${largeTitle(esc(d.name), "", top)}
    ${group("Rest Timer", `<div class="presets">${[30, 60, 90, 120, 180].map(s => `<button class="btn tinted" type="button" data-act="preset" data-s="${s}">${s < 120 ? s + "s" : (s / 60) + ":00"}</button>`).join("")}</div>`, { cls: "padded" })}
    ${formBlocks(draft, d, "draft")}
    ${group("Notes", `<textarea id="note" data-f="note" data-scope="draft" placeholder="How it felt, what to change next time">${esc(draft.note)}</textarea>`, { cls: "padded" })}
    <button class="btn filled large" type="button" data-act="finish">Finish Workout</button>
  </section>`;
}

// Blocks + items for a session form. scope "draft" = live session, "edit" = a saved session.
function formBlocks(form, d, scope) {
  const ref = scope === "edit" ? { id: form.id, date: form.date, ts: form.ts } : null;
  const ids = new Set(itemsOf(d).map(i => i.id));
  const extra = Object.keys(form.ex).filter(id => !ids.has(id)).map(id => {
    const e = form.ex[id], info = itemInfo(id) || { id, n: id };
    return { ...info, id, t: e.sets ? "sets" : e.rounds ? "rounds" : "check" };
  });
  const blocks = d.blocks.map((b, bi) => ({ ...b, bi }));
  if (extra.length) blocks.push({ label: "Other logged items", items: extra });
  return blocks.map(b => group(esc(b.label), b.items.map(it => exHTML(it, form, scope, ref)).join(""),
    { right: b.timer && scope === "draft" ? `<button class="link" type="button" data-act="btimer" data-b="${b.bi}">${IC.play}${esc(b.timer.label)}</button>` : "",
      foot: b.about && scope === "draft" ? esc(b.about) : "" })).join("");
}

function exHTML(it, form, scope, ref) {
  const e = form.ex[it.id] || {}, sc = `data-scope="${scope}" data-id="${esc(it.id)}"`;
  const note = it.note ? `<span class="cell-detail">${esc(it.note)}</span>` : "";
  if (it.t === "check")
    return `<button type="button" class="cell checkcell ${e.done ? "on" : ""}" data-act="check" ${sc} aria-pressed="${!!e.done}"><span class="circle" aria-hidden="true"></span><span class="cell-body"><span class="cell-title">${esc(it.n)}</span></span>${note}</button>`;
  const open = howOpen.has(it.id);
  const how = it.how ? `<button type="button" class="link howbtn" data-act="how" data-id="${esc(it.id)}" aria-expanded="${open}">${IC.info}${open ? "Hide" : "How to"}</button>${open ? `<p class="how">${esc(it.how)}</p>` : ""}` : "";
  const head = `<div class="item-head"><span class="cell-title">${esc(it.n)}</span>${note}</div>${how}`;
  if (it.t === "rounds") {
    const r = e.rounds || [], done = r.filter(Boolean).length;
    const wt = it.wt ? `<label class="rw"><span>Weight</span><input inputmode="decimal" autocomplete="off" data-f="rw" ${sc} value="${esc(e.w || "")}" placeholder="${esc(lastWeight(workouts, it.id, ref))}" aria-label="${esc(it.n)} weight in pounds"><span class="rw-u">lb</span></label>` : "";
    return `<div class="item">${head}${wt}<div class="pips">${r.map((on, i) => `<button type="button" class="pip ${on ? "on" : ""}" data-act="pip" ${sc} data-i="${i}" aria-pressed="${on}" aria-label="Round ${i + 1}">${i + 1}</button>`).join("")}<button type="button" class="pip add" data-act="addpip" ${sc} aria-label="Add round">+</button></div><div class="item-foot tnum">${done} of ${r.length} rounds</div></div>`;
  }
  const prev = lastSets(workouts, it.id, ref) || [];
  const tg = scope === "draft" ? target(workouts, program, it) : null;
  const rest = scope === "draft" && it.rest > 0 ? `<div class="item-foot">${fmtClock(it.rest * 1000)} rest starts when you log a set's reps</div>` : "";
  return `<div class="item">${head}${targetText(it, tg)}${rest}<div class="sets"><span class="h">Set</span><span class="h">lb</span><span class="h">Reps</span>
    ${(e.sets || []).map((s, i) => {
      const p = prev[i] || prev[prev.length - 1] || {};
      return `<span class="i tnum">${i + 1}</span>
      <input inputmode="decimal" enterkeyhint="next" autocomplete="off" data-f="set" ${sc} data-i="${i}" data-k="w" value="${esc(s.w)}" placeholder="${esc(tg ? tg.w : (p.w || ""))}" aria-label="${esc(it.n)} set ${i + 1} weight">
      <input inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" data-f="set" ${sc} data-i="${i}" data-k="r" value="${esc(s.r)}" placeholder="${esc(p.r || it.reps || "")}" aria-label="${esc(it.n)} set ${i + 1} reps">`;
    }).join("")}
    </div><button type="button" class="link addset" data-act="addset" ${sc}>${IC.plus}Add Set</button></div>`;
}

function vSheet() {
  const f = editing, d = dayOf(program, f.day) || { n: f.day, name: "Workout", blocks: [] };
  fillForm(f, d);
  return `<div class="sheetbar"><button type="button" class="link" data-act="closesheet">Cancel</button><div class="sheettitle">Day ${f.day} · ${esc(d.name)}</div><button type="button" class="link bold" data-act="savew">Save</button></div>
    <div class="sbody">
      ${group("Details", `<label class="cell field"><span class="cell-title">Date</span><input id="eDate" type="date" data-f="edate" value="${esc(f.date)}"></label>
        <label class="cell field"><span class="cell-title">Minutes</span><input id="eMins" inputmode="numeric" pattern="[0-9]*" data-f="emins" value="${esc(f.mins ?? "")}" placeholder="—"></label>`)}
      ${formBlocks(f, d, "edit")}
      ${group("Notes", `<textarea id="eNote" data-f="note" data-scope="edit">${esc(f.note)}</textarea>`, { cls: "padded" })}
      ${group("", `<button type="button" class="cell center destructive" data-act="delw"><span class="cell-title">Delete Session</span></button>`)}
    </div>`;
}

function vHistory() {
  if (!workouts.length) return `<section class="view">${largeTitle("History", "No sessions yet")}${group("", `<div class="empty">Finish a workout and it shows up here.</div>`, { cls: "padded" })}</section>`;
  // R5.2 best sets
  const prs = MAIN.map(([id, n]) => {
    let best = null, date = null;
    for (const w of workouts) { const t = topSet(w.ex && w.ex[id] && w.ex[id].sets); if (t && (!best || t.v > best.v)) { best = t; date = w.date; } }
    return { n, best, date };
  });
  // R5.3 progress
  const weeks = hist.range === "all" ? null : +hist.range;
  const cutoff = weeks ? new Date(Date.now() - weeks * 7 * 864e5) : null;
  const pts = workouts.slice().reverse().filter(w => !cutoff || parseD(w.date) >= cutoff).map(w => {
    const t = topSet(w.ex && w.ex[hist.lift] && w.ex[hist.lift].sets);
    return t ? { date: w.date, id: w.id, w: t.w, e: Math.round(t.v * 10) / 10 } : null;
  }).filter(Boolean);
  const liftName = MAIN.find(m => m[0] === hist.lift)[1];
  // R5.4 volume
  const wks = lastWeeks(12), wkLabel = s => { const [, m, d] = s.split("-").map(Number); return `${m}/${d}`; };
  const setItems = [];
  for (const d of program.days) for (const it of itemsOf(d)) if (it.t === "sets" && !setItems.some(x => x.id === it.id)) setItems.push(it);
  const volOf = w => {
    const v = hist.vol;
    if (v === "all" || v.startsWith("day:")) { if (v.startsWith("day:") && w.day !== +v.slice(4)) return 0; return Object.values(w.ex || {}).reduce((a, e) => a + volume(e.sets), 0); }
    return volume(w.ex && w.ex[v.slice(5)] && w.ex[v.slice(5)].sets);
  };
  const volBars = wks.map(k => { const v = Math.round(workouts.filter(w => weekOf(w.date) === k).reduce((a, w) => a + volOf(w), 0)); return { label: wkLabel(k), v, info: `Week of ${fmtDate(k)}: ${v.toLocaleString()} lb` }; });
  // R5.5 sessions per week
  const cnt = wks.map(k => { const v = workouts.filter(w => weekOf(w.date) === k).length; return { label: wkLabel(k), v, info: `Week of ${fmtDate(k)}: ${v} session${v === 1 ? "" : "s"}` }; });
  const thisWk = cnt[cnt.length - 1].v;

  return `<section class="view">
    ${largeTitle("History", `${workouts.length} session${workouts.length === 1 ? "" : "s"} logged`)}
    <section class="group"><div class="gh"><span>Best Sets</span></div>
      <div class="prs">${prs.map(p => `<div class="pr"><span class="pr-l">${p.n}</span><span class="pr-v tnum">${p.best ? `${lb(p.best.w)}<small>×${p.best.r}</small>` : "—"}</span><span class="pr-s tnum">${p.best ? `e1RM ${Math.round(p.best.v)}${p.best.w ? "" : " (BW)"} · ${esc(fmtDate(p.date))}` : "No sets yet"}</span></div>`).join("")}</div>
      <p class="gf">Estimated 1-rep max uses weight × (1 + reps ÷ 30).</p></section>

    ${group("Progress", `${seg(MAIN.map(([id, n]) => [id, n.replace(" DL", "")]), hist.lift, "hist", `data-k="lift"`)}
      ${seg([["4", "4W"], ["12", "12W"], ["all", "All"]], hist.range, "hist", `data-k="range"`)}
      ${pts.length ? `${progressChart(pts)}<div class="legend"><span><i style="background:var(--c1)"></i>Top set</span><span><i style="background:var(--c2)"></i>Estimated 1RM</span></div>` : `<div class="empty">No ${esc(liftName.toLowerCase())} sets in this range yet.</div>`}`,
      { cls: "padded", foot: pts.length ? "Tap a point to open that session." : "" })}

    ${group("Weekly Volume", `${barChart(volBars, { id: "volOut" })}<div class="hint" id="volOut">Sets × reps × weight. Tap a bar for the number.</div>`, { cls: "padded", right: `<label class="menu"><select data-f="vol" aria-label="Volume for">
        <option value="all" ${hist.vol === "all" ? "selected" : ""}>All Lifts</option>
        <optgroup label="By day">${program.days.map(d => `<option value="day:${d.n}" ${hist.vol === "day:" + d.n ? "selected" : ""}>Day ${d.n} · ${esc(d.name)}</option>`).join("")}</optgroup>
        <optgroup label="By lift">${setItems.map(it => `<option value="lift:${esc(it.id)}" ${hist.vol === "lift:" + it.id ? "selected" : ""}>${esc(it.n)}</option>`).join("")}</optgroup>
      </select></label>` })}

    ${group("Sessions per Week", `${barChart(cnt, { goal: 4, id: "cntOut", showVals: true })}<div class="hint" id="cntOut">Last 12 weeks. Dashed line is the 4-session target.</div>`, { cls: "padded", right: `<span class="gh-r tnum">${thisWk} of 4 this week</span>` })}

    ${group("Sessions", workouts.map(w => {
      const d = dayOf(program, w.day), main = d ? mainItem(d) : null, t = main ? topSet(w.ex && w.ex[main.id] && w.ex[main.id].sets) : null;
      const sub = [w.mins ? w.mins + " min" : "", t ? `${esc(main.n)} <span class="tnum">${lb(t.w)}×${t.r}</span>` : ""].filter(Boolean).join(" · ") + (w.note ? `<span class="cell-note">${esc(w.note)}</span>` : "");
      return cell({ attrs: `data-act="openw" data-id="${esc(w.id)}"`, title: `Day ${w.day} · ${esc(d ? d.name : "Workout")}`, sub, detail: esc(fmtDate(w.date)) });
    }).join(""))}
  </section>`;
}

function vSettings() {
  const d = dayOf(program, progDay) || program.days[0];
  const tl = t => t ? `${t.ph.map(p => `${p[0]} ${p[1] >= 60 && p[1] % 60 === 0 ? p[1] / 60 + " min" : p[1] + "s"}`).join(" / ")}${t.rep ? " ×" + t.rep : ""}` : "";
  const ib = (act, op, b, i, icon, label, dis, cls = "") => `<button type="button" class="rbtn ${cls}" data-act="${act}" data-op="${op}" data-b="${b}"${i != null ? ` data-i="${i}"` : ""} aria-label="${label}" ${dis ? "disabled" : ""}>${icon}</button>`;
  const TYPE = { sets: "Sets", rounds: "Rounds", check: "Checkbox" };
  const num1 = (bi, ii, k, label, v, mode = "numeric") => `<label class="mini"><span>${label}</span><input inputmode="${mode}" ${mode === "numeric" ? `pattern="[0-9]*"` : ""} data-f="prog" data-b="${bi}" data-i="${ii}" data-k="${k}" value="${esc(v ?? "")}" placeholder="—"></label>`;
  return `<section class="view">
    ${largeTitle("Settings")}
    ${group("Backup", `
      <button type="button" class="cell" data-act="export"><span class="sicon blue">${IC.share}</span><span class="cell-body"><span class="cell-title">Export Backup</span></span>${IC.chev}</button>
      <label class="cell"><span class="sicon green">${IC.inbox}</span><span class="cell-body"><span class="cell-title">Import Backup</span></span>${IC.chev}<input type="file" accept="application/json,.json" data-f="import" hidden></label>`,
      { foot: `Everything is stored on this phone (${workouts.length} session${workouts.length === 1 ? "" : "s"}). Export a backup to move your data to a new phone, then import it there.` })}

    ${group("Program", `${seg(program.days.map(x => [x.n, "Day " + x.n]), d.n, "progday")}
      <label class="field-row"><span>Day name</span><input data-f="prog" data-k="dayname" value="${esc(d.name)}"></label>`,
      { cls: "padded", right: programEdited ? `<button class="link" type="button" data-act="resetprog">Reset to Default</button>` : "", foot: `Changes save automatically. "+lb" is the weight added after you hit every set and rep (blank = no auto progression). "Rest" starts a timer in seconds each time you log a set's reps. "Weight" adds a pounds box to a rounds exercise, like a carry.` })}

    ${d.blocks.map((b, bi) => group("", `
      <div class="eblock"><input class="eb-name" data-f="prog" data-b="${bi}" data-k="label" value="${esc(b.label)}" aria-label="Block name">
        <span class="rbtns">${ib("pb", "up", bi, null, IC.up, "Move block up", bi === 0)}${ib("pb", "down", bi, null, IC.down, "Move block down", bi === d.blocks.length - 1)}${ib("pb", "del", bi, null, IC.trash, "Remove block", false, "destructive")}</span></div>
      ${b.timer ? `<div class="eb-timer">${IC.play}Timer: ${esc(tl(b.timer))}</div>` : ""}
      <div class="eitem"><textarea class="ei-how" rows="2" data-f="prog" data-b="${bi}" data-k="about" placeholder="About this block, e.g. why the timer" aria-label="About this block">${esc(b.about || "")}</textarea></div>
      ${b.items.map((it, ii) => `<div class="eitem">
        <div class="ei-top"><input class="ei-name" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="n" value="${esc(it.n)}" aria-label="Exercise name">
          <span class="rbtns">${ib("pi", "up", bi, ii, IC.up, "Move up", bi === 0 && ii === 0)}${ib("pi", "down", bi, ii, IC.down, "Move down", bi === d.blocks.length - 1 && ii === b.items.length - 1)}${ib("pi", "del", bi, ii, IC.trash, "Remove exercise", false, "destructive")}</span></div>
        <div class="ei-fields"><span class="tag">${TYPE[it.t]}</span>
          ${it.t === "sets" ? num1(bi, ii, "sets", "Sets", it.sets) + num1(bi, ii, "reps", "Reps", it.reps) + num1(bi, ii, "inc", "+lb", (program.progression || {})[it.id], "decimal") + num1(bi, ii, "rest", "Rest", it.rest || "") : ""}
          ${it.t === "rounds" ? num1(bi, ii, "rounds", "Rounds", it.rounds) + `<label class="mini sw"><span>Weight</span><input type="checkbox" role="switch" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="wt" ${it.wt ? "checked" : ""} aria-label="Log a weight for this exercise"></label>` : ""}</div>
        <input class="ei-note" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="note" value="${esc(it.note || "")}" placeholder="Note, e.g. 4×5 · 2 min rest" aria-label="Note">
        ${it.t === "check" ? "" : `<textarea class="ei-how" rows="2" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="how" placeholder="How to do it (optional)" aria-label="How to do it">${esc(it.how || "")}</textarea>`}
      </div>`).join("")}
      <div class="eadd">${["sets", "rounds", "check"].map(t => `<button type="button" class="link" data-act="padd" data-b="${bi}" data-t="${t}">${IC.plus}${TYPE[t]}</button>`).join("")}</div>`)).join("")}

    ${group("", `<button type="button" class="cell center" data-act="pb" data-op="add"><span class="cell-title link-c">Add Block</span></button>`, { foot: "Lift Tracker works offline. Your data stays on this phone." })}
  </section>`;
}

/* ---------- actions ---------- */
const formOf = scope => scope === "edit" ? editing : draft;
const touch = scope => { if (scope === "draft") persistDraft(); };
const go = t => { tab = t; history.replaceState(null, "", "#" + t); render(); window.scrollTo(0, 0); };

async function act(a, el) {
  const d = el.dataset;
  switch (a) {
    case "tab": go(d.tab); break;
    case "start":
      if (!draft) { draft = newDraft(program, +d.day); persistDraft(); }
      go("train"); break;
    case "check": { const f = formOf(d.scope); f.ex[d.id].done = !f.ex[d.id].done; touch(d.scope); render(); break; }
    case "pip": { const r = formOf(d.scope).ex[d.id].rounds; r[+d.i] = !r[+d.i]; touch(d.scope); render(); break; }
    case "addpip": formOf(d.scope).ex[d.id].rounds.push(false); touch(d.scope); render(); break;
    case "addset": { const s = formOf(d.scope).ex[d.id].sets, l = s[s.length - 1] || { w: "", r: "" }; s.push({ w: l.w, r: "" }); touch(d.scope); render(); break; }
    case "preset": startTimer("Rest", [["Rest", +d.s]]); break;
    case "btimer": {
      const t = dayOf(program, draft.day).blocks[+d.b].timer;
      let ph = []; for (let i = 0; i < (t.rep || 1); i++) ph = ph.concat(t.ph);
      startTimer(t.label, ph, t.ph.length); break;
    }
    case "stoptimer": stopTimer(); break;
    case "discard":
      if (await ask({ title: "Discard this session?", body: "Everything you've entered for this session will be deleted.", yes: "Discard", danger: true })) {
        draft = null; persistDraft(); stopTimer(); toast("Session discarded"); render();
      }
      break;
    case "finish": {
      const rec = { id: uid(), date: draft.date, day: draft.day, mins: Math.max(1, Math.round((Date.now() - draft.start) / 6e4)), note: draft.note.trim(), ts: Date.now(), ...fromForm(draft) };
      el.disabled = true;
      try {
        await db.putWorkout(rec);
        workouts = sortWorkouts([rec, ...workouts]);
        draft = null; await persistDraft(); stopTimer(); toast("Session saved"); go("history");
      } catch { el.disabled = false; toast("Couldn't save. Try again."); }
      break;
    }
    case "openw": { const w = workouts.find(x => x.id === d.id); if (w) { editing = toForm(w); render(); $("#sheet").scrollTop = 0; } break; }
    case "closesheet": editing = null; render(); break;
    case "savew": {
      const old = workouts.find(x => x.id === editing.id) || {};
      const mins = parseInt(editing.mins, 10);
      const rec = { ...old, date: editing.date || old.date, mins: isFinite(mins) ? mins : old.mins, note: editing.note.trim(), ...fromForm(editing) };
      try { await db.putWorkout(rec); workouts = sortWorkouts(workouts.map(x => x.id === rec.id ? rec : x)); editing = null; toast("Changes saved"); render(); }
      catch { toast("Couldn't save. Try again."); }
      break;
    }
    case "delw":
      if (await ask({ title: "Delete this session?", body: "This can't be undone.", yes: "Delete", danger: true })) {
        await db.delWorkout(editing.id); workouts = workouts.filter(x => x.id !== editing.id); editing = null; toast("Session deleted"); render();
      }
      break;
    case "hist": hist[d.k] = d.v; render(); break;
    case "how": howOpen.has(d.id) ? howOpen.delete(d.id) : howOpen.add(d.id); render(); break;
    case "barinfo": { const o = document.getElementById(d.out); if (o) o.textContent = d.text; break; }
    case "export": exportBackup(); break;
    case "resetprog":
      if (await ask({ title: "Reset the program?", body: "Your edits to exercises, sets and reps go back to the original program. Logged sessions are kept.", yes: "Reset", danger: true })) {
        program = clone(defaultProgram); programEdited = false; await db.kvSet("program", undefined); toast("Program reset"); render();
      }
      break;
    case "progday": progDay = +d.v; render(); break;
    case "pb": await editBlock(d); break;
    case "pi": await editItem(d); break;
    case "padd": {
      const t = d.t, it = { id: "c_" + uid(), n: "New exercise", t };
      if (t === "sets") Object.assign(it, { sets: 3, reps: 10, note: "3×10" });
      if (t === "rounds") Object.assign(it, { rounds: 3 });
      dayOf(program, progDay).blocks[+d.b].items.push(it); saveProgram(); render(); break;
    }
  }
}

async function editBlock(d) {
  const blocks = dayOf(program, progDay).blocks, b = +d.b;
  if (d.op === "add") blocks.push({ label: "New block", items: [] });
  else if (d.op === "up" && b > 0) [blocks[b - 1], blocks[b]] = [blocks[b], blocks[b - 1]];
  else if (d.op === "down" && b < blocks.length - 1) [blocks[b + 1], blocks[b]] = [blocks[b], blocks[b + 1]];
  else if (d.op === "del") {
    if (!await ask({ title: `Remove "${blocks[b].label}"?`, body: `Removes the block and its ${blocks[b].items.length} exercise(s) from Day ${progDay}. Past sessions keep their logged sets.`, yes: "Remove", danger: true })) return;
    blocks.splice(b, 1);
  }
  saveProgram(); render();
}

async function editItem(d) {
  const blocks = dayOf(program, progDay).blocks, b = +d.b, i = +d.i, items = blocks[b].items;
  if (d.op === "up") {
    if (i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    else if (b > 0) blocks[b - 1].items.push(items.shift());
  } else if (d.op === "down") {
    if (i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    else if (b < blocks.length - 1) blocks[b + 1].items.unshift(items.pop());
  } else if (d.op === "del") {
    if (!await ask({ title: `Remove "${items[i].n}"?`, body: `Removes it from Day ${progDay}. Past sessions keep their logged sets.`, yes: "Remove", danger: true })) return;
    items.splice(i, 1);
  }
  saveProgram(); render();
}

async function exportBackup() {
  const data = { app: "lift-tracker", version: 1, exportedAt: new Date().toISOString(), workouts, program, names };
  const name = `lift-tracker-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Lift Tracker backup" }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast("That file isn't a backup."); return; }
  const list = Array.isArray(data) ? data : data && data.workouts;
  const valid = Array.isArray(list) ? list.filter(w => w && typeof w.date === "string" && w.day && w.ex) : [];
  if (!valid.length) { toast("No sessions found in that file."); return; }
  const prog = data && data.program && Array.isArray(data.program.days) ? data.program : null;
  const ok = await ask({ title: `Import ${valid.length} session${valid.length === 1 ? "" : "s"}?`, body: `Sessions already on this phone are kept; matching ones are replaced.${prog ? " Your program is replaced by the one in the backup." : ""}`, yes: "Import" });
  if (!ok) return;
  const recs = valid.map(w => ({ ...w, id: w.id || uid() }));
  await db.putWorkouts(recs);
  if (prog) { program = prog; Object.assign(names, data.names || {}); saveProgram(); }
  workouts = sortWorkouts(await db.allWorkouts());
  toast(`Imported ${recs.length} session${recs.length === 1 ? "" : "s"}`); render();
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && !el.disabled) { e.preventDefault(); act(el.dataset.act, el); }
});

document.addEventListener("input", e => {
  const el = e.target, f = el.dataset.f;
  if (!f) return;
  if (f === "set") { const form = formOf(el.dataset.scope); form.ex[el.dataset.id].sets[+el.dataset.i][el.dataset.k] = el.value; touch(el.dataset.scope); }
  else if (f === "note") { formOf(el.dataset.scope).note = el.value; touch(el.dataset.scope); }
  else if (f === "rw") { formOf(el.dataset.scope).ex[el.dataset.id].w = el.value; touch(el.dataset.scope); }
  else if (f === "edate") { if (el.value) editing.date = el.value; }
  else if (f === "emins") editing.mins = el.value;
  else if (f === "prog") {
    const day = dayOf(program, progDay), k = el.dataset.k;
    if (k === "dayname") day.name = el.value;
    else if (k === "label" || k === "about") day.blocks[+el.dataset.b][k] = el.value;
    else {
      const it = day.blocks[+el.dataset.b].items[+el.dataset.i];
      if (k === "n" || k === "note" || k === "how") it[k] = el.value;
      else if (k === "inc") { program.progression = program.progression || {}; const v = num(el.value); if (v > 0) program.progression[it.id] = v; else delete program.progression[it.id]; }
      else if (k === "rest") { const v = parseInt(el.value, 10); it.rest = v > 0 ? v : 0; }
      else { const v = parseInt(el.value, 10); if (v > 0) it[k] = v; }
    }
    saveProgram();
  }
});

// Remember what a reps box held before editing, so rest only starts when a set is first logged.
document.addEventListener("focusin", e => { if (e.target.dataset.k === "r") e.target.dataset.was = e.target.value; });

document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.f === "set" && el.dataset.k === "r" && el.dataset.scope === "draft" && el.dataset.was === "" && num(el.value) != null) {
    const it = itemsOf(dayOf(program, draft.day)).find(i => i.id === el.dataset.id), sets = draft.ex[el.dataset.id].sets;
    el.dataset.was = el.value;
    if (it && it.rest > 0 && +el.dataset.i < sets.length - 1) startTimer(`Rest · ${it.n}`, [["Rest", it.rest]]);
  }
  if (el.dataset.f === "vol") { hist.vol = el.value; render(); }
  if (el.dataset.f === "prog" && el.dataset.k === "wt") { dayOf(program, progDay).blocks[+el.dataset.b].items[+el.dataset.i].wt = el.checked; saveProgram(); }
  if (el.dataset.f === "import" && el.files && el.files[0]) { importBackup(el.files[0]); el.value = ""; }
});

addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.includes(h) && h !== tab) { tab = h; render(); } });
setInterval(() => { const el = $("#elapsed"); if (el && draft) el.textContent = fmtClock(Date.now() - draft.start); }, 1000);
// Flush the draft when the app is hidden (switching apps, locking the phone).
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && draft) persistDraft(); });

/* ---------- boot ---------- */
// Apply changes made to data/program.json since `base` to an in-app edited program, field by field,
// leaving alone anything Noah changed himself. Returns true if anything changed.
function mergeDefaults(prog, base, next) {
  const FIELDS = ["n", "sets", "reps", "rounds", "note", "rest", "wt", "how"], key = (d, it) => d.n + ":" + it.id;
  const idx = p => { const m = {}; for (const d of p.days) for (const it of itemsOf(d)) m[key(d, it)] = it; return m; };
  const b = idx(base), n = idx(next);
  let changed = false;
  for (const d of prog.days) for (const it of itemsOf(d)) {
    const was = b[key(d, it)], now = n[key(d, it)];
    if (!was || !now) continue;
    for (const f of FIELDS) if (it[f] === was[f] && now[f] !== was[f]) { it[f] = now[f]; changed = true; }
  }
  // Block notes ("about"), matched by day, position and name.
  for (const d of prog.days) d.blocks.forEach((bl, i) => {
    const bd = base.days.find(x => x.n === d.n), nd = next.days.find(x => x.n === d.n);
    const was = bd && bd.blocks[i], now = nd && nd.blocks[i];
    if (was && now && was.label === bl.label && now.label === bl.label && bl.about === was.about && now.about !== was.about) { bl.about = now.about; changed = true; }
  });
  const bp = base.progression || {}, np = next.progression || {};
  prog.progression = prog.progression || {};
  for (const id of Object.keys(np)) if (prog.progression[id] === bp[id] && np[id] !== bp[id]) { prog.progression[id] = np[id]; changed = true; }
  return changed;
}

async function fetchJSON(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(url); return r.json(); }

(async () => {
  render();
  try {
    const [stored, savedDraft, savedTimer, savedNames, imported, ws, base] = await Promise.all([
      db.kvGet("program"), db.kvGet("draft"), db.kvGet("timer"), db.kvGet("names"), db.kvGet("imported"), db.allWorkouts(), db.kvGet("programBase"),
    ]);
    names = savedNames || {};
    let fetched = false;
    try { defaultProgram = await fetchJSON("data/program.json"); fetched = true; } catch {}
    program = stored ? stored : defaultProgram ? clone(defaultProgram) : null;
    programEdited = !!stored;
    if (!program) { loadError = "Couldn't load the program. Connect to the internet once and reopen the app."; render(); return; }
    if (!defaultProgram) defaultProgram = clone(program);
    // Carry new per-item settings from the default program into an edited copy.
    if (stored) {
      const defs = {};
      for (const d of defaultProgram.days) for (const it of itemsOf(d)) defs[it.id] = it;
      for (const d of program.days) for (const it of itemsOf(d)) if (it.rest === undefined && defs[it.id] && defs[it.id].rest) it.rest = defs[it.id].rest;
      if (base && fetched && mergeDefaults(program, base, defaultProgram)) db.kvSet("program", clone(program));
    }
    // Remember which default the phone last saw, so later changes to program.json can be merged in.
    if (fetched) db.kvSet("programBase", defaultProgram);
    workouts = ws || [];
    if (!imported) {
      try {
        const h = await fetchJSON("data/history.json");
        const have = new Set(workouts.map(w => w.id));
        const add = (h.workouts || []).filter(w => !have.has(w.id));
        if (add.length) await db.putWorkouts(add);
        workouts = workouts.concat(add);
        await db.kvSet("imported", true);
      } catch {}
    }
    workouts = sortWorkouts(workouts);
    draft = savedDraft || null;
    ready = true;
    render();
    initTimer(savedTimer, t => db.kvSet("timer", t ? clone(t) : undefined));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    loadError = "This browser blocked storage, so sessions can't be saved. Open the app from your Home Screen or turn off Private Browsing.";
    render();
  }
})();

if ("serviceWorker" in navigator) {
  // When a new version installs, reload once so the update shows on this open, not the next one.
  // Everything typed is already saved, so a reload loses nothing.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
