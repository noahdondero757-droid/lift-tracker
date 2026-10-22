import * as db from "./db.js";
import { startTimer, stopTimer, initTimer } from "./timer.js";
import { progressChart, barChart } from "./charts.js";
import {
  MAIN, pad, today, parseD, num, uid, weekOf, sortWorkouts, nextDay, dayOf, itemsOf, mainItem,
  lastSets, topSet, target, toForm, fillForm, newDraft, fromForm, volume, lastWeeks,
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

/* ---------- in-page confirmation ---------- */
let askResolve = null;
function ask({ title, body = "", yes = "OK", danger = false }) {
  const el = $("#ask");
  el.innerHTML = `<div class="askpanel" role="alertdialog" aria-modal="true" aria-labelledby="askT">
    <h3 id="askT">${esc(title)}</h3>${body ? `<p class="muted">${esc(body)}</p>` : ""}
    <div class="askbtns"><button type="button" class="btn ghost" data-ask="0">Cancel</button><button type="button" class="btn ${danger ? "dangerfill" : ""}" data-ask="1">${esc(yes)}</button></div></div>`;
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
  const sh = $("#sheet");
  if (editing) { const st = sh.hidden ? 0 : sh.scrollTop; sh.innerHTML = vSheet(); sh.hidden = false; sh.scrollTop = st; document.body.classList.add("locked"); }
  else { sh.hidden = true; sh.innerHTML = ""; document.body.classList.remove("locked"); }
}

function targetText(it, tg) {
  if (!tg) return "";
  const main = tg.up ? `Target ${lb(tg.w)} lb · +${tg.inc} after hitting all ${it.sets}×${it.reps}` : `Repeat ${lb(tg.w)} lb · finish all ${it.sets}×${it.reps} to move up`;
  const dl = tg.deload ? `<div class="target warn">Missed reps at ${lb(tg.w)} twice in a row. Consider a deload to ${lb(tg.deload)} lb.</div>` : "";
  return `<div class="target ${tg.up ? "up" : ""}">${main}</div>${dl}`;
}

function vToday() {
  const n = draft ? draft.day : nextDay(workouts, program), d = dayOf(program, n) || program.days[0];
  const wk = weekOf(today()), done = workouts.filter(w => weekOf(w.date) === wk).length;
  const main = mainItem(d);
  let mainLine = "";
  if (main) {
    const tg = target(workouts, program, main), ts = topSet(lastSets(workouts, main.id));
    mainLine = `<div class="muted">${esc(main.n)}${tg ? ` · ${tg.up ? "target" : "repeat"} <span class="mono ink">${lb(tg.w)} lb</span>${tg.up ? ` <span class="up mono">+${tg.inc}</span>` : ""}` : ts ? ` · last top set <span class="mono ink">${lb(ts.w)}×${ts.r}</span>` : ""}</div>`;
  }
  const last = workouts[0];
  return `<section class="view">
    <div class="plain"><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div><h1>Today</h1></div>
    <div class="card">
      <div class="row between"><div class="eyebrow">${draft ? "In progress" : "Up next"}</div><span class="mono muted small">${done}/4 this week</span></div>
      <div class="stack6"><h2>Day ${d.n} · ${esc(d.name)}</h2>${mainLine}</div>
      <button class="btn wide big" data-act="${draft ? "tab" : "start"}" data-tab="train" data-day="${d.n}" type="button">${draft ? "Resume session" : "Start Day " + d.n}</button>
      ${draft ? "" : `<button class="textbtn" type="button" data-act="tab" data-tab="train">Pick a different day</button>`}
    </div>
    ${last ? `<button type="button" class="card cardbtn" data-act="openw" data-id="${esc(last.id)}"><div class="eyebrow">Last session</div><div><strong>Day ${last.day}</strong> · ${esc((dayOf(program, last.day) || {}).name || "")}</div><div class="muted small">${esc(fmtDate(last.date))}${last.mins ? ` · ${last.mins} min` : ""}${last.note ? ` · ${esc(last.note)}` : ""}</div></button>` : ""}
  </section>`;
}

function vTrain() {
  if (!draft) {
    const nx = nextDay(workouts, program);
    return `<section class="view"><div class="plain"><div class="eyebrow">${esc(program.name || "Program")}</div><h1>Train</h1></div>
      <div class="days">${program.days.map(d => {
        const items = itemsOf(d).filter(i => i.t !== "check"), main = mainItem(d), tg = main && target(workouts, program, main);
        return `<button type="button" class="day ${d.n === nx ? "next" : ""}" data-act="start" data-day="${d.n}">
          <span class="dn">${d.n}</span><span><h3>${esc(d.name)}</h3><span class="meta">${items.slice(0, 3).map(i => esc(i.n)).join(" · ")}</span>${tg ? `<span class="meta mono ${tg.up ? "up" : ""}">${esc(main.n)} ${tg.up ? "target" : "repeat"} ${lb(tg.w)} lb</span>` : ""}</span>
          <span class="mono muted small">${d.n === nx ? "NEXT" : ""}</span></button>`;
      }).join("")}</div></section>`;
  }
  const d = dayOf(program, draft.day);
  fillForm(draft, d);
  return `<section class="view">
    <div class="plain"><div class="row between"><div class="eyebrow">Day ${d.n} · <span class="mono" id="elapsed">${fmtClock(Date.now() - draft.start)}</span></div><button class="textbtn bad" type="button" data-act="discard">Discard</button></div><h1>${esc(d.name)}</h1></div>
    <div class="card"><div class="eyebrow">Rest timer</div><div class="presets">${[30, 60, 90, 120, 180].map(s => `<button class="btn ghost mono" type="button" data-act="preset" data-s="${s}">${s < 60 ? s + "s" : s === 60 ? "60s" : s === 90 ? "90s" : (s / 60) + ":00"}</button>`).join("")}</div></div>
    <div class="card">${formBlocks(draft, d, "draft")}</div>
    <div class="card"><label class="eyebrow" for="note">Notes</label><textarea id="note" data-f="note" data-scope="draft" placeholder="How it felt, what to change next time">${esc(draft.note)}</textarea>
      <button class="btn wide big" type="button" data-act="finish">Finish &amp; save</button></div>
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
  return blocks.map(b => `<div class="block">
    <div class="blockhead"><div class="eyebrow">${esc(b.label)}</div>${b.timer && scope === "draft" ? `<button class="btn ghost small" type="button" data-act="btimer" data-b="${b.bi}">▶ ${esc(b.timer.label)}</button>` : ""}</div>
    ${b.items.map(it => exHTML(it, form, scope, ref)).join("")}</div>`).join("");
}

function exHTML(it, form, scope, ref) {
  const e = form.ex[it.id] || {}, sc = `data-scope="${scope}" data-id="${esc(it.id)}"`;
  const note = it.note ? `<span class="exnote">${esc(it.note)}</span>` : "";
  if (it.t === "check")
    return `<button type="button" class="check ${e.done ? "on" : ""}" data-act="check" ${sc} aria-pressed="${!!e.done}"><span class="box"></span><span class="exname">${esc(it.n)}</span>${note}</button>`;
  const head = `<div class="exhead"><span class="exname">${esc(it.n)}</span>${note}</div>`;
  if (it.t === "rounds") {
    const r = e.rounds || [], done = r.filter(Boolean).length;
    return `<div class="ex">${head}<div class="pips">${r.map((on, i) => `<button type="button" class="pip ${on ? "on" : ""}" data-act="pip" ${sc} data-i="${i}" aria-pressed="${on}" aria-label="Round ${i + 1}">${i + 1}</button>`).join("")}<button type="button" class="pip add" data-act="addpip" ${sc} aria-label="Add round">+</button></div><span class="exnote mono">${done}/${r.length} rounds</span></div>`;
  }
  const prev = lastSets(workouts, it.id, ref) || [];
  const tg = scope === "draft" ? target(workouts, program, it) : null;
  const rest = scope === "draft" && it.rest > 0 ? `<div class="exnote">${fmtClock(it.rest * 1000)} rest starts when you log a set's reps</div>` : "";
  return `<div class="ex">${head}${targetText(it, tg)}${rest}<div class="sets"><span class="h">Set</span><span class="h">lb</span><span class="h">Reps</span>
    ${(e.sets || []).map((s, i) => {
      const p = prev[i] || prev[prev.length - 1] || {};
      return `<span class="i">${i + 1}</span>
      <input inputmode="decimal" enterkeyhint="next" autocomplete="off" data-f="set" ${sc} data-i="${i}" data-k="w" value="${esc(s.w)}" placeholder="${esc(tg ? tg.w : (p.w || ""))}" aria-label="${esc(it.n)} set ${i + 1} weight">
      <input inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" data-f="set" ${sc} data-i="${i}" data-k="r" value="${esc(s.r)}" placeholder="${esc(p.r || it.reps || "")}" aria-label="${esc(it.n)} set ${i + 1} reps">`;
    }).join("")}
    </div><button type="button" class="textbtn" data-act="addset" ${sc}>+ Add set</button></div>`;
}

function vSheet() {
  const f = editing, d = dayOf(program, f.day) || { n: f.day, name: "Workout", blocks: [] };
  fillForm(f, d);
  return `<div class="shead"><button type="button" class="iconbtn" data-act="closesheet" aria-label="Close">✕</button><div class="stitle">Day ${f.day} · ${esc(d.name)}</div></div>
    <div class="sbody">
      <div class="card"><div class="grid2">
        <div class="field"><label for="eDate">Date</label><input id="eDate" type="date" data-f="edate" value="${esc(f.date)}"></div>
        <div class="field"><label for="eMins">Minutes</label><input id="eMins" inputmode="numeric" pattern="[0-9]*" data-f="emins" value="${esc(f.mins ?? "")}"></div>
      </div></div>
      <div class="card">${formBlocks(f, d, "edit")}</div>
      <div class="card"><label class="eyebrow" for="eNote">Notes</label><textarea id="eNote" data-f="note" data-scope="edit">${esc(f.note)}</textarea>
        <button class="btn wide big" type="button" data-act="savew">Save changes</button>
        <button class="btn danger wide" type="button" data-act="delw">Delete session</button></div>
    </div>`;
}

function vHistory() {
  if (!workouts.length) return `<section class="view"><div class="plain"><div class="eyebrow">0 sessions logged</div><h1>History</h1></div><div class="card"><div class="empty">Finish a session and it shows up here.</div></div></section>`;
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
  const seg = (key, opts) => `<div class="seg" role="tablist" style="grid-template-columns:repeat(${opts.length},1fr)">${opts.map(([v, l]) => `<button type="button" role="tab" aria-selected="${hist[key] === v}" data-act="hist" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div>`;

  return `<section class="view">
    <div class="plain"><div class="eyebrow">${workouts.length} session${workouts.length === 1 ? "" : "s"} logged</div><h1>History</h1></div>
    <div class="plain"><div class="eyebrow">Best sets · estimated 1RM</div></div>
    <div class="prs">${prs.map(p => `<div class="pr"><span class="eyebrow">${p.n}</span><span class="v">${p.best ? `${lb(p.best.w)}×${p.best.r}` : "—"}</span><span class="muted mono small">${p.best ? `e1RM ${Math.round(p.best.v)}${p.best.w ? "" : " (BW)"} · ${esc(fmtDate(p.date))}` : "No sets yet"}</span></div>`).join("")}</div>

    <div class="card"><div class="eyebrow">Progress · ${esc(liftName)}</div>
      ${seg("lift", MAIN.map(([id, n]) => [id, n.replace(" DL", "")]))}
      ${seg("range", [["4", "4W"], ["12", "12W"], ["all", "All"]])}
      ${pts.length ? `${progressChart(pts)}<div class="legend"><span><i style="background:var(--c1)"></i>Top set weight</span><span><i style="background:var(--c2)"></i>Estimated 1RM</span></div><div class="hint">Tap a point to open that session.</div>` : `<div class="empty">No ${esc(liftName.toLowerCase())} sets in this range yet.</div>`}
    </div>

    <div class="card"><div class="row between"><div class="eyebrow">Weekly volume</div>
      <select class="sel" data-f="vol" aria-label="Volume for">
        <option value="all" ${hist.vol === "all" ? "selected" : ""}>All lifts</option>
        <optgroup label="By day">${program.days.map(d => `<option value="day:${d.n}" ${hist.vol === "day:" + d.n ? "selected" : ""}>Day ${d.n} · ${esc(d.name)}</option>`).join("")}</optgroup>
        <optgroup label="By lift">${setItems.map(it => `<option value="lift:${esc(it.id)}" ${hist.vol === "lift:" + it.id ? "selected" : ""}>${esc(it.n)}</option>`).join("")}</optgroup>
      </select></div>
      ${barChart(volBars, { id: "volOut" })}
      <div class="hint" id="volOut">Sets × reps × weight, last 12 weeks. Tap a bar for the number.</div>
    </div>

    <div class="card"><div class="row between"><div class="eyebrow">Sessions per week</div><span class="mono muted small">${thisWk}/4 this week</span></div>
      ${barChart(cnt, { goal: 4, id: "cntOut", showVals: true })}
      <div class="hint" id="cntOut">Last 12 weeks. Dashed line is the 4-session target.</div>
    </div>

    <div class="card"><div class="eyebrow">Sessions</div><div class="list">${workouts.map(w => {
      const d = dayOf(program, w.day), main = d ? mainItem(d) : null, t = main ? topSet(w.ex && w.ex[main.id] && w.ex[main.id].sets) : null;
      return `<button type="button" class="li" data-act="openw" data-id="${esc(w.id)}"><span><strong>Day ${w.day}</strong> · ${esc(d ? d.name : "Workout")}</span><span class="mono muted small">${esc(fmtDate(w.date))}</span>
        <span class="sub">${w.mins ? w.mins + " min" : ""}${t ? `${w.mins ? " · " : ""}${esc(main.n)} <span class="mono">${lb(t.w)}×${t.r}</span>` : ""}${w.note ? `<br>${esc(w.note)}` : ""}</span><span class="chev" aria-hidden="true">›</span></button>`;
    }).join("")}</div></div>
  </section>`;
}

function vSettings() {
  const d = dayOf(program, progDay) || program.days[0];
  const tl = t => t ? `${t.ph.map(p => `${p[0]} ${p[1] >= 60 && p[1] % 60 === 0 ? p[1] / 60 + " min" : p[1] + "s"}`).join(" / ")}${t.rep ? " ×" + t.rep : ""}` : "";
  return `<section class="view">
    <div class="plain"><div class="eyebrow">Data &amp; program</div><h1>Settings</h1></div>
    <div class="card"><div class="eyebrow">Backup</div>
      <div class="muted small">Everything is stored on this phone. Export a backup file to move your data to a new phone, then import it there.</div>
      <div class="row"><button class="btn" type="button" data-act="export">Export backup</button>
      <label class="btn ghost filebtn">Import backup<input type="file" accept="application/json,.json" data-f="import" hidden></label></div>
      <div class="muted small">${workouts.length} sessions on this phone.</div>
    </div>
    <div class="card"><div class="row between"><div class="eyebrow">Edit program</div>${programEdited ? `<button class="textbtn" type="button" data-act="resetprog">Reset to default</button>` : ""}</div>
      <div class="seg" role="tablist" style="grid-template-columns:repeat(${program.days.length},1fr)">${program.days.map(x => `<button type="button" role="tab" aria-selected="${x.n === d.n}" data-act="progday" data-n="${x.n}">Day ${x.n}</button>`).join("")}</div>
      <div class="field"><label>Day name</label><input data-f="prog" data-k="dayname" value="${esc(d.name)}"></div>
      ${d.blocks.map((b, bi) => `<div class="eblock">
        <div class="erow"><input class="grow" data-f="prog" data-b="${bi}" data-k="label" value="${esc(b.label)}" aria-label="Block name">
          <button type="button" class="iconbtn" data-act="pb" data-op="up" data-b="${bi}" aria-label="Move block up" ${bi === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="iconbtn" data-act="pb" data-op="down" data-b="${bi}" aria-label="Move block down" ${bi === d.blocks.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="iconbtn bad" data-act="pb" data-op="del" data-b="${bi}" aria-label="Remove block">✕</button></div>
        ${b.timer ? `<div class="muted small">Timer: ${esc(tl(b.timer))}</div>` : ""}
        ${b.items.map((it, ii) => `<div class="eitem">
          <input data-f="prog" data-b="${bi}" data-i="${ii}" data-k="n" value="${esc(it.n)}" aria-label="Exercise name">
          <div class="erow"><span class="tag">${{ sets: "Sets", rounds: "Rounds", check: "Check" }[it.t]}</span><span class="grow"></span>
            <button type="button" class="iconbtn" data-act="pi" data-op="up" data-b="${bi}" data-i="${ii}" aria-label="Move up" ${bi === 0 && ii === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="iconbtn" data-act="pi" data-op="down" data-b="${bi}" data-i="${ii}" aria-label="Move down" ${bi === d.blocks.length - 1 && ii === b.items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="iconbtn bad" data-act="pi" data-op="del" data-b="${bi}" data-i="${ii}" aria-label="Remove exercise">✕</button></div>
          ${it.t === "sets" ? `<div class="efields"><label>Sets<input inputmode="numeric" pattern="[0-9]*" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="sets" value="${esc(it.sets ?? "")}"></label>
            <label>Reps<input inputmode="numeric" pattern="[0-9]*" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="reps" value="${esc(it.reps ?? "")}"></label>
            <label>+lb<input inputmode="decimal" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="inc" value="${esc((program.progression || {})[it.id] ?? "")}" placeholder="—" aria-label="Pounds added when all sets are hit (blank = no auto progression)"></label>
            <label>Rest s<input inputmode="numeric" pattern="[0-9]*" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="rest" value="${esc(it.rest || "")}" placeholder="—" aria-label="Rest between sets in seconds (blank = none)"></label></div>` : ""}
          ${it.t === "rounds" ? `<div class="efields"><label>Rounds<input inputmode="numeric" pattern="[0-9]*" data-f="prog" data-b="${bi}" data-i="${ii}" data-k="rounds" value="${esc(it.rounds ?? "")}"></label></div>` : ""}
          <input data-f="prog" data-b="${bi}" data-i="${ii}" data-k="note" value="${esc(it.note || "")}" placeholder="Note, e.g. 4×5 · 2 min rest" aria-label="Note">
        </div>`).join("")}
        <div class="row"><span class="muted small">Add:</span>${["sets", "rounds", "check"].map(t => `<button type="button" class="btn ghost small" data-act="padd" data-b="${bi}" data-t="${t}">+ ${{ sets: "Sets", rounds: "Rounds", check: "Check" }[t]}</button>`).join("")}</div>
      </div>`).join("")}
      <button type="button" class="btn ghost wide" data-act="pb" data-op="add">+ Add block</button>
      <div class="muted small">Changes save automatically. "+lb" is how much weight to add after you hit every set and rep; leave it blank for no auto progression. "Rest s" starts a rest timer (in seconds) each time you log a set\'s reps.</div>
    </div>
    <div class="muted small pad">Lift Tracker · works offline · data stays on this phone.</div>
  </section>`;
}

/* ---------- actions ---------- */
const formOf = scope => scope === "edit" ? editing : draft;
const touch = scope => { if (scope === "draft") persistDraft(); };
const go = t => { tab = t; history.replaceState(null, "", "#" + t); render(); window.scrollTo(0, 0); };
let timerOn = false;

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
    case "barinfo": { const o = document.getElementById(d.out); if (o) o.textContent = d.text; break; }
    case "export": exportBackup(); break;
    case "resetprog":
      if (await ask({ title: "Reset the program?", body: "Your edits to exercises, sets and reps go back to the original program. Logged sessions are kept.", yes: "Reset", danger: true })) {
        program = clone(defaultProgram); programEdited = false; await db.kvSet("program", undefined); toast("Program reset"); render();
      }
      break;
    case "progday": progDay = +d.n; render(); break;
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
  else if (f === "edate") { if (el.value) editing.date = el.value; }
  else if (f === "emins") editing.mins = el.value;
  else if (f === "prog") {
    const day = dayOf(program, progDay), k = el.dataset.k;
    if (k === "dayname") day.name = el.value;
    else if (k === "label") day.blocks[+el.dataset.b].label = el.value;
    else {
      const it = day.blocks[+el.dataset.b].items[+el.dataset.i];
      if (k === "n" || k === "note") it[k] = el.value;
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
  if (el.dataset.f === "import" && el.files && el.files[0]) { importBackup(el.files[0]); el.value = ""; }
});

addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.includes(h) && h !== tab) { tab = h; render(); } });
setInterval(() => { const el = $("#elapsed"); if (el && draft) el.textContent = fmtClock(Date.now() - draft.start); }, 1000);
// Flush the draft when the app is hidden (switching apps, locking the phone).
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && draft) persistDraft(); });

/* ---------- boot ---------- */
async function fetchJSON(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(url); return r.json(); }

(async () => {
  render();
  try {
    const [stored, savedDraft, savedTimer, savedNames, imported, ws] = await Promise.all([
      db.kvGet("program"), db.kvGet("draft"), db.kvGet("timer"), db.kvGet("names"), db.kvGet("imported"), db.allWorkouts(),
    ]);
    names = savedNames || {};
    try { defaultProgram = await fetchJSON("data/program.json"); } catch {}
    program = stored ? stored : defaultProgram ? clone(defaultProgram) : null;
    programEdited = !!stored;
    if (!program) { loadError = "Couldn't load the program. Connect to the internet once and reopen the app."; render(); return; }
    if (!defaultProgram) defaultProgram = clone(program);
    // Carry new per-item settings from the default program into an edited copy.
    if (stored) {
      const defs = {};
      for (const d of defaultProgram.days) for (const it of itemsOf(d)) defs[it.id] = it;
      for (const d of program.days) for (const it of itemsOf(d)) if (it.rest === undefined && defs[it.id] && defs[it.id].rest) it.rest = defs[it.id].rest;
    }
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
