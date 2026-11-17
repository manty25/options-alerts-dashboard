import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file gets its own empty data directory and runs offline.
export function isolate(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relay-${name}-`));
  process.env.RELAY_DATA_DIR = dir;
  process.env.RELAY_OFFLINE = '1';
  process.env.RELAY_LLM = 'off';
  delete process.env.RELAY_EMAIL_PROVIDER;
  return dir;
}

export const FIXED_NOW = '2026-11-17T15:00:00Z'; // a Tuesday

export const briefs = {
  funding: { news: 'Fernwood Labs raises $12 million Series A led by Northstar Ventures to expand its carbon accounting software for mid-size manufacturers.', org: 'Fernwood Labs', city: 'Denver', regionName: 'Colorado', spokesperson: { name: 'Ana Ruiz', title: 'CEO' }, contact: { email: 'press@fernwood.example' }, about: 'Fernwood Labs builds carbon accounting software for manufacturers.' },
  earnings: { news: 'Orbis Corp reports third quarter revenue of $410 million, up 12% year over year, and raises full-year guidance.', org: 'Orbis Corp', publicCompany: true, ticker: 'NYSE: ORB' },
  crisis: { news: 'Paxton Bank statement on the service outage that affected online banking customers on Monday.', org: 'Paxton Bank' },
  research: { news: 'A new survey of 2,000 remote workers by Clearline finds 64% would take a pay cut to keep working from home.', org: 'Clearline' },
  local: { news: 'Brightwater Health opens a 24-hour urgent care clinic in Dayton that will create 45 jobs.', org: 'Brightwater Health' },
};
