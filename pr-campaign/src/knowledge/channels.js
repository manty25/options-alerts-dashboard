// Channel catalog. cost = typical USD per campaign for the operator (list prices, 2026, approximate).
// automation: 'auto' (Relay sends it), 'assisted' (Relay prepares a ready-to-submit package),
// 'manual' (Relay gives copy + instructions).
// kind follows the PESO model: earned, owned, shared, paid.

export const CHANNELS = {
  pitch_email: {
    label: 'One-to-one journalist pitches', kind: 'earned', automation: 'auto', cost: [0, 0],
    hoursToLive: 0, why: 'Coverage journalists choose to write comes from relevant one-to-one pitches.',
  },
  exclusive: {
    label: 'Exclusive offer to one tier-1 outlet', kind: 'earned', automation: 'auto', cost: [0, 0],
    hoursToLive: 0, why: 'One outlet gets it first; exclusives get higher reply rates and anchor the launch.',
  },
  newsroom: {
    label: 'Owned newsroom page (SEO + AI search)', kind: 'owned', automation: 'auto', cost: [0, 0],
    hoursToLive: 0, why: 'Crawlable page with NewsArticle data, fact sheet and RSS: what AI assistants and search cite.',
  },
  value_wire: {
    label: 'Value newswire (e.g. EIN Presswire, PRWeb)', kind: 'paid', automation: 'assisted', cost: [99, 400],
    hoursToLive: 4, why: 'Cheap syndication and indexing for SEO and AI-search footprint; not a journalist-attention channel.',
  },
  tier1_wire: {
    label: 'Tier-1 newswire (PR Newswire / Business Wire / GlobeNewswire)', kind: 'paid', automation: 'assisted', cost: [400, 1500],
    hoursToLive: 2, why: 'Required for simultaneous public disclosure of material news; reaches financial terminals.',
  },
  science_wire: {
    label: 'Science news service (EurekAlert! / AlphaGalileo)', kind: 'paid', automation: 'assisted', cost: [0, 300],
    hoursToLive: 24, why: 'Science reporters use these with embargo support tied to journal publication.',
  },
  linkedin: { label: 'LinkedIn post (company + spokesperson)', kind: 'shared', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Strongest organic channel for B2B, hiring and executive news.' },
  x: { label: 'X post', kind: 'shared', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Where many reporters still watch tech, finance and politics news break.' },
  bluesky: { label: 'Bluesky post', kind: 'shared', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Large journalist, science and tech community; free open API.' },
  threads: { label: 'Threads post', kind: 'shared', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Consumer reach adjacent to Instagram.' },
  mastodon: { label: 'Mastodon post', kind: 'shared', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Open-source, science and developer communities.' },
  hacker_news: { label: 'Hacker News (Show HN)', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Developer audience; high-intent traffic when the product is technical.' },
  product_hunt: { label: 'Product Hunt launch', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Early-adopter audience for new software products.' },
  reddit: { label: 'Relevant subreddits (follow each sub’s rules)', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Niche communities; must be genuinely useful, never spam.' },
  discord: { label: 'Discord communities', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Where gaming and developer communities talk.' },
  facebook: { label: 'Facebook page and local groups', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Local and community audiences.' },
  instagram: { label: 'Instagram', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Visual consumer and lifestyle stories.' },
  tiktok: { label: 'TikTok', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Consumer, gaming and entertainment reach via short video.' },
  youtube: { label: 'YouTube', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Trailers, demos, long-form explainers.' },
  nextdoor: { label: 'Nextdoor', kind: 'shared', automation: 'manual', cost: [0, 0], hoursToLive: 0, why: 'Hyper-local reach.' },
  creators: { label: 'Creators / reviewers outreach', kind: 'earned', automation: 'auto', cost: [0, 0], hoursToLive: 0, why: 'Creators drive consumer and gaming discovery; same pitch rules as journalists.' },
  community_calendars: { label: 'Community and event calendars', kind: 'owned', automation: 'manual', cost: [0, 0], hoursToLive: 24, why: 'Free listings that local media and audiences check.' },
  newsletter_own: { label: 'Own email newsletter / customer list', kind: 'owned', automation: 'assisted', cost: [0, 0], hoursToLive: 0, why: 'Your most engaged audience; drives the first wave of social proof.' },
};

export const SOCIAL_LIMITS = {
  x: { chars: 280, hashtags: 2 },
  bluesky: { chars: 300, hashtags: 2 },
  threads: { chars: 500, hashtags: 2 },
  mastodon: { chars: 500, hashtags: 3 },
  linkedin: { chars: 3000, hashtags: 3, hook: 210 },
};

// Traditional benchmark used for the cost/speed comparison (docs/RESEARCH.md §1, §3).
export const AGENCY_BENCHMARK = {
  label: 'Typical agency + wire + media database',
  retainerPerMonth: [5000, 25000],
  wirePerRelease: [400, 1500],
  databasePerYear: [5000, 15000],
  daysBriefToLaunch: [7, 14],
};
