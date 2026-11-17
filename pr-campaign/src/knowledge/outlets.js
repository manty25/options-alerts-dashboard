// Seed outlet database (outlet level only — no personal contact data).
// Contacts come from the operator's own CSV import or from discovery; see src/engine/contacts.js.
// tier: 1 national/global flagship, 2 major trade or vertical, 3 niche, local or newsletter.
// reach: rough audience class used only for estimates: xl ≥ 50M, l 10–50M, m 1–10M, s < 1M monthly.

const O = (name, domain, tier, type, region, reach, beats) => ({ name, domain, tier, type, region, reach, beats });

export const OUTLETS = [
  // General news & business — national/global
  O('Reuters', 'reuters.com', 1, 'wire-service', 'global', 'xl', ['business', 'finance', 'markets', 'tech', 'policy', 'health', 'climate', 'energy']),
  O('Associated Press', 'apnews.com', 1, 'wire-service', 'global', 'xl', ['business', 'policy', 'local', 'health', 'science', 'climate', 'sports', 'entertainment']),
  O('Bloomberg', 'bloomberg.com', 1, 'national', 'global', 'xl', ['business', 'finance', 'markets', 'tech', 'energy', 'climate', 'policy']),
  O('The Wall Street Journal', 'wsj.com', 1, 'national', 'us', 'xl', ['business', 'finance', 'markets', 'tech', 'policy', 'health', 'real-estate']),
  O('The New York Times', 'nytimes.com', 1, 'national', 'us', 'xl', ['business', 'tech', 'policy', 'health', 'science', 'climate', 'lifestyle', 'food', 'travel']),
  O('Financial Times', 'ft.com', 1, 'national', 'global', 'l', ['business', 'finance', 'markets', 'tech', 'policy', 'energy']),
  O('CNBC', 'cnbc.com', 1, 'broadcast', 'us', 'xl', ['business', 'finance', 'markets', 'tech', 'startups']),
  O('Forbes', 'forbes.com', 1, 'national', 'us', 'xl', ['business', 'startups', 'finance', 'tech', 'hr-workplace', 'marketing']),
  O('Fortune', 'fortune.com', 1, 'national', 'us', 'l', ['business', 'finance', 'startups', 'hr-workplace', 'tech']),
  O('Business Insider', 'businessinsider.com', 1, 'national', 'us', 'xl', ['business', 'tech', 'startups', 'finance', 'retail', 'hr-workplace']),
  O('Axios', 'axios.com', 1, 'national', 'us', 'l', ['business', 'tech', 'policy', 'health', 'climate', 'startups', 'local']),
  O('The Guardian', 'theguardian.com', 1, 'national', 'uk', 'xl', ['business', 'tech', 'policy', 'science', 'climate', 'health', 'lifestyle']),
  O('BBC News', 'bbc.com', 1, 'broadcast', 'uk', 'xl', ['business', 'tech', 'policy', 'science', 'health', 'climate']),
  O('CNN Business', 'cnn.com', 1, 'broadcast', 'us', 'xl', ['business', 'tech', 'consumer', 'policy']),
  O('The Washington Post', 'washingtonpost.com', 1, 'national', 'us', 'xl', ['policy', 'tech', 'business', 'climate', 'health']),
  O('USA Today', 'usatoday.com', 1, 'national', 'us', 'xl', ['consumer', 'lifestyle', 'travel', 'local', 'sports', 'money']),
  O('NPR', 'npr.org', 1, 'broadcast', 'us', 'xl', ['policy', 'science', 'health', 'climate', 'business', 'local']),
  O('Fast Company', 'fastcompany.com', 2, 'national', 'us', 'm', ['business', 'tech', 'marketing', 'hr-workplace', 'climate', 'startups']),
  O('Inc.', 'inc.com', 2, 'national', 'us', 'm', ['startups', 'business', 'hr-workplace']),
  O('Entrepreneur', 'entrepreneur.com', 2, 'national', 'us', 'm', ['startups', 'business', 'marketing']),
  O('Quartz', 'qz.com', 2, 'national', 'global', 'm', ['business', 'tech', 'finance', 'hr-workplace']),
  // Tech
  O('TechCrunch', 'techcrunch.com', 1, 'trade', 'global', 'l', ['tech', 'startups', 'ai', 'enterprise-software', 'consumer-tech', 'transport', 'crypto']),
  O('The Verge', 'theverge.com', 1, 'trade', 'us', 'l', ['tech', 'consumer-tech', 'ai', 'gaming', 'transport', 'entertainment']),
  O('Wired', 'wired.com', 1, 'national', 'us', 'l', ['tech', 'ai', 'science', 'cybersecurity', 'policy', 'consumer-tech', 'transport']),
  O('Ars Technica', 'arstechnica.com', 2, 'trade', 'us', 'm', ['tech', 'science', 'cybersecurity', 'policy', 'gaming', 'ai']),
  O('Engadget', 'engadget.com', 2, 'trade', 'us', 'l', ['consumer-tech', 'gaming', 'tech', 'transport']),
  O('VentureBeat', 'venturebeat.com', 2, 'trade', 'us', 'm', ['ai', 'enterprise-software', 'tech', 'gaming', 'startups']),
  O('ZDNET', 'zdnet.com', 2, 'trade', 'us', 'l', ['enterprise-software', 'tech', 'cybersecurity', 'ai', 'consumer-tech']),
  O('CNET', 'cnet.com', 2, 'trade', 'us', 'l', ['consumer-tech', 'tech', 'consumer', 'transport']),
  O('The Information', 'theinformation.com', 1, 'trade', 'us', 's', ['tech', 'startups', 'ai', 'enterprise-software', 'finance']),
  O('MIT Technology Review', 'technologyreview.com', 2, 'trade', 'global', 'm', ['ai', 'science', 'climate', 'tech', 'biotech', 'energy']),
  O('Tom’s Guide', 'tomsguide.com', 2, 'trade', 'us', 'l', ['consumer-tech', 'consumer', 'gaming']),
  O('Gizmodo', 'gizmodo.com', 2, 'trade', 'us', 'm', ['tech', 'science', 'consumer-tech', 'entertainment']),
  O('SiliconANGLE', 'siliconangle.com', 3, 'trade', 'us', 's', ['enterprise-software', 'ai', 'tech', 'cybersecurity']),
  O('The Register', 'theregister.com', 2, 'trade', 'uk', 'm', ['enterprise-software', 'tech', 'cybersecurity', 'ai']),
  O('Sifted', 'sifted.eu', 2, 'trade', 'eu', 's', ['startups', 'tech', 'finance']),
  O('Tech.eu', 'tech.eu', 3, 'trade', 'eu', 's', ['startups', 'tech']),
  O('GeekWire', 'geekwire.com', 2, 'trade', 'us', 's', ['tech', 'startups', 'local', 'ai']),
  O('Dark Reading', 'darkreading.com', 2, 'trade', 'us', 's', ['cybersecurity']),
  O('BleepingComputer', 'bleepingcomputer.com', 2, 'trade', 'us', 'm', ['cybersecurity', 'tech']),
  O('CoinDesk', 'coindesk.com', 2, 'trade', 'global', 'm', ['crypto', 'finance']),
  // Finance & markets
  O('Barron’s', 'barrons.com', 2, 'trade', 'us', 'm', ['finance', 'markets']),
  O('MarketWatch', 'marketwatch.com', 2, 'national', 'us', 'l', ['finance', 'markets', 'business']),
  O('Yahoo Finance', 'finance.yahoo.com', 1, 'national', 'global', 'xl', ['finance', 'markets', 'business']),
  O('Seeking Alpha', 'seekingalpha.com', 3, 'trade', 'us', 'm', ['finance', 'markets']),
  O('American Banker', 'americanbanker.com', 3, 'trade', 'us', 's', ['finance']),
  // Health & science
  O('STAT', 'statnews.com', 1, 'trade', 'us', 'm', ['health', 'biotech', 'science', 'policy']),
  O('Fierce Healthcare', 'fiercehealthcare.com', 2, 'trade', 'us', 's', ['health', 'business']),
  O('Fierce Biotech', 'fiercebiotech.com', 2, 'trade', 'us', 's', ['biotech', 'health']),
  O('Healthcare Dive', 'healthcaredive.com', 3, 'trade', 'us', 's', ['health']),
  O('Scientific American', 'scientificamerican.com', 2, 'national', 'us', 'm', ['science', 'health', 'climate']),
  O('New Scientist', 'newscientist.com', 2, 'national', 'uk', 'm', ['science', 'health', 'climate', 'tech']),
  O('Science News', 'sciencenews.org', 2, 'trade', 'us', 's', ['science', 'health']),
  O('The Conversation', 'theconversation.com', 2, 'national', 'global', 'm', ['science', 'health', 'policy', 'education', 'climate']),
  // Climate, energy, transport
  O('Canary Media', 'canarymedia.com', 3, 'trade', 'us', 's', ['climate', 'energy']),
  O('Grist', 'grist.org', 2, 'national', 'us', 's', ['climate', 'energy', 'policy']),
  O('Electrek', 'electrek.co', 2, 'trade', 'global', 'm', ['transport', 'energy', 'climate', 'consumer-tech']),
  O('Streetsblog', 'streetsblog.org', 3, 'trade', 'us', 's', ['transport', 'local', 'policy']),
  O('Bicycling', 'bicycling.com', 3, 'trade', 'us', 's', ['transport', 'sports', 'consumer']),
  O('Utility Dive', 'utilitydive.com', 3, 'trade', 'us', 's', ['energy', 'climate', 'policy']),
  // Consumer, lifestyle, retail, food, travel
  O('Good Housekeeping', 'goodhousekeeping.com', 2, 'national', 'us', 'l', ['consumer', 'lifestyle', 'food']),
  O('Wirecutter', 'nytimes.com/wirecutter', 1, 'trade', 'us', 'l', ['consumer', 'consumer-tech', 'lifestyle']),
  O('Real Simple', 'realsimple.com', 2, 'national', 'us', 'm', ['lifestyle', 'consumer', 'food']),
  O('Retail Dive', 'retaildive.com', 3, 'trade', 'us', 's', ['retail', 'business']),
  O('Modern Retail', 'modernretail.co', 3, 'trade', 'us', 's', ['retail', 'marketing', 'consumer']),
  O('Food & Wine', 'foodandwine.com', 2, 'national', 'us', 'm', ['food', 'lifestyle', 'travel']),
  O('Eater', 'eater.com', 2, 'trade', 'us', 'm', ['food', 'local']),
  O('Travel + Leisure', 'travelandleisure.com', 2, 'national', 'us', 'm', ['travel', 'lifestyle']),
  O('Skift', 'skift.com', 2, 'trade', 'global', 's', ['travel', 'business']),
  // Marketing, HR, education, real estate, policy
  O('Adweek', 'adweek.com', 2, 'trade', 'us', 's', ['marketing']),
  O('Marketing Brew', 'marketingbrew.com', 3, 'newsletter', 'us', 's', ['marketing']),
  O('HR Dive', 'hrdive.com', 3, 'trade', 'us', 's', ['hr-workplace']),
  O('EdSurge', 'edsurge.com', 3, 'trade', 'us', 's', ['education', 'tech']),
  O('Inside Higher Ed', 'insidehighered.com', 3, 'trade', 'us', 's', ['education']),
  O('The Real Deal', 'therealdeal.com', 2, 'trade', 'us', 's', ['real-estate']),
  O('Politico', 'politico.com', 1, 'national', 'us', 'l', ['policy', 'health', 'tech', 'energy']),
  O('The Hill', 'thehill.com', 2, 'national', 'us', 'l', ['policy']),
  O('Chronicle of Philanthropy', 'philanthropy.com', 3, 'trade', 'us', 's', ['nonprofit']),
  // Gaming & entertainment
  O('IGN', 'ign.com', 1, 'trade', 'global', 'l', ['gaming', 'entertainment']),
  O('Polygon', 'polygon.com', 2, 'trade', 'us', 'm', ['gaming', 'entertainment']),
  O('PC Gamer', 'pcgamer.com', 2, 'trade', 'global', 'm', ['gaming']),
  O('GamesIndustry.biz', 'gamesindustry.biz', 2, 'trade', 'global', 's', ['gaming', 'business']),
  O('Variety', 'variety.com', 1, 'trade', 'us', 'l', ['entertainment']),
  O('The Hollywood Reporter', 'hollywoodreporter.com', 1, 'trade', 'us', 'l', ['entertainment']),
  O('Billboard', 'billboard.com', 2, 'trade', 'us', 'l', ['entertainment']),
  // Newsletters & podcasts
  O('Morning Brew', 'morningbrew.com', 2, 'newsletter', 'us', 'm', ['business', 'tech', 'finance']),
  O('TLDR', 'tldr.tech', 3, 'newsletter', 'global', 'm', ['tech', 'ai', 'startups']),
  O('Hacker Newsletter', 'hackernewsletter.com', 3, 'newsletter', 'global', 's', ['tech']),
  // Local & regional examples (replace with your own region via CSV import)
  O('Patch', 'patch.com', 3, 'local', 'us', 'l', ['local', 'nonprofit', 'education']),
  O('American City Business Journals', 'bizjournals.com', 2, 'local', 'us', 'm', ['business', 'local', 'startups', 'real-estate', 'hr-workplace']),
  O('Local TV news desk (your market)', 'local-tv.example', 2, 'broadcast', 'local', 'm', ['local', 'nonprofit', 'consumer']),
  O('Local newspaper (your market)', 'local-paper.example', 3, 'local', 'local', 's', ['local', 'nonprofit', 'business', 'education']),
];

export const REACH_ESTIMATE = { xl: 60_000_000, l: 20_000_000, m: 4_000_000, s: 400_000 };

// Share of an outlet's monthly audience that typically sees one story (rough planning factor).
export const STORY_SHARE = { 1: 0.004, 2: 0.008, 3: 0.015 };
