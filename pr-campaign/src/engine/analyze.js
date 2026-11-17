// Topic classification, beat inference and news-value scoring.
import { TOPICS, TOPIC_BY_ID, BEAT_HINTS } from '../knowledge/topics.js';
import { extractNumbers, SUPERLATIVES } from './brief.js';
import { unique, clamp } from '../util.js';

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9%$€£+\s-]/g, ' ').replace(/\s+/g, ' ')} `;
const has = (text, kw) => text.includes(` ${kw.toLowerCase()} `) || (kw.length > 3 && text.includes(kw.toLowerCase()));

export function classify(brief) {
  const text = norm([brief.news, ...brief.facts, brief.audience].join(' '));
  const scores = TOPICS.map((t) => {
    let score = 0;
    const hits = [];
    for (const kw of t.keywords) {
      if (has(text, kw)) { score += kw.includes(' ') ? 2 : 1; hits.push(kw); }
    }
    // The verb in the first clause carries most of the signal.
    const lead = norm(brief.news.split(/[,.;]/)[0]);
    for (const kw of t.keywords.slice(0, 6)) if (has(lead, kw)) score += 1.5;
    return { id: t.id, label: t.label, score, hits };
  }).sort((a, b) => b.score - a.score);

  let top = scores[0];
  if (brief.topicOverride && TOPIC_BY_ID[brief.topicOverride]) top = scores.find((s) => s.id === brief.topicOverride);
  if (!top || top.score === 0) top = scores.find((s) => s.id === 'product_launch');

  // Material-news topics only count as regulated for public companies (OP-11).
  const topic = { ...TOPIC_BY_ID[top.id] };
  const total = scores.reduce((n, s) => n + s.score, 0) || 1;
  const confidence = brief.topicOverride ? 1 : clamp(Math.round((top.score / total) * 100) / 100 + 0.2, 0.2, 0.99);

  // Specific beats come from the vocabulary of the story; generic ones from the topic playbook.
  const specific = Object.entries(BEAT_HINTS).filter(([, kws]) => kws.some((k) => has(text, k))).map(([b]) => b);
  const beats = new Set([...specific, ...topic.beats]);
  return {
    topic: { id: topic.id, label: topic.label },
    confidence,
    matched: top.hits,
    alternatives: scores.filter((s) => s.id !== top.id && s.score > 0).slice(0, 3).map((s) => ({ id: s.id, label: s.label })),
    beats: unique([...beats]),
    specificBeats: specific,
    regulated: Boolean(topic.regulated && brief.publicCompany),
    crisis: Boolean(topic.crisis),
  };
}

// News values used by editors: timeliness, impact, novelty, prominence, proximity, human interest, conflict/trend.
export function newsworthiness(brief, cls) {
  const text = [brief.news, ...brief.facts].join(' ');
  const lower = text.toLowerCase();
  const numbers = extractNumbers(text);
  const v = {};
  const tip = {};

  v.timeliness = brief.launchAt || /\b(today|now|this week|this month|starting|from (monday|tuesday|wednesday|thursday|friday)|available|begins|launch)/i.test(text) ? 70 : 35;
  if (/\b(ahead of|in time for|as .* (season|deadline)|before the)\b/i.test(text)) v.timeliness = 90;
  tip.timeliness = 'Tie the news to a date, season, deadline or a story already in the news ("ahead of the city’s new bike-lane rules").';

  v.impact = clamp(30 + numbers.length * 15 + (/\b(customers|users|people|residents|patients|employees|jobs|families|cities|countries)\b/i.test(text) ? 15 : 0), 0, 100);
  tip.impact = 'Add a number that shows scale or effect: people affected, money saved, time saved, jobs created.';

  v.novelty = clamp((/\b(new|first|launch|unveil|introduc|debut|announc)/i.test(text) ? 55 : 25) + (SUPERLATIVES.test(text) ? 25 : 0), 0, 100);
  tip.novelty = 'Say what is new compared with what exists today — one sentence on how it differs.';

  const properNouns = (text.match(/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)+/g) || []).filter((n) => !n.includes(brief.org));
  v.prominence = clamp(25 + properNouns.length * 12 + (brief.publicCompany ? 15 : 0), 0, 100);
  tip.prominence = 'Name well-known partners, investors, customers or a recognised expert who can comment.';

  v.proximity = brief.city ? 65 : 30;
  if (cls.beats.includes('local')) v.proximity += 20;
  v.proximity = clamp(v.proximity, 0, 100);
  tip.proximity = 'Add the city/region — local media cover local companies, and national desks like regional data.';

  v.human = /\b(founder|story|family|mother|father|student|nurse|teacher|veteran|patient|volunteer|community|her|his|their)\b/i.test(text) ? 70 : 25;
  tip.human = 'Offer a person: a customer, employee or founder with a short, specific story.';

  v.conflict = /\b(despite|versus|vs\.?|instead of|rising|falling|shortage|crisis|problem|cost of|struggle|record|trend|growing|decline|compared)\b/i.test(lower) ? 70 : 25;
  tip.conflict = 'Connect to a tension or trend: a rising cost, a shortage, a change in behaviour.';

  const weights = { timeliness: 0.18, impact: 0.22, novelty: 0.18, prominence: 0.12, proximity: 0.08, human: 0.1, conflict: 0.12 };
  const score = Math.round(Object.entries(weights).reduce((n, [k, w]) => n + v[k] * w, 0));
  const verdict = score >= 65 ? 'strong' : score >= 48 ? 'moderate' : 'weak';
  const improvements = Object.entries(v).filter(([, s]) => s < 50).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => ({ value: k, tip: tip[k] }));
  const advice = {
    strong: 'Strong story. Lead with an exclusive to the best-fit tier-1 outlet, then pitch broadly.',
    moderate: 'Pitchable. Target trade and vertical press first; tier-1 only where the beat fit is exact.',
    weak: 'Thin for journalists as it stands. Publish on owned and social channels, pitch only trade/niche outlets, and strengthen the hook using the suggestions.',
  }[verdict];
  return { score, verdict, values: v, improvements, advice };
}
