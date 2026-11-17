// Media targeting: relevance-first, recency-ranked, one reporter per outlet (TG-1..TG-7).
import { OUTLETS } from '../knowledge/outlets.js';
import { TOPIC_BY_ID } from '../knowledge/topics.js';
import { demoDeskContact, isSuppressed, pitchedRecently } from './contacts.js';
import { domainOf } from './discovery.js';

const REGION_TZ = { us: 'America/New_York', uk: 'Europe/London', eu: 'Europe/Berlin', global: 'America/New_York', local: '' };
const MIN_RELEVANCE = 0.2;
const outletByDomain = new Map(OUTLETS.map((o) => [o.domain.split('/')[0], o]));

export function findOutlet(domain) {
  const d = String(domain || '').replace(/^www\./, '');
  return outletByDomain.get(d) || null;
}

// Story-specific beats (e.g. transport for an e-bike) outweigh generic topic beats (e.g. tech).
function relevance(contactBeats, campaignBeats, specificBeats) {
  const weights = Object.fromEntries(campaignBeats.map((b) => [b, specificBeats.includes(b) ? 2 : 1]));
  const max = Object.values(weights).sort((a, b) => b - a).slice(0, 3).reduce((n, w) => n + w, 0) || 1;
  const matched = contactBeats.filter((b) => weights[b]).sort((a, b) => weights[b] - weights[a]);
  return { value: Math.min(1, matched.reduce((n, b) => n + weights[b], 0) / max), matched };
}

function recency(contact, articlesByDomain, terms) {
  const daysAgo = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 999);
  let best = null;
  for (const a of articlesByDomain.get(contact.domain) || []) {
    const age = daysAgo(a.date);
    if (age <= 90 && (!best || age < best.age)) best = { ...a, age };
  }
  const ra = contact.recentArticle;
  if (ra?.title && terms.some((t) => ra.title.toLowerCase().includes(t))) {
    const age = daysAgo(ra.date);
    if (!best || age < best.age) best = { title: ra.title, url: ra.url, date: ra.date, age: age === 999 ? 30 : age };
  }
  if (!best) return { value: 0, article: null };
  return { value: best.age <= 14 ? 1 : best.age <= 45 ? 0.7 : 0.4, article: best };
}

export function buildTargets({ brief, cls, nw, flags, discovery, contacts = [], includeDemo = true, campaignId = '', suppression, history }) {
  const topic = TOPIC_BY_ID[cls.topic.id];
  const terms = discovery?.query?.terms || [];
  const articlesByDomain = new Map();
  for (const a of discovery?.articles || []) {
    const d = (a.domain || domainOf(a.url)).replace(/^www\./, '');
    if (!articlesByDomain.has(d)) articlesByDomain.set(d, []);
    articlesByDomain.get(d).push(a);
  }

  // Candidate pool: imported contacts first, then outlet news desks (demo, test mode only).
  const pool = [];
  const covered = new Set();
  for (const c of contacts) {
    const o = findOutlet(c.domain);
    pool.push({ ...c, outlet: c.outlet || o?.name || c.domain, tier: c.tier || o?.tier || 3, reach: o?.reach || 's', region: o?.region || brief.region, beats: c.beats?.length ? c.beats : o?.beats || [] });
    covered.add(c.domain);
  }
  if (includeDemo) {
    for (const o of OUTLETS) if (!covered.has(o.domain)) pool.push({ ...demoDeskContact(o), reach: o.reach, region: o.region });
  }

  const tierW = {
    strong: { 1: 1, 2: 0.85, 3: 0.7 },
    moderate: { 1: 0.75, 2: 1, 3: 0.85 },
    weak: { 1: 0, 2: 0.8, 3: 1 },
  }[nw.verdict];

  const excluded = { offBeat: 0, suppressed: 0, recentlyPitched: 0, tier: 0, local: 0 };
  const scored = [];
  for (const c of pool) {
    const rel = relevance(c.beats, cls.beats, cls.specificBeats || []);
    // When the story has specific beats, a single generic beat match (e.g. only "tech") is not relevant enough.
    const minRel = (cls.specificBeats || []).length ? Math.max(MIN_RELEVANCE, 0.3) : MIN_RELEVANCE;
    if (rel.value < minRel || !rel.matched.length) { excluded.offBeat++; continue; }
    if (isSuppressed(c.email, suppression)) { excluded.suppressed++; continue; }
    if (pitchedRecently(c.email, campaignId, 30, history)) { excluded.recentlyPitched++; continue; }
    if (!tierW[c.tier]) { excluded.tier++; continue; }
    if (c.region === 'local' && !brief.city) { excluded.local++; continue; }
    const rec = recency(c, articlesByDomain, terms);
    const regionFit = c.region === brief.region || c.region === 'global' || c.region === 'local' ? 1 : 0.6;
    const score = Math.round(100 * (0.45 * rel.value + 0.25 * rec.value + 0.2 * tierW[c.tier] + 0.1 * regionFit));
    const reasons = [`beat: ${rel.matched.slice(0, 3).join(', ')}`];
    if (rec.article) reasons.push(`covered “${rec.article.title.slice(0, 70)}” ${rec.article.age}d ago`);
    reasons.push(`tier ${c.tier}`);
    scored.push({
      ...c, score, relevance: Math.round(rel.value * 100) / 100, recentArticle: rec.article || c.recentArticle || null,
      matchedBeats: rel.matched, reason: reasons.join(' · '),
      timezone: c.timezone || REGION_TZ[c.region] || brief.timezone,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.tier - b.tier);
  const perOutlet = new Set();
  const targets = [];
  for (const t of scored) {
    const key = (t.outlet || t.domain).toLowerCase();
    if (perOutlet.has(key)) continue; // TG-2
    perOutlet.add(key);
    targets.push(t);
    if (targets.length >= topic.listCap) break; // TG-4
  }

  // TG-7: exclusive offered to one outlet at a time; keep two backups in order.
  if (flags.exclusive) {
    const ranked = targets.filter((t) => t.tier === 1).concat(targets.filter((t) => t.tier === 2));
    ranked.slice(0, 3).forEach((t, i) => { t.role = i === 0 ? 'exclusive' : `exclusive_backup_${i}`; if (i === 0) t.exclusive = true; });
  }
  if (flags.embargo) targets.filter((t) => !t.role).slice(0, 8).forEach((t) => { t.role = 'embargo'; });
  for (const t of targets) t.role ||= 'launch';

  return { targets, excluded, poolSize: pool.length, demoUsed: targets.some((t) => t.demo) };
}
