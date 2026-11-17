// Results report aligned with AMEC Barcelona Principles 3.0 (ME-1..ME-5). No AVE.
import { REACH_ESTIMATE, STORY_SHARE } from '../knowledge/outlets.js';
import { clicksFor } from '../distribute/tracking.js';
import { escapeHtml, fmtDateTime } from '../util.js';

const STOP = new Set('about after their there which would could these those with from into that this will have been were what when where also more than other some your ours'.split(' '));
const terms = (s) => [...new Set(String(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !STOP.has(w)))];

export function pullThrough(message, text) {
  const ts = terms(message).slice(0, 6);
  if (!ts.length) return false;
  const t = String(text).toLowerCase();
  return ts.filter((w) => t.includes(w)).length / ts.length >= 0.5;
}

export function computeReport(c) {
  const ev = c.events || [];
  const sent = ev.filter((e) => e.type === 'sent' && !e.error);
  const byStage = {};
  for (const s of sent) byStage[s.stage] = (byStage[s.stage] || 0) + 1;
  const replies = ev.filter((e) => e.type === 'reply');
  const repliedTargets = new Set(replies.map((r) => r.targetId));
  const pitchedTargets = new Set(sent.map((s) => s.targetId));
  const coverageAll = ev.filter((e) => e.type === 'coverage');
  const syndication = coverageAll.filter((e) => e.source === 'wire-syndication');
  const coverage = coverageAll.filter((e) => e.source !== 'wire-syndication');
  const tiers = { 1: 0, 2: 0, 3: 0 };
  let reach = 0;
  for (const cov of coverage) {
    const tier = cov.tier || 3;
    tiers[tier] = (tiers[tier] || 0) + 1;
    reach += (REACH_ESTIMATE[cov.reach] || 400000) * (STORY_SHARE[tier] || 0.01);
  }
  reach += syndication.length * 1500;
  const messages = (c.plan.keyMessages || []).map((m) => ({
    message: m,
    placements: coverage.filter((cov) => pullThrough(m, `${cov.title} ${cov.excerpt}`)).length,
  })).map((m) => ({ ...m, share: coverage.length ? Math.round((m.placements / coverage.length) * 100) : 0 }));
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const cov of coverage) if (cov.sentiment) sentiment[cov.sentiment]++;
  // Coverage dates are days; measure from the planned launch day (test runs are time-compressed).
  const launchDay = new Date(c.plan.launchAt.slice(0, 10));
  const firstCov = coverage.map((x) => new Date(x.date)).sort((a, b) => a - b)[0];
  const realClicks = clicksFor(c.id).reduce((m, x) => ({ ...m, [x.channel]: (m[x.channel] || 0) + 1 }), {});
  const simClicks = c.simulation?.clicks || {};
  const clicks = Object.fromEntries([...new Set([...Object.keys(realClicks), ...Object.keys(simClicks)])].map((k) => [k, (realClicks[k] || 0) + (simClicks[k] || 0)]));
  const wireMid = c.assets.wire ? c.assets.wire.services.reduce((n, s) => n + (s.cost[0] + s.cost[1]) / 2, 0) : 0;
  const cost = Math.round(((c.estimates?.cost?.ai || 0) + wireMid) * 100) / 100;
  const bench = c.estimates?.benchmark;
  const benchMid = bench ? (bench.cost[0] + bench.cost[1]) / 2 : 0;
  const simulated = ev.some((e) => e.simulated) || Boolean(c.simulation);
  return {
    simulated,
    mode: c.mode,
    outputs: {
      pitchesSent: sent.filter((s) => s.channel === 'email').length, byStage,
      skipped: (c.jobs || []).filter((j) => j.status === 'skipped').length,
      published: ev.filter((e) => e.type === 'published').map((e) => e.channel),
    },
    outtakes: {
      replies: replies.length,
      replyRate: pitchedTargets.size ? Math.round((repliedTargets.size / pitchedTargets.size) * 100) : 0,
      byKind: replies.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {}),
      exclusive: replies.find((r) => r.stage === 'exclusive_offer' && r.kind === 'interested')?.outlet || null,
      clicks, totalClicks: Object.values(clicks).reduce((a, b) => a + b, 0),
    },
    outcomes: {
      placements: coverage.length, tiers, syndicationPickups: syndication.length,
      tierWeightedReach: Math.round(reach), messages, sentiment,
      daysToFirstCoverage: firstCov ? Math.max(0, Math.round((firstCov - launchDay) / 86400000)) : null,
      coverage: coverage.slice(0, 50),
    },
    efficiency: {
      cost, costPerPlacement: coverage.length ? Math.round((cost / coverage.length) * 100) / 100 : null,
      benchmarkCost: benchMid, benchmarkCostPerPlacement: coverage.length ? Math.round(benchMid / coverage.length) : null,
      buildSeconds: Math.round(((c.timings?.buildMs || 0) / 1000) * 10) / 10,
      benchmarkDays: bench?.daysBriefToLaunch,
    },
    method: 'Barcelona Principles 3.0: outputs → outtakes → outcomes; no AVE. Tier-weighted reach = Σ outlet audience × typical story share; syndication counted at 1,500 readers per pickup. Message pull-through = share of placements containing ≥ 50% of each key message’s key terms.',
  };
}

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const bar = (v, max) => `<span class="bar"><span style="width:${max ? Math.round((v / max) * 100) : 0}%"></span></span>`;

export function reportHtml(c, r = computeReport(c)) {
  const sim = r.simulated ? '<span class="sim">SIMULATED</span>' : '';
  const maxClicks = Math.max(1, ...Object.values(r.outtakes.clicks));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campaign report — ${escapeHtml(c.name)}</title>
<style>
@font-face{font-family:"Instrument Serif";src:url(/fonts/instrument-serif-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Inter;src:url(/fonts/inter-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
:root{--bg:#f6f3ec;--panel:#fffdf8;--fg:#16140f;--ink2:#3c3830;--muted:#6b655a;--line:#e2dccf;--acc:#d6401f;--acc-ink:#a32d14;--sim:#a32d14;--simbg:#fbe4dc;--serif:"Instrument Serif",Georgia,serif}
@media (prefers-color-scheme:dark){:root{--bg:#15130f;--panel:#1d1a15;--fg:#f1ece2;--ink2:#d6cfc2;--muted:#a39b8c;--line:#2e2a23;--acc:#f0643f;--acc-ink:#ff8a68;--sim:#ff8a68;--simbg:#3a1d14}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:980px;margin:0 auto;padding:32px 16px 64px}h1{font:400 40px/1.05 var(--serif);letter-spacing:-.02em;margin:6px 0 6px}
h2{font:500 11.5px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:36px 0 0;padding-bottom:9px;border-bottom:1px solid var(--fg);display:flex;gap:8px;align-items:center}
.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));border-bottom:1px solid var(--line)}
.card{padding:18px 18px 16px 0}.card+.card{padding-left:18px;border-left:1px solid var(--line)}
.big{font:400 44px/1 var(--serif);letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:6px 0}
.sim{display:inline-block;background:var(--simbg);color:var(--sim);font:600 10.5px/1 Inter,sans-serif;letter-spacing:.1em;padding:4px 6px;border-radius:3px}
.banner{border-left:2px solid var(--acc);background:var(--simbg);color:var(--sim);padding:10px 14px;margin:18px 0 0;font-size:14px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
th{font:500 11px Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.bar{display:inline-block;width:120px;height:3px;background:var(--line);vertical-align:middle;margin-right:10px}.bar span{display:block;height:100%;background:var(--fg)}
a{color:var(--acc-ink)}td.num{font-variant-numeric:tabular-nums;white-space:nowrap}td .o{font-family:var(--serif);font-size:18px}
</style></head><body><main>
<div class="muted" style="font-size:11.5px;letter-spacing:.14em;text-transform:uppercase">Results report</div>
<h1>${escapeHtml(c.name)}</h1>
<div class="muted">${escapeHtml(c.analysis.topic.label)} · ${c.mode === 'test' ? 'Test campaign' : 'Live campaign'} · launched ${escapeHtml(fmtDateTime(new Date(c.launchedAt || c.plan.launchAt), c.brief.timezone))}</div>
${r.simulated ? '<div class="banner">SIMULATED results: this is a test campaign. No journalist was contacted; replies, clicks and coverage below are generated to exercise the pipeline.</div>' : ''}
<h2>Outcomes ${sim}</h2>
<div class="grid">
<div class="card"><div class="muted">Placements</div><div class="big">${n(r.outcomes.placements)}</div><div class="muted">T1 ${r.outcomes.tiers[1]} · T2 ${r.outcomes.tiers[2]} · T3 ${r.outcomes.tiers[3]}</div></div>
<div class="card"><div class="muted">Tier-weighted reach</div><div class="big">${n(r.outcomes.tierWeightedReach)}</div><div class="muted">${n(r.outcomes.syndicationPickups)} wire syndication pickups</div></div>
<div class="card"><div class="muted">Time to first coverage</div><div class="big">${r.outcomes.daysToFirstCoverage == null ? '—' : r.outcomes.daysToFirstCoverage === 0 ? 'Launch day' : `Day ${r.outcomes.daysToFirstCoverage}`}</div></div>
<div class="card"><div class="muted">Exclusive</div><div class="big" style="font-size:18px">${escapeHtml(r.outtakes.exclusive || 'none')}</div></div>
</div>
<h2>Key-message pull-through ${sim}</h2>
<table><tr><th>Key message</th><th>Placements carrying it</th></tr>
${r.outcomes.messages.map((m) => `<tr><td>${escapeHtml(m.message)}</td><td class="num">${bar(m.share, 100)}${m.share}% (${m.placements})</td></tr>`).join('')}</table>
<h2>Outtakes ${sim}</h2>
<div class="grid">
<div class="card"><div class="muted">Reply rate</div><div class="big">${r.outtakes.replyRate}%</div><div class="muted">${Object.entries(r.outtakes.byKind).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ') || 'no replies'}</div></div>
<div class="card"><div class="muted">Tracked clicks</div><div class="big">${n(r.outtakes.totalClicks)}</div></div>
</div>
<table><tr><th>Channel</th><th>Clicks</th></tr>${Object.entries(r.outtakes.clicks).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${bar(v, maxClicks)}${n(v)}</td></tr>`).join('')}</table>
<h2>Outputs</h2>
<div class="grid">
<div class="card"><div class="muted">Pitches sent</div><div class="big">${n(r.outputs.pitchesSent)}</div><div class="muted">${Object.entries(r.outputs.byStage).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}</div></div>
<div class="card"><div class="muted">Published</div><div class="big">${r.outputs.published.length}</div><div class="muted">${escapeHtml([...new Set(r.outputs.published)].join(', '))}</div></div>
<div class="card"><div class="muted">Sends skipped by rules</div><div class="big">${n(r.outputs.skipped)}</div><div class="muted">follow-up limits, exclusives, opt-outs</div></div>
</div>
<h2>Cost and speed vs a traditional agency</h2>
<table><tr><th></th><th>This campaign</th><th>Agency + wire + database (typical)</th></tr>
<tr><td>Cost</td><td class="num">$${n(r.efficiency.cost)}</td><td class="num">≈ $${n(r.efficiency.benchmarkCost)} / month</td></tr>
<tr><td>Cost per placement</td><td class="num">${r.efficiency.costPerPlacement == null ? '—' : `$${n(r.efficiency.costPerPlacement)}`}</td><td class="num">${r.efficiency.benchmarkCostPerPlacement == null ? '—' : `≈ $${n(r.efficiency.benchmarkCostPerPlacement)}`}</td></tr>
<tr><td>Brief → campaign kit</td><td class="num">${r.efficiency.buildSeconds} s</td><td class="num">${r.efficiency.benchmarkDays ? `${r.efficiency.benchmarkDays[0]}–${r.efficiency.benchmarkDays[1]} days` : '—'}</td></tr></table>
<h2>Coverage ${sim}</h2>
<table><tr><th>Date</th><th>Outlet</th><th>Headline</th><th>Sentiment</th></tr>
${r.outcomes.coverage.map((x) => `<tr><td class="num">${escapeHtml(x.date)}</td><td><span class="o">${escapeHtml(x.outlet)}</span>${x.tier ? ` <span class="muted">T${x.tier}</span>` : ''}</td><td>${x.simulated ? escapeHtml(x.title) : `<a href="${escapeHtml(x.url)}">${escapeHtml(x.title)}</a>`}</td><td>${escapeHtml(x.sentiment || '—')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No coverage logged yet.</td></tr>'}</table>
<p class="muted" style="margin-top:24px">Method: ${escapeHtml(r.method)}</p>
</main></body></html>`;
}
