import { randomBytes, createHash } from 'node:crypto';

export const id = (prefix = '') => prefix + randomBytes(6).toString('hex');
export const hash = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

export const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
export const wordCount = (s) => words(s).length;
export const sentences = (s) => String(s || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(["”’)]+)?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const titleCase = (s) => String(s || '').replace(/\w\S*/g, (w) => (w.length > 3 || /^[A-Z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w));

export const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const unique = (arr) => [...new Set(arr)];

// Deterministic PRNG for simulations (mulberry32).
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : parseInt(hash(seed).slice(0, 8), 16);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Syllable estimate for Flesch–Kincaid.
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export function fleschKincaidGrade(text) {
  const sents = sentences(text).length || 1;
  const ws = words(text).filter((w) => /[a-z]/i.test(w));
  if (!ws.length) return 0;
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return Math.round((0.39 * (ws.length / sents) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10;
}

// ---- Time zones without dependencies -------------------------------------------------------

function tzParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, weekday: p.weekday };
}

export function tzOffsetMinutes(date, timeZone) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function zonedToUtc(y, m, d, h, min, timeZone) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off1 = tzOffsetMinutes(guess, timeZone);
  const t = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(t, timeZone);
  return off1 === off2 ? t : new Date(guess.getTime() - off2 * 60000);
}

export const localParts = tzParts;

export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const weekdayIndex = (date, tz) => WD[tzParts(date, tz).weekday];

export function addBusinessDays(date, n, tz = 'UTC') {
  let t = new Date(date.getTime());
  let added = 0;
  while (added < n) {
    t = new Date(t.getTime() + 86400000);
    const wd = weekdayIndex(t, tz);
    if (wd !== 0 && wd !== 6) added++;
  }
  return t;
}

// Next slot within allowed weekdays and hour window in the given zone (OP-2).
export function nextWindow(from, tz, { days = [2, 3, 4], startHour = 6, endHour = 10, minute = 5 } = {}) {
  for (let i = 0; i < 21; i++) {
    const probe = new Date(from.getTime() + i * 86400000);
    const p = tzParts(probe, tz);
    const wd = WD[p.weekday];
    if (!days.includes(wd)) continue;
    const slot = zonedToUtc(p.y, p.m, p.d, startHour, minute, tz);
    const end = zonedToUtc(p.y, p.m, p.d, endHour, 0, tz);
    if (from <= slot) return slot;
    if (from < end) return new Date(from.getTime() + 60000);
  }
  return from;
}

export function fmtDate(date, tz = 'UTC') {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

export function fmtDateTime(date, tz = 'UTC') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

// AP style month abbreviations for datelines.
const AP_MONTH = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
export function apDate(date, tz = 'UTC') {
  const p = tzParts(date, tz);
  return `${AP_MONTH[p.m - 1]} ${p.d}, ${p.y}`;
}

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
