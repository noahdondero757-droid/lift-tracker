# Lift Tracker

Phone-first workout tracker for Noah's 4-day athletic program: session logging, rest/block timers,
automatic lift progression, history and progress charts. It's a PWA hosted on GitHub Pages and
installed to his iPhone Home Screen.

**Specs:** `specs/lift-tracker.md` (workouts, built) and `specs/vitals.md` (recovery data, next). Build to
them, and check work against each spec's Definition of done.

## Files

- `specs/lift-tracker.md`: requirements (R1–R7), constraints, definition of done.
- `data/program.json`: the program (days → blocks → items). This is Noah's training, so don't change
  exercises, sets or reps unless he asks. Item `id`s are referenced by history, so never rename an id.
- `data/history.json`: his existing logged sessions, to import on first run.
- `apps-script/Code.gs`: Google Apps Script that runs in Noah's Google account, pulls Fitbit data
  from the Google Health API hourly, and serves it to the app at a private web link (`doGet`). It
  keeps `PASTE_..._HERE` placeholders for the OAuth client, so never commit the real values, the link,
  or the key.
- `data/vitals-sample.json`: made-up vitals in the `doGet` shape, for development only.
- `reference/current-app.html`: the old all-in-one app this replaces. Use it for logic
  (`target()`, `topSet()`, `nextDay()`, the timer, `newDraft()`). Its visual style is no longer used: the
  app now looks iOS-native (see spec R7.3). It also
  contains health/sleep features that are out of scope here.

## Data shapes

```
program.days[] = { n, name, blocks[] }
block = { label, about?, timer?: { label, ph: [[phaseLabel, seconds], ...], rep? }, items[] }  // about: why the block/timer, shown under it
item  = { id, n (name), t: "sets"|"rounds"|"check", sets?, reps?, rounds?, note?, rest?, wt?, how? }  // how: "How to" text
// rest: seconds, auto-starts after each logged set. wt: rounds item also logs a weight (carries, sled)
program.progression = { squat: 10, trapbar: 10, bench: 5 }   // lb added when all sets×reps hit

workout = { id, date "YYYY-MM-DD", day 1-4, mins, note,
            ex: { [itemId]: {sets:[{w,r}]} | {rounds, of, w?} | {done:true} } }
// w and r are strings as typed; parse with parseFloat. Empty r means the set wasn't done.
```

## Conventions

- Plain HTML/CSS/JS with ES modules, no build step, unless the spec's constraint is revisited with Noah.
- iOS Safari is the primary target. Test at 390×844, in light and dark mode.
- Never use `alert/confirm/prompt`. Build confirmations into the page.
- Timers compute remaining time from end timestamps, so they stay right after the phone sleeps.

## Working with Noah

- He's not a developer. Explain changes in plain words, give click-by-click steps for anything he has
  to do (GitHub Pages, Add to Home Screen), and keep it short.
- He likes direct, opinionated answers.
