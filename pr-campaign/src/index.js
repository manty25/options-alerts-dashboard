// Public API.
import path from 'node:path';
import { createCampaign, approveCampaign, launchCampaign } from './engine/campaign.js';
import { makeReplySimulator, simulateOutcomes } from './engine/simulate.js';
import { computeReport, reportHtml } from './engine/report.js';
import { writeText, campaignDir, saveCampaign, writeJson } from './store.js';
import { contactsCsv } from './engine/contacts.js';

export * from './engine/campaign.js';
export { computeReport, reportHtml } from './engine/report.js';
export { simulateOutcomes, makeReplySimulator } from './engine/simulate.js';

export const SAMPLE_BRIEF = {
  news: 'Lumora Mobility launches the Lumora Commuter, a foldable e-bike that weighs 14 kg and recharges to 80% in 45 minutes, priced at $1,290.',
  org: 'Lumora Mobility',
  city: 'Austin',
  regionName: 'Texas',
  website: 'https://lumora.example',
  spokesperson: { name: 'Dana Reyes', title: 'CEO and co-founder' },
  contact: { name: 'Sam Patel', email: 'press@lumora.example' },
  about: 'Lumora Mobility designs lightweight electric bikes for city commuters. Founded in 2022, the company is based in Austin, Texas, and has 38 employees.',
  audience: 'city commuters who want to drive less',
  facts: [
    'The Commuter has a range of 70 km on one charge.',
    'Lumora tested the Commuter with 300 daily commuters in Austin and Denver over six months.',
    'Pre-orders open today; deliveries start in March 2027.',
    'The bike folds in 10 seconds to fit under a desk or on a bus rack.',
  ],
};

// Writes every deliverable to the campaign folder so it can be opened without the UI.
export function exportCampaignFiles(c) {
  const dir = campaignDir(c.id);
  writeText(path.join(dir, 'press-release.txt'), c.assets.releaseText);
  writeText(path.join(dir, 'newsroom-preview.html'), c.assets.newsroomHtml);
  writeText(path.join(dir, 'media-list.csv'), contactsCsv(c.targets));
  writeText(path.join(dir, 'pitches.txt'), c.assets.pitches.map((p) => `=== ${p.stage.toUpperCase()} → ${p.outlet} <${p.email}>${p.conditional ? ' (only if previous outlet declines)' : ''}\nSend: ${p.sendAt}\nSubject: ${p.subject}\n\n${p.body}\n`).join('\n'));
  writeText(path.join(dir, 'social.txt'), Object.entries(c.assets.social).map(([k, v]) => `=== ${k}\n${v.text.replace('{link}', v.link)}\n`).join('\n'));
  writeJson(path.join(dir, 'qa.json'), c.qa);
  return dir;
}

export async function runTestCampaign(input = SAMPLE_BRIEF, opts = {}) {
  const c = await createCampaign(input, { ...opts, mode: 'test' });
  approveCampaign(c, opts.approvedBy || 'test-run');
  await launchCampaign(c, { simulateReplies: opts.simulate === false ? undefined : makeReplySimulator(c) });
  if (opts.simulate !== false) simulateOutcomes(c);
  const report = computeReport(c);
  const dir = exportCampaignFiles(c);
  writeText(path.join(dir, 'report.html'), reportHtml(c, report));
  saveCampaign(c);
  return { campaign: c, report, dir };
}
