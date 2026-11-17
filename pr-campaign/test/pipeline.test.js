// End-to-end behaviour: test runs, approval gate, live-mode compliance, idempotency, replies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isolate, FIXED_NOW } from './helpers.js';

const dir = isolate('pipeline');
const relay = await import('../src/index.js');
const { loadSuppression, importContactsCsv } = await import('../src/engine/contacts.js');
const { outboxFiles } = await import('../src/distribute/email.js');
const { campaignDir } = await import('../src/store.js');

test('SLO-2: the one-command test campaign completes end to end in < 10 s', async () => {
  const t0 = Date.now();
  const { campaign: c, report, dir: out } = await relay.runTestCampaign();
  assert.ok(Date.now() - t0 < 10_000);
  assert.equal(c.status, 'complete');
  assert.equal(c.mode, 'test');
  assert.ok(report.outputs.pitchesSent > 10);
  assert.ok(report.outputs.published.includes('newsroom'));
  for (const f of ['report.html', 'press-release.txt', 'pitches.txt', 'social.txt', 'media-list.csv']) assert.ok(fs.existsSync(path.join(out, f)), f);
});

test('DS-3: test mode never addresses a deliverable journalist inbox', async () => {
  const { campaign: c } = await relay.runTestCampaign();
  const emails = outboxFiles(c.id).filter((f) => f.startsWith('email/'));
  assert.ok(emails.length > 10);
  for (const f of emails) {
    const raw = fs.readFileSync(path.join(campaignDir(c.id), 'outbox', f), 'utf8');
    assert.match(raw, /^To: .*@relay-demo\.test$/m);
    assert.match(raw, /X-Relay-Mode: test/);
  }
});

test('ME-1/ME-5: report is labelled SIMULATED and never uses AVE', async () => {
  const { campaign: c, report } = await relay.runTestCampaign();
  assert.equal(report.simulated, true);
  const html = relay.reportHtml(c, report);
  assert.match(html, /SIMULATED/);
  assert.ok(!/advertising value/i.test(html));
  assert.ok(report.outcomes.messages.length >= 2, 'key-message pull-through reported');
});

test('DS-2: launching without approval is refused', async () => {
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  await assert.rejects(relay.launchCampaign(c), /Approve the campaign/);
});

test('OP-6: live mode is blocked until compliance checks pass', async () => {
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  await relay.updateCampaign(c, { mode: 'live' });
  assert.equal(c.mode, 'live');
  assert.ok(!c.targets.some((t) => t.demo), 'demo desks are never used in live mode');
  const comp = relay.complianceChecks(c);
  assert.equal(comp.pass, false);
  for (const id of ['OP-6b', 'OP-6c', 'TG-real', 'OP-send']) assert.equal(comp.checks.find((x) => x.id === id).pass, false, id);
  relay.approveCampaign(c);
  await assert.rejects(relay.launchCampaign(c), /compliance/);
});

test('live approval is refused while blocking QA errors remain', async () => {
  const c = await relay.createCampaign('Acme Robotics launches Pathfinder, a warehouse robot.', { now: FIXED_NOW });
  await relay.updateCampaign(c, { mode: 'live' });
  assert.throws(() => relay.approveCampaign(c), /blocking quality/);
});

test('OP-9: re-running jobs never sends the same message twice', async () => {
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  relay.approveCampaign(c);
  await relay.launchCampaign(c);
  const before = outboxFiles(c.id).length;
  for (const j of c.jobs) if (j.type === 'email') j.status = 'pending';
  await relay.runJobs(c, { all: true });
  assert.equal(outboxFiles(c.id).length, before);
});

test('TG-7: backup exclusive is only offered after the first outlet declines', async () => {
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  relay.approveCampaign(c);
  const first = c.targets.find((t) => t.role === 'exclusive');
  // First outlet accepts → no backup exclusive offers.
  await relay.launchCampaign(c, { simulateReplies: (camp, p, job) => { if (job.stage === 'exclusive_offer' && p.targetId === first.id) relay.logReply(camp, { targetId: first.id, kind: 'interested', stage: 'exclusive_offer', simulated: true }); } });
  const offers = c.jobs.filter((j) => j.stage === 'exclusive_offer');
  assert.equal(offers.filter((j) => j.status === 'done').length, 1);
  assert.ok(offers.filter((j) => j.conditional).every((j) => j.status === 'skipped'));
  // The outlet holding the exclusive gets no launch pitch.
  assert.ok(!c.jobs.some((j) => j.ref === `launch:${first.id}` && j.status === 'done'));
});

test('PT-8/OP-7: replies stop follow-ups; opt-outs land on the suppression list', async () => {
  importContactsCsv('name,email,outlet,domain,beats\nAlex Kim,alex@bikes-news.com,Bike News Daily,bikes-news.com,transport;consumer-tech\n');
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  const alex = c.targets.find((t) => t.email === 'alex@bikes-news.com');
  assert.ok(alex, 'imported contact is targeted');
  relay.approveCampaign(c);
  await relay.launchCampaign(c, { simulateReplies: (camp, p, job) => { if (p.targetId === alex.id && job.stage !== 'follow_up') relay.logReply(camp, { targetId: alex.id, kind: 'opt_out' }); } });
  assert.ok(loadSuppression().some((s) => s.email === 'alex@bikes-news.com'));
  const fu = c.jobs.find((j) => j.ref === `follow_up:${alex.id}`);
  assert.equal(fu.status, 'skipped');
});

test('imported contacts with a recent article get a personalised opener (PT-3)', async () => {
  importContactsCsv('name,email,outlet,domain,beats,recent_article_title,recent_article_date\nRiya Shah,riya@citycycle.news,CityCycle,citycycle.news,transport,"Why commuters are switching to folding e-bikes",2026-11-01\n');
  const c = await relay.createCampaign(relay.SAMPLE_BRIEF, { now: FIXED_NOW });
  const p = c.assets.pitches.find((x) => x.email === 'riya@citycycle.news');
  assert.ok(p);
  assert.match(p.body, /Why commuters are switching to folding e-bikes/);
  assert.match(p.body, /^Hi Riya,/);
});

test('crisis campaigns publish a statement with no social posts', async () => {
  const c = await relay.createCampaign({ news: 'Paxton Bank statement on the service outage that affected online banking customers on Monday.', org: 'Paxton Bank' }, { now: FIXED_NOW });
  assert.equal(c.plan.flags.mode, 'crisis');
  assert.deepEqual(Object.keys(c.assets.social), []);
  assert.ok(c.assets.extras.statement);
  assert.ok(c.assets.pitches.every((p) => p.kind === 'statement'));
});

test('audit log records every outbound action (OP-8) without secrets (OP-10)', async () => {
  process.env.RESEND_API_KEY = 're_secret_value';
  await relay.runTestCampaign();
  const log = fs.readFileSync(path.join(dir, 'audit.log'), 'utf8');
  assert.match(log, /"channel":"email"/);
  assert.match(log, /"channel":"newsroom"/);
  assert.doesNotMatch(log, /re_secret_value/);
  delete process.env.RESEND_API_KEY;
});
