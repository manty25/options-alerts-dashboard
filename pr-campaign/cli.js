#!/usr/bin/env node
// Relay command line.
//   node cli.js demo                              full test campaign with the sample brief
//   node cli.js test "One sentence of news" --org "Acme"   full test campaign from minimal input
//   node cli.js plan "…" [--org …] [--json]       build a campaign (test mode) and print the plan
//   node cli.js list | report <id> | serve
//   node cli.js import-contacts contacts.csv
import fs from 'node:fs';
import path from 'node:path';
import { runTestCampaign, createCampaign, loadCampaign, computeReport, SAMPLE_BRIEF, exportCampaignFiles } from './src/index.js';
import { listCampaigns } from './src/store.js';
import { importContactsCsv } from './src/engine/contacts.js';
import { llmAvailable, MODEL } from './src/generate/claude.js';

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const flag = (name, def = '') => { const i = args.indexOf(`--${name}`); return i > -1 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && arr[i - 1].startsWith('--') && !['--json', '--no-sim', '--offline'].includes(arr[i - 1])));

const out = (s = '') => process.stdout.write(s + '\n');
const money = (x) => `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);

function briefFromArgs() {
  const news = positional[0];
  if (!news) return null;
  const b = { news };
  for (const k of ['org', 'city', 'website', 'spokesperson', 'title', 'email', 'budget', 'region', 'date']) {
    const v = flag(k);
    if (v && v !== true) b[k] = v;
  }
  if (b.spokesperson) b.spokesperson = { name: b.spokesperson, title: b.title || '' };
  if (b.email) b.contact = { email: b.email };
  if (b.date) b.launchAt = b.date;
  return b;
}

function summary(c, r, dir) {
  out();
  out(bold(`✔ ${c.name}`) + `  (${c.mode} mode, ${c.id})`);
  out(`  Topic: ${c.analysis.topic.label} · news value ${c.analysis.newsworthiness.score}/100 (${c.analysis.newsworthiness.verdict}) · writer: ${c.writer.name}${c.writer.model ? ` (${c.writer.model})` : ''}`);
  out(`  Channels: ${c.plan.channels.map((ch) => ch.id).join(', ')}`);
  out(`  Media list: ${c.targets.length} targets · exclusive → ${c.targets.find((t) => t.role === 'exclusive')?.outlet || 'none'}`);
  out(`  QA: ${c.qa.score}/100 (${c.qa.errors} blocking, ${c.qa.warnings} warnings)`);
  for (const x of c.qa.checks.filter((k) => !k.pass)) out(`    - [${x.id}] ${x.asset}: ${x.message}`);
  out(`  Built in ${((c.timings.buildMs || 0) / 1000).toFixed(2)} s · est. cost ${money(c.estimates.cost.total[0])}–${money(c.estimates.cost.total[1])} vs agency ${money(c.estimates.benchmark.cost[0])}–${money(c.estimates.benchmark.cost[1])}/month`);
  if (r) {
    out();
    out(bold(r.simulated ? 'Results (SIMULATED — no journalist was contacted)' : 'Results'));
    out(`  Pitches sent to outbox: ${r.outputs.pitchesSent} (${Object.entries(r.outputs.byStage).map(([k, v]) => `${k} ${v}`).join(', ')}) · skipped by rules: ${r.outputs.skipped}`);
    out(`  Published: ${[...new Set(r.outputs.published)].join(', ')}`);
    out(`  Replies: ${r.outtakes.replies} (${r.outtakes.replyRate}% of reporters) · exclusive: ${r.outtakes.exclusive || 'none'} · clicks: ${r.outtakes.totalClicks}`);
    out(`  Placements: ${r.outcomes.placements} (T1 ${r.outcomes.tiers[1]}, T2 ${r.outcomes.tiers[2]}, T3 ${r.outcomes.tiers[3]}) + ${r.outcomes.syndicationPickups} wire pickups · reach ≈ ${r.outcomes.tierWeightedReach.toLocaleString('en-US')}`);
    out(`  Cost per placement: ${r.efficiency.costPerPlacement == null ? '—' : money(r.efficiency.costPerPlacement)} (agency ≈ ${r.efficiency.benchmarkCostPerPlacement == null ? '—' : money(r.efficiency.benchmarkCostPerPlacement)})`);
  }
  if (dir) {
    out();
    out(bold('Files'));
    for (const f of ['report.html', 'press-release.txt', 'pitches.txt', 'social.txt', 'media-list.csv', 'newsroom-preview.html', 'outbox/']) if (fs.existsSync(path.join(dir, f))) out(`  ${path.join(dir, f)}`);
  }
  out();
}

async function main() {
  if (flag('offline')) process.env.RELAY_OFFLINE = '1';
  switch (cmd) {
    case 'demo': {
      out(`Running a test campaign with the sample brief (${llmAvailable() ? `Claude: ${MODEL}` : 'offline writer — set ANTHROPIC_API_KEY to use Claude'})…`);
      const { campaign, report, dir } = await runTestCampaign(SAMPLE_BRIEF, { simulate: !flag('no-sim') });
      if (flag('json')) return out(JSON.stringify({ id: campaign.id, report }, null, 2));
      return summary(campaign, report, dir);
    }
    case 'test': {
      const brief = briefFromArgs();
      if (!brief) throw new Error('Usage: node cli.js test "One sentence about the news" --org "Organisation"');
      const { campaign, report, dir } = await runTestCampaign(brief, { simulate: !flag('no-sim') });
      if (flag('json')) return out(JSON.stringify({ id: campaign.id, report }, null, 2));
      return summary(campaign, report, dir);
    }
    case 'plan': {
      const brief = briefFromArgs();
      if (!brief) throw new Error('Usage: node cli.js plan "One sentence about the news" --org "Organisation"');
      const c = await createCampaign(brief, { mode: 'test' });
      const dir = exportCampaignFiles(c);
      if (flag('json')) return out(JSON.stringify(c, null, 2));
      return summary(c, null, dir);
    }
    case 'list':
      for (const c of listCampaigns()) out(`${c.id}  ${c.status.padEnd(10)} ${c.mode.padEnd(5)} ${c.name}`);
      return;
    case 'report': {
      const c = loadCampaign(positional[0] || '');
      if (!c) throw new Error('Unknown campaign id');
      return out(JSON.stringify(computeReport(c), null, 2));
    }
    case 'import-contacts': {
      const file = positional[0];
      if (!file) throw new Error('Usage: node cli.js import-contacts contacts.csv');
      return out(JSON.stringify(importContactsCsv(fs.readFileSync(file, 'utf8'))));
    }
    case 'serve':
      await import('./server.js');
      return;
    default:
      out(`Relay — PR campaigns from one sentence.

  node cli.js demo                                   Full test campaign with a sample brief
  node cli.js test "<news>" --org "<organisation>"   Full test campaign from your own one-liner
  node cli.js plan "<news>" --org "<organisation>"   Build plan + assets only (no launch)
  node cli.js list                                   List campaigns
  node cli.js report <id>                            Results as JSON
  node cli.js import-contacts <file.csv>             Import journalist contacts
  node cli.js serve                                  Start the web app (http://localhost:8787)

Options: --city --website --spokesperson --title --email --budget free|lean|full --region us|uk|eu… --date YYYY-MM-DD --offline --no-sim --json`);
  }
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
