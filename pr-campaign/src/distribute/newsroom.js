// Owned newsroom (AE-1, AE-2): release pages with structured data, RSS, sitemap and llms.txt.
// Served by Relay at /newsroom/, optionally mirrored to RELAY_NEWSROOM_DIR (e.g. a static-site folder).
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, writeText, readJson, writeJson, audit } from '../store.js';
import { escapeHtml, slug } from '../util.js';

export const publicBase = () => (process.env.RELAY_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, '');
export const newsroomRoot = () => path.join(dataDir(), 'newsroom');

export function releasePath(campaign) {
  const day = campaign.plan.launchAt.slice(0, 10);
  return `${campaign.brief.orgSlug}/${day}-${slug(campaign.assets?.pressRelease?.headline || campaign.brief.news).slice(0, 48)}/`;
}
export const releaseUrl = (campaign) => `${publicBase()}/newsroom/${releasePath(campaign)}`;

function rebuildIndexes(orgSlug, orgName) {
  const dir = path.join(newsroomRoot(), orgSlug);
  const manifest = readJson(path.join(dir, 'releases.json'), []);
  const base = `${publicBase()}/newsroom/${orgSlug}/`;
  const items = manifest.sort((a, b) => b.date.localeCompare(a.date));
  writeText(path.join(dir, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${escapeHtml(orgName)} newsroom</title><link>${base}</link><description>News from ${escapeHtml(orgName)}</description>
${items.map((r) => `<item><title>${escapeHtml(r.headline)}</title><link>${r.url}</link><guid>${r.url}</guid><pubDate>${new Date(r.date).toUTCString()}</pubDate><description>${escapeHtml(r.summary)}</description></item>`).join('\n')}
</channel></rss>\n`);
  writeText(path.join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items.map((r) => `<url><loc>${r.url}</loc><news:news><news:publication><news:name>${escapeHtml(orgName)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${r.date}</news:publication_date><news:title>${escapeHtml(r.headline)}</news:title></news:news></url>`).join('\n')}
</urlset>\n`);
  writeText(path.join(dir, 'llms.txt'), `# ${orgName} newsroom\n\n> Official announcements from ${orgName}. Each release links to a fact sheet with verified facts.\n\n## Releases\n${items.map((r) => `- [${r.headline}](${r.url}): ${r.summary}`).join('\n')}\n`);
  writeText(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(orgName)} newsroom</title><link rel="alternate" type="application/rss+xml" href="rss.xml">
<style>:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--acc:#0b57d0}@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9da7b3;--acc:#7aa2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:32px 16px}a{color:var(--acc)}li{margin:14px 0}time{color:var(--muted);font-size:14px;display:block}</style></head>
<body><main><h1>${escapeHtml(orgName)} newsroom</h1><p><a href="rss.xml">RSS feed</a></p><ul>${items.map((r) => `<li><time>${r.date.slice(0, 10)}</time><a href="${escapeHtml(r.url)}">${escapeHtml(r.headline)}</a></li>`).join('')}</ul></main></body></html>`);
}

export function publishNewsroom(campaign) {
  const rel = releasePath(campaign);
  const dir = path.join(newsroomRoot(), rel);
  writeText(path.join(dir, 'index.html'), campaign.assets.newsroomHtml);
  writeJson(path.join(dir, 'facts.json'), { org: campaign.brief.org, headline: campaign.assets.pressRelease.headline, published: campaign.plan.launchAt, facts: campaign.assets.factSheet.facts.map((f) => f.text), faq: campaign.assets.faq });
  const orgDir = path.join(newsroomRoot(), campaign.brief.orgSlug);
  const manifestFile = path.join(orgDir, 'releases.json');
  const manifest = readJson(manifestFile, []).filter((r) => r.campaignId !== campaign.id);
  manifest.push({ campaignId: campaign.id, headline: campaign.assets.pressRelease.headline, url: releaseUrl(campaign), date: campaign.plan.launchAt, summary: campaign.assets.pressRelease.subhead || campaign.brief.news.slice(0, 200), test: campaign.mode === 'test' });
  writeJson(manifestFile, manifest);
  rebuildIndexes(campaign.brief.orgSlug, campaign.brief.org);

  // Mirror to an external static folder only for live campaigns.
  if (campaign.mode === 'live' && process.env.RELAY_NEWSROOM_DIR) {
    fs.cpSync(orgDir, path.join(process.env.RELAY_NEWSROOM_DIR, campaign.brief.orgSlug), { recursive: true });
  }
  audit({ campaignId: campaign.id, channel: 'newsroom', mode: campaign.mode, url: releaseUrl(campaign) });
  return { url: releaseUrl(campaign), path: rel, at: new Date().toISOString() };
}
