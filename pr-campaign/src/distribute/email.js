// Email delivery. Providers: outbox (default, local files), resend, postmark, sendgrid.
// Test mode always writes to the outbox; if RELAY_TEST_INBOX is set and a provider is configured,
// a copy goes to that inbox only, with the intended recipient in the subject (DS-3, OP-1).
// Plain text only, no attachments, no tracking pixel (PT-6, PT-9, OP-13). Idempotent (OP-9).
import path from 'node:path';
import fs from 'node:fs';
import { campaignDir, writeText, audit, readJson, writeJson } from '../store.js';
import { hash, isEmail } from '../util.js';

export function emailProvider() {
  const p = (process.env.RELAY_EMAIL_PROVIDER || '').toLowerCase();
  if (p === 'resend' && process.env.RESEND_API_KEY) return 'resend';
  if (p === 'postmark' && process.env.POSTMARK_TOKEN) return 'postmark';
  if (p === 'sendgrid' && process.env.SENDGRID_API_KEY) return 'sendgrid';
  return 'outbox';
}

function eml({ from, to, subject, text, headers = {} }) {
  const h = {
    From: from, To: to, Subject: subject, Date: new Date().toUTCString(), 'MIME-Version': '1.0',
    'Content-Type': 'text/plain; charset=utf-8', 'Content-Transfer-Encoding': '8bit', ...headers,
  };
  return Object.entries(h).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]+/g, ' ')}`).join('\r\n') + '\r\n\r\n' + text.replace(/\r?\n/g, '\r\n');
}

async function postJson(url, body, headers) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url.split('/')[2]} responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json().catch(() => ({}));
}

async function deliver(provider, msg) {
  const { from, to, subject, text, replyTo, listUnsubscribe } = msg;
  const extra = listUnsubscribe ? { 'List-Unsubscribe': `<mailto:${listUnsubscribe}?subject=unsubscribe>` } : {};
  if (provider === 'resend') {
    return postJson('https://api.resend.com/emails', { from, to: [to], subject, text, reply_to: replyTo, headers: extra }, { authorization: `Bearer ${process.env.RESEND_API_KEY}` });
  }
  if (provider === 'postmark') {
    return postJson('https://api.postmarkapp.com/email', { From: from, To: to, Subject: subject, TextBody: text, ReplyTo: replyTo, MessageStream: 'outbound', TrackOpens: false, Headers: Object.entries(extra).map(([Name, Value]) => ({ Name, Value })) }, { 'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN, accept: 'application/json' });
  }
  if (provider === 'sendgrid') {
    return postJson('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: to }] }], from: { email: from.replace(/^.*<|>$/g, '') || from, name: from.replace(/\s*<.*$/, '') }, reply_to: replyTo ? { email: replyTo } : undefined,
      subject, content: [{ type: 'text/plain', value: text }], headers: extra, tracking_settings: { open_tracking: { enable: false }, click_tracking: { enable: false } },
    }, { authorization: `Bearer ${process.env.SENDGRID_API_KEY}` });
  }
  throw new Error(`Unknown provider ${provider}`);
}

// Sends one message. Returns a delivery record.
export async function sendEmail(campaign, message) {
  const { to, subject, text, key } = message;
  const sentFile = path.join(campaignDir(campaign.id), 'sent-keys.json');
  const sent = readJson(sentFile, {});
  const idem = hash(`${campaign.id}:${key}`);
  if (sent[idem]) return { ...sent[idem], duplicate: true };

  const brief = campaign.brief;
  const fromAddr = brief.sender.email || process.env.RELAY_FROM_EMAIL || 'relay@localhost';
  const from = `${brief.sender.name || brief.contact.name} <${fromAddr}>`;
  const base = { from, to, subject, text, replyTo: isEmail(brief.contact.email) ? brief.contact.email : undefined, listUnsubscribe: fromAddr };
  const outboxPath = path.join(campaignDir(campaign.id), 'outbox', 'email', `${String(Date.now()).slice(-9)}-${idem}.eml`);
  writeText(outboxPath, eml({ ...base, headers: { 'X-Relay-Mode': campaign.mode, 'X-Relay-Key': key } }));

  const provider = emailProvider();
  let delivered = 'outbox', error = null, deliveredTo = null;
  try {
    if (campaign.mode === 'live' && provider !== 'outbox') {
      await deliver(provider, base); delivered = provider; deliveredTo = to;
    } else if (campaign.mode === 'test' && provider !== 'outbox' && isEmail(process.env.RELAY_TEST_INBOX)) {
      await deliver(provider, { ...base, to: process.env.RELAY_TEST_INBOX, subject: `[TEST → ${to}] ${subject}` });
      delivered = `${provider} (test inbox)`; deliveredTo = process.env.RELAY_TEST_INBOX;
    }
  } catch (e) { error = e.message; }

  const record = { key, to, subject, mode: campaign.mode, provider: delivered, deliveredTo, outbox: path.relative(campaignDir(campaign.id), outboxPath), at: new Date().toISOString(), error };
  if (!error) { sent[idem] = record; writeJson(sentFile, sent); }
  audit({ campaignId: campaign.id, channel: 'email', mode: campaign.mode, to, subject, provider: delivered, error });
  return record;
}

export function outboxFiles(cid) {
  const dir = path.join(campaignDir(cid), 'outbox');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const sub of fs.readdirSync(dir)) for (const f of fs.readdirSync(path.join(dir, sub))) out.push(`${sub}/${f}`);
  return out.sort();
}
