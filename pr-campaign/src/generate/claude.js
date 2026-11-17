// Claude writer (DS-5): same output contract as the offline writer, written by Claude
// with structured outputs so the result always parses. Only runs when a key is configured.
import Anthropic from '@anthropic-ai/sdk';
import { TOPIC_BY_ID } from '../knowledge/topics.js';

export const MODEL = process.env.RELAY_MODEL || 'claude-opus-5-5';

export function llmAvailable() {
  if (process.env.RELAY_LLM === 'off') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const str = { type: 'string' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: 'array', items });

export const SCHEMA = obj({
  pressRelease: obj({
    headline: str,
    subhead: str,
    paragraphs: arr(str),
    quote: str,
    boilerplate: str,
  }),
  faq: arr(obj({ q: str, a: str })),
  social: obj({ x: str, bluesky: str, threads: str, mastodon: str, linkedin: str }),
  newsletter: obj({ subject: str, body: str }),
  pitchCore: obj({ news: str, detail: str, whyItMatters: str, followUpDetail: str }),
  openers: arr(obj({ targetId: str, opener: str })),
  statement: str,
  advisory: str,
});

const SYSTEM = `You are a senior media-relations writer at a top PR agency. You write campaign assets that journalists actually use.

Hard rules (each maps to the house standards):
- Facts: use ONLY facts in the brief and fact sheet. Never invent numbers, names, customers, prices, dates or claims. Where a strong release would need a missing fact, write a visible placeholder like [TK: price and availability]. (DS-4)
- Press release: AP style, inverted pyramid. Headline ≤ 100 characters with an active verb, no exclamation marks. Lede ≤ 45 words answering who and what. Do NOT include the dateline; it is added automatically. Body 250–600 words across 4–7 paragraphs when the facts allow; shorter is better than padded. Put 3+ discrete facts in one paragraph that starts with "Key facts:" followed by lines beginning with "• ". (PR-1..PR-4, AE-3)
- No hype: never use revolutionary, game-changing, cutting-edge, world-class, best-in-class, synergy, disruptive, seamless, unparalleled, leverage, next-generation, innovative, groundbreaking, robust, state-of-the-art. Superlatives (first, only, largest, #1) only if the brief marks claims as substantiated. (PR-9, PR-11)
- Do not put the spokesperson quote inside paragraphs; it is inserted automatically after the second paragraph.
- Quote: if the brief has a quote, use it verbatim. Otherwise draft ONE quote for the spokesperson that gives opinion, motivation or vision — never a repeat of facts — in plain spoken English. It will be approved by the spokesperson. Return the quote text only (no attribution, no quotation marks).
- Boilerplate: if the brief has an "about" text, return it verbatim; otherwise return "".
- FAQ: 5 plain questions a person would ask an AI assistant about this news, with short factual answers from the brief. (AE-5)
- Social: native copy per platform, all different. Include the literal token {link} exactly once in each. X ≤ 230 chars before the link, Bluesky ≤ 250, Threads ≤ 450, Mastodon ≤ 450, LinkedIn: hook line ≤ 200 chars then short paragraphs. Hashtags: ≤ 2 on X/Bluesky/Threads, ≤ 3 on LinkedIn/Mastodon. (SO-1..SO-4)
- Newsletter: subject ≤ 55 chars; body ≤ 150 words with {link} once.
- pitchCore: "news" is one sentence stating the news; "detail" one sentence with the most concrete supporting fact; "whyItMatters" one sentence on why readers of trade/national press would care, grounded in the facts; "followUpDetail" one NEW fact or asset not in news/detail for a follow-up. Combined ≤ 90 words. (PT-1, PT-4, PT-8)
- openers: one per target id given. One sentence that shows you know the reporter's coverage: reference their recent article title if given, otherwise their beat and outlet. Never flatter, never claim you are a fan. (PT-3)
- statement: only for crisis topics, otherwise "". advisory: only for events (WHAT/WHEN/WHERE/WHO/WHY lines), otherwise "".
Write in clear, concrete, plain English.`;

function client() {
  return new Anthropic({ maxRetries: 2, timeout: 5 * 60 * 1000 });
}

async function call(messages) {
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`Claude declined the request (${msg.stop_details?.category || 'policy'}).`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude output was cut off (max_tokens).');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { data: JSON.parse(text), usage: msg.usage, model: msg.model };
}

function promptFor({ brief, analysis, factSheet, targets, launchAt }) {
  const topic = TOPIC_BY_ID[analysis.topic.id];
  const tgt = targets.slice(0, 40).map((t) => ({ targetId: t.id, outlet: t.outlet, beats: t.matchedBeats, recentArticle: t.recentArticle?.title || null }));
  return `Write the campaign assets for this announcement.

<brief>
${JSON.stringify({
    news: brief.news, org: brief.org, city: brief.city, region: brief.regionName, website: brief.website, productUrl: brief.productUrl,
    spokesperson: brief.spokesperson, quote: brief.quote || null, about: brief.about || null, audience: brief.audience || null,
    goal: brief.goal || null, extraFacts: brief.facts, claimsSubstantiated: brief.claimsSubstantiated, publicCompany: brief.publicCompany,
    announcementDate: launchAt.slice(0, 10),
  }, null, 2)}
</brief>

<fact_sheet>
${factSheet.facts.map((f) => `- ${f.text}`).join('\n')}
</fact_sheet>

<playbook topic="${topic.label}">
Angles that work: ${topic.angles.join('; ')}
Assets journalists expect: ${topic.assets.join('; ')}
News-value verdict: ${analysis.newsworthiness.verdict} (${analysis.newsworthiness.score}/100)
</playbook>

<targets>
${JSON.stringify(tgt)}
</targets>`;
}

export async function writeWithClaude(ctx) {
  const messages = [{ role: 'user', content: promptFor(ctx) }];
  const first = await call(messages);
  return { ...first, messages };
}

// One repair round for blocking QA issues (keeps the same schema and facts).
export async function repairWithClaude(ctx, previous, issues) {
  const messages = [
    ...previous.messages,
    { role: 'assistant', content: JSON.stringify(previous.data) },
    { role: 'user', content: `The house QA check found these problems. Fix only these, keep everything else, and return the full JSON again:\n${issues.map((i) => `- [${i.id}] ${i.asset}: ${i.message}`).join('\n')}` },
  ];
  return call(messages);
}
