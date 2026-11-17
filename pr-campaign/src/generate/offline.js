// Deterministic writer (DS-5). Uses only facts from the brief (DS-4); gaps become [TK: …] placeholders.
import { TOPIC_BY_ID } from '../knowledge/topics.js';
import { TK } from '../engine/brief.js';
import { sentences, capFirst, apDate } from '../util.js';

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via', 'with', 'from', 'into']);
export function headlineCase(s) {
  return String(s).split(' ').map((w, i) => {
    if (/^[A-Z0-9$€£]{2,}/.test(w) || /[A-Z].*[A-Z]/.test(w)) return w; // keep acronyms / brand casing
    if (i > 0 && SMALL.has(w.toLowerCase())) return w.toLowerCase();
    return w ? w[0].toUpperCase() + w.slice(1) : w;
  }).join(' ');
}

// Split a long first sentence into a headline (≤ 100 chars) and a subhead.
export function splitHeadline(sentence, max = 100) {
  const s = sentence.replace(/[.!]+$/, '').trim();
  if (s.length <= max) return { headline: s, subhead: '' };
  const cuts = [', which ', ', a ', ', an ', ' that ', ', ', ' to ', ' for ', ' with '];
  for (const c of cuts) {
    const i = s.lastIndexOf(c, max);
    if (i > 30) return { headline: s.slice(0, i).trim(), subhead: capFirst(s.slice(i + c.length).trim()) };
  }
  const cut = s.lastIndexOf(' ', max);
  return { headline: s.slice(0, cut), subhead: capFirst(s.slice(cut + 1)) };
}

const PAST = { launches: 'launched', unveils: 'unveiled', introduces: 'introduced', announces: 'announced', raises: 'raised', opens: 'opened', releases: 'released', names: 'named', appoints: 'appointed', acquires: 'acquired', partners: 'partnered', publishes: 'published', wins: 'won', debuts: 'debuted', expands: 'expanded', hires: 'hired', adds: 'added', closes: 'closed', reports: 'reported', joins: 'joined', donates: 'donated', hosts: 'hosted', completes: 'completed', signs: 'signed', secures: 'secured', ships: 'shipped' };

// Splits "Org launches Thing, a description …" into parts used by every writer.
export function parseNews(sentence, org) {
  const s = String(sentence).replace(/^today,?\s*/i, '').replace(/[.!]+$/, '').trim();
  const orgOk = org && !org.startsWith('[TK') && s.startsWith(org);
  const rest = orgOk ? s.slice(org.length).trim() : s;
  const m = rest.match(/^(today\s+)?([a-z]+s)\b\s*(.*)$/);
  const verb = m && PAST[m[2]] ? m[2] : '';
  const object = verb ? m[3] : rest;
  const app = object.match(/^(.+?),\s+((?:a|an|the)\s.+)$/);
  return { org: orgOk ? org : '', verb, verbPast: PAST[verb] || '', object, name: app ? app[1].replace(/^the\s+/i, '') : '', descriptor: app ? app[2] : '' };
}

// AP-style lede: "Org today launched X, …".
export function apLede(sentence, org) {
  const p = parseNews(sentence, org);
  if (p.org && p.verbPast) return `${p.org} today ${p.verbPast} ${p.object}.`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

const STOPEND = /\s+(a|an|the|to|for|of|and|with|that|in|on|at|by|from|its|their|is|are)$/i;
function cutWords(s, max) {
  if (s.length <= max) return s;
  let out = s.slice(0, max + 1).replace(/\s+\S*$/, '');
  // Do not end inside a proper-noun run ("… the Lumora" of "the Lumora Commuter").
  const next = s.slice(out.length).trim().split(/\s+/)[0] || '';
  if (/^[A-Z]/.test(next)) out = out.replace(/(\s+[A-Z][\w’'-]*)+$/, '');
  while (STOPEND.test(out)) out = out.replace(STOPEND, '');
  return out.replace(/[,;:–—-]+$/, '');
}

// Short version of the news for subject lines (PT-2: ≤ 60 chars, ≤ 10 words).
export function shortNews(headline, max = 52, parsed = null) {
  const s = String(headline).replace(/[.!]+$/, '');
  const fits = (x) => x.length <= max && x.split(/\s+/).length <= 10;
  // Prefer "Name: concrete descriptor" — it carries the specifics reporters scan for.
  if (parsed?.name && parsed.descriptor) {
    const d = parsed.descriptor.replace(/^(a|an)\s+/i, '');
    const cand = `${parsed.name}: ${cutWords(d, max - parsed.name.length - 2)}`;
    if (fits(cand) && cand.length > parsed.name.length + 12) return cand;
  }
  if (fits(s)) return s;
  return cutWords(s.split(/\s+/).slice(0, 10).join(' '), max);
}

// AP quote form: “First sentence,” said Name, title at Org. “Rest.”
export function quoteParagraph(q, org) {
  const parts = sentences(q.text);
  const attrib = `said ${q.name}, ${q.title}${org ? ` at ${org}` : ''}`;
  const first = parts[0].replace(/[.]$/, ',').replace(/([?!])$/, '$1');
  const rest = parts.slice(1).join(' ');
  return `“${first}” ${attrib}.${rest ? ` “${rest}”` : ''}`;
}

const QUOTE_BY_TOPIC = {
  product_launch: (b, t) => `We built this for ${b.audience || 'the people who asked us for it'}, and the launch is the start, not the finish. We will keep shipping improvements based on what they tell us.`,
  funding: (b) => `This investment lets us move faster on what our customers have been asking for. We intend to spend it on the product and the people who build it.`,
  partnership: (b) => `Together we can offer ${b.audience || 'customers'} something neither of us could offer alone.`,
  research: (b) => `The numbers point to a shift that is already under way. We are publishing the full data so others can test it and build on it.`,
  exec_hire: (b) => `The appointment reflects where we are heading next, and the experience we need to get there.`,
  event: (b) => `We want everyone who attends to leave with something practical they can use the next day.`,
  local: (b) => `This is about our neighbours as much as our business. We are proud to grow here.`,
  nonprofit: (b) => `Every contribution goes to work in the community right away, and we will report back on exactly what it achieved.`,
  consumer_product: (b) => `We designed it around how people actually live, and we priced it so more of them can enjoy it.`,
  crisis: (b) => `We take this seriously. Our priority is the people affected, and we will share verified updates as soon as we have them.`,
};

export function draftQuote(brief, topicId) {
  if (brief.quote) return { text: brief.quote, name: brief.spokesperson.name, title: brief.spokesperson.title, draft: false };
  const fn = QUOTE_BY_TOPIC[topicId] || QUOTE_BY_TOPIC.product_launch;
  return { text: fn(brief), name: brief.spokesperson.name, title: brief.spokesperson.title, draft: true };
}

export function hashtagsFor(terms = [], beats = [], n = 2) {
  const map = { ai: 'AI', climate: 'Climate', transport: 'Mobility', startups: 'Startups', health: 'HealthTech', cybersecurity: 'Cybersecurity', gaming: 'Gaming', 'enterprise-software': 'SaaS', 'consumer-tech': 'Tech', marketing: 'Marketing', finance: 'Fintech', energy: 'Energy', local: 'Local' };
  const fromTerms = terms.filter((t) => /^[a-z][a-z-]{3,20}$/.test(t)).map((t) => t.split('-').map(capFirst).join(''));
  const fromBeats = beats.map((b) => map[b]).filter(Boolean);
  return [...new Set([...fromBeats, ...fromTerms])].slice(0, n).map((h) => `#${h}`);
}

export function writeOffline({ brief, analysis, factSheet, launchAt, newsroomUrl, terms }) {
  const topicId = analysis.topic.id;
  const topic = TOPIC_BY_ID[topicId];
  const tz = brief.timezone;
  const newsSents = sentences(brief.news);
  const first = newsSents[0].replace(/^today,?\s*/i, '');
  const { headline: rawHead, subhead: rawSub } = splitHeadline(first);
  const headline = headlineCase(rawHead);
  const subhead = rawSub || (newsSents[1] ? newsSents[1].replace(/[.]$/, '') : '');
  const city = brief.city ? brief.city.toUpperCase() : TK('CITY');
  const dateline = `${city}${brief.regionName ? `, ${brief.regionName}` : ''} — ${apDate(new Date(launchAt), tz)} —`;

  const parsed = parseNews(first, brief.org);
  const lede = apLede(first, brief.org);
  const details = [...newsSents.slice(1), ...brief.facts.map((f) => (/[.!?]$/.test(f) ? f : `${f}.`))];
  const q1 = draftQuote(brief, topicId);
  const quotes = [q1];
  if (brief.secondQuote) quotes.push({ text: brief.secondQuote.text, name: brief.secondQuote.name || TK('second spokesperson'), title: brief.secondQuote.title || TK('title'), draft: false });

  const paras = [];
  paras.push(`${dateline} ${lede}`);
  if (details.length) paras.push(details.slice(0, 2).join(' '));
  else paras.push(TK(`one or two sentences of context: ${topic.angles[0]}`));
  paras.push(quoteParagraph(q1, brief.org));
  if (details.length > 2) paras.push(`Key facts:\n${details.slice(2).map((d) => `• ${d}`).join('\n')}`);
  if (quotes[1]) paras.push(quoteParagraph(quotes[1], ''));
  const avail = [];
  if (brief.productUrl) avail.push(`More information is available at ${brief.productUrl}.`);
  else if (brief.website) avail.push(`More information is available at ${brief.website}.`);
  if (['product_launch', 'consumer_product'].includes(topicId) && !/\b(price|priced|\$|€|£|free)\b/i.test(brief.news + brief.facts.join(' '))) avail.push(TK('price and availability'));
  if (brief.mediaKitUrl) avail.push(`Images and a media kit are available at ${brief.mediaKitUrl}.`);
  if (avail.length) paras.push(avail.join(' '));

  const boilerplate = brief.about ? `About ${brief.org}\n${brief.about}` : `About ${brief.org}\n${TK(`two-sentence description of ${brief.org}: what it does, for whom, where, since when`)}`;
  const contactBlock = `Media contact\n${brief.contact.name}\n${brief.contact.email}${brief.contact.phone ? `\n${brief.contact.phone}` : ''}`;
  const pressRelease = { headline, subhead, dateline, paragraphs: paras, quotes, boilerplate, contact: contactBlock };

  // Fact sheet + FAQ (AE-3, AE-5)
  const faq = [
    { q: `What did ${brief.org} announce?`, a: first.replace(/\.$/, '') + '.' },
    { q: `When was it announced?`, a: `${apDate(new Date(launchAt), tz)}.` },
    { q: `Who is it for?`, a: brief.audience ? capFirst(brief.audience.replace(/\.$/, '')) + '.' : TK('who benefits, in one sentence') },
    { q: `Where can I find more information?`, a: brief.productUrl || brief.website || newsroomUrl },
    { q: `Who is ${brief.org}?`, a: brief.about || TK(`one-sentence description of ${brief.org}`) },
  ];
  if (details[0]) faq.splice(2, 0, { q: `What are the key details?`, a: details.slice(0, 2).join(' ') });

  // Social copy per platform (SO-1..SO-4). {link} is replaced per channel with a tracked URL.
  const plain = `${first.replace(/\.$/, '')}.`; // sentence case reads naturally on social
  const numberFact = details.find((d) => /\d/.test(d)) || details[0] || '';
  const tags = (n) => hashtagsFor(terms, analysis.specificBeats?.length ? analysis.specificBeats : analysis.beats, n).join(' ');
  const what = parsed.name ? `the ${parsed.name}${parsed.descriptor ? `, ${parsed.descriptor}` : ''}` : parsed.object;
  const social = {
    x: { text: `${cutWords(plain, 170)}${plain.length > 170 ? '…' : ''}${numberFact && plain.length < 120 ? ` ${numberFact}` : ''} {link} ${tags(2)}`.trimEnd() },
    bluesky: { text: `New from ${brief.org}: ${cutWords(what, 200)}.${numberFact ? ` ${numberFact}`.slice(0, 80) : ''} {link}`.replace(/\.\./g, '.') },
    threads: { text: `${plain}\n\n${details.slice(0, 2).join(' ')}\n\nDetails: {link} ${tags(2)}`.trim() },
    mastodon: { text: `${headline}\n\n${details.slice(0, 2).join(' ')}\n\n{link}\n\n${tags(3)}`.trim() },
    linkedin: {
      text: [
        cutWords(plain, 200),
        subhead && plain.length > 200 ? `\n${subhead}.` : '',
        details.length ? `\n${details.slice(0, 4).map((d) => `→ ${d}`).join('\n')}` : '',
        `\n“${q1.text}” — ${q1.name}, ${q1.title}`,
        `\nRead the full announcement: {link}`,
        `\n${tags(3)}`,
      ].join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    },
  };

  const newsletter = {
    subject: shortNews(headline, 55),
    body: `${headline}.\n\n${lede}\n\n${details.slice(0, 3).join(' ')}\n\nRead more: {link}\n\n— The ${brief.org} team`,
  };

  const extras = {};
  if (topicId === 'crisis') {
    extras.statement = { title: `Statement from ${brief.org}`, text: `${brief.org} is aware of ${first.replace(/^.*?(responds to|statement on|about)\s*/i, '').replace(/\.$/, '')}. ${details.join(' ')} ${q1.text} We will publish verified updates at ${newsroomUrl}.` };
  }
  if (topicId === 'event') {
    extras.advisory = {
      title: `Media advisory: ${headline}`,
      text: `WHAT: ${first}\nWHEN: ${TK('date and time with time zone')}\nWHERE: ${brief.city || TK('venue and address')}\nWHO: ${brief.spokesperson.name}, ${brief.spokesperson.title}\nWHY: ${details[0] || TK('why it matters')}\nMEDIA: Press registration and interviews — ${brief.contact.email}`,
    };
  }

  // Core pitch paragraph (assembled per target in compose.js).
  const pitchCore = {
    parsed,
    news: lede,
    detail: numberFact && numberFact !== first ? numberFact : details[1] || '',
    followUpDetail: details.find((d) => d !== numberFact) || (brief.mediaKitUrl ? `Images and a media kit are ready: ${brief.mediaKitUrl}` : `${brief.spokesperson.name} is available for a short interview this week.`),
  };

  return { pressRelease, faq, social, newsletter, extras, pitchCore, writer: 'offline' };
}
