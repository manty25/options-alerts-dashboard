// Unit tests named after the standard they enforce (docs/STANDARDS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolate, briefs, FIXED_NOW } from './helpers.js';

isolate('standards');
const { normalizeBrief, buildFactSheet, inferCity } = await import('../src/engine/brief.js');
const { classify, newsworthiness } = await import('../src/engine/analyze.js');
const { chooseChannels, launchTime, buildTimeline } = await import('../src/engine/strategy.js');
const { buildTargets } = await import('../src/engine/targeting.js');
const { runQa } = await import('../src/engine/qa.js');
const { createCampaign, SAMPLE_BRIEF } = await import('../src/index.js');
const { localParts, weekdayIndex, wordCount } = await import('../src/util.js');
const { SOCIAL_LIMITS } = await import('../src/knowledge/channels.js');

const analyse = (input) => {
  const b = normalizeBrief(input);
  const cls = classify(b);
  const nw = newsworthiness(b, cls);
  return { b, cls, nw, choice: chooseChannels(b, cls, nw) };
};
const ids = (choice) => choice.channels.map((c) => c.id);

const sample = await createCampaign(SAMPLE_BRIEF, { now: FIXED_NOW });

test('DS-1: one sentence is enough to build a full campaign', async () => {
  const c = await createCampaign('Acme Robotics launches Pathfinder, a warehouse robot that cuts picking time by 30%.', { now: FIXED_NOW });
  assert.equal(c.brief.org, 'Acme Robotics');
  assert.ok(c.assets.releaseText.includes('###'));
  assert.ok(c.targets.length > 5);
  assert.ok(c.assets.pitches.length > 5);
  assert.ok(Object.keys(c.assets.social).length >= 2);
});

test('DS-4: unknown facts become visible [TK] placeholders and QA blocks them', async () => {
  const c = await createCampaign('Acme Robotics launches Pathfinder, a warehouse robot.', { now: FIXED_NOW });
  assert.match(c.assets.releaseText, /\[TK: /);
  const tk = c.qa.checks.find((x) => x.id === 'DS-4');
  assert.equal(tk.pass, false);
  assert.equal(tk.severity, 'error');
});

test('topic classification covers the main story types', () => {
  assert.equal(analyse(briefs.funding).cls.topic.id, 'funding');
  assert.equal(analyse(briefs.earnings).cls.topic.id, 'earnings');
  assert.equal(analyse(briefs.crisis).cls.topic.id, 'crisis');
  assert.equal(analyse(briefs.research).cls.topic.id, 'research');
  assert.equal(analyse(briefs.local).cls.topic.id, 'local');
  assert.equal(analyse(SAMPLE_BRIEF).cls.topic.id, 'product_launch');
});

test('story-specific beats are detected (e-bike → transport)', () => {
  const { cls } = analyse(SAMPLE_BRIEF);
  assert.deepEqual(cls.specificBeats, ['transport']);
});

test('OP-11: regulated disclosure forces tier-1 wire and disables exclusives/embargo', () => {
  const { cls, choice } = analyse(briefs.earnings);
  assert.equal(cls.regulated, true);
  assert.ok(ids(choice).includes('tier1_wire'));
  assert.equal(choice.exclusive, false);
  assert.equal(choice.embargo, false);
  // Even on a free budget the legally required wire stays.
  const free = analyse({ ...briefs.earnings, budget: 'free' });
  assert.ok(ids(free.choice).includes('tier1_wire'));
});

test('OP-12: crisis mode has no wire, no social, no exclusive', () => {
  const { choice } = analyse(briefs.crisis);
  assert.deepEqual(ids(choice).sort(), ['newsroom', 'pitch_email']);
  assert.equal(choice.exclusive, false);
  assert.equal(choice.mode, 'crisis');
});

test('budget rules: free budget drops paid wires for non-regulated news', () => {
  const { choice } = analyse({ ...briefs.funding, budget: 'free' });
  assert.ok(!choice.channels.some((c) => c.kind === 'paid'));
  const lean = analyse({ ...briefs.funding, budget: 'lean' });
  assert.ok(ids(lean.choice).includes('value_wire'), 'funding is wire-recommended → value wire on lean');
});

test('OP-2/OP-5: launch defaults to a Tue–Thu morning, off the hour', () => {
  const { b, choice } = analyse(SAMPLE_BRIEF);
  const t = launchTime(b, choice, new Date(FIXED_NOW));
  assert.ok([2, 3, 4].includes(weekdayIndex(t, b.timezone)));
  const p = localParts(t, b.timezone);
  assert.equal(p.h, 8);
  assert.equal(p.min, 5);
});

test('OP-4: sequence is exclusive → embargo → launch → social → follow-up → report', () => {
  const phases = sample.plan.timeline.map((s) => s.phase);
  assert.deepEqual(phases, ['exclusive_offer', 'embargo_prebrief', 'launch', 'social', 'newsletter', 'follow_up', 'report']);
  const at = Object.fromEntries(sample.plan.timeline.map((s) => [s.phase, new Date(s.at)]));
  assert.ok(at.exclusive_offer < at.embargo_prebrief && at.embargo_prebrief < at.launch && at.launch < at.follow_up);
});

test('exclusive window is skipped when launch is too close', () => {
  const { b, choice } = analyse({ ...SAMPLE_BRIEF, launchAt: '2026-11-18' });
  const flags = { exclusive: choice.exclusive, embargo: choice.embargo, mode: choice.mode };
  const tl = buildTimeline(b, flags, launchTime(b, flags, new Date(FIXED_NOW)), new Date(FIXED_NOW));
  assert.ok(!tl.steps.some((s) => s.phase === 'exclusive_offer'));
  assert.ok(tl.notes.some((n) => /too soon/.test(n)));
});

test('TG-1/TG-2/TG-4: relevant targets only, one per outlet, capped', () => {
  const outlets = sample.targets.map((t) => t.outlet.toLowerCase());
  assert.equal(new Set(outlets).size, outlets.length);
  assert.ok(sample.targets.length <= 40);
  assert.ok(sample.targets.every((t) => t.matchedBeats.length > 0 && t.relevance >= 0.2));
  assert.ok(!sample.targets.some((t) => /variety|billboard|ign/i.test(t.outlet)), 'entertainment outlets are off-beat for an e-bike');
});

test('TG-7: exactly one exclusive at a time, with ordered backups', () => {
  const ex = sample.targets.filter((t) => t.role === 'exclusive');
  assert.equal(ex.length, 1);
  const backups = sample.assets.pitches.filter((p) => p.conditional);
  assert.equal(backups.length, 2);
  assert.equal(backups[0].conditional.ifDeclined, ex[0].id);
});

test('TG-5: suppressed contacts are never targeted', () => {
  const { b, cls, nw, choice } = analyse(SAMPLE_BRIEF);
  const base = { brief: b, cls, nw, flags: { exclusive: true, embargo: true }, discovery: null, includeDemo: true, history: {} };
  const all = buildTargets({ ...base, suppression: [] }).targets;
  const victim = all[0];
  const after = buildTargets({ ...base, suppression: [{ email: victim.email.toLowerCase() }] }).targets;
  assert.ok(!after.some((t) => t.email === victim.email));
});

test('TG-6: contacts pitched by another campaign in the last 30 days are skipped', () => {
  const { b, cls, nw } = analyse(SAMPLE_BRIEF);
  const base = { brief: b, cls, nw, flags: {}, discovery: null, includeDemo: true, suppression: [], campaignId: 'cmp_now' };
  const first = buildTargets({ ...base, history: {} }).targets[0];
  const history = { [first.email.toLowerCase()]: [{ campaignId: 'cmp_old', at: new Date().toISOString(), replied: false }] };
  assert.ok(!buildTargets({ ...base, history }).targets.some((t) => t.email === first.email));
});

test('PT-1/PT-2/PT-7/OP-6: every pitch is short, has a clean subject, explicit terms and an opt-out', () => {
  for (const p of [...sample.assets.pitches, ...sample.assets.followUps]) {
    assert.ok(wordCount(p.body) <= 200, `${p.id} has ${wordCount(p.body)} words`);
    assert.ok(p.subject.length <= 60, p.subject);
    assert.ok(!/press release/i.test(p.subject));
    assert.match(p.body, /no thanks/i);
    if (['exclusive', 'embargo'].includes(p.kind)) assert.match(p.body, /\d{1,2}:\d{2} (AM|PM) [A-Z]{2,5}/);
  }
});

test('PT-3: pitches open with the reporter’s outlet or recent article', () => {
  for (const p of sample.assets.pitches) assert.ok(p.body.split('\n').slice(0, 4).join(' ').includes(p.outlet), p.id);
});

test('PT-8: no follow-up for the outlet that holds the exclusive', () => {
  const ex = sample.targets.find((t) => t.role === 'exclusive');
  assert.ok(!sample.assets.followUps.some((f) => f.targetId === ex.id));
});

test('SO-1/SO-2: social posts fit platform limits with exactly one link', () => {
  for (const [platform, post] of Object.entries(sample.assets.social)) {
    const rendered = post.text.replace('{link}', 'x'.repeat(23));
    assert.ok(rendered.length <= SOCIAL_LIMITS[platform].chars, `${platform}: ${rendered.length}`);
    assert.equal((post.text.match(/\{link\}/g) || []).length, 1);
  }
});

test('PR-1..PR-8: the sample release passes the structural checks', () => {
  for (const id of ['PR-1', 'PR-2', 'PR-3', 'PR-5', 'PR-6', 'PR-7', 'PR-8', 'PR-9', 'PR-11', 'AE-4', 'DS-4']) {
    const failing = sample.qa.checks.filter((x) => x.id === id && !x.pass);
    assert.deepEqual(failing, [], `${id} failed`);
  }
  assert.equal(sample.qa.errors, 0);
});

test('PR-9/PR-11/AE-4: QA catches hype, unsubstantiated superlatives and invented numbers', () => {
  const assets = structuredClone(sample.assets);
  assets.pressRelease.paragraphs[1] = 'It is the first revolutionary e-bike, and 9,999 riders already love it.';
  assets.releaseText = assets.releaseText.replace(sample.assets.pressRelease.paragraphs[1], assets.pressRelease.paragraphs[1]);
  const qa = runQa({ assets, brief: sample.brief, launchAt: sample.plan.launchAt });
  const failed = (id) => qa.checks.find((x) => x.id === id && !x.pass);
  assert.ok(failed('PR-9'));
  assert.ok(failed('PR-11'));
  assert.ok(failed('AE-4'), 'number 9999 is not in the brief');
});

test('AE-1: newsroom page carries NewsArticle + FAQ structured data and a canonical URL', () => {
  const html = sample.assets.newsroomHtml;
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /<link rel="canonical"/);
  assert.match(html, /application\/rss\+xml/);
});

test('AE-3/DS-10: fact sheet is built from the brief', () => {
  const fs = buildFactSheet(normalizeBrief(SAMPLE_BRIEF));
  assert.ok(fs.facts.length >= 5);
  assert.ok(fs.numbers.some((n) => n.includes('1,290')));
});

test('dateline city is inferred from the sentence when not given', () => {
  assert.equal(inferCity(briefs.local.news), 'Dayton');
  assert.equal(inferCity('Acme launches in March'), '');
});

test('DS-6: estimates and the agency benchmark are shown before approval', () => {
  assert.ok(sample.estimates.placements.mid > 0);
  assert.ok(sample.estimates.benchmark.cost[0] > 1000);
  assert.match(sample.estimates.method, /Estimates, not promises/);
});
