// Discovery parsers and the Claude writer, against local mock servers (no network, no key).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { isolate, FIXED_NOW } from './helpers.js';

isolate('integrations');
const { parseRss, gdeltSearch, discoverCoverage, topicQuery } = await import('../src/engine/discovery.js');
const { SCHEMA } = await import('../src/generate/claude.js');

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Folding e-bikes win over commuters - Electrek</title><link>https://news.google.com/x1</link><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><source url="https://electrek.co">Electrek</source></item>
<item><title><![CDATA[City e-bike rebates expand &amp; grow]]></title><link>https://news.google.com/x2</link><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate><source url="https://www.theverge.com">The Verge</source></item>
</channel></rss>`;

test('Google News RSS parsing strips the outlet suffix and resolves domains', () => {
  const items = parseRss(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Folding e-bikes win over commuters');
  assert.equal(items[0].domain, 'electrek.co');
  assert.equal(items[1].title, 'City e-bike rebates expand & grow');
  assert.equal(items[1].domain, 'theverge.com');
  assert.equal(items[0].date, '2026-11-09');
});

test('GDELT results are normalised', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ articles: [{ url: 'https://www.electrek.co/a', title: 'E-bike sales rise', seendate: '20261110T120000Z', domain: 'electrek.co', language: 'English' }] }));
  const arts = await gdeltSearch('"e-bike"', { fetchImpl: fakeFetch });
  assert.deepEqual(arts[0], { title: 'E-bike sales rise', url: 'https://www.electrek.co/a', domain: 'electrek.co', date: '2026-11-10', source: 'gdelt', language: 'English' });
});

test('discovery fails soft and recent coverage boosts targeting (TG-3)', async () => {
  delete process.env.RELAY_OFFLINE;
  const fakeFetch = async (url) => (String(url).includes('gdelt')
    ? new Response(JSON.stringify({ articles: [{ url: 'https://streetsblog.org/x', title: 'Folding commuter bikes are having a moment', seendate: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', domain: 'streetsblog.org' }] }))
    : new Response('nope', { status: 503 }));
  const { createCampaign, SAMPLE_BRIEF } = await import('../src/index.js');
  const { normalizeBrief } = await import('../src/engine/brief.js');
  const { classify } = await import('../src/engine/analyze.js');
  const b = normalizeBrief(SAMPLE_BRIEF);
  const d = await discoverCoverage(b, classify(b), { fetchImpl: fakeFetch });
  assert.equal(d.ok, true);
  assert.match(d.reason, /503/);
  const c = await createCampaign(SAMPLE_BRIEF, { now: FIXED_NOW, fetchImpl: fakeFetch });
  const sb = c.targets.find((t) => t.outlet === 'Streetsblog');
  assert.ok(sb, 'Streetsblog targeted');
  assert.match(sb.reason, /covered “Folding commuter bikes/);
  assert.ok(c.targets.indexOf(sb) < 8, 'recent coverage lifts the outlet into the top of the list');
  assert.match(c.assets.pitches.find((p) => p.targetId === sb.id).body, /Folding commuter bikes are having a moment/);
  process.env.RELAY_OFFLINE = '1';
});

test('topic query excludes the organisation name', () => {
  const q = topicQuery({ news: 'Lumora Mobility launches the Lumora Commuter folding e-bike for commuters', org: 'Lumora Mobility' }, { beats: ['transport'] });
  assert.ok(!q.terms.includes('lumora'));
  assert.ok(q.terms.includes('commuter') || q.terms.includes('commuters'));
});

test('structured-output schema is strict (every object closed, every key required)', () => {
  const walk = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.type === 'array') walk(s.items);
  };
  walk(SCHEMA);
});

// ---- Claude writer against a mock Messages API (SSE) ----------------------------------------
let requestBody = null;
const mock = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  requestBody = JSON.parse(raw);
  const out = {
    pressRelease: {
      headline: 'Lumora Mobility Launches a 14 kg Folding E-Bike for City Commuters',
      subhead: 'The Lumora Commuter recharges to 80% in 45 minutes and costs $1,290',
      paragraphs: [
        'Lumora Mobility today launched the Lumora Commuter, a foldable e-bike that weighs 14 kg and recharges to 80% in 45 minutes.',
        'The bike costs $1,290 and has a range of 70 km on one charge. Lumora tested it with 300 daily commuters in Austin and Denver over six months.',
        'Key facts:\n• Pre-orders open today; deliveries start in March 2027.\n• The bike folds in 10 seconds.',
      ],
      quote: 'Commuters told us the hardest part of riding to work is everything around the ride. We designed the Commuter to make that part disappear.',
      boilerplate: '',
    },
    faq: [{ q: 'What did Lumora launch?', a: 'A 14 kg folding e-bike.' }, { q: 'How much does it cost?', a: '$1,290.' }, { q: 'When does it ship?', a: 'March 2027.' }, { q: 'How far does it go?', a: '70 km per charge.' }],
    social: { x: 'A 14 kg folding e-bike that recharges to 80% in 45 minutes. {link}', bluesky: 'Lumora Commuter: folds in 10 seconds, 70 km range. {link}', threads: 'Meet the Lumora Commuter. {link}', mastodon: 'New folding e-bike from Lumora. {link} #EBike', linkedin: 'We launched the Lumora Commuter today.\n\nRead more: {link}' },
    newsletter: { subject: 'Meet the Lumora Commuter', body: 'Pre-orders are open. {link}' },
    pitchCore: { news: 'Lumora Mobility today launched a 14 kg folding e-bike priced at $1,290.', detail: 'It recharges to 80% in 45 minutes.', whyItMatters: 'Folding e-bikes solve the last-mile problem for transit commuters.', followUpDetail: 'Lumora tested it with 300 commuters over six months.' },
    openers: [], statement: '', advisory: '',
  };
  const text = JSON.stringify(out);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: requestBody.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 1 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
  ev('content_block_stop', { index: 0 });
  ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2500 } });
  ev('message_stop', {});
  res.end();
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
after(() => mock.close());

test('Claude writer: structured request, parsed into assets, costed, and QA-checked', async () => {
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.RELAY_LLM;
  const { createCampaign, SAMPLE_BRIEF } = await import('../src/index.js');
  const c = await createCampaign(SAMPLE_BRIEF, { now: FIXED_NOW });
  assert.equal(c.writer.name, 'claude');
  assert.equal(requestBody.model, 'claude-opus-5-5');
  assert.equal(requestBody.output_config.format.type, 'json_schema');
  assert.deepEqual(requestBody.thinking, { type: 'adaptive' });
  assert.equal(c.assets.pressRelease.headline, 'Lumora Mobility Launches a 14 kg Folding E-Bike for City Commuters');
  assert.match(c.assets.pressRelease.paragraphs[0], /^AUSTIN, Texas — /, 'dateline added by Relay');
  assert.ok(c.assets.pressRelease.paragraphs.some((p) => /,” said Dana Reyes, CEO and co-founder at Lumora Mobility\./.test(p)), 'quote inserted in AP form');
  assert.match(c.assets.pressRelease.boilerplate, /^About Lumora Mobility\nLumora Mobility designs/, 'brief boilerplate used verbatim');
  assert.match(c.assets.pitches[0].body, /Folding e-bikes solve the last-mile problem/);
  assert.equal(c.estimates.cost.ai, Math.round(((3000 * 4 + 2500 * 20) / 1e6) * 100) / 100);
  assert.equal(c.qa.errors, 0, JSON.stringify(c.qa.checks.filter((x) => !x.pass)));
  delete process.env.ANTHROPIC_API_KEY;
  process.env.RELAY_LLM = 'off';
});

test('Claude failure falls back to the offline writer (DS-5)', async () => {
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.RELAY_LLM;
  const { createCampaign, SAMPLE_BRIEF } = await import('../src/index.js');
  const c = await createCampaign(SAMPLE_BRIEF, { now: FIXED_NOW });
  assert.equal(c.writer.name, 'offline');
  assert.match(c.writer.note, /Claude unavailable/);
  assert.ok(c.assets.releaseText.length > 200);
  delete process.env.ANTHROPIC_API_KEY;
  process.env.RELAY_LLM = 'off';
});
