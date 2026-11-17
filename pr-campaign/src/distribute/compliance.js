// Live-mode compliance gate (DS-2, DS-3, OP-6). Every check must pass before a live launch.
import { isEmail } from '../util.js';
import { emailProvider } from './email.js';

export function complianceChecks(campaign) {
  const b = campaign.brief;
  const c = campaign.compliance || {};
  const targets = campaign.targets || [];
  const checks = [
    { id: 'DS-2', label: 'Campaign approved by a person', pass: Boolean(campaign.approvedAt) },
    { id: 'QA', label: 'No blocking quality errors (incl. no [TK] placeholders)', pass: (campaign.qa?.errors ?? 1) === 0 },
    { id: 'OP-6a', label: 'Real sender name and email', pass: Boolean(b.sender.name) && isEmail(b.sender.email) && !/\.(test|example|invalid|localhost)$/i.test(b.sender.email) },
    { id: 'OP-6b', label: 'Postal address set (CAN-SPAM)', pass: b.postalAddress.length >= 10 },
    { id: 'OP-6c', label: 'Legal basis recorded (legitimate interest, GDPR Art. 6(1)(f))', pass: c.legalBasis === 'legitimate_interest' },
    { id: 'OP-6d', label: 'Every pitch has an opt-out line', pass: (campaign.assets?.pitches || []).every((p) => /no thanks/i.test(p.body)) },
    { id: 'TG-real', label: 'Media list uses real, imported contacts (no demo desks)', pass: targets.length > 0 && !targets.some((t) => t.demo) },
    { id: 'OP-send', label: 'Email provider configured (Resend, Postmark or SendGrid)', pass: emailProvider() !== 'outbox' },
  ];
  return { pass: checks.every((x) => x.pass), checks };
}
