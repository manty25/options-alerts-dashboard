// HTTP API, newsroom hosting, click tracking and path safety.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { isolate } from './helpers.js';

isolate('server');
const { createServer } = await import('../server.js');
const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.RELAY_PUBLIC_URL = base;
after(() => server.close());

const j = async (path, opts = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, redirect: 'manual' });
  return { status: res.status, headers: res.headers, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
};

test('UI and status endpoint are served', async () => {
  const ui = await j('/');
  assert.equal(ui.status, 200);
  assert.match(ui.body, /<title>Relay/);
  const st = await j('/api/status');
  assert.equal(st.body.app, 'Relay');
  assert.equal(st.body.email, 'outbox');
});

test('one-click test campaign via API, then report, CSV, newsroom and outbox', async () => {
  const r = await j('/api/test-campaign', { method: 'POST', body: '{}' });
  assert.equal(r.status, 201);
  const id = r.body.id;
  assert.equal((await j(`/api/campaigns/${id}/report`)).body.simulated, true);
  assert.match((await j(`/api/campaigns/${id}/report.html`)).body, /SIMULATED/);
  assert.match((await j(`/api/campaigns/${id}/media-list.csv`)).body, /^name,email,outlet/);
  const files = (await j(`/api/campaigns/${id}/outbox`)).body;
  assert.ok(files.length > 10);
  const eml = await j(`/api/campaigns/${id}/outbox/${files[0]}`);
  assert.equal(eml.status, 200);
  const nr = await j(`/newsroom/${r.body.brief.orgSlug}/`);
  assert.equal(nr.status, 200);
  assert.match(nr.body, /newsroom/);
  const rss = await j(`/newsroom/${r.body.brief.orgSlug}/rss.xml`);
  assert.match(rss.body, /<rss/);
});

test('create → edit → approve → launch through the API', async () => {
  const c = (await j('/api/campaigns', { method: 'POST', body: JSON.stringify({ brief: { news: 'Fernwood Labs raises $12 million Series A to expand its carbon accounting software.', org: 'Fernwood Labs' } }) })).body;
  assert.equal(c.status, 'ready');
  const edited = (await j(`/api/campaigns/${c.id}`, { method: 'PATCH', body: JSON.stringify({ pressRelease: { headline: 'Fernwood Labs Raises $12 Million to Expand Carbon Accounting Software' } }) })).body;
  assert.equal(edited.assets.pressRelease.headline, 'Fernwood Labs Raises $12 Million to Expand Carbon Accounting Software');
  assert.equal((await j(`/api/campaigns/${c.id}/launch`, { method: 'POST', body: '{}' })).status, 400, 'launch before approval is refused');
  assert.equal((await j(`/api/campaigns/${c.id}/approve`, { method: 'POST', body: '{}' })).status, 200);
  const launched = (await j(`/api/campaigns/${c.id}/launch`, { method: 'POST', body: '{}' })).body;
  assert.ok(launched.jobs.length > 5);
});

test('tracked links redirect with UTM tags and count clicks', async () => {
  const c = (await j('/api/test-campaign', { method: 'POST', body: '{}' })).body;
  const link = c.assets.social.linkedin.link;
  const code = link.split('/r/')[1];
  const r = await j(`/r/${code}`);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /utm_source=linkedin&utm_medium=social/);
  const rep = (await j(`/api/campaigns/${c.id}/report`)).body;
  assert.ok(rep.outtakes.clicks.linkedin >= 1);
});

test('path traversal is blocked', async () => {
  const r = await fetch(`${base}/newsroom/..%2F..%2Fcontacts.json`);
  assert.ok([403, 404].includes(r.status));
  const r2 = await fetch(`${base}/..%2Fserver.js`);
  assert.ok([403, 404].includes(r2.status));
});

test('invalid input returns 400, unknown campaign 404', async () => {
  assert.equal((await j('/api/campaigns', { method: 'POST', body: JSON.stringify({ brief: { news: '' } }) })).status, 400);
  assert.equal((await j('/api/campaigns/cmp_nope')).status, 404);
});
