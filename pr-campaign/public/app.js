// Relay UI — vanilla JS, no build step. All text is inserted via textContent (no HTML injection).
const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'content-type': typeof opts.body === 'string' ? 'text/csv' : 'application/json' } : {},
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

async function busy(btn, label, fn) {
  const old = [...btn.childNodes];
  btn.disabled = true; btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` ${label}`);
  try { return await fn(); } catch (e) { toast(e.message); throw e; } finally { btn.disabled = false; btn.replaceChildren(...old); }
}

const fmt = {
  n: (x) => (x == null ? '—' : Number(x).toLocaleString()),
  compact: (x) => (x == null ? '—' : new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 2 }).format(x)),
  money: (x) => (x == null ? '—' : `$${Number(x).toLocaleString(undefined, { maximumFractionDigits: x < 10 ? 2 : 0 })}`),
  range: (a, b, f = fmt.n) => (a === b ? f(a) : `${f(a)}–${f(b)}`),
  dt: (iso, tz) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso)),
};
const chip = (text, kind = '') => h('span', { class: `chip ${kind}` }, text);
const statusKind = { draft: '', ready: 'acc', approved: 'acc', live: 'warn', monitoring: 'ok', complete: 'ok' };

// ------------------------------------------------------------------ chrome

async function loadStatus() {
  try {
    const s = await api('status');
    $('#status').replaceChildren(
      chip(s.writer.name === 'claude' ? `Writer: Claude` : 'Writer: offline', s.writer.name === 'claude' ? 'ok' : ''),
      chip(`Email: ${s.email}`, s.email === 'outbox' ? '' : 'ok'),
      chip(`Discovery: ${s.discovery}`),
      chip(`${s.contacts} contacts`),
    );
    return s;
  } catch { $('#status').replaceChildren(chip('Server offline', 'err')); }
}

async function loadList(activeId) {
  const list = await api('campaigns').catch(() => []);
  $('#campaigns').replaceChildren(...(list.length ? list.map((c) => h('li', {},
    h('a', { href: `#/c/${c.id}`, class: c.id === activeId ? 'active' : '' },
      h('span', { class: 'cname' }, c.name),
      h('span', { class: 'row' }, chip(c.status, statusKind[c.status]), c.mode === 'test' ? chip('test') : chip('live', 'warn'),
        h('span', { class: 'muted small' }, new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })))))) : [h('li', { class: 'muted small' }, 'No campaigns yet.')]));
}

// ------------------------------------------------------------------ new campaign

let knowledge = null;
async function viewNew() {
  knowledge ||= await api('knowledge').catch(() => ({ sample: null, topics: [] }));
  const f = (name, label, attrs = {}, hint) => h('label', { class: attrs.full ? 'full' : '' }, label, hint ? h('span', { class: 'hint' }, hint) : null,
    attrs.textarea ? h('textarea', { name, rows: attrs.rows || 3, placeholder: attrs.placeholder || '' }) : h('input', { name, type: attrs.type || 'text', placeholder: attrs.placeholder || '' }));

  const form = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'card stack' },
      h('label', {}, 'What’s the news?', h('span', { class: 'hint' }, 'One or two sentences is enough. Relay works out the topic, angle, media, channels and timing.'),
        h('textarea', { name: 'news', class: 'big', required: true, placeholder: 'e.g. Acme Robotics launches Pathfinder, a warehouse robot that cuts picking time by 30%, available today for $2,400 a month.' })),
      h('label', {}, 'Organisation', h('input', { name: 'org', type: 'text', placeholder: 'Acme Robotics' }))),
    h('details', { class: 'more' }, h('summary', {}, 'Add details (optional — each one improves the result)'),
      h('div', { class: 'fields' },
        f('website', 'Website', { type: 'url', placeholder: 'https://…' }),
        f('productUrl', 'Product / announcement link', { type: 'url' }),
        f('city', 'City (dateline)', { placeholder: 'Austin' }),
        f('regionName', 'State / country', { placeholder: 'Texas' }),
        f('spokespersonName', 'Spokesperson name'),
        f('spokespersonTitle', 'Spokesperson title', { placeholder: 'CEO and co-founder' }),
        f('contactName', 'Media contact name'),
        f('contactEmail', 'Media contact email', { type: 'email' }),
        f('facts', 'More facts (one per line)', { textarea: true, rows: 4, full: true, placeholder: 'Numbers, dates, prices, customers, partners — only what is true.' }),
        f('quote', 'Spokesperson quote', { textarea: true, rows: 2, full: true }, 'Leave empty and Relay drafts one for approval.'),
        f('about', 'About the organisation (boilerplate)', { textarea: true, rows: 2, full: true }),
        f('audience', 'Who is it for?', { placeholder: 'city commuters who want to drive less' }),
        f('launchAt', 'Announcement date', { type: 'date' }, 'Empty = next good Tue–Thu slot.'),
        h('label', {}, 'Budget', h('select', { name: 'budget' }, h('option', { value: 'free' }, 'Free — owned, earned and social only'), h('option', { value: 'lean', selected: true }, 'Lean — add a value wire where it helps'), h('option', { value: 'full' }, 'Full — tier-1 wire when the story warrants'))),
        h('label', {}, 'Region', h('select', { name: 'region' }, ...['us', 'uk', 'eu', 'ca', 'au', 'fi', 'de', 'fr', 'se', 'in', 'sg', 'jp'].map((r) => h('option', { value: r }, r.toUpperCase())))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'publicCompany' }), 'Publicly listed company (enables disclosure rules)'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'claimsSubstantiated' }), 'Superlative claims (“first”, “only”) are substantiated'),
      )),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: (e) => submit(e.currentTarget, false) }, 'Build campaign'),
      h('button', { class: 'btn', type: 'button', onclick: (e) => submit(e.currentTarget, true) }, 'Run full test campaign'),
      knowledge.sample ? h('button', { class: 'btn', type: 'button', onclick: fillSample }, 'Use sample brief') : null),
    h('p', { class: 'muted small' }, 'New campaigns run in test mode: nothing is sent to journalists until you approve and switch to live with compliance checks passing.'));

  function readForm() {
    const d = Object.fromEntries(new FormData(form));
    return {
      news: d.news, org: d.org, website: d.website, productUrl: d.productUrl, city: d.city, regionName: d.regionName, region: d.region,
      spokesperson: { name: d.spokespersonName, title: d.spokespersonTitle }, contact: { name: d.contactName, email: d.contactEmail },
      facts: d.facts, quote: d.quote, about: d.about, audience: d.audience, launchAt: d.launchAt, budget: d.budget,
      publicCompany: Boolean(d.publicCompany), claimsSubstantiated: Boolean(d.claimsSubstantiated),
    };
  }
  function fillSample() {
    const s = knowledge.sample;
    const set = (n, v) => { const el = form.elements[n]; if (el) el.value = v || ''; };
    set('news', s.news); set('org', s.org); set('website', s.website); set('city', s.city); set('regionName', s.regionName);
    set('spokespersonName', s.spokesperson.name); set('spokespersonTitle', s.spokesperson.title); set('contactName', s.contact.name); set('contactEmail', s.contact.email);
    set('facts', s.facts.join('\n')); set('about', s.about); set('audience', s.audience);
    form.querySelector('details').open = true;
  }
  async function submit(btn, fullTest) {
    const brief = readForm();
    if (!brief.news.trim()) { toast('Write a sentence about the news first.'); form.elements.news.focus(); return; }
    const c = await busy(btn, fullTest ? 'Running test campaign…' : 'Building campaign…', () => api(fullTest ? 'test-campaign' : 'campaigns', { method: 'POST', body: { brief } }));
    location.hash = `#/c/${c.id}${fullTest ? '/results' : ''}`;
  }
  main.replaceChildren(h('div', { class: 'wrap stack' },
    h('div', { class: 'hero' }, h('h1', {}, 'New PR campaign'), h('p', { class: 'muted' }, 'From one sentence to a standards-checked campaign: release, targeted media list, personalised pitches, social, newsroom page and a launch plan.')),
    form));
  form.elements.news.focus();
}

// ------------------------------------------------------------------ campaign view

const TABS = [['overview', 'Overview'], ['assets', 'Assets'], ['media', 'Media list'], ['launch', 'Approve & launch'], ['results', 'Results']];

async function viewCampaign(id, tab = 'overview') {
  let c;
  try { c = await api(`campaigns/${id}`); } catch (e) { main.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
  await loadList(id);
  const body = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...TABS.map(([k, label]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { location.hash = `#/c/${id}/${k}`; } }, label)));
  const headerChips = h('div', { class: 'row' }, chip(c.analysis.topic.label, 'acc'), chip(c.status, statusKind[c.status]), c.mode === 'test' ? chip('test mode') : chip('LIVE', 'warn'), chip(`QA ${c.qa.score}/100`, c.qa.errors ? 'err' : c.qa.warnings ? 'warn' : 'ok'), chip(`Writer: ${c.writer?.name || 'offline'}`));
  main.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'spread' }, h('div', {}, h('h1', {}, c.name), h('p', { class: 'muted' }, c.brief.news)), headerChips),
    c.mode === 'test' ? h('div', { class: 'banner test' }, 'Test mode — every message goes to the local outbox. No journalist will be contacted.') : null,
    tabs, body));
  const render = { overview, assets, media, launch, results }[tab] || overview;
  body.append(await render(c));
}

function stat(label, value, sub) { return h('div', { class: 'card stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null); }

function overview(c) {
  const nw = c.analysis.newsworthiness;
  const e = c.estimates;
  const names = { timeliness: 'Timeliness', impact: 'Impact', novelty: 'Novelty', prominence: 'Prominence', proximity: 'Proximity', human: 'Human interest', conflict: 'Tension / trend' };
  return h('div', { class: 'stack' },
    h('div', { class: 'grid4' },
      stat('News value', `${nw.score}/100`, nw.verdict),
      stat('Expected placements', fmt.range(e.placements.low, e.placements.high), `estimate · mid ${e.placements.mid}`),
      stat('Earned reach', fmt.range(e.earnedReach.low, e.earnedReach.high, fmt.compact), 'tier-weighted estimate'),
      stat('Cost', fmt.range(e.cost.total[0], e.cost.total[1], fmt.money), `agency ≈ ${fmt.range(e.benchmark.cost[0], e.benchmark.cost[1], fmt.money)}/mo`)),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'News judgement'), h('p', {}, nw.advice),
        h('div', { class: 'values' }, ...Object.entries(nw.values).map(([k, v]) => h('div', { class: 'v' }, h('span', {}, names[k]), h('div', { class: 'meter', role: 'meter', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': names[k] }, h('span', { style: `width:${v}%` })), h('span', { class: 'num muted' }, v)))),
        nw.improvements.length ? h('div', { style: 'margin-top:12px' }, h('h3', {}, 'Strengthen the story'), h('ul', { class: 'small' }, ...nw.improvements.map((i) => h('li', {}, i.tip)))) : null),
      h('div', { class: 'card' }, h('h2', {}, 'Launch sequence'),
        h('ol', { class: 'timeline' }, ...c.plan.timeline.map((s) => h('li', {}, h('span', { class: 'num muted' }, fmt.dt(s.at, c.brief.timezone)), h('span', {}, s.label)))),
        c.plan.notes.length ? h('div', { style: 'margin-top:10px' }, ...c.plan.notes.map((n) => h('p', { class: 'small muted' }, n))) : null)),
    h('div', { class: 'card' }, h('h2', {}, 'Channel mix'), h('p', { class: 'small muted' }, `Topic: ${c.analysis.topic.label} (confidence ${Math.round(c.analysis.confidence * 100)}%). Beats: ${c.analysis.beats.join(', ')}.`),
      h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Channel'), h('th', {}, 'Role'), h('th', {}, 'How'), h('th', {}, 'Cost'), h('th', {}, 'Why'))),
        h('tbody', {}, ...c.plan.channels.map((ch) => h('tr', {}, h('td', {}, ch.label), h('td', {}, chip(ch.role, ch.role === 'primary' ? 'acc' : '')), h('td', {}, chip({ auto: 'Relay sends', assisted: 'Relay prepares', manual: 'copy provided' }[ch.automation])), h('td', { class: 'num' }, ch.cost[1] ? fmt.range(ch.cost[0], ch.cost[1], fmt.money) : 'free'), h('td', { class: 'muted' }, ch.why))))))),
    h('div', { class: 'card' }, h('h2', {}, 'Speed and cost vs a traditional agency'),
      h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Relay'), h('th', {}, e.benchmark.label))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Brief → campaign kit'), h('td', { class: 'num' }, `${((c.timings?.buildMs || 0) / 1000).toFixed(1)} s`), h('td', { class: 'num' }, `${e.benchmark.daysBriefToLaunch[0]}–${e.benchmark.daysBriefToLaunch[1]} days`)),
          h('tr', {}, h('td', {}, 'Cost'), h('td', { class: 'num' }, `${fmt.range(e.cost.total[0], e.cost.total[1], fmt.money)} (AI ${fmt.money(e.cost.ai)} + distribution)`), h('td', { class: 'num' }, `${fmt.range(e.benchmark.cost[0], e.benchmark.cost[1], fmt.money)} per month`)),
          h('tr', {}, h('td', {}, 'Media list'), h('td', {}, `${c.targets.length} relevance-ranked targets, one per outlet`), h('td', {}, 'Database seat + manual list building'))))),
      h('p', { class: 'small muted', style: 'margin-top:8px' }, e.method)));
}

function qaPanel(c) {
  const failing = c.qa.checks.filter((x) => !x.pass);
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h2', {}, `Quality check: ${c.qa.passed}/${c.qa.total} passed`), h('div', { class: 'row' }, chip(`${c.qa.errors} blocking`, c.qa.errors ? 'err' : 'ok'), chip(`${c.qa.warnings} warnings`, c.qa.warnings ? 'warn' : 'ok'))),
    failing.length ? h('ul', { class: 'qa-list' }, ...failing.map((x) => h('li', {}, chip(x.id, x.severity === 'error' ? 'err' : 'warn'), h('span', {}, h('strong', {}, `${x.asset}: `), x.message))))
      : h('p', { class: 'muted' }, 'Every asset meets the house standards.'),
    c.assets.pressRelease.quotes?.some((q) => q.draft) ? h('p', { class: 'small', style: 'margin-top:8px' }, chip('Draft quote', 'warn'), ' The spokesperson quote was drafted by Relay — get it approved by the spokesperson before launch.') : null);
}

async function patch(c, body, btn, msg = 'Saved') {
  await busy(btn, 'Saving…', () => api(`campaigns/${c.id}`, { method: 'PATCH', body }));
  toast(msg); route();
}

function assets(c) {
  const A = c.assets;
  const pane = h('div', {});
  const sections = {
    release: () => {
      const head = h('input', { type: 'text', value: A.pressRelease.headline });
      const sub = h('input', { type: 'text', value: A.pressRelease.subhead });
      const body = h('textarea', { rows: 16, value: A.pressRelease.paragraphs.join('\n\n') });
      const about = h('textarea', { rows: 3, value: A.pressRelease.boilerplate });
      return h('div', { class: 'card stack' },
        h('label', {}, 'Headline', head), h('label', {}, 'Subhead', sub), h('label', {}, 'Body (blank line between paragraphs)', body), h('label', {}, 'Boilerplate', about),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: (e) => patch(c, { pressRelease: { headline: head.value.trim(), subhead: sub.value.trim(), paragraphs: body.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), boilerplate: about.value.trim() } }, e.currentTarget, 'Release saved — QA re-run') }, 'Save & re-check'),
          h('a', { class: 'btn', href: `/api/campaigns/${c.id}/outbox`, onclick: (e) => { e.preventDefault(); navigator.clipboard?.writeText(A.releaseText).then(() => toast('Release copied')); } }, 'Copy plain text')));
    },
    pitches: () => {
      const all = [...A.pitches, ...A.followUps];
      const sel = h('select', {}, ...all.map((p, i) => h('option', { value: i }, `${p.stage.replace(/_/g, ' ')} → ${p.outlet}${p.conditional ? ' (if previous declines)' : ''}`)));
      const subj = h('input', { type: 'text' });
      const body = h('textarea', { rows: 14 });
      const count = h('div', { class: 'counter' });
      const meta = h('p', { class: 'small muted' });
      const show = () => { const p = all[sel.value]; subj.value = p.subject; body.value = p.body; meta.textContent = `To ${p.name} <${p.email}> · send ${fmt.dt(p.sendAt, c.brief.timezone)}${p.demo ? ' · demo desk address (never delivered)' : ''}`; upd(); };
      const upd = () => { const w = body.value.trim().split(/\s+/).length; count.textContent = `${w}/200 words · subject ${subj.value.length}/60`; count.classList.toggle('over', w > 200 || subj.value.length > 60); };
      body.addEventListener('input', upd); subj.addEventListener('input', upd); sel.addEventListener('change', show);
      setTimeout(show);
      return h('div', { class: 'card stack' }, h('p', { class: 'muted small' }, `${A.pitches.length} pitches + ${A.followUps.length} follow-ups, each personalised to the reporter’s beat or recent article.`),
        h('label', {}, 'Pitch', sel), meta, h('label', {}, 'Subject', subj), h('label', {}, 'Body', body), count,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: (e) => { const p = all[sel.value]; patch(c, { pitch: { id: p.id, subject: subj.value, body: body.value } }, e.currentTarget, 'Pitch saved'); } }, 'Save pitch')));
    },
    social: () => {
      const limits = { x: 280, bluesky: 300, threads: 500, mastodon: 500, linkedin: 3000 };
      const areas = {};
      const cards = Object.entries(A.social).map(([k, v]) => {
        const ta = h('textarea', { rows: k === 'linkedin' ? 10 : 4, value: v.text });
        const cnt = h('div', { class: 'counter' });
        const upd = () => { const n = ta.value.replace('{link}', 'x'.repeat(23)).length; cnt.textContent = `${n}/${limits[k]}`; cnt.classList.toggle('over', n > limits[k]); };
        ta.addEventListener('input', upd); upd(); areas[k] = ta;
        return h('label', {}, k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1), ta, cnt);
      });
      return h('div', { class: 'card stack' }, h('p', { class: 'muted small' }, '{link} becomes a tracked newsroom link with UTM tags per platform.'), ...cards,
        h('button', { class: 'btn primary', onclick: (e) => patch(c, { social: Object.fromEntries(Object.entries(areas).map(([k, t]) => [k, t.value])) }, e.currentTarget, 'Social copy saved') }, 'Save social copy'));
    },
    newsroom: () => h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `Publishes to ${A.newsroomUrl} with NewsArticle + FAQ structured data, RSS, sitemap and llms.txt.`),
      h('iframe', { class: 'preview', title: 'Newsroom page preview', src: `/api/campaigns/${c.id}/newsroom-preview`, sandbox: '' })),
    facts: () => h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'Fact sheet (single source of truth)'), h('ul', {}, ...A.factSheet.facts.map((f) => h('li', {}, f.text)))),
      h('div', { class: 'card' }, h('h2', {}, 'FAQ for search and AI assistants'), ...A.faq.map((f) => h('div', { style: 'margin-bottom:10px' }, h('strong', {}, f.q), h('div', {}, f.a))))),
    wire: () => A.wire ? h('div', { class: 'card stack' }, h('h2', {}, 'Wire package'),
      h('p', {}, `Release at ${A.wire.releaseAtLocal}. Recommended: ${A.wire.services.map((s) => `${s.label} (${fmt.range(s.cost[0], s.cost[1], fmt.money)})`).join('; ')}.`),
      h('ul', { class: 'small' }, ...A.wire.checklist.map((x) => h('li', {}, x))), h('div', { class: 'pre mono' }, A.wire.text))
      : h('div', { class: 'card' }, h('p', {}, 'No wire in this plan — the topic and budget don’t justify one. Coverage will come from direct pitches; indexing from the newsroom page.')),
    extras: () => h('div', { class: 'stack' },
      A.newsletter ? h('div', { class: 'card' }, h('h2', {}, 'Newsletter to your own list'), h('p', {}, h('strong', {}, 'Subject: '), A.newsletter.subject), h('div', { class: 'pre' }, A.newsletter.body)) : null,
      ...Object.values(A.extras || {}).map((x) => h('div', { class: 'card' }, h('h2', {}, x.title), h('div', { class: 'pre' }, x.text)))),
  };
  const labels = { release: 'Press release', pitches: 'Pitches', social: 'Social', newsroom: 'Newsroom page', facts: 'Fact sheet & FAQ', wire: 'Wire', extras: 'Newsletter & more' };
  const bar = h('div', { class: 'subtabs', role: 'group', 'aria-label': 'Asset type' });
  const show = (k) => { for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.k === k)); pane.replaceChildren(sections[k]()); };
  for (const [k, l] of Object.entries(labels)) bar.append(h('button', { 'data-k': k, onclick: () => show(k) }, l));
  show('release');
  return h('div', { class: 'stack' }, qaPanel(c), bar, pane);
}

function media(c) {
  return h('div', { class: 'stack' },
    h('div', { class: 'spread' },
      h('p', { class: 'muted' }, `${c.targets.length} targets from ${c.targeting.poolSize} candidates. Excluded: ${Object.entries(c.targeting.excluded).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ') || 'none'}. Live discovery: ${c.discovery.ok ? `${c.discovery.articleCount} recent articles` : c.discovery.reason || 'off'}.`),
      h('div', { class: 'row' }, h('a', { class: 'btn sm', href: `/api/campaigns/${c.id}/media-list.csv`, download: 'media-list.csv' }, 'Export CSV'), h('a', { class: 'btn sm', href: '#/contacts' }, 'Import contacts'),
        !c.jobs?.length ? h('button', { class: 'btn sm', onclick: (e) => patch(c, { retarget: true }, e.currentTarget, 'Media list rebuilt') }, 'Rebuild list') : null)),
    c.targeting.demoUsed ? h('div', { class: 'banner test' }, 'Outlet news desks with .test addresses fill gaps for testing. Import your own journalist contacts (CSV) to run live.') : null,
    h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Outlet'), h('th', {}, 'Contact'), h('th', {}, 'Tier'), h('th', {}, 'Score'), h('th', {}, 'Role'), h('th', {}, 'Why'))),
      h('tbody', {}, ...c.targets.map((t, i) => h('tr', {}, h('td', { class: 'num muted' }, i + 1), h('td', {}, t.outlet), h('td', {}, t.name, h('div', { class: 'muted small' }, t.email)), h('td', { class: 'num' }, t.tier), h('td', { class: 'num' }, t.score),
        h('td', {}, chip(t.role.replace(/_/g, ' '), t.role === 'exclusive' ? 'acc' : '')), h('td', { class: 'muted' }, t.reason)))))));
}

async function launch(c) {
  const comp = await api(`campaigns/${c.id}/compliance`);
  const outbox = await api(`campaigns/${c.id}/outbox`).catch(() => []);
  const legal = h('input', { type: 'checkbox', checked: c.compliance?.legalBasis === 'legitimate_interest' });
  const addr = h('input', { type: 'text', value: c.brief.postalAddress, placeholder: 'Street, city, postcode, country' });
  const sName = h('input', { type: 'text', value: c.brief.sender.name });
  const sEmail = h('input', { type: 'email', value: c.brief.sender.email });
  const steps = h('div', { class: 'grid2' },
    h('div', { class: 'card stack' }, h('h2', {}, '1. Mode'),
      h('p', {}, c.mode === 'test' ? 'Test: the full sequence runs immediately into the outbox, with simulated replies and coverage. Safe to run any time.' : 'Live: pitches go to real reporters on schedule (Tue–Thu mornings in their time zone), throttled, with follow-ups and opt-outs handled.'),
      ['live', 'monitoring', 'complete'].includes(c.status) ? null : h('button', { class: 'btn', onclick: (e) => patch(c, { mode: c.mode === 'test' ? 'live' : 'test' }, e.currentTarget, `Switched to ${c.mode === 'test' ? 'live' : 'test'} mode`) }, c.mode === 'test' ? 'Switch to live mode…' : 'Switch back to test mode')),
    h('div', { class: 'card stack' }, h('h2', {}, '2. Sender & compliance'),
      h('label', {}, 'Sender name', sName), h('label', {}, 'Sender email', sEmail), h('label', {}, 'Postal address (CAN-SPAM)', addr),
      h('label', { class: 'check' }, legal, 'We contact journalists under legitimate interest (GDPR Art. 6(1)(f)) and honour every opt-out immediately.'),
      h('button', { class: 'btn', onclick: (e) => patch(c, { brief: { postalAddress: addr.value, sender: { name: sName.value, email: sEmail.value } }, compliance: { legalBasis: legal.checked ? 'legitimate_interest' : '' } }, e.currentTarget, 'Compliance details saved') }, 'Save')));
  const checks = h('div', { class: 'card' }, h('h2', {}, c.mode === 'live' ? '3. Live launch checks' : '3. Checks (required for live mode)'),
    h('ul', { class: 'qa-list' }, ...comp.checks.map((x) => h('li', {}, chip(x.pass ? 'pass' : 'todo', x.pass ? 'ok' : c.mode === 'live' ? 'err' : ''), h('span', {}, x.label)))));
  const actions = h('div', { class: 'card stack' }, h('h2', {}, '4. Approve and launch'),
    h('p', {}, c.approvedAt ? `Approved by ${c.approvedBy} on ${fmt.dt(c.approvedAt)}.` : 'Review the assets and media list, then approve. Nothing is sent before approval (DS-2).'),
    h('div', { class: 'row' },
      !c.approvedAt ? h('button', { class: 'btn primary', onclick: (e) => busy(e.currentTarget, 'Approving…', () => api(`campaigns/${c.id}/approve`, { method: 'POST', body: {} })).then(() => { toast('Approved'); route(); }) }, 'Approve campaign') : null,
      c.approvedAt && !c.jobs?.length ? h('button', { class: 'btn primary', onclick: (e) => busy(e.currentTarget, 'Launching…', () => api(`campaigns/${c.id}/launch`, { method: 'POST', body: {} })).then(() => { toast('Launched'); location.hash = `#/c/${c.id}/launch`; route(); }) }, c.mode === 'test' ? 'Launch test run' : 'Launch live campaign') : null,
      c.mode === 'live' && c.status === 'live' ? h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, 'Sending…', () => api(`campaigns/${c.id}/run-due`, { method: 'POST', body: {} })).then(() => route()) }, 'Send due messages now') : null));
  const counts = (c.jobs || []).reduce((m, j) => ({ ...m, [j.status]: (m[j.status] || 0) + 1 }), {});
  const jobs = c.jobs?.length ? h('details', { class: 'card', open: c.jobs.length <= 25 }, h('summary', {}, h('strong', {}, `Send log — ${c.jobs.length} items`), ' ', ...Object.entries(counts).map(([k, v]) => chip(`${v} ${k}`, { done: 'ok', failed: 'err', pending: 'warn' }[k] || ''))),
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Item'), h('th', {}, 'Due'), h('th', {}, 'Status'))),
      h('tbody', {}, ...c.jobs.map((j) => h('tr', {}, h('td', {}, j.stage.replace(/_/g, ' ')), h('td', {}, `${j.type}: ${j.ref.replace(/^[a-z_]+:/, '')}`), h('td', { class: 'num muted' }, fmt.dt(j.dueAt, c.brief.timezone)),
        h('td', {}, chip(j.status, { done: 'ok', skipped: '', failed: 'err', pending: 'warn' }[j.status]), j.reason ? h('div', { class: 'small muted' }, j.reason) : null)))))))
    : null;
  const files = outbox.length ? h('details', { class: 'card' }, h('summary', {}, h('strong', {}, `Outbox — ${outbox.length} files`), ' ', h('span', { class: 'muted small' }, 'every email (.eml), post and wire file Relay produced')), h('ul', { class: 'small' }, ...outbox.slice(0, 200).map((f) => h('li', {}, h('a', { href: `/api/campaigns/${c.id}/outbox/${f}`, target: '_blank', rel: 'noopener' }, f))))) : null;
  return h('div', { class: 'stack' }, steps, checks, actions, jobs, files);
}

function results(c) {
  const launched = Boolean(c.jobs?.length);
  const url = h('input', { type: 'url', placeholder: 'https://…' });
  const title = h('input', { type: 'text', placeholder: 'Headline' });
  const outlet = h('input', { type: 'text', placeholder: 'Outlet' });
  const tsel = h('select', {}, ...c.targets.map((t) => h('option', { value: t.id }, `${t.outlet} — ${t.name}`)));
  const ksel = h('select', {}, ...[['interested', 'Interested / wants interview'], ['declined', 'Declined'], ['question', 'Question'], ['not_my_beat', 'Not my beat (suppress)'], ['opt_out', 'Opt-out (suppress)']].map(([v, l]) => h('option', { value: v }, l)));
  return h('div', { class: 'stack' },
    !launched ? h('div', { class: 'card' }, h('p', {}, 'Launch the campaign to see results.')) : null,
    launched ? h('div', { class: 'row' },
      c.mode === 'test' && !c.simulation ? h('button', { class: 'btn primary', onclick: (e) => busy(e.currentTarget, 'Simulating…', () => api(`campaigns/${c.id}/simulate`, { method: 'POST', body: {} })).then(() => route()) }, 'Simulate outcomes') : null,
      h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, 'Searching news…', () => api(`campaigns/${c.id}/monitor`, { method: 'POST', body: {} })).then((r) => { toast(r.ok ? `Found ${r.found} mention(s), ${r.added} new` : `Monitoring unavailable: ${r.reason}`); route(); }) }, 'Check coverage now'),
      h('a', { class: 'btn', href: `/api/campaigns/${c.id}/report.html`, target: '_blank', rel: 'noopener' }, 'Open report'),
      h('a', { class: 'btn', href: `/api/campaigns/${c.id}/export.json`, download: `${c.id}.json` }, 'Export JSON')) : null,
    launched ? h('iframe', { class: 'preview', title: 'Campaign report', src: `/api/campaigns/${c.id}/report.html`, style: 'height:900px' }) : null,
    launched ? h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', {}, 'Log a reply'), h('label', {}, 'Reporter', tsel), h('label', {}, 'Reply', ksel),
        h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api(`campaigns/${c.id}/replies`, { method: 'POST', body: { targetId: tsel.value, kind: ksel.value } })).then(() => { toast('Reply logged'); route(); }) }, 'Save reply')),
      h('div', { class: 'card stack' }, h('h2', {}, 'Add coverage'), h('label', {}, 'URL', url), h('label', {}, 'Headline', title), h('label', {}, 'Outlet', outlet),
        h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api(`campaigns/${c.id}/coverage`, { method: 'POST', body: { url: url.value, title: title.value, outlet: outlet.value } })).then(() => { toast('Coverage added'); route(); }) }, 'Add'))) : null);
}

// ------------------------------------------------------------------ contacts

async function viewContacts() {
  const [contacts, supp] = await Promise.all([api('contacts'), api('suppression')]);
  const csv = h('textarea', { rows: 8, class: 'mono', placeholder: 'name,email,outlet,domain,beats,timezone,recent_article_title,recent_article_url,recent_article_date\nAlex Kim,alex@example-news.com,Example News,example-news.com,transport;climate,America/Chicago,"Cities add protected bike lanes",https://…,2026-11-02' });
  const file = h('input', { type: 'file', accept: '.csv,text/csv' });
  file.addEventListener('change', async () => { csv.value = await file.files[0].text(); });
  const email = h('input', { type: 'email', placeholder: 'reporter@outlet.com or @domain.com' });
  main.replaceChildren(h('div', { class: 'wrap stack' },
    h('div', {}, h('h1', {}, 'Contacts & suppression'), h('p', { class: 'muted' }, 'Bring your own journalist list (export from Muck Rack, Cision, Apollo or a spreadsheet). Beats drive relevance; a recent article title enables personalised openers.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Import CSV'), file, csv,
      h('button', { class: 'btn primary', onclick: (e) => busy(e.currentTarget, 'Importing…', () => api('contacts/import', { method: 'POST', body: csv.value })).then((r) => { toast(`Added ${r.added}, updated ${r.updated}, rejected ${r.rejected}`); viewContacts(); loadStatus(); }) }, 'Import')),
    h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, `${contacts.length} contacts`), h('a', { class: 'btn sm', href: '/api/contacts/export.csv', download: 'contacts.csv' }, 'Export')),
      contacts.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Outlet'), h('th', {}, 'Beats'), h('th', {}, 'Email'))),
        h('tbody', {}, ...contacts.map((x) => h('tr', {}, h('td', {}, x.name), h('td', {}, x.outlet), h('td', {}, (x.beats || []).join(', ')), h('td', {}, x.email)))))) : h('p', { class: 'muted' }, 'No contacts yet. Test campaigns use outlet news desks with undeliverable .test addresses.')),
    h('div', { class: 'card stack' }, h('h2', {}, `Suppression list (${supp.length})`), h('p', { class: 'small muted' }, 'Opt-outs and “not my beat” replies are added automatically and never pitched again (TG-5, OP-7).'),
      h('div', { class: 'row' }, email, h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api('suppression', { method: 'POST', body: { email: email.value } })).then(() => viewContacts()) }, 'Suppress')),
      supp.length ? h('ul', { class: 'small' }, ...supp.map((s) => h('li', {}, `${s.email} — ${s.reason}`))) : null)));
}

// ------------------------------------------------------------------ router

async function route() {
  const [, kind, id, tab] = location.hash.replace(/^#/, '').split('/');
  if (kind === 'c' && id) return viewCampaign(id, tab);
  await loadList();
  if (kind === 'contacts') return viewContacts();
  return viewNew();
}
window.addEventListener('hashchange', () => { route(); main.focus({ preventScroll: true }); });
loadStatus();
route();
