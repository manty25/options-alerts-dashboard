// Tiny JSON-file store. Atomic writes; one directory per campaign.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, '..');

export function dataDir() {
  return path.resolve(process.env.RELAY_DATA_DIR || path.join(APP_ROOT, 'data'));
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
  return file;
}

export const campaignDir = (cid) => path.join(dataDir(), 'campaigns', cid);
export const campaignFile = (cid) => path.join(campaignDir(cid), 'campaign.json');

export function saveCampaign(c) {
  c.updatedAt = new Date().toISOString();
  writeJson(campaignFile(c.id), c);
  return c;
}

export function loadCampaign(cid) {
  if (!/^[a-z0-9_-]+$/i.test(cid)) return null;
  return readJson(campaignFile(cid), null);
}

export function listCampaigns() {
  const dir = path.join(dataDir(), 'campaigns');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((cid) => readJson(path.join(dir, cid, 'campaign.json'), null))
    .filter(Boolean)
    .map((c) => ({
      id: c.id, name: c.name, org: c.brief?.org, status: c.status, mode: c.mode, topic: c.analysis?.topic?.label,
      createdAt: c.createdAt, updatedAt: c.updatedAt, test: c.mode === 'test',
    }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function deleteCampaign(cid) {
  if (!/^[a-z0-9_-]+$/i.test(cid)) return false;
  fs.rmSync(campaignDir(cid), { recursive: true, force: true });
  return true;
}

// Append-only audit log of outbound actions (OP-8). Never contains secrets (OP-10).
export function audit(entry) {
  const file = path.join(ensureDir(dataDir()), 'audit.log');
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

export function readAudit(filter = () => true, limit = 500) {
  const file = path.join(dataDir(), 'audit.log');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((x) => x && filter(x)).slice(-limit);
}

export const globalFile = (name) => path.join(dataDir(), name);
