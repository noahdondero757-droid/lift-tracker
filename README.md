# Lift Tracker

Workout tracker for a 4-day athletic program: guided sessions, rest and block timers, automatic lift
progression, history and progress charts. Works offline and installs on an iPhone Home Screen.

App link (once GitHub Pages is on): **https://noahdondero757-droid.github.io/lift-tracker/**

## Turn on GitHub Pages (one time)

GitHub Pages is free for **public** repos. A private repo needs a paid GitHub Pro plan.

1. Open https://github.com/noahdondero757-droid/lift-tracker/settings
2. Only if the repo is private and you don't have Pro: scroll to **Danger Zone** → **Change visibility** →
   **Make public** → confirm. (Your logged sessions live on your phone, not in the repo. The repo only
   holds the program and the one starter session in `data/history.json`.)
3. In the left menu click **Pages**.
4. Under **Build and deployment** → **Source**, pick **Deploy from a branch**.
5. Under **Branch**, pick **main** and **/ (root)**, then click **Save**.
6. Wait about a minute, then refresh the page. The link shows at the top of the Pages screen.

## Add it to your iPhone Home Screen

1. Open the app link above in **Safari** (not Chrome).
2. Tap the **Share** button (square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Lift Tracker** from the Home Screen icon from now on. Once it's open, it works with no signal.

Your data is stored on the phone. To move it to a new phone, go to **Settings → Export backup** and
save the file, then use **Import backup** on the new phone.

## Files

- `index.html`, `styles.css`, `js/`: the app (plain HTML/CSS/JS, no build step).
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and Home Screen install.
- `data/program.json`: the program. `data/history.json`: sessions imported on first launch.
- `specs/lift-tracker.md`: the spec.

When you change the app files, bump `VERSION` in `sw.js` so phones pick up the new version.
