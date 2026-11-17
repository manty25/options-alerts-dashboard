// Social publishing. Live adapters: Bluesky (AT Protocol), Mastodon, LinkedIn & X via a webhook
// (Zapier/Make/n8n/Typefully) — everything else, and all test-mode posts, go to the outbox.
import path from 'node:path';
import { campaignDir, writeText, audit } from '../store.js';

export function socialAdapters() {
  return {
    bluesky: Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
    mastodon: Boolean(process.env.MASTODON_URL && process.env.MASTODON_TOKEN),
    webhook: Boolean(process.env.RELAY_SOCIAL_WEBHOOK),
  };
}

// Bluesky needs explicit link facets with UTF-8 byte offsets.
function bskyFacets(text) {
  const facets = [];
  const enc = new TextEncoder();
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const start = enc.encode(text.slice(0, m.index)).length;
    facets.push({ index: { byteStart: start, byteEnd: start + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)(#[\p{L}\p{N}_]+)/gu)) {
    const start = enc.encode(text.slice(0, m.index + m[1].length)).length;
    facets.push({ index: { byteStart: start, byteEnd: start + enc.encode(m[2]).length }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2].slice(1) }] });
  }
  return facets;
}

async function postBluesky(text) {
  const svc = process.env.BLUESKY_SERVICE || 'https://bsky.social';
  const s = await fetch(`${svc}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }) });
  if (!s.ok) throw new Error(`Bluesky login ${s.status}`);
  const { accessJwt, did } = await s.json();
  const r = await fetch(`${svc}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text, facets: bskyFacets(text), createdAt: new Date().toISOString() } }),
  });
  if (!r.ok) throw new Error(`Bluesky post ${r.status}`);
  return (await r.json()).uri;
}

async function postMastodon(text) {
  const r = await fetch(`${process.env.MASTODON_URL.replace(/\/$/, '')}/api/v1/statuses`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MASTODON_TOKEN}` }, body: JSON.stringify({ status: text, visibility: 'public' }),
  });
  if (!r.ok) throw new Error(`Mastodon ${r.status}`);
  return (await r.json()).url;
}

async function postWebhook(platform, text, campaign) {
  const r = await fetch(process.env.RELAY_SOCIAL_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform, text, campaignId: campaign.id, org: campaign.brief.org }) });
  if (!r.ok) throw new Error(`Webhook ${r.status}`);
  return 'webhook';
}

export async function publishSocial(campaign, platform, text) {
  const file = path.join(campaignDir(campaign.id), 'outbox', 'social', `${platform}.txt`);
  writeText(file, text);
  const a = socialAdapters();
  let provider = 'outbox', url = null, error = null;
  if (campaign.mode === 'live') {
    try {
      if (platform === 'bluesky' && a.bluesky) { url = await postBluesky(text); provider = 'bluesky'; }
      else if (platform === 'mastodon' && a.mastodon) { url = await postMastodon(text); provider = 'mastodon'; }
      else if (a.webhook) { url = await postWebhook(platform, text, campaign); provider = 'webhook'; }
    } catch (e) { error = e.message; }
  }
  audit({ campaignId: campaign.id, channel: platform, mode: campaign.mode, provider, error });
  return { platform, provider, url, error, outbox: `outbox/social/${platform}.txt`, at: new Date().toISOString() };
}
