// Assembles writer output into final, sendable assets: per-target pitches (PT-*),
// release text, wire package (OP-5) and newsroom HTML (AE-*).
import { fmtDateTime, escapeHtml, apDate, localParts, zonedToUtc } from '../util.js';
import { shortNews } from './offline.js';

const firstName = (t) => (t.demo ? '' : String(t.name || '').split(/\s+/)[0]);

export function defaultOpener(t) {
  if (t.recentArticle?.title) return `I read your recent ${t.outlet} piece, “${t.recentArticle.title}”, so this seemed relevant to you.`;
  const beat = (t.matchedBeats || t.beats || [])[0] || 'this area';
  return `Since you cover ${beat.replace(/-/g, ' ')} for ${t.outlet}, I thought this would be useful.`;
}

export function pitchFor({ target, kind, core, brief, launchAt, exclusiveDeadline, opener, newsroomUrl }) {
  const tz = target.timezone || brief.timezone;
  const launch = new Date(launchAt);
  const sender = brief.sender.name || brief.contact.name;
  const prefix = { exclusive: 'Exclusive: ', embargo: 'Embargoed: ', statement: 'Statement: ' }[kind] || '';
  const sn = shortNews(core.headline || core.news, 58 - prefix.length, core.parsed);
  const subject = {
    exclusive: `Exclusive: ${sn}`,
    embargo: `Embargoed: ${sn}`,
    launch: sn,
    statement: `Statement: ${sn}`,
  }[kind] || sn;

  const ask = {
    exclusive: `I’d like to offer ${target.outlet} this as an exclusive before the public announcement on ${fmtDateTime(launch, tz)}. If you’re interested, please reply by ${fmtDateTime(new Date(exclusiveDeadline), tz)}; after that I’ll offer it elsewhere. ${brief.spokesperson.name} can do an interview before then.`,
    embargo: `This is under embargo until ${fmtDateTime(launch, tz)}. Could I set up a 15-minute call with ${brief.spokesperson.name} before then? Embargoed release and fact sheet on request.`,
    launch: `${brief.spokesperson.name} is available for interviews this week. Release, fact sheet and images: ${newsroomUrl}`,
    statement: `Our full statement is at ${newsroomUrl}. ${brief.spokesperson.name} can answer questions on the record.`,
  }[kind];

  const greeting = firstName(target) ? `Hi ${firstName(target)},` : 'Hi,';
  const body = [
    greeting,
    '',
    `${opener || defaultOpener(target)} ${core.news}${core.detail ? ` ${core.detail}` : ''}`,
    '',
    core.whyItMatters ? `${core.whyItMatters}\n` : null,
    ask,
    '',
    'Thanks,',
    sender,
    `${brief.org} · ${brief.contact.email}`,
    '',
    'Not a fit for your beat? Reply “no thanks” and I won’t pitch you again.',
  ].filter((x) => x !== null).join('\n');
  return { subject, body, kind };
}

export function followUpFor({ target, core, brief, newsroomUrl }) {
  const sn = shortNews(core.headline || core.news, 54, core.parsed);
  const greeting = firstName(target) ? `Hi ${firstName(target)},` : 'Hi,';
  return {
    subject: `Re: ${sn}`,
    body: `${greeting}\n\nA quick follow-up with one new detail: ${core.followUpDetail}\n\nEverything is here: ${newsroomUrl}. Happy to set up time with ${brief.spokesperson.name}.\n\nThanks,\n${brief.sender.name || brief.contact.name}\n\nNot a fit? Reply “no thanks” and I won’t follow up again.`,
    kind: 'follow_up',
  };
}

export function releaseText(pr) {
  return [
    pr.headline,
    pr.subhead ? `\n${pr.subhead}` : '',
    '',
    pr.paragraphs.join('\n\n'),
    '',
    pr.boilerplate,
    '',
    pr.contact,
    '',
    '###',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

// Wire package: plain text + scheduling off the hour (OP-5) + service recommendation.
export function wirePackage({ pr, plan, brief, launchAt }) {
  const wires = plan.channels.filter((c) => /wire/.test(c.id));
  if (!wires.length) return null;
  const launch = new Date(launchAt);
  const p = localParts(launch, brief.timezone);
  const offHour = p.min === 0 ? zonedToUtc(p.y, p.m, p.d, p.h, 5, brief.timezone) : launch;
  return {
    services: wires.map((w) => ({ id: w.id, label: w.label, cost: w.cost, why: w.why })),
    releaseAt: offHour.toISOString(),
    releaseAtLocal: fmtDateTime(offHour, brief.timezone),
    text: releaseText(pr),
    checklist: [
      'Paste the release text exactly as approved; do not let the wire editor rewrite quotes.',
      `Schedule for ${fmtDateTime(offHour, brief.timezone)} (off the hour).`,
      'Choose the smallest geographic circuit that reaches your audience; add trade/industry lists only if relevant.',
      'Attach one image with alt text; add the newsroom URL as the canonical link.',
      plan.mode === 'regulated' ? 'Disclosure: release must cross the wire before or at the same time as any other channel (Reg FD / MAR).' : 'Not a disclosure release: pitches may go out before the wire crosses.',
    ],
  };
}

export function newsroomHtml({ pr, faq, factSheet, brief, url, launchAt, imageUrl }) {
  const date = new Date(launchAt).toISOString();
  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: pr.headline, alternativeHeadline: pr.subhead || undefined,
    datePublished: date, dateModified: date, mainEntityOfPage: url,
    author: { '@type': 'Organization', name: brief.org, url: brief.website || undefined },
    publisher: { '@type': 'Organization', name: brief.org, url: brief.website || undefined },
    description: pr.paragraphs[0].slice(0, 300), image: imageUrl || undefined,
  };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const para = (t) => (t.startsWith('Key facts:') ? `<p><strong>Key facts</strong></p><ul>${t.split('\n').slice(1).map((l) => `<li>${escapeHtml(l.replace(/^•\s*/, ''))}</li>`).join('')}</ul>` : `<p>${escapeHtml(t)}</p>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(pr.headline)} | ${escapeHtml(brief.org)} newsroom</title>
<meta name="description" content="${escapeHtml(pr.paragraphs[0].slice(0, 155))}">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(brief.org)} news" href="rss.xml">
<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(pr.headline)}">
<meta property="og:description" content="${escapeHtml(pr.subhead || pr.paragraphs[0].slice(0, 155))}"><meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>
<style>
:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--acc:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9da7b3;--line:#30363d;--acc:#7aa2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 Georgia,'Times New Roman',serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
.kicker{font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
h1{font:700 32px/1.2 system-ui,sans-serif;margin:8px 0 12px}h2{font:700 20px/1.3 system-ui,sans-serif;margin-top:40px}
.sub{font-size:19px;color:var(--muted);margin:0 0 24px}a{color:var(--acc)}
.facts li{margin:6px 0}.box{border-top:1px solid var(--line);margin-top:32px;padding-top:16px;white-space:pre-line;font:15px/1.6 system-ui,sans-serif}
dt{font-weight:700;font-family:system-ui,sans-serif;margin-top:14px}dd{margin:4px 0 0}
</style></head>
<body><main>
<div class="kicker">${escapeHtml(brief.org)} newsroom · <time datetime="${date}">${escapeHtml(apDate(new Date(launchAt), brief.timezone))}</time></div>
<article>
<h1>${escapeHtml(pr.headline)}</h1>
${pr.subhead ? `<p class="sub">${escapeHtml(pr.subhead)}</p>` : ''}
${pr.paragraphs.map(para).join('\n')}
<div class="box">${escapeHtml(pr.boilerplate)}</div>
<div class="box">${escapeHtml(pr.contact)}</div>
</article>
<section><h2>Fact sheet</h2><ul class="facts">${factSheet.facts.map((f) => `<li>${escapeHtml(f.text)}</li>`).join('')}</ul></section>
<section><h2>Questions and answers</h2><dl>${faq.map((f) => `<dt>${escapeHtml(f.q)}</dt><dd>${escapeHtml(f.a)}</dd>`).join('')}</dl></section>
</main></body></html>`;
}
