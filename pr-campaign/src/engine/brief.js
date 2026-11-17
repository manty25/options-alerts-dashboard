// Brief normalisation (DS-1) and fact sheet extraction (DS-4, DS-10, AE-3).
import { isValidTimeZone, sentences, unique, isEmail, slug } from '../util.js';

export const TK = (what) => `[TK: ${what}]`;
export const hasTK = (s) => /\[TK:[^\]]*\]/.test(String(s || ''));

const REGION_TZ = {
  us: 'America/New_York', uk: 'Europe/London', eu: 'Europe/Berlin', de: 'Europe/Berlin', fr: 'Europe/Paris',
  fi: 'Europe/Helsinki', se: 'Europe/Stockholm', au: 'Australia/Sydney', ca: 'America/Toronto', in: 'Asia/Kolkata',
  sg: 'Asia/Singapore', jp: 'Asia/Tokyo',
};

const VERBS = /\s(launches|launched|unveils|introduces|announces|raises|raised|acquires|appoints|names|hires|partners|opens|releases|debuts|wins|publishes|reports|expands|teams|joins|responds|statement|will|is|has|today)\b/i;

export function inferOrg(news) {
  const m = String(news).match(VERBS);
  if (!m || m.index === 0) return '';
  const head = news.slice(0, m.index).trim().replace(/^(today,?\s+)/i, '');
  if (head.split(/\s+/).length > 6 || !/^[A-Z0-9]/.test(head)) return '';
  return head.replace(/[,]$/, '');
}

// Number-bearing phrases: money, percentages, counts, dates.
const NUM_RE = /(?:[$€£¥]\s?\d[\d,.]*\s?(?:million|billion|thousand|[mbk]n?|bn)?|\d[\d,.]*\s?(?:%|percent|million|billion|thousand)|\b(?:19|20)\d{2}\b|\bQ[1-4]\b|\b\d[\d,.]*\+?\s(?:[a-z-]+\s){0,2}[a-z-]+)/gi;

export function extractNumbers(text) {
  return unique((String(text).match(NUM_RE) || []).map((x) => x.trim()));
}

const NOT_PLACES = new Set(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Europe', 'Asia', 'Africa', 'America', 'North America', 'South America', 'Latin America', 'Oceania', 'The', 'A', 'An', 'Q1', 'Q2', 'Q3', 'Q4']);

// "… a clinic in Dayton that …" → Dayton (used for the dateline and proximity when no city is given).
export function inferCity(news, org = '') {
  for (const m of String(news).matchAll(/\b(?:in|to|across) ((?:[A-Z][a-z]+)(?:[ -][A-Z][a-z]+)?)\b/g)) {
    const place = m[1];
    if (NOT_PLACES.has(place) || NOT_PLACES.has(place.split(' ')[0]) || org.includes(place)) continue;
    return place;
  }
  return '';
}

export function normalizeBrief(input) {
  const b = typeof input === 'string' ? { news: input } : { ...(input || {}) };
  const news = String(b.news || '').trim().replace(/\s+/g, ' ');
  if (!news) throw new Error('The brief needs at least one sentence about the news.');

  const org = String(b.org || '').trim() || inferOrg(news) || TK('organisation name');
  const region = String(b.region || b.country || 'us').toLowerCase();
  let timezone = b.timezone && isValidTimeZone(b.timezone) ? b.timezone : REGION_TZ[region] || 'America/New_York';

  const spokesperson = {
    name: b.spokesperson?.name || b.spokespersonName || TK('spokesperson name'),
    title: b.spokesperson?.title || b.spokespersonTitle || TK('spokesperson title'),
  };
  const contactEmail = b.contact?.email || b.contactEmail || '';
  const contact = {
    name: b.contact?.name || b.contactName || (spokesperson.name.startsWith('[TK') ? 'Media relations' : spokesperson.name),
    email: isEmail(contactEmail) ? contactEmail : TK('media contact email'),
    phone: b.contact?.phone || b.contactPhone || '',
  };

  const website = (b.website || '').trim();
  const extraFacts = (Array.isArray(b.facts) ? b.facts : String(b.facts || '').split(/\n+/))
    .map((f) => String(f).replace(/^[-*•]\s*/, '').trim()).filter(Boolean);

  const brief = {
    news,
    org,
    orgSlug: slug(org.startsWith('[TK') ? 'company' : org),
    website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
    city: b.city || inferCity(news, String(b.org || '')),
    cityInferred: !b.city && Boolean(inferCity(news, String(b.org || ''))),
    regionName: b.regionName || b.state || '',
    region,
    timezone,
    launchAt: b.launchAt || b.date || '',
    spokesperson,
    quote: (b.quote || '').trim(),
    secondQuote: b.secondQuote ? { text: b.secondQuote, name: b.secondQuoteName || '', title: b.secondQuoteTitle || '' } : null,
    contact,
    about: (b.about || '').trim(),
    facts: extraFacts,
    audience: (b.audience || '').trim(),
    goal: (b.goal || '').trim(),
    productUrl: (b.productUrl || b.link || '').trim(),
    mediaKitUrl: (b.mediaKitUrl || '').trim(),
    claimsSubstantiated: Boolean(b.claimsSubstantiated),
    publicCompany: Boolean(b.publicCompany),
    ticker: (b.ticker || '').trim(),
    budget: ['free', 'lean', 'full'].includes(b.budget) ? b.budget : 'lean',
    topicOverride: b.topic || b.topicOverride || '',
    postalAddress: (b.postalAddress || '').trim(),
    sender: {
      name: b.sender?.name || b.senderName || (contact.name !== 'Media relations' ? contact.name : ''),
      email: b.sender?.email || b.senderEmail || (isEmail(contactEmail) ? contactEmail : ''),
    },
    exclusiveOk: b.exclusiveOk !== false,
    embargoOk: b.embargoOk !== false,
  };
  return brief;
}

// The fact sheet is the single source of truth every asset is generated from (DS-10).
export function buildFactSheet(brief) {
  const facts = [];
  const add = (kind, text, extra = {}) => {
    const t = String(text).trim().replace(/\s+/g, ' ');
    if (t && !facts.some((f) => f.text === t)) facts.push({ id: `f${facts.length + 1}`, kind, text: /[.!?]$/.test(t) ? t : `${t}.`, ...extra });
  };
  const newsSentences = sentences(brief.news);
  newsSentences.forEach((s, i) => add(i === 0 ? 'core' : 'detail', s));
  brief.facts.forEach((f) => add('detail', f));
  if (!brief.org.startsWith('[TK')) {
    if (brief.city) add('org', `${brief.org} is based in ${brief.city}${brief.regionName ? `, ${brief.regionName}` : ''}`);
    if (brief.website) add('org', `More information: ${brief.website}`);
    if (brief.publicCompany && brief.ticker) add('org', `${brief.org} is listed as ${brief.ticker}`);
  }
  if (brief.launchAt) {
    const d = new Date(brief.launchAt);
    if (!isNaN(d)) add('availability', `Announcement date: ${d.toISOString().slice(0, 10)}`);
  }
  const numbers = unique([brief.news, ...brief.facts].flatMap(extractNumbers));
  return { facts, numbers };
}

// Words in the brief that mark a claim as a superlative needing proof (PR-11).
export const SUPERLATIVES = /\b(first|only|largest|biggest|fastest|leading|#1|number one|world's|best)\b/i;
