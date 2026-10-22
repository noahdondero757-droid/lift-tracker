// Training Log ⇄ Fitbit link
// Pulls your Fitbit data (HRV, sleep, resting HR, breathing, SpO2, steps, VO2 max, weight)
// from Google Health every hour and saves it to a Google Doc called "Training Log – Fitbit Data".
// It also serves that data to the Lift Tracker app through a private web link (doGet below).
//
// HOW TO USE:
//  1. Paste your Client ID and Client secret below.
//  2. Run "authorize", open the link it logs, and approve.
//  3. Run "setup" once.
//  4. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone) > Deploy.
//  5. Run "showAppLink" and paste the link it logs into Lift Tracker > Settings > Vitals link.

const CLIENT_ID = 'PASTE_CLIENT_ID_HERE';
const CLIENT_SECRET = 'PASTE_CLIENT_SECRET_HERE';
const SCOPE = [
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'
].join(' ');

const DOC_NAME = 'Training Log – Fitbit Data';
const DAYS_BACK = 30;
const API = 'https://health.googleapis.com/v4/users/me/dataTypes/';

// ---------- Fitbit login (no library needed) ----------
function props_() { return PropertiesService.getUserProperties(); }
function redirect_() { return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback'; }
function html_(msg) { return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">' + msg + '</p>'); }

function authorize() {
  if (props_().getProperty('REFRESH')) { Logger.log('Already linked to Fitbit. Run setup.'); return; }
  const state = ScriptApp.newStateToken().withMethod('authCallback').withTimeout(3600).createToken();
  const q = { client_id: CLIENT_ID, redirect_uri: redirect_(), response_type: 'code', scope: SCOPE,
              access_type: 'offline', prompt: 'consent', state: state };
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
  Logger.log('Open this link, approve, then run setup:\n' + url);
}

function authCallback(e) {
  const code = e.parameter.code;
  if (!code) return html_('Linking failed: ' + (e.parameter.error || 'no code') + '. Run authorize again.');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true,
    payload: { code: code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: redirect_(), grant_type: 'authorization_code' } });
  const j = JSON.parse(res.getContentText());
  if (!j.refresh_token) return html_('Linking failed: ' + res.getContentText().slice(0, 300));
  props_().setProperties({ REFRESH: j.refresh_token, ACCESS: j.access_token, EXP: String(Date.now() + (j.expires_in - 120) * 1000) });
  return html_('Fitbit linked. Close this tab and run setup.');
}

function token_() {
  const p = props_();
  if (p.getProperty('ACCESS') && Date.now() < Number(p.getProperty('EXP'))) return p.getProperty('ACCESS');
  const refresh = p.getProperty('REFRESH');
  if (!refresh) return null;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true,
    payload: { refresh_token: refresh, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' } });
  const j = JSON.parse(res.getContentText());
  if (!j.access_token) throw new Error('Fitbit login expired: ' + res.getContentText().slice(0, 200) + ' Run reset, then authorize.');
  p.setProperties({ ACCESS: j.access_token, EXP: String(Date.now() + (j.expires_in - 120) * 1000) });
  return j.access_token;
}

function reset() { ['REFRESH', 'ACCESS', 'EXP'].forEach(k => props_().deleteProperty(k)); Logger.log('Fitbit login cleared. Run authorize.'); }

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  sync();
  Logger.log('Done. HRV will refresh every hour. Doc: ' + getDoc_().getUrl());
}

function sync() {
  const out = { updated: new Date().toISOString(), hrv: {}, errors: [], sample: null };
  const cutoff = Utilities.formatDate(new Date(Date.now() - DAYS_BACK * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const points = list_('daily-heart-rate-variability', out);
  // One day can have points from several sources (your Fitbit, and Apple Health copies).
  // Prefer the Fitbit reading, and use its nightly average, which is the HRV Google Health shows you.
  const best = {};
  out.debug = {};
  points.forEach(p => {
    const date = findDate_(p); if (!date || date < cutoff) return;
    const d = p.dailyHeartRateVariability || {};
    const ds = p.dataSource || {};
    const fromApple = ds.platform === 'HEALTH_KIT' || /apple/i.test(JSON.stringify(ds));
    const deep = typeof d.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds === 'number' ? d.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds : null;
    const avg = typeof d.averageHeartRateVariabilityMilliseconds === 'number' ? d.averageHeartRateVariabilityMilliseconds : null;
    const val = avg > 0 ? avg : (deep > 0 ? deep : findNum_(p, /rmssd|milli|average|value|ms$/i));
    (out.debug[date] = out.debug[date] || []).push([fromApple ? 'apple' : (ds.platform || 'fitbit'), deep, avg]);
    if (typeof val !== 'number' || val <= 0) return;
    const rank = fromApple ? 1 : 2;
    if (!best[date] || rank > best[date].rank) best[date] = { rank: rank, val: val };
  });
  Object.keys(best).forEach(k => out.hrv[k] = Math.round(best[k].val));

  // ---- everything else: saved raw so the app can read it ----
  out.daily = {}; out.raw = {}; out.sleep = [];
  const DAILY = ['daily-resting-heart-rate', 'daily-respiratory-rate', 'daily-oxygen-saturation',
                 'daily-steps', 'steps', 'daily-vo2-max', 'vo2-max', 'weight', 'body-weight', 'daily-heart-rate'];
  DAILY.forEach(type => {
    const pts = list_(type, out, 3);
    if (!pts.length) return;
    out.raw[type] = pts.slice(-2);
    const m = {};
    pts.forEach(p => { const d = findDate_(p) || isoDate_(p); const v = mainNum_(p); if (d && d >= cutoff && typeof v === 'number') (m[d] = m[d] || []).push(v); });
    out.daily[type] = {};
    Object.keys(m).forEach(d => out.daily[type][d] = Math.round(m[d].reduce((a, b) => a + b, 0) / m[d].length * 100) / 100);
  });
  const since = new Date(Date.now() - 15 * 864e5).toISOString();
  let sl = list_('sleep', out, 3, 'sleep.interval.end_time >= "' + since + '"');
  if (!sl.length) sl = list_('sleep', out, 3);
  out.sleep = sl.filter(p => { const t = JSON.stringify(p).match(/"(20\d\d-\d\d-\d\dT[^"]+)"/); return !t || t[1] >= since; }).slice(-20);
  if (points.length) out.sample = points[points.length - 1]; // kept so the app can adapt to the data shape
  out.days = normalize_(out);
  saveDays_(out.days);
  const body = getDoc_().getBody();
  body.setText('===BEGIN===\n' + JSON.stringify(out) + '\n===END===');
  Logger.log('HRV days found: ' + Object.keys(out.hrv).length + ' | sleep sessions: ' + out.sleep.length +
    ' | days for app: ' + Object.keys(out.days).length + ' | other data: ' + Object.keys(out.daily).map(k => k + ' ' + Object.keys(out.daily[k]).length).join(', ') +
    (out.errors.length ? ' | errors: ' + out.errors.length : ''));
}

function list_(type, out, maxPages, filter) {
  const token = token_();
  if (!token) { out.errors.push('Not linked yet. Run authorize first.'); return []; }
  let all = [], pageToken = '';
  for (let i = 0; i < (maxPages || 5); i++) {
    const url = API + type + '/dataPoints?pageSize=100' + (filter ? '&filter=' + encodeURIComponent(filter) : '') + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { out.errors.push(type + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 160)); break; }
    const json = JSON.parse(res.getContentText());
    all = all.concat(json.dataPoints || json.points || []);
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

function getDoc_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DOC_ID');
  if (id) { try { return DocumentApp.openById(id); } catch (e) {} }
  const doc = DocumentApp.create(DOC_NAME);
  props.setProperty('DOC_ID', doc.getId());
  return doc;
}

function walk_(o, fn, key) {
  if (o && typeof o === 'object') Object.keys(o).forEach(k => { fn(k, o[k]); walk_(o[k], fn, k); });
}
function pad_(n) { return String(n).padStart(2, '0'); }
function findDate_(o) {
  let r = null;
  walk_(o, (k, v) => {
    if (r) return;
    if (v && typeof v === 'object' && 'year' in v && 'month' in v && 'day' in v) r = v.year + '-' + pad_(v.month) + '-' + pad_(v.day);
    else if (typeof v === 'string' && /date/i.test(k) && /^\d{4}-\d{2}-\d{2}/.test(v)) r = v.slice(0, 10);
  });
  return r;
}
function findNum_(o, re) {
  let r = null;
  walk_(o, (k, v) => { if (r === null && typeof v === 'number' && re.test(k) && !/year|month|day/i.test(k)) r = v; });
  if (r === null) walk_(o, (k, v) => { if (r === null && typeof v === 'number' && !/year|month|day|nanos|seconds|offset/i.test(k)) r = v; });
  return r;
}

function isoDate_(o) {
  const m = JSON.stringify(o).match(/"(20\d\d-\d\d-\d\d)T/);
  return m ? m[1] : null;
}
function mainNum_(o) {
  let r = null;
  walk_(o, (k, v) => { if (r === null && typeof v === 'number' && !/year|month|day|nanos|seconds|offset|hours|minutes|count$/i.test(k)) r = v; });
  if (r === null) walk_(o, (k, v) => { if (r === null && typeof v === 'number' && !/year|month|day|nanos|seconds|offset/i.test(k)) r = v; });
  return r;
}

// ---------- normalized data for the app ----------
// days[YYYY-MM-DD] = { hrv, rhr, rr, spo2, steps, vo2, weight, sleep: {deep, rem, light, awake, onset, wakeMin, wakes} }
const PICK = { rhr: ['daily-resting-heart-rate'], rr: ['daily-respiratory-rate'], spo2: ['daily-oxygen-saturation'],
               steps: ['daily-steps', 'steps'], vo2: ['daily-vo2-max', 'vo2-max'], weight: ['weight', 'body-weight'] };
function normalize_(out) {
  const days = {};
  const get = d => (days[d] = days[d] || {});
  Object.keys(out.hrv).forEach(d => get(d).hrv = out.hrv[d]);
  Object.keys(PICK).forEach(k => {
    const t = PICK[k].find(t => out.daily[t] && Object.keys(out.daily[t]).length);
    if (!t) return;
    Object.keys(out.daily[t]).forEach(d => {
      let v = out.daily[t][d];
      if (k === 'spo2' && v <= 1) v = v * 100;
      if (k === 'weight' && v < 150) v = v * 2.20462;      // kg -> lb
      get(d)[k] = k === 'steps' ? Math.round(v) : Math.round(v * 10) / 10;
    });
  });
  (out.sleep || []).forEach(p => {
    const s = sleepOf_(p); if (!s) return;
    const prev = days[s.date] && days[s.date].sleep;
    if (!prev || (s.deep + s.rem + s.light) > (prev.deep + prev.rem + prev.light)) get(s.date).sleep = s;   // keep the main sleep, not naps
  });
  return days;
}
function isoIn_(o) {   // ISO timestamps directly inside o (one level of nesting)
  const r = [];
  Object.keys(o || {}).forEach(k => {
    const v = o[k];
    if (typeof v === 'string' && /^20\d\d-\d\d-\d\dT/.test(v)) r.push(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(k2 => { if (typeof v[k2] === 'string' && /^20\d\d-\d\d-\d\dT/.test(v[k2])) r.push(v[k2]); });
  });
  return r.sort();
}
function sleepOf_(p) {
  const segs = [];
  walk_(p, (k, v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const label = Object.keys(v).map(x => typeof v[x] === 'string' ? v[x] : '').join(' ');
    const m = label.match(/DEEP|REM|LIGHT|AWAKE|WAKE|RESTLESS/i);
    const t = isoIn_(v);
    if (m && t.length >= 2) segs.push({ k: /DEEP/i.test(m[0]) ? 'deep' : /REM/i.test(m[0]) ? 'rem' : /LIGHT/i.test(m[0]) ? 'light' : 'awake', st: new Date(t[0]).getTime(), en: new Date(t[t.length - 1]).getTime() });
  });
  if (!segs.length) return null;
  const asleep = segs.filter(x => x.k !== 'awake');
  if (!asleep.length) return null;
  const on = Math.min.apply(null, asleep.map(x => x.st)), off = Math.max.apply(null, asleep.map(x => x.en));
  const min = x => Math.round((x.en - x.st) / 6e4), sum = k => segs.filter(x => x.k === k).reduce((a, x) => a + min(x), 0);
  const mid = segs.filter(x => x.k === 'awake' && x.st >= on && x.en <= off);
  const date = Utilities.formatDate(new Date(off), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return { date: date, deep: sum('deep'), rem: sum('rem'), light: sum('light'), awake: sum('awake'),
           onset: new Date(on).toISOString(), wakeMin: mid.reduce((a, x) => a + min(x), 0), wakes: mid.length };
}
function histDoc_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('HIST_ID');
  if (id) { try { return DocumentApp.openById(id); } catch (e) {} }
  const doc = DocumentApp.create('Training Log – Vitals History');
  p.setProperty('HIST_ID', doc.getId());
  return doc;
}
function loadDays_() { try { return JSON.parse(histDoc_().getBody().getText() || '{}'); } catch (e) { return {}; } }
function saveDays_(days) {   // keep up to 180 days of history across runs
  const all = loadDays_();
  Object.keys(days).forEach(d => all[d] = Object.assign(all[d] || {}, days[d]));
  const trimmed = {};
  Object.keys(all).sort().slice(-180).forEach(d => trimmed[d] = all[d]);
  histDoc_().getBody().setText(JSON.stringify(trimmed));
}

// ---------- private web link for the app ----------
function key_() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('APP_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); p.setProperty('APP_KEY', k); }
  return k;
}
function showAppLink() {
  const url = ScriptApp.getService().getUrl();
  if (!url) { Logger.log('Deploy it first: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).'); return; }
  Logger.log('Paste this into Lift Tracker > Settings > Vitals link:\n' + url + '?key=' + key_());
}
function doGet(e) {
  const out = x => ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
  if (!e || !e.parameter || e.parameter.key !== key_()) return out({ error: 'bad key' });
  return out({ updated: new Date().toISOString(), days: loadDays_() });
}
