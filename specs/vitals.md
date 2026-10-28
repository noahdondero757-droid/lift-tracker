# Vitals spec

## Goal

Add Noah's recovery data (sleep, HRV, resting HR, breathing rate, blood oxygen, steps, VO₂ max,
weight) to Lift Tracker. He should see it on Today next to his workout, get a readiness call that
adjusts the session, and tap any metric to see its trend. The data comes from his Fitbit through
Google Health. This ports the health half of `reference/current-app.html` (`dashboard()`,
`detailHTML()`, `scoreParts()`, `readiness()`, `bodyTrends()`) into this app.

## Where the data comes from

`apps-script/Code.gs` runs hourly in Noah's Google account. It pulls from the Google Health API and
serves the result at a private web link (Apps Script Web App `doGet`):

```
GET <vitals link>   (the link includes ?key=…)
→ { "updated": ISO, "days": { "YYYY-MM-DD": {
      "hrv": ms, "rhr": bpm, "rr": breaths/min, "spo2": %, "steps": n, "vo2": ml/kg/min, "weight": lb,
      "sleep": { "deep": min, "rem": min, "light": min, "awake": min,
                 "onset": ISO (first moment asleep), "wakeMin": min awake after onset, "wakes": n } } },
    "workouts": [ { "start": ISO, "end": ISO, "date": "YYYY-MM-DD", "mins": n, "type": "Weightlifting",
                    "avgHr": bpm, "maxHr": bpm, "cal": kcal } ] }   // tracked on the watch; any field but start/end can be missing
→ { "error": "bad key" }   if the key is wrong
```

- Any field can be missing on any day. Render "—" and hide charts with no data.
- The sleep `date` is the morning the night ended.
- `data/vitals-sample.json` has the same shape with **made-up** values for development. Never ship
  it as real data, and never commit Noah's real link or numbers (the repo is public).

## Requirements

### V1. Connection
- V1.1 Settings has a **Vitals link** field. Noah pastes the link once, and it's stored in IndexedDB
  (`kv`), never in the repo.
- V1.2 Fetch on app open and whenever the app becomes visible again after more than 30 minutes. Plain
  `fetch(link)` GET, no custom headers (keeps it a simple CORS request; Apps Script redirects to
  googleusercontent.com, which allows it).
- V1.3 Cache the last good response in IndexedDB. Offline or failed fetches show the cached data
  with "Updated 3h ago". The service worker must **not** cache or intercept the vitals request.
- V1.4 Status line in Settings: "Connected · updated 4:12 PM", "Link is wrong (bad key)",
  "Couldn't reach Google. Showing data from …", or "Not set up". Include a **Test link** button.

### V1b. Watch workouts (built)
- Each logged session is paired with the watch workout that overlaps it in time (else the longest one
  that day, ignoring walks). History shows the watch's duration, heart rate and calories; the session
  sheet has a "From Your Watch" group.
- Watch workouts from the last 14 days (15+ min, not walks) with no logged session are listed in History
  under "From Your Watch". Tap to log one (pre-filled date, minutes and next day in the rotation), or ✕ to hide it.

### V2. Today screen
- V2.1 Above the workout card, a 2×2 grid of tiles: **Sleep score**, **HRV**, **Resting HR**,
  **Steps**. Each tile shows the value, the change vs. its 7-day average (colored good/bad by
  direction), and a 14-day sparkline.
- V2.2 An **Early warning** row: breathing rate and blood oxygen, with a Normal or Elevated pill.
  Elevated means breathing rate is 1+/min above its 7-day average, or SpO₂ is under 94%.
- V2.3 **Last night** card: asleep / deep / REM / awake, a stage bar, bedtime, and the readiness pill
  with one line of advice.
- V2.4 The **Up next** workout card shows the readiness advice too. On "Go easy" it says "Cut the
  main lift to 3×5 and skip the finisher".

### V3. Sleep score (Apple-style, 0–100)
- Duration 50: full marks at 7h50m+ asleep. Shortfall `s` in hours costs `5.5·s` up to 1h,
  `5.5 + 7.5·(s−1)` up to 2h, then `13 + 18.5·(s−2)`. −5 if deep < 10% of asleep, −5 if REM < 15%.
- Bedtime 30: compare onset with the median onset of the previous 13 nights (needs at least 3).
  Up to 15 min late is free, 15–60 min late costs up to 10, 60–150 min late costs up to 30 total.
  More than 60 min early costs 1 point per 30 min, max 6. Without enough history, give 30.
- Interruptions 20: `(wakeMin − 11)/4` (when positive) plus `(wakes − 2)/2` (when positive).
- Bands: 96+ Very high · 81–95 High · 61–80 OK · 41–60 Low · ≤40 Very low.
- Copy the exact implementation from `scoreParts()` in `reference/current-app.html`.

### V4. Readiness
- Base from last night: **Go easy** if asleep < 6h or deep < 40 min. **Ready** if asleep ≥ 7.5h
  and deep ≥ 60 min. Otherwise **Moderate**.
- Drop one level each if resting HR is 3+ bpm over its 7-day average, or HRV is 10%+ under its
  7-day average (only when those readings are from today or yesterday).
- Breathing rate +1/min **and** resting HR +3 together force **Go easy**, with the note "That combo
  often means you're fighting something off".
- Show each reason as a short bullet under the advice.

### V5. Trend sheets
- Tapping any tile, the early-warning row, or the last-night card opens a full-screen sheet for
  that metric (port `detailHTML()` from the reference):
  - 7D / 30D / 90D toggle.
  - Line chart (bars for steps) with a dashed average line and a shaded ±1 SD "your range" band.
    Drag across it to scrub day by day.
  - Average / Low / High / Your range stats, plus a Steady / Trending up / Trending down pill
    colored by whether that direction is good.
  - Timeline list, newest first, with the delta vs. average. Sleep rows also show the
    Duration / Bedtime / Interruptions breakdown and a stage bar. Tap a row to select that day.
  - One-paragraph "what this means" note per metric (copy the `about` text from the reference `M`
    object).
- Close with ✕, Escape, or swiping back. Don't lose scroll position on Today.

### V6. History
- Add a **Body & activity** section: VO₂ max, weight, 7-day average steps, sessions per week. Each
  is tappable into its trend sheet.

## Constraints
- Same stack as the rest of the app (plain JS modules, no build). Same look as the existing screens.
- Never put the vitals link, the key, or real health numbers in the repo or in console logs.
- Bump `VERSION` in `sw.js`.

## Definition of done
- With `data/vitals-sample.json` served locally as the link, Today shows all tiles, the early
  warning row, the last-night card with a score, and readiness. Every trend sheet opens, scrubs and
  closes at 390×844 in light and dark.
- A wrong key shows "Link is wrong (bad key)". Airplane mode shows cached data with its age.
- `grep` for "script.google.com/macros/s/" in the repo finds nothing except docs placeholders.
