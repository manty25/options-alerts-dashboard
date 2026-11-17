// First-party click tracking with UTM tags (OP-13). No open pixels.
import fs from 'node:fs';
import { readJson, writeJson, globalFile, ensureDir, dataDir } from '../store.js';
import { hash, slug } from '../util.js';
import { publicBase } from './newsroom.js';

const LINKS = () => globalFile('links.json');
const CLICKS = () => globalFile('clicks.jsonl');

const MEDIUM = { email: 'email', pitch: 'email', newsletter: 'email', wire: 'referral', newsroom: 'referral' };

export function trackedLink(campaign, channel, url) {
  const u = new URL(url);
  u.searchParams.set('utm_source', channel);
  u.searchParams.set('utm_medium', MEDIUM[channel] || 'social');
  u.searchParams.set('utm_campaign', slug(campaign.name).slice(0, 40));
  const code = hash(`${campaign.id}:${channel}:${url}`).slice(0, 8);
  const links = readJson(LINKS(), {});
  if (!links[code]) { links[code] = { campaignId: campaign.id, channel, url: u.toString() }; writeJson(LINKS(), links); }
  return `${publicBase()}/r/${code}`;
}

export function resolveLink(code) {
  return readJson(LINKS(), {})[code] || null;
}

export function recordClick(code, meta = {}) {
  const link = resolveLink(code);
  if (!link) return null;
  ensureDir(dataDir());
  fs.appendFileSync(CLICKS(), JSON.stringify({ at: new Date().toISOString(), code, campaignId: link.campaignId, channel: link.channel, ref: meta.referer || '' }) + '\n');
  return link;
}

export function clicksFor(campaignId) {
  if (!fs.existsSync(CLICKS())) return [];
  return fs.readFileSync(CLICKS(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.campaignId === campaignId);
}
