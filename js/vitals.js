// Connection to the Google script's private link (spec vitals.md V1). The link and the data stay on the
// phone (IndexedDB); never log them.

import * as db from "./db.js";

export const V = { link: "", data: null, fetchedAt: 0, state: "none", lastTry: 0 };
let onChange = () => {};

export async function initVitals(cb) {
  onChange = cb;
  const [link, cached] = await Promise.all([db.kvGet("vitalsLink"), db.kvGet("vitals")]);
  V.link = link || "";
  if (cached) { V.data = cached.data; V.fetchedAt = cached.at; }
  V.state = V.link ? (V.data ? "cached" : "loading") : "none";
  if (V.link) refreshVitals();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && V.link && Date.now() - V.lastTry > 30 * 6e4) refreshVitals();
  });
}

export async function setLink(link) {
  V.link = link.trim();
  await db.kvSet("vitalsLink", V.link || undefined);
  if (!V.link) { V.state = "none"; onChange(); return; }
  return refreshVitals();
}

// Plain GET with no custom headers, so it stays a simple CORS request.
export async function refreshVitals() {
  if (!V.link) return;
  V.lastTry = Date.now();
  V.state = "loading"; onChange();
  try {
    const r = await fetch(V.link, { cache: "no-store" });
    const j = await r.json();
    if (j && j.error) { V.state = "bad"; }
    else if (j && j.days) {
      V.data = j; V.fetchedAt = Date.now(); V.state = "ok";
      await db.kvSet("vitals", { data: j, at: V.fetchedAt });
    } else V.state = "offline";
  } catch { V.state = "offline"; }
  onChange();
}

const ago = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)} days ago`; };
export function statusText() {
  const t = V.fetchedAt ? new Date(V.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return {
    none: "Not set up",
    loading: "Checking…",
    ok: `Connected · updated ${t}`,
    cached: V.fetchedAt ? `Showing data from ${ago(V.fetchedAt)}` : "Not set up",
    bad: "Link is wrong (bad key)",
    offline: V.fetchedAt ? `Couldn't reach Google. Showing data from ${ago(V.fetchedAt)}` : "Couldn't reach Google",
  }[V.state];
}

export const watchWorkouts = () => (V.data && Array.isArray(V.data.workouts) ? V.data.workouts : []);
