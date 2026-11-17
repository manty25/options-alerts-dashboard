# Relay — design and operational standards

These are the standards the app is built and tested against. Each one has an ID. The quality checker
(`src/engine/qa.js`) and the test suite (`test/`) refer to these IDs, so a failed check always points
back to a rule here. The reasoning behind each rule is in [RESEARCH.md](RESEARCH.md).

Goal: **better reach, lower cost and higher speed than a traditional agency + wire + database stack**,
without losing the things journalists actually reward (relevance, accuracy, brevity).

---

## 1. Product design standards (DS)

| ID | Standard |
|----|----------|
| DS-1 | **Minimal input.** One sentence about the news plus an organisation name is enough to produce a complete campaign. Every other field has a sensible default or is inferred. |
| DS-2 | **Human approval gate.** Nothing leaves the system (email, social post, newsroom publish, wire file) until a person approves the campaign. Approval is recorded with a timestamp. |
| DS-3 | **Safe by default.** New campaigns run in **test mode**: all email goes to a local outbox (or the operator's test inbox), social posts are written to the outbox, nothing reaches a journalist. Live mode needs an explicit switch *and* passing compliance checks (OP-6). |
| DS-4 | **No invented facts.** Assets may only state facts that are in the brief. Unknown details become visible `[TK: …]` placeholders, and the QA check blocks approval while any remain in live mode. |
| DS-5 | **Works without an AI key.** A deterministic engine produces every asset offline. When `ANTHROPIC_API_KEY` is set, Claude writes the assets instead, using the same schemas and the same QA checks. |
| DS-6 | **Cost, reach and time shown up front.** The plan shows estimated cost, estimated reach and time to launch, next to the traditional-agency benchmark, before approval. |
| DS-7 | **Explainable recommendations.** Every channel and every media target carries a one-line reason ("covered e-bike regulation 12 days ago"). |
| DS-8 | **Accessible, responsive UI.** WCAG 2.2 AA contrast, keyboard operable, works at 360 px width, light and dark themes. |
| DS-9 | **Portable data.** Media lists export as CSV, emails as `.eml`, the whole campaign as JSON. No lock-in. |
| DS-10 | **Single source of truth.** All assets derive from one structured *fact sheet*; editing a fact regenerates dependent assets. |

## 2. Press release standards (PR)

| ID | Standard | Check |
|----|----------|-------|
| PR-1 | Headline states the news with an active verb, ≤ 100 characters, no exclamation marks, no ALL CAPS words (acronyms excepted). | automatic |
| PR-2 | Dateline in AP form: `CITY, Region — Month D, YYYY —`. | automatic |
| PR-3 | Lede ≤ 45 words and answers who + what (+ when/where where known). | automatic |
| PR-4 | Body 200–650 words; inverted pyramid. Short beats padded: add facts, not adjectives. | automatic (warning) |
| PR-5 | 1–2 quotes, each attributed with name and title; quotes add opinion or context, not repeated facts. | automatic (presence) |
| PR-6 | "About {Org}" boilerplate present. | automatic |
| PR-7 | Media contact block (name, email) present. | automatic |
| PR-8 | Ends with `###`. | automatic |
| PR-9 | No hype words (revolutionary, game-changing, cutting-edge, world-class, best-in-class, synergy, disruptive, seamless, unparalleled, leverage, next-generation …). | automatic |
| PR-10 | At least one concrete figure (number, date, amount, percentage). | automatic |
| PR-11 | Superlative claims ("first", "only", "largest", "#1") only when the brief marks them as substantiated. | automatic |
| PR-12 | Readability: Flesch–Kincaid grade ≤ 14 (target ≤ 12). | automatic |

## 3. Pitch standards (PT)

| ID | Standard | Check |
|----|----------|-------|
| PT-1 | Body ≤ 200 words (target 90–170). | automatic |
| PT-2 | Subject ≤ 60 characters and ≤ 10 words, states the news, never "Press release:" or ALL CAPS. | automatic |
| PT-3 | Personalised opening that references the reporter's beat or a recent relevant article. | automatic (token present) |
| PT-4 | The news is in the first two sentences. | heuristic |
| PT-5 | One clear ask (interview, exclusive, embargoed briefing, assets). | automatic |
| PT-6 | No attachments; links only. | enforced by sender |
| PT-7 | Exclusive and embargo terms are explicit: what, until when, with time zone. | automatic |
| PT-8 | At most one follow-up, 3–4 business days later, adding something new. | enforced by scheduler |
| PT-9 | Plain text, no tracking pixel. | enforced by sender |

## 4. Social standards (SO)

| ID | Standard |
|----|----------|
| SO-1 | Respect platform limits: X 280, Bluesky 300, Threads 500, Mastodon 500, LinkedIn 3,000 (hook in first 210). |
| SO-2 | Exactly one link per post, tagged with UTM parameters for that channel. |
| SO-3 | Hashtags: ≤ 2 on X/Bluesky/Threads, ≤ 3 on LinkedIn/Mastodon. |
| SO-4 | Copy written natively per platform — no identical cross-posts. |

## 5. Newsroom and AI-search standards (AE)

| ID | Standard |
|----|----------|
| AE-1 | Each release gets a newsroom page with `NewsArticle` JSON-LD, Open Graph tags and a canonical URL. |
| AE-2 | Newsroom has an RSS feed and a sitemap that are updated on publish. |
| AE-3 | A fact sheet with ≥ 5 short, quotable, self-contained facts (numbers, dates, names) is published with the release. |
| AE-4 | Every number that appears in any asset also appears in the fact sheet (fact consistency). |
| AE-5 | An FAQ of 4–6 questions written as plain questions a person would ask an AI assistant. |

## 6. Targeting standards (TG)

| ID | Standard |
|----|----------|
| TG-1 | A target must match the campaign's topic beats (relevance score ≥ threshold). Off-beat contacts are excluded, never "sprayed". |
| TG-2 | At most one reporter per outlet per campaign (exception: separately named desks). |
| TG-3 | Rank by recency of relevant coverage (last 90 days) first, then outlet tier, then audience fit. |
| TG-4 | List size is capped by topic (default 40) — quality over volume. |
| TG-5 | Suppression list (opt-outs, bounces, "not my beat" replies) is always honoured. |
| TG-6 | Do not re-pitch the same contact within 30 days unless they replied. |
| TG-7 | Exclusive goes to one outlet at a time, highest fit first. |

## 7. Operational standards (OP)

| ID | Standard |
|----|----------|
| OP-1 | Test mode is the default for every new campaign (see DS-3). |
| OP-2 | Pitch send window: Tue–Thu, 06:00–10:00 in the recipient's time zone (Mon/Fri allowed only for breaking/crisis). |
| OP-3 | Throttle live email: default 20 per hour per sender with random jitter, to look and behave like one-to-one mail. |
| OP-4 | Sequence: exclusive (optional) → embargoed pre-brief (optional) → launch (newsroom + wire + pitches) → social amplification → single follow-up → report. |
| OP-5 | Wire releases are scheduled off the hour (e.g. 08:05). |
| OP-6 | **Compliance gate for live mode:** sender name and address are real, a postal address is set (CAN-SPAM), every pitch carries a one-line opt-out, opt-outs are processed immediately, and the legal basis for contacting journalists (legitimate interest, GDPR Art. 6(1)(f)) is recorded. |
| OP-7 | Bounces, opt-outs and "not my beat" replies go on the suppression list automatically. |
| OP-8 | Every outbound message is written to an append-only audit log (who, what, when, channel, mode). |
| OP-9 | Sends are idempotent: a retry never sends the same message twice. |
| OP-10 | Secrets come only from environment variables; they are never written to campaign files or logs. |
| OP-11 | **Regulated disclosure:** material news from a public company (earnings, M&A, guidance) forces a tier-1 wire, simultaneous release, and disables exclusives and embargo pre-briefs. |
| OP-12 | **Crisis mode:** no wire, no promotional social copy, no exclusives; a factual holding statement on the newsroom and direct replies to reporters already covering the story. |
| OP-13 | Open tracking is off (privacy, and Apple Mail Privacy Protection makes it unreliable). Click tracking uses first-party redirect links with UTM tags. |

## 8. Measurement standards (ME)

| ID | Standard |
|----|----------|
| ME-1 | Follow AMEC Barcelona Principles 3.0: report outcomes, show the method, **never** use AVE. |
| ME-2 | Report in three layers: outputs (sent/published), outtakes (clicks, replies), outcomes (placements, tier-weighted reach, message pull-through, sentiment). |
| ME-3 | Show cost per placement and time to first coverage, compared with the agency benchmark. |
| ME-4 | Key-message pull-through = share of placements that contain each key message. |
| ME-5 | Any simulated data (test campaigns) is labelled **SIMULATED** on every chart and table where it appears. |

## 9. Performance targets (SLO)

| ID | Target |
|----|--------|
| SLO-1 | Brief → complete campaign kit: < 2 s offline, < 3 min with Claude. |
| SLO-2 | Test campaign end-to-end (`npm run demo`): one command, no configuration, < 10 s. |
| SLO-3 | UI first load < 1 s on localhost; no build step; no front-end framework download. |
| SLO-4 | Zero runtime dependencies except the official Anthropic SDK. |
