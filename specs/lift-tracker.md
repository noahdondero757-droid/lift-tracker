# Lift Tracker spec

## Goal

A phone-first workout tracker for Noah's 4-day athletic program. He opens it from his iPhone Home
Screen at the gym, runs each session from it (warmups, sets, rounds, timers), and it tells him what
weight to lift next time. It replaces the workout part of the current Training Log app
(`reference/current-app.html`, tabs **Today / Train / History**). Health data (sleep, HRV, heart
rate) is **out of scope** for this project.

## Users

One user: Noah. He's not a developer, so the app has to work without any setup on his side beyond
"open the link, Add to Home Screen".

## Requirements

### R1. Program
- R1.1 Load the program from `data/program.json`: 4 days, each with ordered blocks (warmup, power,
  strength, rounds, conditioning…), each block with items.
- R1.2 Item types: `sets` (weight × reps per set, with a target set and rep count), `rounds`
  (tap-to-complete round pips, with "+" to add a round), `check` (single checkbox, e.g. warmup moves).
- R1.3 Every item shows its prescription note (e.g. "4×5 @ ~80% · 2 min rest", "3×3 each side").
- R1.4 Noah can edit the program in-app: rename exercises, change sets/reps/notes, add/remove/reorder
  items and blocks. Edits persist and don't break past history (history references item ids).

### R2. Running a session
- R2.1 Home shows the **next day in the rotation** (the day after the last finished session, wrapping
  4 → 1), sessions done this week, and the main lift's target for today. One tap to start. He can
  also pick any day manually.
- R2.2 Session screen lists blocks in order with the inputs above. Elapsed time shown.
- R2.3 Weight and reps inputs show **last session's values as placeholders**. For progression lifts,
  the weight placeholder is the **target** (see R3).
- R2.4 Numeric keypad on phone (`inputmode="decimal"` / `"numeric"`). Inputs stay usable with sweaty
  thumbs: large tap targets, ≥ 44 px.
- R2.5 "+ Add set" on set items (copies the last set's weight).
- R2.6 Session notes field.
- R2.7 An in-progress session survives closing the app, locking the phone, or reloading.
- R2.8 Finish & save, or discard with an in-page confirmation (no browser `confirm()`).

### R3. Lift progression
- R3.1 Progression lifts and increments: squat +10 lb, trap bar deadlift +10 lb, bench +5 lb
  (configurable per lift in the program).
- R3.2 Rule: if the last session hit **all prescribed sets × reps at the top working weight**, the
  target is top weight + increment. Otherwise repeat the same weight.
- R3.3 Show the target on the item ("Target 195 lb · +10 after hitting all 4×5" / "Repeat 185 lb ·
  finish all 4×5 to move up") and on the home card.
- R3.4 Optional: after 2 sessions in a row missing reps at the same weight, suggest a 10% deload.

### R4. Timers
- R4.1 Rest preset buttons: 30s, 60s, 90s, 2:00, 3:00.
- R4.2 Block timers defined in the program (`timer.ph` = phases `[label, seconds]`, `timer.rep` =
  repeats). Examples: Day 1 power alternates "Box jumps 90s / Lateral bounds 90s" ×4, and bike sprints
  run "Sprint 10s / Easy 50s" ×8.
- R4.3 Timer bar fixed above the bottom nav: big countdown, current phase label, "Round x of y", Stop.
- R4.4 Beep at each phase change (Web Audio, started from a tap). Keep the screen awake while running
  (Wake Lock, ignore if refused). The timer must stay correct after the phone sleeps (compute from end
  timestamps, not by counting ticks).

### R5. History & progress
- R5.1 Session list, newest first: day, date, duration, main lift top set, note. Tap to view or edit.
  Delete with in-page confirmation.
- R5.2 Best set per main lift (squat, bench, trap bar, pull-up) with estimated 1RM
  (Epley: `w × (1 + r/30)`).
- R5.3 **Progress chart per lift**: top-set weight and e1RM over time, 4W / 12W / All toggle, tap a
  point to see that session.
- R5.4 Weekly volume (sets × reps × weight) per lift or day, as a simple bar chart.
- R5.5 Sessions per week (target 4).

### R6. Data
- R6.1 Store everything on the device (IndexedDB). Works fully offline at the gym.
- R6.2 **Import** `data/history.json` (Noah's existing log) on first run.
- R6.3 Export / import a JSON backup file from a Settings screen, so data can move to a new phone.

### R7. App shell
- R7.1 Installable PWA: `manifest.webmanifest` (name "Lift Tracker", icon, `display: standalone`,
  theme color) and a service worker that caches the app for offline use.
- R7.2 Bottom tab bar: **Today · Train · History · Settings**. Respect iPhone safe areas.
- R7.3 Light and dark theme following the system setting. Keep the current look (dark slate,
  condensed display headings, monospace numbers) from `reference/current-app.html`.

## Constraints

- No backend, no accounts, no paid services.
- Prefer **no build step**: plain HTML/CSS/JS (ES modules) so Noah can host it on GitHub Pages and
  edit from his phone with Claude Code. If a framework is used, it must build to static files with a
  single `npm run build`.
- Must work in iOS Safari (Home Screen web app) as the primary target.

## Definition of done

- Every R-item above works on an iPhone-sized screen (390×844) in light and dark mode.
- The existing Day 1 session from `data/history.json` appears in History after first launch, and Day 1's
  squat target shows **195 lb** (185 × 4×5 hit → +10).
- Starting a session, killing the tab, and reopening resumes it with inputs intact.
- Airplane mode: the app loads and a session can be logged and saved.
- Deployed to GitHub Pages with a short README section explaining how to add it to the Home Screen.

## Open questions for Noah

- Day 2–4 reps were filled in by Claude. Day 1 is his exact program. Confirm the others.
