// Relay UI — Editorial design, keyboard-first. Vanilla JS, no build step.
// All dynamic text goes through textContent (no HTML injection).
const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl ';

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
const kbd = (s) => h('kbd', {}, s.replace('⌘', MOD));

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
  if (!btn) return fn();
  const old = [...btn.childNodes];
  btn.disabled = true; btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` ${label}`);
  try { return await fn(); } catch (e) { toast(e.message); throw e; } finally { btn.disabled = false; btn.replaceChildren(...old); }
}

const fmt = {
  n: (x) => (x == null ? '—' : Number(x).toLocaleString()),
  compact: (x) => (x == null ? '—' : new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 2 }).format(x)),
  money: (x) => (x == null ? '—' : `$${Number(x).toLocaleString(undefined, { maximumFractionDigits: x < 10 ? 2 : 0 })}`),
  range: (a, b, f = fmt.n) => (f(a) === f(b) ? f(a) : `${f(a)}–${f(b)}`),
  day: (iso, tz) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso)),
  time: (iso, tz) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
  dt: (iso, tz) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso)),
  ago: (iso) => { const d = (Date.now() - new Date(iso)) / 60000; return d < 60 ? `${Math.max(1, Math.round(d))} min ago` : d < 1440 ? `${Math.round(d / 60)} h ago` : `${Math.round(d / 1440)} d ago`; },
};
const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
const STATUS = { draft: ['Draft', ''], ready: ['Awaiting approval', 'acc'], approved: ['Approved', 'acc'], live: ['Sending', 'warn'], monitoring: ['Monitoring', 'ok'], complete: ['Complete', 'ok'] };

// ------------------------------------------------------------------ app state & chrome

const state = { view: null, campaign: null, tab: null, primary: null, secondary: null, save: null, list: [], status: null };

async function loadStatus() {
  try { state.status = await api('status'); } catch { state.status = null; }
  renderMode();
}
function renderMode() {
  const live = state.campaign?.mode === 'live';
  $('#mode').replaceChildren(h('span', { class: `mode${live ? ' live' : ''}`, title: live ? 'Live: messages reach real reporters on schedule' : 'Test mode: every message goes to the local outbox' }, live ? 'Live campaign' : 'Test mode'));
}
function setNav(key) {
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}
async function loadList() { state.list = await api('campaigns').catch(() => []); return state.list; }
function render(...nodes) { main.replaceChildren(h('div', { class: 'page' }, ...nodes)); }

// ------------------------------------------------------------------ compose

let knowledge = null;
const ORG_VERBS = /\s(launches|launched|unveils|introduces|announces|raises|raised|acquires|appoints|names|hires|partners|opens|releases|debuts|wins|publishes|reports|expands|teams|joins|responds|will|is|has|today)\b/i;
function guessOrg(news) {
  const m = news.match(ORG_VERBS);
  if (!m || m.index === 0) return '';
  const head = news.slice(0, m.index).trim();
  return head.split(/\s+/).length <= 6 && /^[A-Z0-9]/.test(head) ? head.replace(/,$/, '') : '';
}
function guessCity(news) {
  const skip = /^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Europe|Asia|Africa|America|The)$/;
  for (const m of news.matchAll(/\b(?:in|to) ((?:[A-Z][a-z]+)(?:[ -][A-Z][a-z]+)?)\b/g)) if (!skip.test(m[1].split(' ')[0])) return m[1];
  return '';
}
function parseWhen(s) {
  const t = s.trim().toLowerCase();
  if (!t || /next|slot|auto/.test(t)) return '';
  const d = new Date();
  if (t === 'today' || t === 'now') return d.toISOString().slice(0, 10);
  if (t === 'tomorrow') return new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = days.findIndex((x) => t.startsWith(x.slice(0, 3)));
  if (wd >= 0 && /^[a-z]+$/.test(t)) { const n = (wd - d.getDay() + 7) % 7 || 7; return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10); }
  const p = new Date(/\d{4}/.test(t) ? s : `${s} ${d.getFullYear()}`);
  return isNaN(p) ? '' : new Date(p.getTime() - p.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const STEPS = ['Judge the story the way an editor would, and say how to make it stronger.', 'Pick the channels that fit this kind of story — and skip the ones that don’t.', 'Rank the reporters who covered the topic recently. One per outlet.', 'Write the release, pitches, posts and newsroom page — facts only.', 'Check all of it against 33 house standards.'];

async function viewNew() {
  state.view = 'new'; state.campaign = null; setNav('new'); renderMode();
  knowledge ||= await api('knowledge').catch(() => ({ sample: null }));
  const list = await loadList();
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  const news = h('textarea', { id: 'news', rows: 3, 'aria-label': 'The news, in a sentence', placeholder: 'Acme Robotics launches Pathfinder, a warehouse robot that cuts picking time by 30%, available today for $2,400 a month.' });
  const tok = (name, placeholder, label, size) => h('input', { class: 'tok', type: 'text', name, placeholder, 'aria-label': label, size, autocomplete: 'off' });
  const org = tok('org', 'your organisation', 'Organisation', 16);
  const city = tok('city', 'your city', 'City for the dateline', 10);
  const when = tok('when', 'the next good slot', 'Announcement date', 14);
  const spk = tok('spokesperson', 'a spokesperson', 'Spokesperson name', 12);
  const budget = h('select', { class: 'tok', name: 'budget', 'aria-label': 'Budget' }, h('option', { value: 'free' }, 'free'), h('option', { value: 'lean', selected: true }, 'lean'), h('option', { value: 'full' }, 'full'));
  const touched = new Set();
  for (const t of [org, city]) t.addEventListener('input', () => touched.add(t));
  news.addEventListener('input', () => {
    if (!touched.has(org)) org.value = guessOrg(news.value);
    if (!touched.has(city)) city.value = guessCity(news.value);
  });

  const f = (name, label, attrs = {}) => h('label', { class: `f${attrs.full ? ' full' : ''}` }, label,
    attrs.textarea ? h('textarea', { name, rows: attrs.rows || 3, placeholder: attrs.placeholder || '' }) : h('input', { name, type: attrs.type || 'text', placeholder: attrs.placeholder || '' }));
  const details = h('details', { class: 'more' }, h('summary', {}, 'Add facts, a quote and contact details', h('span', { class: 'muted small' }, ' — optional, each one strengthens the story')),
    h('div', { class: 'fields' },
      f('facts', 'More facts, one per line', { textarea: true, rows: 4, full: true, placeholder: 'Numbers, dates, prices, customers, partners — only what is true.' }),
      f('quote', 'Spokesperson quote', { textarea: true, rows: 2, full: true, placeholder: 'Leave empty and Relay drafts one for approval.' }),
      f('spokespersonTitle', 'Spokesperson title', { placeholder: 'CEO and co-founder' }),
      f('regionName', 'State or country', { placeholder: 'Texas' }),
      f('contactName', 'Media contact'),
      f('contactEmail', 'Media contact email', { type: 'email' }),
      f('website', 'Website', { type: 'url', placeholder: 'https://' }),
      f('productUrl', 'Announcement link', { type: 'url' }),
      f('about', 'About the organisation', { textarea: true, rows: 2, full: true }),
      f('audience', 'Who is it for?'),
      h('label', { class: 'f' }, 'Region', h('select', { name: 'region' }, ...['us', 'uk', 'eu', 'ca', 'au', 'fi', 'de', 'fr', 'se', 'in', 'sg', 'jp'].map((r) => h('option', { value: r }, r.toUpperCase())))),
      h('label', { class: 'check full' }, h('input', { type: 'checkbox', name: 'publicCompany' }), 'Publicly listed company — applies disclosure rules (tier-1 wire, no exclusives)'),
      h('label', { class: 'check full' }, h('input', { type: 'checkbox', name: 'claimsSubstantiated' }), 'Claims like “first” or “only” are substantiated'),
    ));
  const form = h('form', { onsubmit: (e) => e.preventDefault() }, details);
  const steps = h('ol', { class: 'steps' }, ...STEPS.map((s) => h('li', {}, s)));
  const buildBtn = h('button', { class: 'btn pri', type: 'button', onclick: () => submit(false) }, 'Build the campaign', kbd('⌘↵'));
  const testBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => submit(true) }, 'Run a full test', kbd('⇧⌘↵'));

  function readBrief() {
    const d = Object.fromEntries(new FormData(form));
    return {
      news: news.value, org: org.value, city: city.value, launchAt: parseWhen(when.value), budget: budget.value,
      spokesperson: { name: spk.value, title: d.spokespersonTitle }, contact: { name: d.contactName, email: d.contactEmail },
      regionName: d.regionName, region: d.region, website: d.website, productUrl: d.productUrl, facts: d.facts, quote: d.quote,
      about: d.about, audience: d.audience, publicCompany: Boolean(d.publicCompany), claimsSubstantiated: Boolean(d.claimsSubstantiated),
    };
  }
  function fillSample() {
    const s = knowledge.sample; if (!s) return;
    news.value = s.news; org.value = s.org; city.value = s.city; spk.value = s.spokesperson.name; touched.add(org); touched.add(city);
    const set = (n, v) => { if (form.elements[n]) form.elements[n].value = v || ''; };
    set('spokespersonTitle', s.spokesperson.title); set('regionName', s.regionName); set('contactName', s.contact.name); set('contactEmail', s.contact.email);
    set('website', s.website); set('facts', s.facts.join('\n')); set('about', s.about); set('audience', s.audience);
    details.open = true; news.focus();
  }
  async function submit(fullTest) {
    const brief = readBrief();
    if (!brief.news.trim()) { toast('Write a sentence about the news first.'); news.focus(); return; }
    const btn = fullTest ? testBtn : buildBtn;
    const items = [...steps.children];
    let i = 0;
    const tick = setInterval(() => { items.forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('on', k === i); }); i = Math.min(i + 1, items.length - 1); }, 450);
    try {
      const c = await busy(btn, fullTest ? 'Running the test…' : 'Building…', () => api(fullTest ? 'test-campaign' : 'campaigns', { method: 'POST', body: { brief } }));
      items.forEach((li) => { li.classList.add('done'); li.classList.remove('on'); });
      location.hash = `#/c/${c.id}/${fullTest ? 'results' : 'overview'}`;
    } finally { clearInterval(tick); }
  }
  state.primary = () => submit(false);
  state.secondary = () => submit(true);
  state.save = null;

  render(h('div', { class: 'compose' },
    h('section', {},
      h('div', { class: 'eyebrow' }, `New campaign · ${today}`),
      h('h1', { class: 'hero' }, 'What’s the ', h('em', {}, 'story'), '?'),
      h('div', { class: 'newsbox' }, h('div', { class: 'bar eyebrow' }, h('span', {}, 'The news, in a sentence'), h('span', {}, kbd('⌘↵'), ' to build')), news),
      h('p', { class: 'sentence' }, 'It’s from ', org, ' in ', city, ', announced ', when, ', with ', spk, ' speaking, on a ', budget, ' budget.'),
      form,
      h('div', { class: 'actions' }, buildBtn, testBtn, knowledge.sample ? h('button', { class: 'link', type: 'button', onclick: fillSample }, 'Use the sample brief') : null)),
    h('aside', { class: 'aside' },
      h('h3', {}, 'What Relay will do'), steps,
      h('p', { class: 'note' }, 'In test mode every message goes to your outbox. No journalist is contacted until you approve and go live.'),
      list.length ? h('div', { class: 'recent' }, h('div', { class: 'eyebrow', style: 'margin-bottom:6px' }, 'Recent campaigns'),
        ...list.slice(0, 4).map((c) => h('a', { href: `#/c/${c.id}` }, h('span', { class: 't' }, c.name), h('small', {}, (STATUS[c.status] || [c.status])[0])))) : null)));
  news.focus();
}

// ------------------------------------------------------------------ campaign

const TABS = [['overview', 'Overview'], ['assets', 'Assets'], ['media', 'Media list'], ['launch', 'Launch'], ['results', 'Results']];

async function viewCampaign(id, tab = 'overview') {
  let c;
  try { c = await api(`campaigns/${id}`); } catch (e) { render(h('div', { class: 'empty' }, h('h2', {}, 'Campaign not found'), h('p', {}, e.message))); return; }
  state.view = 'campaign'; state.campaign = c; state.tab = tab; state.save = null; state.secondary = null; setNav('campaigns'); renderMode();
  const [label, kind] = STATUS[c.status] || [c.status, ''];
  const body = h('div', {});
  render(
    h('div', { class: 'mast' },
      h('div', {}, h('div', { class: 'eyebrow' }, `${c.analysis.topic.label} · ${c.brief.org}`), h('h1', {}, c.name)),
      h('div', { class: 'badges' }, badge(label, kind), badge(`${c.qa.passed} of ${c.qa.total} checks`, c.qa.errors ? 'err' : 'ok'), c.mode === 'live' ? badge('Live', 'err') : badge('Test mode'), badge(c.writer?.name === 'claude' ? 'Written by Claude' : 'Offline writer'))),
    h('nav', { class: 'tabs', 'aria-label': 'Campaign sections' }, ...TABS.map(([k, l], i) => h('a', { href: `#/c/${c.id}/${k}`, 'aria-current': k === tab ? 'page' : null }, l, kbd(String(i + 1))))),
    body);
  state.primary = primaryFor(c);
  body.append(await ({ overview, assets, media, launch, results }[tab] || overview)(c));
  // Phones: the next step is always one thumb away.
  const p = state.primary;
  main.firstChild.classList.add('has-mbar');
  main.append(h('div', { class: 'mbar' }, h('button', { class: 'btn acc', type: 'button', onclick: (e) => p.run(e.currentTarget) }, p.label)));
}

// The single next step for this campaign — bound to ⌘↵ everywhere on the campaign.
function primaryFor(c) {
  const launched = Boolean(c.jobs?.length);
  if (launched) return { label: 'View results', run: () => { location.hash = `#/c/${c.id}/results`; } };
  if (c.mode === 'test') return { label: 'Approve and run the test', fine: 'Runs the whole sequence into your outbox, then shows simulated results.', run: (btn) => runTest(c, btn) };
  if (!c.approvedAt) return { label: 'Approve campaign', fine: c.qa.errors ? `Fix ${c.qa.errors} blocking issue(s) first.` : 'Nothing is sent until you launch.', run: (btn) => busy(btn, 'Approving…', () => api(`campaigns/${c.id}/approve`, { method: 'POST', body: {} })).then(() => { toast('Approved'); route(); }) };
  return { label: 'Launch live campaign', fine: 'Pitches go to real reporters on schedule.', run: (btn) => { if (confirm(`Launch "${c.name}" to ${c.targets.length} real reporters?`)) busy(btn, 'Launching…', () => api(`campaigns/${c.id}/launch`, { method: 'POST', body: {} })).then(() => { toast('Launched'); location.hash = `#/c/${c.id}/launch`; }); } };
}
async function runTest(c, btn) {
  await busy(btn, 'Running…', async () => {
    if (!c.approvedAt) await api(`campaigns/${c.id}/approve`, { method: 'POST', body: {} });
    await api(`campaigns/${c.id}/launch`, { method: 'POST', body: {} });
    await api(`campaigns/${c.id}/simulate`, { method: 'POST', body: {} });
  });
  toast('Test run complete — nothing was sent');
  location.hash = `#/c/${c.id}/results`;
}
function primaryButton(c, cls = 'btn acc block') {
  const p = state.primary;
  const btn = h('button', { class: cls, type: 'button', onclick: (e) => p.run(e.currentTarget) }, p.label, kbd('⌘↵'));
  return h('div', { class: 'go' }, btn, p.fine ? h('span', { class: 'fine' }, p.fine) : null);
}

function overview(c) {
  const nw = c.analysis.newsworthiness;
  const e = c.estimates;
  const tz = c.brief.timezone;
  const names = { timeliness: 'Timeliness', impact: 'Impact', novelty: 'Novelty', prominence: 'Prominence', proximity: 'Proximity', human: 'Human interest', conflict: 'Tension, trend' };
  const pr = c.assets.pressRelease;
  const lede = pr.paragraphs[0].replace(pr.dateline, '').trim();
  const draftQuote = pr.quotes?.some((q) => q.draft);
  const ex = c.targets.find((t) => t.role === 'exclusive');
  const roleName = (r) => (r === 'exclusive' ? 'Exclusive' : r === 'embargo' ? 'Embargo' : /backup/.test(r) ? 'Backup' : 'Launch');
  const errs = c.qa.checks.filter((x) => !x.pass && x.severity === 'error');
  return h('div', { class: 'split' },
    h('div', { class: 'stack', style: 'gap:28px' },
      h('div', { class: 'figs' },
        h('div', { class: 'fig' }, h('div', { class: 'c' }, 'News value'), h('div', { class: 'n' }, String(nw.score), h('small', {}, '/100')), h('div', { class: 'd' }, `${nw.verdict[0].toUpperCase()}${nw.verdict.slice(1)}${nw.improvements[0] ? ` — ${nw.improvements[0].value === 'human' ? 'add a person’s story' : `strengthen ${nw.improvements[0].value}`}` : ''}`)),
        h('div', { class: 'fig' }, h('div', { class: 'c' }, 'Placements'), h('div', { class: 'n' }, fmt.range(Math.max(1, Math.round(e.placements.low)), Math.max(1, Math.round(e.placements.high)))), h('div', { class: 'd' }, ex ? 'expected, incl. one exclusive' : 'expected')),
        h('div', { class: 'fig' }, h('div', { class: 'c' }, 'Reach'), h('div', { class: 'n' }, fmt.compact(e.earnedReach.high)), h('div', { class: 'd' }, `tier-weighted, ${c.targets.length} outlets`)),
        h('div', { class: 'fig' }, h('div', { class: 'c' }, 'Cost'), h('div', { class: 'n' }, fmt.money(e.cost.total[1])), h('div', { class: 'd' }, `vs ≈ ${fmt.money(e.benchmark.cost[0])} a month agency`))),
      h('div', { class: 'cols2' },
        h('section', { class: 'sec plan' }, h('h4', {}, 'The plan', h('span', { class: 'muted' }, 'reporter time zones applied')),
          h('ol', { class: 'list' }, ...c.plan.timeline.filter((s) => s.phase !== 'report').map((s, i) => h('li', { class: i === 0 ? 'next' : '' }, h('time', {}, `${fmt.day(s.at, tz)} · ${fmt.time(s.at, tz)}`), h('span', {}, s.label))))),
        h('section', { class: 'sec who' }, h('h4', {}, 'Who we’re pitching', h('a', { href: `#/c/${c.id}/media` }, `All ${c.targets.length} →`)),
          h('ol', { class: 'list' }, ...c.targets.slice().sort((a, b) => (a.role === 'exclusive' ? -1 : b.role === 'exclusive' ? 1 : 0)).slice(0, 5).map((t) => h('li', {},
            h('span', {}, h('span', { class: 'o' }, t.outlet), h('small', {}, t.recentArticle ? `Covered “${t.recentArticle.title.slice(0, 48)}”` : t.reason.replace(/^beat: /, '').replace(/ · tier \d/, ''))),
            h('span', { class: 'r' }, h('b', { class: t.role === 'exclusive' ? 'x' : '' }, roleName(t.role)), `fit ${t.score}`)))))),
      h('div', { class: 'cols2' },
        h('section', { class: 'sec' }, h('h4', {}, 'News judgement'), h('p', { style: 'margin-top:12px;font-size:14px;color:var(--ink2)' }, nw.advice),
          h('div', { class: 'values' }, ...Object.entries(nw.values).map(([k, v]) => h('div', { class: 'v' }, h('span', {}, names[k]), h('div', { class: 'meter', role: 'meter', 'aria-label': names[k], 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${v}%` })), h('span', { class: 'num muted' }, v))))),
        h('section', { class: 'sec' }, h('h4', {}, 'Channels', h('span', { class: 'muted' }, c.plan.channels.some((x) => x.kind === 'paid') ? 'includes a paid wire' : 'no paid wire needed')),
          h('ol', { class: 'list' }, ...c.plan.channels.map((ch) => h('li', { style: 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px' }, h('span', {}, ch.label, h('small', { class: 'muted', style: 'display:block;font-size:12.5px' }, ch.why)), h('span', { class: 'small muted' }, { auto: 'Relay sends', assisted: 'Relay prepares', manual: 'Copy ready' }[ch.automation])))),
          c.plan.notes.length ? h('div', { style: 'margin-top:12px' }, ...c.plan.notes.map((n) => h('p', { class: 'small muted' }, n))) : null))),
    h('div', { class: 'vr' }),
    h('aside', {},
      h('article', { class: 'proof' }, h('span', { class: 'stamp' }, c.approvedAt ? 'Approved' : 'Draft'),
        h('div', { class: 'eyebrow', style: 'display:flex;justify-content:space-between' }, h('span', {}, 'Press release'), h('span', {}, `${pr.paragraphs.join(' ').split(/\s+/).length} words`)),
        h('h2', {}, pr.headline),
        h('p', {}, h('strong', {}, pr.dateline, ' '), lede),
        pr.quotes?.[0] ? h('blockquote', {}, `“${pr.quotes[0].text.split(/(?<=\.)\s/)[0]}”`) : null,
        h('p', { style: 'margin:14px 0 0' }, h('a', { href: `#/c/${c.id}/assets` }, 'Read and edit everything →'))),
      h('ul', { class: 'checks' },
        errs.length ? errs.slice(0, 3).map((x) => h('li', {}, h('span', { class: 'i-err' }, '!'), `${x.asset}: ${x.message}`)) : h('li', {}, h('span', { class: 'i-ok' }, '✓'), 'No blocking issues across release, pitches and posts'),
        c.qa.checks.find((x) => x.id === 'AE-4')?.pass ? h('li', {}, h('span', { class: 'i-ok' }, '✓'), 'No invented facts — every number traces to your brief') : null,
        h('li', {}, h('span', { class: 'i-ok' }, '✓'), `${c.assets.pitches.length} pitches under 200 words, each with an opt-out`),
        draftQuote ? h('li', {}, h('span', { class: 'i-warn' }, '●'), `The quote is a draft — send it to ${c.brief.spokesperson.name.startsWith('[TK') ? 'your spokesperson' : c.brief.spokesperson.name}`) : null),
      primaryButton(c)));
}

async function patch(c, body, btn, msg = 'Saved') {
  await busy(btn, 'Saving…', () => api(`campaigns/${c.id}`, { method: 'PATCH', body }));
  toast(msg); route();
}

function qaList(c) {
  const failing = c.qa.checks.filter((x) => !x.pass);
  if (!failing.length) return h('p', { class: 'muted small' }, `All ${c.qa.total} checks pass.`);
  return h('section', { class: 'sec', style: 'margin-bottom:26px' }, h('h4', {}, `Quality check — ${c.qa.passed} of ${c.qa.total} pass`, h('span', {}, c.qa.errors ? badge(`${c.qa.errors} blocking`, 'err') : badge('nothing blocking', 'ok'))),
    h('ul', { class: 'list qa' }, ...failing.map((x) => h('li', {}, badge(x.id, x.severity === 'error' ? 'err' : 'warn'), h('span', { class: 'small' }, h('strong', {}, `${x.asset}: `), x.message)))));
}

function assets(c) {
  const A = c.assets;
  const pane = h('div', {});
  const sections = {
    release: () => {
      const head = h('input', { class: 'head', type: 'text', value: A.pressRelease.headline, 'aria-label': 'Headline' });
      const sub = h('input', { class: 'sub', type: 'text', value: A.pressRelease.subhead, 'aria-label': 'Subhead', placeholder: 'Subhead' });
      const body = h('textarea', { class: 'body', rows: 18, value: A.pressRelease.paragraphs.join('\n\n'), 'aria-label': 'Body, blank line between paragraphs' });
      const about = h('textarea', { class: 'boiler', rows: 3, value: A.pressRelease.boilerplate, 'aria-label': 'Boilerplate' });
      const saveBtn = h('button', { class: 'btn pri', type: 'button' }, 'Save and re-check', kbd('⌘S'));
      const save = () => patch(c, { pressRelease: { headline: head.value.trim(), subhead: sub.value.trim(), paragraphs: body.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), boilerplate: about.value.trim() } }, saveBtn, 'Release saved — checks re-run');
      saveBtn.addEventListener('click', save); state.save = save;
      return h('div', { class: 'stack' }, h('div', { class: 'doc' }, head, sub, body, about),
        h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn ghost', type: 'button', onclick: () => navigator.clipboard?.writeText(A.releaseText).then(() => toast('Release copied as plain text')) }, 'Copy plain text')));
    },
    pitches: () => {
      const all = [...A.pitches, ...A.followUps];
      let cur = 0;
      const subj = h('input', { type: 'text', 'aria-label': 'Subject' });
      const body = h('textarea', { rows: 14, 'aria-label': 'Pitch body' });
      const count = h('div', { class: 'counter' });
      const meta = h('p', { class: 'small muted' });
      const rows = all.map((p, i) => h('tr', { tabindex: 0, style: 'cursor:pointer', onclick: () => show(i), onkeydown: (e) => { if (e.key === 'Enter') show(i); } },
        h('td', {}, h('span', { class: 'o' }, p.outlet)), h('td', { class: 'muted' }, p.stage.replace(/_/g, ' ') + (p.conditional ? ' (if declined)' : ''))));
      const upd = () => { const w = body.value.trim().split(/\s+/).length; count.textContent = `${w}/200 words · subject ${subj.value.length}/60`; count.classList.toggle('over', w > 200 || subj.value.length > 60); };
      function show(i) {
        cur = i; const p = all[i];
        rows.forEach((r, k) => r.classList.toggle('sel', k === i));
        subj.value = p.subject; body.value = p.body;
        meta.textContent = `To ${p.name} <${p.email}> · ${fmt.dt(p.sendAt, c.brief.timezone)}${p.demo ? ' · test desk, never delivered' : ''}`;
        upd();
      }
      body.addEventListener('input', upd); subj.addEventListener('input', upd);
      const saveBtn = h('button', { class: 'btn pri', type: 'button' }, 'Save pitch', kbd('⌘S'));
      const save = () => patch(c, { pitch: { id: all[cur].id, subject: subj.value, body: body.value } }, saveBtn, 'Pitch saved');
      saveBtn.addEventListener('click', save); state.save = save;
      setTimeout(() => show(0));
      return h('div', { class: 'cols2', style: 'grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)' },
        h('div', { class: 'tablewrap', style: 'max-height:640px;overflow-y:auto' }, h('table', {}, h('tbody', {}, ...rows))),
        h('div', { class: 'stack' }, meta, h('label', { class: 'f' }, 'Subject', subj), h('label', { class: 'f' }, 'Body', body), count, h('div', { class: 'row' }, saveBtn)));
    },
    social: () => {
      const limits = { x: 280, bluesky: 300, threads: 500, mastodon: 500, linkedin: 3000 };
      const areas = {};
      const cards = Object.entries(A.social).map(([k, v]) => {
        const ta = h('textarea', { rows: k === 'linkedin' ? 10 : 4, value: v.text });
        const cnt = h('div', { class: 'counter' });
        const upd = () => { const n = ta.value.replace('{link}', 'x'.repeat(23)).length; cnt.textContent = `${n}/${limits[k]}`; cnt.classList.toggle('over', n > limits[k]); };
        ta.addEventListener('input', upd); upd(); areas[k] = ta;
        return h('label', { class: 'f' }, k === 'x' ? 'X' : k, ta, cnt);
      });
      const saveBtn = h('button', { class: 'btn pri', type: 'button' }, 'Save posts', kbd('⌘S'));
      const save = () => patch(c, { social: Object.fromEntries(Object.entries(areas).map(([k, t]) => [k, t.value])) }, saveBtn, 'Posts saved');
      saveBtn.addEventListener('click', save); state.save = save;
      return h('div', { class: 'stack' }, h('p', { class: 'muted small' }, '{link} becomes a tracked newsroom link with UTM tags for each platform.'), h('div', { class: 'cols2' }, ...cards), h('div', { class: 'row' }, saveBtn));
    },
    newsroom: () => h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `Publishes to ${A.newsroomUrl} with NewsArticle and FAQ structured data, RSS, sitemap and llms.txt.`),
      h('iframe', { class: 'preview', title: 'Newsroom page preview', src: `/api/campaigns/${c.id}/newsroom-preview`, sandbox: '' })),
    facts: () => h('div', { class: 'cols2' },
      h('section', { class: 'sec' }, h('h4', {}, 'Fact sheet — the single source of truth'), h('ul', { class: 'list' }, ...A.factSheet.facts.map((f) => h('li', {}, f.text)))),
      h('section', { class: 'sec' }, h('h4', {}, 'Questions people ask AI assistants'), h('ul', { class: 'list' }, ...A.faq.map((f) => h('li', {}, h('strong', {}, f.q), h('div', { class: 'muted' }, f.a)))))),
    wire: () => A.wire ? h('div', { class: 'stack' }, h('p', {}, `Release at ${A.wire.releaseAtLocal}. Recommended: ${A.wire.services.map((s) => `${s.label} (${fmt.range(s.cost[0], s.cost[1], fmt.money)})`).join('; ')}.`),
      h('ul', { class: 'small' }, ...A.wire.checklist.map((x) => h('li', {}, x))), h('div', { class: 'pre mono' }, A.wire.text))
      : h('div', { class: 'empty', style: 'padding:30px 0' }, h('h2', {}, 'No wire needed'), h('p', {}, 'This topic and budget don’t justify one. Coverage comes from direct pitches; search indexing from your newsroom page.')),
    more: () => h('div', { class: 'stack' },
      A.newsletter ? h('section', { class: 'sec' }, h('h4', {}, 'Newsletter to your own list'), h('p', { style: 'margin-top:12px' }, h('strong', {}, 'Subject: '), A.newsletter.subject), h('div', { class: 'pre' }, A.newsletter.body)) : null,
      ...Object.values(A.extras || {}).map((x) => h('section', { class: 'sec' }, h('h4', {}, x.title), h('div', { class: 'pre', style: 'margin-top:12px' }, x.text)))),
  };
  const labels = { release: 'Press release', pitches: `Pitches (${A.pitches.length + A.followUps.length})`, social: 'Social', newsroom: 'Newsroom page', facts: 'Facts & FAQ', wire: 'Wire', more: 'Newsletter & more' };
  const bar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Asset' });
  const show = (k) => { state.save = null; for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.k === k)); pane.replaceChildren(sections[k]()); };
  for (const [k, l] of Object.entries(labels)) bar.append(h('button', { type: 'button', 'data-k': k, onclick: () => show(k) }, l));
  show('release');
  return h('div', {}, qaList(c), bar, pane);
}

function media(c) {
  const ex = Object.entries(c.targeting.excluded).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ');
  return h('div', { class: 'stack' },
    h('div', { class: 'spread' },
      h('p', { class: 'muted', style: 'max-width:720px;margin:0' }, `${c.targets.length} reporters from ${c.targeting.poolSize} candidates, one per outlet, ranked by beat fit and recent coverage. Excluded: ${ex || 'none'}. Live discovery: ${c.discovery.ok ? `${c.discovery.articleCount} recent articles` : c.discovery.reason || 'off'}.`),
      h('div', { class: 'row' }, h('a', { class: 'btn ghost sm', href: `/api/campaigns/${c.id}/media-list.csv`, download: 'media-list.csv' }, 'Export CSV'), h('a', { class: 'btn ghost sm', href: '#/contacts' }, 'Import contacts'),
        !c.jobs?.length ? h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => patch(c, { retarget: true }, e.currentTarget, 'Media list rebuilt') }, 'Rebuild') : null)),
    c.targeting.demoUsed ? h('div', { class: 'banner' }, 'Outlet news desks with undeliverable .test addresses fill the list for testing. Import your own journalist contacts to go live.') : null,
    h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Outlet'), h('th', {}, 'Contact'), h('th', {}, 'Role'), h('th', {}, 'Fit'), h('th', {}, 'Why'))),
      h('tbody', {}, ...c.targets.map((t) => h('tr', {}, h('td', {}, h('span', { class: 'o' }, t.outlet), h('div', { class: 'small muted' }, `tier ${t.tier}`)), h('td', {}, t.name, h('div', { class: 'small muted' }, t.email)),
        h('td', {}, badge(t.role.replace(/_/g, ' ').replace(/exclusive backup (\d)/, 'backup $1'), t.role === 'exclusive' ? 'acc' : '')), h('td', { class: 'num' }, t.score), h('td', { class: 'muted small' }, t.reason)))))));
}

async function launch(c) {
  const [comp, outbox] = await Promise.all([api(`campaigns/${c.id}/compliance`), api(`campaigns/${c.id}/outbox`).catch(() => [])]);
  const legal = h('input', { type: 'checkbox', checked: c.compliance?.legalBasis === 'legitimate_interest' });
  const addr = h('input', { type: 'text', value: c.brief.postalAddress, placeholder: 'Street, city, postcode, country' });
  const sName = h('input', { type: 'text', value: c.brief.sender.name });
  const sEmail = h('input', { type: 'email', value: c.brief.sender.email });
  const counts = (c.jobs || []).reduce((m, j) => ({ ...m, [j.status]: (m[j.status] || 0) + 1 }), {});
  const locked = ['live', 'monitoring', 'complete'].includes(c.status);
  return h('div', { class: 'split' },
    h('div', { class: 'stack', style: 'gap:30px' },
      h('section', { class: 'sec' }, h('h4', {}, '1 · Mode'),
        h('p', { style: 'margin-top:12px' }, c.mode === 'test' ? 'Test: the whole sequence runs at once into your outbox, with simulated replies and coverage. Safe to run any time.' : 'Live: pitches go to real reporters on schedule — Tue–Thu mornings in their time zone, throttled, with one follow-up. Opt-outs are honoured automatically.'),
        locked ? null : h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => patch(c, { mode: c.mode === 'test' ? 'live' : 'test' }, e.currentTarget, `Switched to ${c.mode === 'test' ? 'live' : 'test'} mode`) }, c.mode === 'test' ? 'Switch to live mode' : 'Back to test mode')),
      h('section', { class: 'sec' }, h('h4', {}, '2 · Sender and compliance'),
        h('div', { class: 'fields', style: 'margin-top:14px' }, h('label', { class: 'f' }, 'Sender name', sName), h('label', { class: 'f' }, 'Sender email', sEmail), h('label', { class: 'f full' }, 'Postal address (CAN-SPAM)', addr),
          h('label', { class: 'check full' }, legal, 'We contact journalists under legitimate interest (GDPR Art. 6(1)(f)) and honour every opt-out immediately.')),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => patch(c, { brief: { postalAddress: addr.value, sender: { name: sName.value, email: sEmail.value } }, compliance: { legalBasis: legal.checked ? 'legitimate_interest' : '' } }, e.currentTarget, 'Saved') }, 'Save')),
      c.jobs?.length ? h('details', { class: 'sec', open: c.jobs.length <= 25 }, h('summary', { style: 'cursor:pointer' }, h('h4', { style: 'display:inline-flex;width:100%' }, `Send log — ${c.jobs.length} items`, h('span', {}, Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')))),
        h('div', { class: 'tablewrap', style: 'border-top:0' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Item'), h('th', {}, 'Due'), h('th', {}, 'Status'))),
          h('tbody', {}, ...c.jobs.map((j) => h('tr', {}, h('td', {}, j.stage.replace(/_/g, ' ')), h('td', {}, `${j.type}: ${j.ref.replace(/^[a-z_]+:/, '').replace(/^desk_/, '')}`), h('td', { class: 'num muted' }, fmt.dt(j.dueAt, c.brief.timezone)),
            h('td', {}, badge(j.status, { done: 'ok', failed: 'err', pending: 'warn' }[j.status] || ''), j.reason ? h('div', { class: 'small muted' }, j.reason) : null))))))) : null,
      outbox.length ? h('details', { class: 'sec' }, h('summary', { style: 'cursor:pointer' }, h('h4', { style: 'display:inline-flex;width:100%' }, `Outbox — ${outbox.length} files`, h('span', {}, 'every email, post and wire file'))),
        h('ul', { class: 'list small' }, ...outbox.slice(0, 300).map((f) => h('li', {}, h('a', { href: `/api/campaigns/${c.id}/outbox/${f}`, target: '_blank', rel: 'noopener' }, f))))) : null),
    h('div', { class: 'vr' }),
    h('aside', {},
      h('section', { class: 'sec' }, h('h4', {}, c.mode === 'live' ? 'Before going live' : 'Needed for live mode'),
        h('ul', { class: 'checks' }, ...comp.checks.map((x) => h('li', {}, h('span', { class: x.pass ? 'i-ok' : c.mode === 'live' ? 'i-err' : 'muted' }, x.pass ? '✓' : '○'), x.label)))),
      c.approvedAt ? h('p', { class: 'small muted', style: 'margin-top:16px' }, `Approved by ${c.approvedBy}, ${fmt.dt(c.approvedAt)}.`) : null,
      c.mode === 'live' && c.status === 'live' ? h('button', { class: 'btn ghost block', type: 'button', style: 'margin-top:16px', onclick: (e) => busy(e.currentTarget, 'Sending…', () => api(`campaigns/${c.id}/run-due`, { method: 'POST', body: {} })).then(() => route()) }, 'Send due messages now') : null,
      primaryButton(c)));
}

function results(c) {
  if (!c.jobs?.length) return h('div', { class: 'empty' }, h('h2', {}, 'Not launched yet'), h('p', {}, 'Run the test to see the whole sequence and a simulated report.'), h('div', { style: 'max-width:340px;margin:20px auto 0' }, primaryButton(c)));
  const url = h('input', { type: 'url', placeholder: 'https://' });
  const title = h('input', { type: 'text', placeholder: 'Headline' });
  const outlet = h('input', { type: 'text', placeholder: 'Outlet' });
  const tsel = h('select', {}, ...c.targets.map((t) => h('option', { value: t.id }, `${t.outlet} — ${t.name}`)));
  const ksel = h('select', {}, ...[['interested', 'Interested, wants an interview'], ['declined', 'Declined'], ['question', 'Asked a question'], ['not_my_beat', 'Not my beat (suppress)'], ['opt_out', 'Opt-out (suppress)']].map(([v, l]) => h('option', { value: v }, l)));
  return h('div', { class: 'stack', style: 'gap:28px' },
    h('div', { class: 'row' },
      c.mode === 'test' && !c.simulation ? h('button', { class: 'btn pri', type: 'button', onclick: (e) => busy(e.currentTarget, 'Simulating…', () => api(`campaigns/${c.id}/simulate`, { method: 'POST', body: {} })).then(() => route()) }, 'Simulate outcomes') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: (e) => busy(e.currentTarget, 'Searching the news…', () => api(`campaigns/${c.id}/monitor`, { method: 'POST', body: {} })).then((r) => { toast(r.ok ? `Found ${r.found} mention(s), ${r.added} new` : `Monitoring unavailable: ${r.reason}`); route(); }) }, 'Check coverage now'),
      h('a', { class: 'btn ghost', href: `/api/campaigns/${c.id}/report.html`, target: '_blank', rel: 'noopener' }, 'Open report'),
      h('a', { class: 'btn ghost', href: `/api/campaigns/${c.id}/export.json`, download: `${c.id}.json` }, 'Export JSON')),
    h('iframe', { class: 'preview', title: 'Campaign report', src: `/api/campaigns/${c.id}/report.html`, style: 'height:1100px' }),
    h('div', { class: 'cols2' },
      h('section', { class: 'sec stack' }, h('h4', {}, 'Log a reply'), h('label', { class: 'f' }, 'Reporter', tsel), h('label', { class: 'f' }, 'Reply', ksel),
        h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api(`campaigns/${c.id}/replies`, { method: 'POST', body: { targetId: tsel.value, kind: ksel.value } })).then(() => { toast('Reply logged'); route(); }) }, 'Save reply'))),
      h('section', { class: 'sec stack' }, h('h4', {}, 'Add coverage'), h('label', { class: 'f' }, 'Link', url), h('label', { class: 'f' }, 'Headline', title), h('label', { class: 'f' }, 'Outlet', outlet),
        h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api(`campaigns/${c.id}/coverage`, { method: 'POST', body: { url: url.value, title: title.value, outlet: outlet.value } })).then(() => { toast('Coverage added'); route(); }) }, 'Add')))));
}

// ------------------------------------------------------------------ campaigns & contacts

async function viewCampaigns() {
  state.view = 'campaigns'; state.campaign = null; setNav('campaigns'); renderMode();
  state.primary = { run: () => { location.hash = '#/'; } }; state.save = null;
  const list = await loadList();
  render(h('div', { class: 'mast' }, h('div', {}, h('div', { class: 'eyebrow' }, `${list.length} campaign${list.length === 1 ? '' : 's'}`), h('h1', {}, 'Campaigns')), h('a', { class: 'btn pri', href: '#/' }, 'New campaign', kbd('N'))),
    list.length ? h('div', { class: 'tablewrap', style: 'border-top:0;margin-top:8px' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Campaign'), h('th', {}, 'Story'), h('th', {}, 'Status'), h('th', {}, 'Mode'), h('th', {}, 'Created'))),
      h('tbody', {}, ...list.map((c) => h('tr', {}, h('td', {}, h('a', { href: `#/c/${c.id}`, class: 'o', style: 'color:var(--ink);text-decoration:none' }, c.name)), h('td', { class: 'muted' }, c.topic), h('td', {}, badge(...(STATUS[c.status] || [c.status]))), h('td', { class: 'muted' }, c.mode), h('td', { class: 'muted num' }, fmt.ago(c.createdAt)))))))
      : h('div', { class: 'empty' }, h('h2', {}, 'No campaigns yet'), h('p', {}, 'Write one sentence about your news to start.'), h('a', { class: 'btn pri', href: '#/', style: 'margin-top:12px' }, 'New campaign')));
}

async function viewContacts() {
  state.view = 'contacts'; state.campaign = null; setNav('contacts'); renderMode(); state.save = null;
  const [contacts, supp] = await Promise.all([api('contacts'), api('suppression')]);
  const csv = h('textarea', { rows: 7, class: 'mono', placeholder: 'name,email,outlet,domain,beats,timezone,recent_article_title,recent_article_url,recent_article_date\nAlex Kim,alex@example-news.com,Example News,example-news.com,transport;climate,America/Chicago,"Cities add protected bike lanes",https://…,2026-11-02' });
  const file = h('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Choose a CSV file' });
  file.addEventListener('change', async () => { csv.value = await file.files[0].text(); });
  const email = h('input', { type: 'email', placeholder: 'reporter@outlet.com or @domain.com', 'aria-label': 'Email or domain to suppress' });
  const importBtn = h('button', { class: 'btn pri', type: 'button', onclick: (e) => busy(e.currentTarget, 'Importing…', () => api('contacts/import', { method: 'POST', body: csv.value })).then((r) => { toast(`Added ${r.added}, updated ${r.updated}, rejected ${r.rejected}`); viewContacts(); }) }, 'Import', kbd('⌘↵'));
  state.primary = { run: () => importBtn.click() };
  render(h('div', { class: 'mast' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Media database'), h('h1', {}, 'Contacts')), h('a', { class: 'btn ghost', href: '/api/contacts/export.csv', download: 'contacts.csv' }, 'Export CSV')),
    h('div', { class: 'split', style: 'margin-top:28px' },
      h('div', { class: 'stack', style: 'gap:28px' },
        h('section', { class: 'sec stack' }, h('h4', {}, 'Import your journalist list'), h('p', { class: 'small muted', style: 'margin:0' }, 'From Muck Rack, Cision, Apollo or a spreadsheet. Beats drive relevance; a recent article title enables personalised openers.'), file, csv, h('div', {}, importBtn)),
        h('section', { class: 'sec' }, h('h4', {}, `${contacts.length} contacts`),
          contacts.length ? h('table', {}, h('tbody', {}, ...contacts.map((x) => h('tr', {}, h('td', {}, h('span', { class: 'o' }, x.name), h('div', { class: 'small muted' }, x.email)), h('td', {}, x.outlet), h('td', { class: 'muted small' }, (x.beats || []).join(', '))))))
            : h('p', { class: 'muted small', style: 'margin-top:12px' }, 'None yet. Test campaigns use outlet news desks with undeliverable .test addresses.'))),
      h('div', { class: 'vr' }),
      h('aside', {}, h('section', { class: 'sec stack' }, h('h4', {}, `Do not contact (${supp.length})`), h('p', { class: 'small muted', style: 'margin:0' }, 'Opt-outs and “not my beat” replies are added automatically and never pitched again.'),
        email, h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => busy(e.currentTarget, 'Saving…', () => api('suppression', { method: 'POST', body: { email: email.value } })).then(() => viewContacts()) }, 'Add')),
        supp.length ? h('ul', { class: 'list small' }, ...supp.map((s) => h('li', {}, s.email, h('span', { class: 'muted' }, ` — ${s.reason.replace(/_/g, ' ')}`)))) : null))));
}

// ------------------------------------------------------------------ command palette & shortcuts

let overlay = null;
function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
function openOverlay(sheet) {
  closeOverlay();
  overlay = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === overlay) closeOverlay(); } }, sheet);
  document.body.append(overlay);
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('relay-theme', next); } catch {}
}

async function openPalette() {
  if (!state.list.length) await loadList();
  const c = state.campaign;
  const items = [];
  const add = (group, label, run, hint = '') => items.push({ group, label, run, hint });
  if (state.view === 'new') { add('Actions', 'Build the campaign', () => state.primary(), '⌘↵'); add('Actions', 'Run a full test', () => state.secondary(), '⇧⌘↵'); }
  if (c) {
    add('Actions', state.primary.label, () => state.primary.run(null), '⌘↵');
    add('Actions', 'Export media list (CSV)', () => { location.href = `/api/campaigns/${c.id}/media-list.csv`; });
    add('Actions', 'Open report in a new tab', () => window.open(`/api/campaigns/${c.id}/report.html`, '_blank', 'noopener'));
    TABS.forEach(([k, l], i) => add('This campaign', l, () => { location.hash = `#/c/${c.id}/${k}`; }, String(i + 1)));
  }
  add('Go to', 'New campaign', () => { location.hash = '#/'; }, 'N');
  add('Go to', 'Campaigns', () => { location.hash = '#/campaigns'; }, 'C');
  add('Go to', 'Contacts', () => { location.hash = '#/contacts'; });
  add('Actions', 'Run a test with the sample brief', async () => { toast('Running the sample test…'); const r = await api('test-campaign', { method: 'POST', body: {} }); location.hash = `#/c/${r.id}/results`; });
  for (const x of state.list.slice(0, 12)) add('Campaigns', x.name, () => { location.hash = `#/c/${x.id}`; }, (STATUS[x.status] || [x.status])[0]);
  add('Preferences', 'Switch light / dark', toggleTheme);
  add('Preferences', 'Keyboard shortcuts', openShortcuts, '?');

  const input = h('input', { type: 'search', placeholder: 'Type a command or a campaign…', 'aria-label': 'Command', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list' });
  const ul = h('ul', { id: 'pal-list', role: 'listbox' });
  let sel = 0, shown = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = items.filter((i) => !q || `${i.group} ${i.label}`.toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    const nodes = []; let g = null;
    shown.forEach((it, i) => {
      if (it.group !== g) { g = it.group; nodes.push(h('li', { class: 'grp', role: 'presentation' }, g)); }
      nodes.push(h('li', { role: 'option', 'aria-selected': String(i === sel), onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => pick(i) }, h('span', {}, it.label), it.hint ? h('small', {}, it.hint) : null));
    });
    ul.replaceChildren(...(nodes.length ? nodes : [h('li', { class: 'grp' }, 'No matches')]));
    ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => { const it = shown[i]; closeOverlay(); it?.run(); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  openOverlay(h('div', { class: 'sheet pal', role: 'dialog', 'aria-label': 'Command menu' }, input, ul));
  draw(); input.focus();
}

function openShortcuts() {
  const row = (label, ...keys) => [h('dt', {}, label), h('dd', {}, ...keys.map(kbd))];
  openOverlay(h('div', { class: 'sheet keys', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
    h('h2', {}, 'Keyboard shortcuts'),
    h('dl', {},
      row('Command menu — jump anywhere, run anything', '⌘K'),
      row('Do the main thing on this screen', '⌘↵'),
      row('Run a full test (new campaign)', '⇧⌘↵'),
      row('Save the asset you are editing', '⌘S'),
      row('Campaign sections', '1', '2', '3', '4', '5'),
      row('New campaign', 'N'),
      row('Campaigns', 'C'),
      row('Focus the news box', '/'),
      row('Close a dialog', 'Esc'),
      row('This list', '?'))));
}

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === 'Escape' && overlay) { e.preventDefault(); closeOverlay(); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay ? closeOverlay() : openPalette(); return; }
  if (overlay) return;
  if (mod && e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey && state.secondary) return state.secondary();
    if (typeof state.primary === 'function') return state.primary();
    if (state.primary?.run) return state.primary.run(document.querySelector('.go .btn'));
    return;
  }
  if (mod && e.key.toLowerCase() === 's' && state.save) { e.preventDefault(); state.save(); return; }
  if (typing || mod || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); openShortcuts(); }
  else if (e.key === 'n') { location.hash = '#/'; }
  else if (e.key === 'c') { location.hash = '#/campaigns'; }
  else if (e.key === '/' && state.view === 'new') { e.preventDefault(); $('#news')?.focus(); }
  else if (/^[1-5]$/.test(e.key) && state.campaign) { location.hash = `#/c/${state.campaign.id}/${TABS[Number(e.key) - 1][0]}`; }
});
$('#palette-btn').addEventListener('click', openPalette);

// ------------------------------------------------------------------ router

async function route() {
  closeOverlay();
  const [, kind, id, tab] = location.hash.replace(/^#/, '').split('/');
  if (kind === 'c' && id) return viewCampaign(id, tab);
  if (kind === 'campaigns') return viewCampaigns();
  if (kind === 'contacts') return viewContacts();
  return viewNew();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
loadStatus();
route();
