// Quality gate: checks every asset against docs/STANDARDS.md. Errors block live launch.
import { SOCIAL_LIMITS } from '../knowledge/channels.js';
import { hasTK, SUPERLATIVES } from './brief.js';
import { wordCount, fleschKincaidGrade } from '../util.js';

export const HYPE = ['revolutionary', 'game-changing', 'game changer', 'cutting-edge', 'cutting edge', 'world-class', 'best-in-class', 'synergy', 'synergies', 'disruptive', 'seamless', 'seamlessly', 'unparalleled', 'leverage', 'leverages', 'next-generation', 'next-gen', 'innovative', 'groundbreaking', 'robust', 'state-of-the-art', 'paradigm', 'best of breed', 'turnkey', 'mission-critical'];
const hypeIn = (t) => HYPE.filter((h) => new RegExp(`\\b${h.replace(/-/g, '[- ]')}\\b`, 'i').test(t));
const digits = (t) => (String(t).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, '').replace(/,/g, ''));
const allCaps = (t) => (String(t).match(/\b[A-Z]{5,}\b/g) || []);

export function runQa({ assets, brief, launchAt }) {
  const checks = [];
  const add = (id, asset, pass, message, severity = 'error') => checks.push({ id, asset, pass: Boolean(pass), severity, message });
  const pr = assets.pressRelease;
  const body = pr.paragraphs.join('\n\n');

  // Press release
  add('PR-1', 'press release', pr.headline.length <= 100 && !/!/.test(pr.headline) && !allCaps(pr.headline).length, `Headline ${pr.headline.length}/100 chars, no “!”, no ALL CAPS.`);
  add('PR-2', 'press release', /^[A-Z][A-Z .'’-]+(, [^—]+)? — [A-Z][a-z]+\.? \d{1,2}, \d{4} —$/.test(pr.dateline), `Dateline in AP form (“CITY, Region — Month D, YYYY —”): ${pr.dateline}`);
  const lede = pr.paragraphs[0].replace(pr.dateline, '').trim();
  add('PR-3', 'press release', wordCount(lede) <= 45, `Lede is ${wordCount(lede)} words (≤ 45).`);
  const bodyWords = wordCount(body);
  add('PR-4', 'press release', bodyWords >= 200 && bodyWords <= 650, `Body is ${bodyWords} words (200–650). Short releases are fine when facts are few — add facts rather than padding.`, 'warn');
  const quoteParas = pr.paragraphs.filter((p) => /“[^”]+”[^“]*\bsaid\b/.test(p));
  add('PR-5', 'press release', quoteParas.length >= 1 && quoteParas.length <= 2, `${quoteParas.length} attributed quote(s) (1–2).`);
  add('PR-6', 'press release', /^About /.test(pr.boilerplate), 'Has “About” boilerplate.');
  add('PR-7', 'press release', /@/.test(pr.contact), 'Has a media contact with an email address.');
  add('PR-8', 'press release', assets.releaseText.trim().endsWith('###'), 'Ends with ###.');
  const hype = hypeIn(assets.releaseText);
  add('PR-9', 'press release', !hype.length, hype.length ? `Hype words: ${hype.join(', ')}.` : 'No hype words.');
  add('PR-10', 'press release', /\d/.test(lede + body.replace(pr.dateline, '')), 'Contains at least one concrete figure.', 'warn');
  const sup = !brief.claimsSubstantiated && SUPERLATIVES.test(body.replace(/\b(first time|first half|first quarter)\b/gi, ''));
  add('PR-11', 'press release', !sup, sup ? 'Superlative claim (first/only/largest/#1/leading/best) without substantiation — mark the claim as substantiated in the brief or remove it.' : 'No unsubstantiated superlatives.');
  const grade = fleschKincaidGrade(body.replace(/\[TK:[^\]]*\]/g, ''));
  add('PR-12', 'press release', grade <= 14, `Reading grade ${grade} (≤ 14, target ≤ 12).`, 'warn');

  // Pitches
  const pitches = assets.pitches || [];
  const failing = (fn) => pitches.filter((p) => !fn(p));
  const tooLong = failing((p) => wordCount(p.body) <= 200);
  add('PT-1', 'pitches', !tooLong.length, tooLong.length ? `${tooLong.length} pitch(es) over 200 words.` : `All ${pitches.length} pitches ≤ 200 words.`);
  const badSubj = failing((p) => p.subject.length <= 60 && wordCount(p.subject) <= 10 && !/press release/i.test(p.subject) && !allCaps(p.subject).length);
  add('PT-2', 'pitches', !badSubj.length, badSubj.length ? `${badSubj.length} subject line(s) too long or off-style, e.g. “${badSubj[0].subject}”.` : 'Subject lines ≤ 60 chars and ≤ 10 words.');
  const notPersonal = pitches.filter((p) => p.kind !== 'follow_up' && !(p.outlet && p.body.split('\n').slice(0, 4).join(' ').includes(p.outlet)) && !(p.articleTitle && p.body.includes(p.articleTitle)));
  add('PT-3', 'pitches', !notPersonal.length, notPersonal.length ? `${notPersonal.length} pitch(es) without a personalised opener.` : 'Every pitch opens with the reporter’s outlet or article.', 'warn');
  const noAsk = failing((p) => /\?|available|reply|interview|call/i.test(p.body));
  add('PT-5', 'pitches', !noAsk.length, noAsk.length ? `${noAsk.length} pitch(es) without a clear ask.` : 'Every pitch has one clear ask.', 'warn');
  const termless = pitches.filter((p) => ['exclusive', 'embargo'].includes(p.kind) && !/\b\d{1,2}:\d{2}\s?(AM|PM)\b.*\b[A-Z]{2,5}\b|GMT[+-]?\d*/.test(p.body));
  add('PT-7', 'pitches', !termless.length, termless.length ? `${termless.length} exclusive/embargo pitch(es) missing an explicit time with time zone.` : 'Exclusive/embargo terms state date, time and time zone.');
  const noOptOut = failing((p) => /no thanks/i.test(p.body));
  add('OP-6', 'pitches', !noOptOut.length, noOptOut.length ? `${noOptOut.length} pitch(es) without an opt-out line.` : 'Every pitch carries a one-line opt-out.');

  // Social
  const texts = [];
  for (const [platform, post] of Object.entries(assets.social || {})) {
    const lim = SOCIAL_LIMITS[platform];
    if (!lim) continue;
    const rendered = post.text.replace('{link}', 'https://x.co/' + 'x'.repeat(16)); // links count ~23 chars
    add('SO-1', platform, rendered.length <= lim.chars, `${rendered.length}/${lim.chars} characters.`);
    const links = (post.text.match(/\{link\}/g) || []).length;
    add('SO-2', platform, links === 1, `${links} link token(s) (exactly 1).`);
    const tags = (post.text.match(/(^|\s)#[\w]+/g) || []).length;
    add('SO-3', platform, tags <= lim.hashtags, `${tags} hashtag(s) (≤ ${lim.hashtags}).`, 'warn');
    if (lim.hook) add('SO-1', `${platform} hook`, post.text.split('\n')[0].length <= lim.hook, `First line ${post.text.split('\n')[0].length}/${lim.hook} chars.`, 'warn');
    texts.push(post.text.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  add('SO-4', 'social', new Set(texts).size === texts.length, 'Posts are written natively per platform (no duplicates).', 'warn');

  // Newsroom / AI search
  add('AE-3', 'fact sheet', assets.factSheet.facts.length >= 5, `${assets.factSheet.facts.length} facts (≥ 5). Add facts to the brief to strengthen AI-search citations.`, 'warn');
  add('AE-5', 'faq', assets.faq.length >= 4 && assets.faq.length <= 6, `${assets.faq.length} FAQ entries (4–6).`, 'warn');
  const allowed = new Set([
    ...digits([brief.news, ...brief.facts, brief.about, brief.website, brief.productUrl, brief.mediaKitUrl, brief.contact.phone, brief.contact.email, brief.quote, brief.secondQuote?.text, brief.audience, brief.ticker, brief.city, brief.org].join(' ')),
    ...digits(new Date(launchAt).toISOString().slice(0, 10).replace(/-0?/g, ' ')),
    ...digits(new Date(launchAt).getUTCFullYear()), '1', '2', '3',
  ]);
  const scanned = [lede, ...pr.paragraphs.slice(1), pr.headline, pr.subhead, ...assets.faq.map((f) => f.a), ...Object.values(assets.social || {}).map((p) => p.text), assets.newsletter?.body || ''].join(' ').replace(/https?:\/\/\S+/g, '');
  const unknown = [...new Set(digits(scanned).filter((n) => !allowed.has(n) && !allowed.has(n.replace(/\.0+$/, ''))))];
  add('AE-4', 'all assets', !unknown.length, unknown.length ? `Numbers not found in the brief: ${unknown.slice(0, 6).join(', ')} — verify or remove (possible invented facts).` : 'Every number traces back to the brief.');

  // Placeholders (DS-4)
  const tkAssets = [];
  if (hasTK(assets.releaseText)) tkAssets.push('press release');
  if (assets.faq.some((f) => hasTK(f.a))) tkAssets.push('FAQ');
  if (pitches.some((p) => hasTK(p.body))) tkAssets.push('pitches');
  if (Object.values(assets.social || {}).some((p) => hasTK(p.text))) tkAssets.push('social');
  const tkList = [...new Set((assets.releaseText.match(/\[TK:[^\]]*\]/g) || []))];
  add('DS-4', tkAssets.join(', ') || 'all assets', !tkAssets.length, tkAssets.length ? `Fill ${tkList.length || 'the'} placeholder(s): ${tkList.slice(0, 4).join(' ')}` : 'No [TK] placeholders left.');

  const errors = checks.filter((c) => !c.pass && c.severity === 'error');
  const warnings = checks.filter((c) => !c.pass && c.severity === 'warn');
  const score = Math.max(0, 100 - errors.length * 8 - warnings.length * 2);
  return { score, errors: errors.length, warnings: warnings.length, passed: checks.filter((c) => c.pass).length, total: checks.length, checks };
}
