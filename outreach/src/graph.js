import { config } from './config.js';

// Microsoft Graph with the "BackX Outreach" app (client credentials). Only two things happen here: send a NEW
// outreach email, and read the same conversation to see whether the firm replied or the mail bounced.
// There is deliberately no function that replies to, forwards or deletes mail.

const GRAPH = config.ms.graphBase;
let token = null;

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch(`${config.ms.loginBase}/${encodeURIComponent(config.ms.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.ms.clientId, client_secret: config.ms.secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`graph token ${r.status} ${j.error ?? ''}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function graph(method, path, body) {
  const r = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 202 || r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`graph ${method} ${r.status} ${j.error?.code ?? ''} ${j.error?.message ?? ''}`.slice(0, 300));
  return j;
}

const mbox = () => `/users/${encodeURIComponent(config.ms.mailbox)}`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (s) => s.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);

/** The email as HTML: the approved text (paragraphs), the owner's signature, one opt-out line. */
export function emailHtml(text, signatureHtml) {
  const body = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
  const optOut = '<p style="margin:18px 0 0;font-size:12px;color:#8a8a8a">If this isn’t relevant, just reply and we won’t write again.</p>';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#111">${body}${signatureHtml || ''}${optOut}</div>`;
}

/** Creates the message (so we get its ids), then sends it. A copy lands in the mailbox's Sent Items. */
export async function sendNew({ to, subject, html }) {
  const draft = await graph('POST', `${mbox()}/messages`, {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: [{ emailAddress: { address: to } }],
  });
  try {
    await graph('POST', `${mbox()}/messages/${encodeURIComponent(draft.id)}/send`);
  } catch (e) {
    // The send call failed, but Microsoft may still have sent it: the worker must never resend blindly.
    throw Object.assign(new Error(`send uncertain: ${e.message}`), { uncertain: true });
  }
  return { messageId: draft.internetMessageId ?? draft.id, conversationId: draft.conversationId };
}

/** 'replied' | 'bounced' | null for a conversation we started. Read only. */
export async function conversationState(conversationId) {
  const q = `?$filter=${encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`)}&$select=from,subject,receivedDateTime,isDraft&$top=25`;
  const j = await graph('GET', `${mbox()}/messages${q}`);
  let state = null;
  for (const m of j?.value ?? []) {
    if (m.isDraft) continue;
    const from = (m.from?.emailAddress?.address ?? '').toLowerCase();
    if (!from || from === config.ms.mailbox) continue;
    if (/postmaster|mailer-daemon|microsoftexchange/.test(from) || /^(undeliverable|delivery status|mail delivery failed)/i.test(m.subject ?? '')) return 'bounced';
    state = 'replied';
  }
  return state;
}
