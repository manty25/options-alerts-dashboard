// Campaign strategy: channel mix, sequencing (OP-4), timing (OP-2, OP-5), estimates (DS-6).
import { TOPIC_BY_ID } from '../knowledge/topics.js';
import { CHANNELS, AGENCY_BENCHMARK } from '../knowledge/channels.js';
import { REACH_ESTIMATE, STORY_SHARE } from '../knowledge/outlets.js';
import { addBusinessDays, nextWindow, localParts, zonedToUtc, unique, weekdayIndex } from '../util.js';

const AUTO_SOCIAL = ['linkedin', 'x', 'bluesky', 'threads', 'mastodon'];

export function chooseChannels(brief, cls, nw) {
  const topic = TOPIC_BY_ID[cls.topic.id];
  const notes = [];
  let primary = [...topic.primary];
  let secondary = [...topic.secondary];

  if (cls.crisis) {
    notes.push('Crisis mode (OP-12): no wire, no promotional social, no exclusives. Holding statement + direct replies only.');
    return finalize(['newsroom', 'pitch_email'], [], notes, { exclusive: false, embargo: false, mode: 'crisis' });
  }

  let exclusive = topic.exclusive && brief.exclusiveOk && nw.verdict !== 'weak';
  let embargo = topic.embargo && brief.embargoOk && nw.verdict !== 'weak';
  const all = () => new Set([...primary, ...secondary]);

  if (cls.regulated) {
    notes.push('Regulated disclosure (OP-11): tier-1 wire with simultaneous release; exclusives and embargo pre-briefs disabled.');
    exclusive = false; embargo = false;
    primary = unique(['tier1_wire', ...primary]);
  } else if (topic.wire === 'required') {
    // e.g. M&A at a private company: wire becomes recommended, not mandatory.
    primary = primary.filter((c) => c !== 'tier1_wire');
    secondary = unique([...secondary, brief.budget === 'full' ? 'tier1_wire' : 'value_wire']);
    notes.push('Private company: tier-1 wire not legally required; using a cheaper wire for indexing.');
  }

  // Budget rules: wires only where the topic justifies them.
  const dropPaid = (ids) => { primary = primary.filter((c) => !ids.includes(c)); secondary = secondary.filter((c) => !ids.includes(c)); };
  if (brief.budget === 'free') {
    dropPaid(cls.regulated ? ['value_wire', 'science_wire'] : ['value_wire', 'tier1_wire', 'science_wire']);
    if (cls.regulated) notes.push('Budget is "free" but a tier-1 wire is legally required for this disclosure — kept.');
  } else if (brief.budget === 'lean') {
    if (!cls.regulated) dropPaid(['tier1_wire']);
    if (topic.wire === 'optional') dropPaid(['value_wire']);
  } else if (brief.budget === 'full') {
    if (!cls.regulated && topic.wire === 'recommended' && nw.verdict === 'strong' && !all().has('science_wire')) secondary = unique([...secondary, 'tier1_wire']);
    if (!all().has('value_wire') && !all().has('tier1_wire') && topic.wire !== 'never') secondary.push('value_wire');
  }

  if (!exclusive) primary = primary.filter((c) => c !== 'exclusive');
  if (nw.verdict === 'weak') notes.push('Weak hook: tier-1 outlets excluded from the pitch list until the story is strengthened.');
  return finalize(primary, secondary, notes, { exclusive, embargo, mode: cls.regulated ? 'regulated' : 'standard' });
}

function finalize(primary, secondary, notes, flags) {
  const mk = (id, role) => ({ id, role, ...CHANNELS[id], estCost: CHANNELS[id].cost });
  const seen = new Set();
  const list = [];
  for (const id of primary) if (!seen.has(id) && CHANNELS[id]) { seen.add(id); list.push(mk(id, 'primary')); }
  for (const id of secondary) if (!seen.has(id) && CHANNELS[id]) { seen.add(id); list.push(mk(id, 'secondary')); }
  return { channels: list, notes, ...flags };
}

// Launch time: the given date at 08:05 local, or the next Tue–Thu morning far enough out for the sequence.
export function launchTime(brief, flags, now = new Date()) {
  const tz = brief.timezone;
  if (flags.mode === 'crisis') return new Date(now.getTime() + 15 * 60000);
  if (brief.launchAt) {
    const d = new Date(brief.launchAt);
    if (!isNaN(d)) {
      if (/T\d\d:\d\d/.test(brief.launchAt)) return d;
      const p = localParts(d, 'UTC');
      return zonedToUtc(p.y, p.m, p.d, 8, 5, tz);
    }
  }
  const lead = flags.exclusive ? 6 : flags.embargo ? 3 : 1;
  const base = addBusinessDays(now, lead, tz);
  return nextWindow(base, tz, { days: [2, 3, 4], startHour: 8, endHour: 9, minute: 5 });
}

export function buildTimeline(brief, flags, launch, now = new Date()) {
  const tz = brief.timezone;
  const steps = [];
  const at = (d) => d.toISOString();
  const minus = (bd) => {
    // n business days before launch at 09:05 local
    let t = new Date(launch.getTime());
    let n = 0;
    while (n < bd) { t = new Date(t.getTime() - 86400000); const wd = weekdayIndex(t, tz); if (wd !== 0 && wd !== 6) n++; }
    const p = localParts(t, tz);
    return zonedToUtc(p.y, p.m, p.d, 9, 5, tz);
  };
  const notes = [];
  if (flags.exclusive) {
    const offer = minus(5);
    if (offer > now) {
      steps.push({ phase: 'exclusive_offer', label: 'Offer exclusive to best-fit tier-1 outlet', at: at(offer), deadline: at(minus(3)), standards: ['TG-7', 'PT-7'] });
    } else { flags.exclusive = false; notes.push('Launch is too soon for an exclusive window (needs 5 business days); exclusive skipped.'); }
  }
  if (flags.embargo) {
    const pre = minus(2);
    if (pre > now) steps.push({ phase: 'embargo_prebrief', label: 'Embargoed pre-brief to top targets', at: at(pre), standards: ['PT-7'] });
    else { flags.embargo = false; notes.push('Launch is too soon for an embargo pre-brief (needs 2 business days); skipped.'); }
  }
  steps.push({ phase: 'launch', label: flags.mode === 'crisis' ? 'Publish holding statement; reply to reporters covering the story' : 'Publish newsroom page, release wire, send launch pitches', at: at(launch), standards: ['OP-4', 'OP-5', 'OP-2'] });
  if (flags.mode !== 'crisis') {
    steps.push({ phase: 'social', label: 'Social amplification (platform-native posts)', at: at(new Date(launch.getTime() + 30 * 60000)), standards: ['SO-1', 'SO-2', 'SO-4'] });
    steps.push({ phase: 'newsletter', label: 'Email own audience / customers', at: at(new Date(launch.getTime() + 2 * 3600000)) });
    steps.push({ phase: 'follow_up', label: 'Single follow-up to non-responders, with a new detail', at: at(addBusinessDays(launch, 3, tz)), standards: ['PT-8'] });
  }
  steps.push({ phase: 'report', label: 'Results report (Barcelona Principles)', at: at(new Date(launch.getTime() + 7 * 86400000)), standards: ['ME-1', 'ME-2'] });
  return { steps, notes };
}

// Pricing for Claude-generated assets (per 1M tokens, USD) — see README "AI cost".
export const AI_PRICE = { input: 4, output: 20 };

export function estimate({ plan, targets, nw, llmUsage }) {
  const verdictRate = { strong: 0.09, moderate: 0.05, weak: 0.02 }[nw.verdict];
  const tierFactor = { 1: 0.6, 2: 1, 3: 1.4 };
  let placements = 0, reach = 0;
  for (const t of targets) {
    const p = Math.min(0.6, verdictRate * (tierFactor[t.tier] || 1) * (0.6 + t.score / 100) * (t.exclusive ? 4 : 1));
    placements += p;
    reach += p * (REACH_ESTIMATE[t.reach] || 400000) * (STORY_SHARE[t.tier] || 0.01);
  }
  const has = (id) => plan.channels.some((c) => c.id === id);
  if (has('value_wire')) reach += 25000; // syndicated pickups: real but small readership
  if (has('tier1_wire')) reach += 60000;
  const wireCost = plan.channels.filter((c) => c.kind === 'paid').reduce((n, c) => [n[0] + c.cost[0], n[1] + c.cost[1]], [0, 0]);
  const ai = llmUsage
    ? (llmUsage.input_tokens * AI_PRICE.input + llmUsage.output_tokens * AI_PRICE.output) / 1e6
    : 0;
  const B = AGENCY_BENCHMARK;
  return {
    placements: { low: Math.round(placements * 0.6 * 10) / 10, mid: Math.round(placements * 10) / 10, high: Math.round(placements * 1.5 * 10) / 10 },
    earnedReach: { low: Math.round(reach * 0.5), high: Math.round(reach * 1.5) },
    cost: { ai: Math.round(ai * 100) / 100, distribution: wireCost, total: [Math.round((ai + wireCost[0]) * 100) / 100, Math.round((ai + wireCost[1]) * 100) / 100] },
    benchmark: {
      label: B.label,
      cost: [B.retainerPerMonth[0] + B.wirePerRelease[0] + Math.round(B.databasePerYear[0] / 12), B.retainerPerMonth[1] + B.wirePerRelease[1] + Math.round(B.databasePerYear[1] / 12)],
      daysBriefToLaunch: B.daysBriefToLaunch,
    },
    method: 'Placements = Σ per-target coverage probability (news-value rate × tier factor × fit; ×4 for an exclusive). Reach = placements × outlet audience × typical story share. Estimates, not promises.',
  };
}
