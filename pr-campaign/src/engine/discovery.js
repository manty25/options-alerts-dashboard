// Live media discovery and coverage monitoring from free, open sources:
//   GDELT DOC 2.0 API (global news index, updated every 15 minutes) and Google News RSS search.
// Both fail soft: on network errors Relay continues with the static outlet database.

const UA = 'RelayPR/1.0 (+media-discovery)';

async function getText(url, timeoutMs = 7000, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

export const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function gdeltSearch(query, { timespan = '3months', max = 75, fetchImpl } = {}) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&sort=datedesc&maxrecords=${max}&timespan=${timespan}`;
  const text = await getText(url, 8000, fetchImpl);
  const json = JSON.parse(text || '{}');
  return (json.articles || []).map((a) => ({
    title: a.title, url: a.url, domain: (a.domain || domainOf(a.url)).replace(/^www\./, ''),
    date: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}` : '',
    source: 'gdelt', language: a.language,
  }));
}

function decodeXml(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t) => decodeXml((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
    const srcUrl = (m[1].match(/<source[^>]*url="([^"]+)"/) || [])[1] || '';
    const title = tag('title');
    const source = tag('source');
    items.push({
      title: source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title,
      url: tag('link'), date: tag('pubDate') ? new Date(tag('pubDate')).toISOString().slice(0, 10) : '',
      outlet: source, domain: domainOf(srcUrl) || domainOf(tag('link')), source: 'googlenews',
    });
  }
  return items;
}

export async function googleNewsSearch(query, { region = 'US', lang = 'en', fetchImpl } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}-${region}&gl=${region}&ceid=${region}:${lang}`;
  return parseRss(await getText(url, 7000, fetchImpl));
}

// Builds a topical query from the brief: key nouns + beats, excluding the org itself.
export function topicQuery(brief, cls) {
  const stop = new Set('the a an and or of for to in on with by at from as is are its it this that new today launches launched announces announced unveils introduces will has have their our we us'.split(' '));
  const orgWords = new Set(brief.org.toLowerCase().split(/\s+/));
  const words = brief.news.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w) && !orgWords.has(w) && !/^\d/.test(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const terms = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 4);
  return { terms, gdelt: terms.length ? `(${terms.map((t) => `"${t}"`).join(' OR ')})` : cls.beats[0], news: terms.slice(0, 3).join(' ') };
}

export async function discoverCoverage(brief, cls, opts = {}) {
  if (process.env.RELAY_OFFLINE === '1' || opts.offline) return { ok: false, reason: 'offline mode', articles: [], query: null };
  const q = topicQuery(brief, cls);
  const results = await Promise.allSettled([
    gdeltSearch(q.gdelt, opts),
    googleNewsSearch(q.news, { region: brief.region === 'uk' ? 'GB' : 'US', fetchImpl: opts.fetchImpl }),
  ]);
  const articles = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
  return { ok: articles.length > 0, reason: errors.join('; ') || (articles.length ? '' : 'no results'), articles, query: q };
}

// Coverage monitoring: mentions of the organisation since launch.
export async function findMentions(brief, sinceIso, opts = {}) {
  if (process.env.RELAY_OFFLINE === '1' || opts.offline) return { ok: false, reason: 'offline mode', articles: [] };
  const q = `"${brief.org}"`;
  const results = await Promise.allSettled([gdeltSearch(q, { timespan: '1month', ...opts }), googleNewsSearch(q, { fetchImpl: opts.fetchImpl })]);
  const since = sinceIso ? sinceIso.slice(0, 10) : '';
  const seen = new Set();
  const articles = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((a) => (!since || !a.date || a.date >= since) && !seen.has(a.url) && seen.add(a.url));
  return { ok: true, articles, reason: results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason)).join('; ') };
}
