// Contacts, suppression list (TG-5, OP-7) and pitch history (TG-6).
import { readJson, writeJson, globalFile } from '../store.js';
import { parseCsv, csvEscape, isEmail, slug, id, isValidTimeZone } from '../util.js';

const CONTACTS = () => globalFile('contacts.json');
const SUPPRESSION = () => globalFile('suppression.json');
const HISTORY = () => globalFile('pitch-history.json');

export const loadContacts = () => readJson(CONTACTS(), []);
export const saveContacts = (list) => writeJson(CONTACTS(), list);

export function importContactsCsv(text) {
  const rows = parseCsv(text);
  const existing = loadContacts();
  const byEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c]));
  let added = 0, updated = 0;
  const rejected = [];
  for (const r of rows) {
    const email = (r.email || '').trim();
    if (!isEmail(email)) { rejected.push({ row: r, reason: 'missing or invalid email' }); continue; }
    const c = {
      id: byEmail.get(email.toLowerCase())?.id || id('c_'),
      name: r.name || r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || email.split('@')[0],
      email,
      outlet: r.outlet || r.publication || r.company || '',
      domain: (r.domain || r.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || email.split('@')[1],
      beats: (r.beats || r.beat || r.topics || '').split(/[;|]/).map((b) => slug(b)).filter(Boolean),
      tier: Number(r.tier) || 0,
      timezone: isValidTimeZone(r.timezone) ? r.timezone : '',
      recentArticle: r.recent_article_title ? { title: r.recent_article_title, url: r.recent_article_url || '', date: r.recent_article_date || '' } : null,
      source: 'import',
    };
    if (byEmail.has(email.toLowerCase())) updated++; else added++;
    byEmail.set(email.toLowerCase(), c);
  }
  saveContacts([...byEmail.values()]);
  return { added, updated, rejected: rejected.length, total: byEmail.size };
}

export function contactsCsv(list) {
  const cols = ['name', 'email', 'outlet', 'domain', 'beats', 'tier', 'timezone', 'score', 'reason', 'role', 'recent_article_title', 'recent_article_url', 'demo'];
  const lines = [cols.join(',')];
  for (const c of list) {
    lines.push([
      c.name, c.email, c.outlet, c.domain, (c.beats || []).join(';'), c.tier, c.timezone, c.score ?? '', c.reason ?? '',
      c.exclusive ? 'exclusive' : c.role || '', c.recentArticle?.title || '', c.recentArticle?.url || '', c.demo ? 'yes' : '',
    ].map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

// Demo desk contacts use the reserved .test TLD so they can never be delivered (DS-3).
export function demoDeskContact(outlet) {
  return {
    id: `desk_${slug(outlet.domain)}`,
    name: `${outlet.name} news desk`,
    email: `newsdesk+${slug(outlet.domain)}@relay-demo.test`,
    outlet: outlet.name, domain: outlet.domain, beats: outlet.beats, tier: outlet.tier, timezone: '',
    recentArticle: null, source: 'demo', demo: true,
  };
}

export const loadSuppression = () => readJson(SUPPRESSION(), []);
export function suppress(email, reason = 'opt-out') {
  const list = loadSuppression();
  const e = String(email).toLowerCase();
  if (!list.some((s) => s.email === e)) list.push({ email: e, reason, at: new Date().toISOString() });
  writeJson(SUPPRESSION(), list);
  return list;
}
export function isSuppressed(email, list = loadSuppression()) {
  const e = String(email).toLowerCase();
  const domain = e.split('@')[1];
  return list.some((s) => s.email === e || (s.email.startsWith('@') && s.email.slice(1) === domain));
}

export const loadHistory = () => readJson(HISTORY(), {});
export function recordPitch(email, campaignId) {
  const h = loadHistory();
  const e = String(email).toLowerCase();
  (h[e] ||= []).push({ campaignId, at: new Date().toISOString(), replied: false });
  writeJson(HISTORY(), h);
}
export function markReplied(email, campaignId) {
  const h = loadHistory();
  for (const p of h[String(email).toLowerCase()] || []) if (p.campaignId === campaignId) p.replied = true;
  writeJson(HISTORY(), h);
}
export function pitchedRecently(email, campaignId, days = 30, history = loadHistory()) {
  const cutoff = Date.now() - days * 86400000;
  const entries = history[String(email).toLowerCase()] || [];
  if (entries.some((p) => p.replied)) return false;
  return entries.some((p) => p.campaignId !== campaignId && new Date(p.at).getTime() > cutoff);
}
