// Test-campaign simulation. Produces plausible replies, clicks and coverage so the whole
// pipeline (monitoring → report) can be exercised without contacting anyone.
// Every simulated record carries simulated: true and is labelled SIMULATED in reports (ME-5).
import { rng, slug } from '../util.js';
import { logReply, addCoverage } from './campaign.js';
import { saveCampaign } from '../store.js';

const VERDICT_RATE = { strong: 1, moderate: 0.65, weak: 0.3 };

export function makeReplySimulator(c) {
  const r = rng(`${c.id}:replies`);
  const v = VERDICT_RATE[c.analysis.newsworthiness.verdict];
  return (camp, pitch, job) => {
    const t = camp.targets.find((x) => x.id === pitch.targetId);
    if (!t) return;
    const x = r();
    if (job.stage === 'exclusive_offer') {
      // Exclusives: decent acceptance for strong stories; decline otherwise (lets backups run).
      logReply(camp, { targetId: t.id, kind: x < 0.45 * v ? 'interested' : 'declined', stage: 'exclusive_offer', simulated: true, note: 'SIMULATED' });
      return;
    }
    const pInterested = (job.stage === 'embargo_prebrief' ? 0.22 : job.stage === 'follow_up' ? 0.07 : 0.1) * v * (t.score / 70);
    if (x < pInterested) logReply(camp, { targetId: t.id, kind: 'interested', stage: job.stage, simulated: true, note: 'SIMULATED' });
    else if (x < pInterested + 0.03) logReply(camp, { targetId: t.id, kind: 'not_my_beat', stage: job.stage, simulated: true, note: 'SIMULATED' });
  };
}

const ANGLES = ['', 'What to know about ', 'Why ', 'Inside ', 'First look: '];

export function simulateOutcomes(c) {
  const r = rng(`${c.id}:outcomes`);
  const v = VERDICT_RATE[c.analysis.newsworthiness.verdict];
  const interested = new Set(c.events.filter((e) => e.type === 'reply' && e.kind === 'interested').map((e) => e.targetId));
  const headline = c.assets.pressRelease.headline;
  const launchDay = new Date(c.plan.launchAt);
  let coverage = 0;
  for (const t of c.targets) {
    const base = interested.has(t.id) ? 0.7 : 0.02 * v;
    if (r() >= base) continue;
    const angle = ANGLES[Math.floor(r() * ANGLES.length)];
    const day = new Date(launchDay.getTime() + Math.floor(r() * 4) * 86400000).toISOString().slice(0, 10);
    const msgs = c.plan.keyMessages || [];
    const excerpt = msgs.filter(() => r() < 0.7).join(' ');
    addCoverage(c, {
      url: `https://${t.domain.split('/')[0]}/simulated/${slug(headline).slice(0, 40)}-${c.id.slice(-4)}`,
      title: `${angle}${headline}`, outlet: t.outlet, domain: t.domain, date: day, excerpt, tier: t.tier, reach: t.reach,
      sentiment: r() < 0.75 ? 'positive' : r() < 0.95 ? 'neutral' : 'negative', source: 'simulation', simulated: true,
    });
    coverage++;
  }
  // Syndicated wire pickups (low readership) when a wire is in the plan.
  if (c.assets.wire) {
    const n = 8 + Math.floor(r() * 20);
    for (let i = 0; i < n; i++) addCoverage(c, { url: `https://syndication-${i + 1}.example/simulated/${c.id}`, title: headline, outlet: `Wire syndication partner ${i + 1}`, domain: `syndication-${i + 1}.example`, tier: 3, reach: 's', sentiment: 'neutral', source: 'wire-syndication', simulated: true, excerpt: (c.plan.keyMessages || []).join(' ') });
  }
  // Clicks per channel.
  const clicks = {};
  const channels = ['pitch', ...Object.keys(c.assets.social), 'newsletter'];
  for (const ch of channels) clicks[ch] = Math.round((ch === 'pitch' ? 4 + coverage * 6 : ch === 'linkedin' ? 60 : ch === 'newsletter' ? 90 : 25) * v * (0.6 + r()));
  c.simulation = { at: new Date().toISOString(), clicks, note: 'SIMULATED outcomes for a test campaign. No journalist was contacted.' };
  c.status = 'complete';
  saveCampaign(c);
  return c;
}
