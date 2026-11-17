# Relay — PR campaigns from one sentence

Relay turns one sentence about your news into a complete PR campaign that has passed quality checks:
news judgement, a channel plan suited to the topic, a ranked media list, AP-style press release,
personalised pitches (exclusive → embargo → launch → one follow-up), platform-native social posts, an
SEO- and AI-search-ready newsroom page, a wire package when the topic needs one, and a results report
that follows the Barcelona Principles.

It is built to beat the usual agency + newswire + media-database setup on **speed** (seconds instead of
1–2 weeks), **cost** (cents of AI usage, plus a wire only when the topic needs one, instead of
$5k–$25k/month) and **reach quality** (relevance- and recency-ranked targets, one reporter per outlet).

* Research behind the design: [`docs/RESEARCH.md`](docs/RESEARCH.md)
* Design and operational standards (each has an ID used by the QA checks and tests): [`docs/STANDARDS.md`](docs/STANDARDS.md)

## Run a test campaign (no setup)

```bash
cd pr-campaign
npm install          # one dependency: the official Anthropic SDK
npm run demo         # full test campaign with a sample brief
```

Or with your own one-liner:

```bash
node cli.js test "Brightwater Health opens a 24-hour urgent care clinic in Dayton that will create 45 jobs" --org "Brightwater Health"
```

A test campaign builds everything, approves it, runs the whole send sequence into a local **outbox**
(nothing can reach a journalist: demo outlet desks use undeliverable `.test` addresses), simulates
replies and coverage (labelled **SIMULATED** everywhere), and writes a report. Output lands in
`data/campaigns/<id>/`: `report.html`, `press-release.txt`, `pitches.txt`, `social.txt`, `media-list.csv`,
`newsroom-preview.html` and `outbox/`.

## Web app

```bash
npm start            # http://localhost:8787
```

Write the news in one sentence. Relay fills in the organisation and city from it, and you can complete the
short sentence below the box ("It's from ___ in ___, announced ___, with ___ speaking, on a ___ budget") or leave
it. Press **⌘↵** to build the campaign, or **⇧⌘↵** to run a full test in one go. On a campaign, **⌘↵** always does
the next step (approve and run the test, launch, view results).

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl K | Command menu: jump to any campaign or section, run any action |
| ⌘↵ | The main action on the current screen |
| ⇧⌘↵ | Run a full test (new campaign) |
| ⌘S | Save the asset you are editing |
| 1–5 | Overview, Assets, Media list, Launch, Results |
| N / C | New campaign / Campaigns |
| / | Focus the news box |
| ? | Show all shortcuts |

The design follows the "Editorial" direction in `design/options/` (light and dark themes, self-hosted fonts).

## Configuration (all optional)

| Variable | Effect |
|----------|--------|
| `ANTHROPIC_API_KEY` | Claude writes the assets (structured outputs, model `claude-opus-5-5`, with refusal fallback). Without it, the offline writer is used. A typical campaign costs about $0.20–$0.60 in tokens. |
| `RELAY_MODEL` | Override the Claude model. |
| `RELAY_EMAIL_PROVIDER` = `resend` \| `postmark` \| `sendgrid` with `RESEND_API_KEY` / `POSTMARK_TOKEN` / `SENDGRID_API_KEY` | Real email delivery for live campaigns. |
| `RELAY_TEST_INBOX` | In test mode, also send every pitch to this address only (subject shows the intended recipient). |
| `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD`, `MASTODON_URL` + `MASTODON_TOKEN` | Live social posting. |
| `RELAY_SOCIAL_WEBHOOK` | Post LinkedIn/X/Threads through Zapier, Make, n8n or Typefully. |
| `RELAY_PUBLIC_URL` | Public base URL for newsroom pages and tracked links. |
| `RELAY_NEWSROOM_DIR` | Mirror the newsroom (HTML, RSS, sitemap, llms.txt) into a static-site folder on live publish. |
| `RELAY_OFFLINE=1` | Skip live media discovery (GDELT + Google News). |
| `RELAY_PASSWORD` | Basic-auth password for the app when exposed beyond localhost (`HOST=0.0.0.0`). |
| `RELAY_MAX_EMAILS_PER_HOUR` | Live throttle (default 20). |

## Going live

1. Import your journalist contacts (`node cli.js import-contacts list.csv` or Contacts in the UI). Columns:
   `name,email,outlet,domain,beats,timezone,recent_article_title,recent_article_url,recent_article_date`.
2. Switch the campaign to live mode. Demo desks drop out and the list is rebuilt from your contacts.
3. Fill the compliance items: sender, postal address, legal basis.
4. Clear all blocking QA issues, including every `[TK]` placeholder, and get the drafted quote approved.
5. Approve, then launch. The server sends due messages every minute: Tue–Thu mornings in each reporter's
   time zone, throttled, with one follow-up. Opt-outs and "not my beat" replies are suppressed automatically.

Wire distribution is an *assisted* channel: Relay prepares the release, the schedule (off the hour), the
service choice and a checklist; you submit it to the wire service you choose.

## Tests

```bash
npm test             # 49 tests, named after the standards they enforce
```

The tests run offline and include a mock Messages API that checks the Claude writing path end to end.

## Layout

```
cli.js, server.js        entry points
src/knowledge/           topic playbooks, channel catalog, outlet database
src/engine/              brief, analysis, strategy, discovery, targeting, QA, campaign orchestration, simulation, report
src/generate/            offline writer, Claude writer, per-target pitch/newsroom/wire composition
src/distribute/          email, social, newsroom, click tracking, compliance gate
public/                  web UI (no build step)
docs/                    research and standards
```
