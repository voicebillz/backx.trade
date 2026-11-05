import { config } from './config.js';
import { db, event, settings, today, markInvestor } from './db.js';
import { sendNew, emailHtml, conversationState } from './graph.js';
import { runForm, Stop } from './forms.js';
import { modelReady } from './llm.js';

// backx-outreach worker (owner 2026-11-05, docs/backx/OUTREACH-AGENT-PLAN.md). One job at a time, once a minute.
// It ONLY sends first outreach emails and fills pitch / apply forms that the owner queued in Admin → Outreach.
// It never replies to, forwards or deletes email; it only reads a conversation to stop on a reply or a bounce.
//
// Guardrails, in order, before anything goes out:
//   paused → send window → daily maximum (Admin, never above config.hardDailyMax) → spacing between sends →
//   the firm is not already checked off by the owner in Admin → Investors → never a second first-email to the
//   same firm or address → (forms) daily token cap, per-job token cap, CAPTCHA/login → owner's queue.

const TICK_MS = config.tickMs;
const REPLY_CHECK_MS = 10 * 60_000;
let lastReplyCheck = 0;
let stopping = false;

function inWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.sendZone, weekday: 'short', hour: 'numeric', hour12: false })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  return !['Sat', 'Sun'].includes(parts.weekday) && hour >= 9 && hour < 18;
}

async function claim() {
  const { rows } = await db.query(
    `with picked as (
       select id, status from outreach_jobs where status in ('approved', 'submit')
        order by approved_at nulls last, id limit 1 for update skip locked)
     update outreach_jobs j set status = 'sending', attempts = j.attempts + 1
       from picked where j.id = picked.id
     returning j.*, picked.status as prev`);
  return rows[0] ?? null;
}

const setJob = (id, fields) => {
  const keys = Object.keys(fields);
  return db.query(`update outreach_jobs set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [id, ...keys.map((k) => fields[k])]);
};

async function ownerAlreadyDone(job) {
  const { rows } = await db.query('select status, updated_by from investor_status where firm = $1', [job.firm]);
  return rows[0] && rows[0].updated_by !== 'outreach-agent' ? rows[0] : null;
}

async function doEmail(job) {
  const dup = await db.query(
    `select id from outreach_jobs where id <> $1 and channel = 'email' and status in ('sent', 'replied', 'bounced')
        and (lower(target) = lower($2) or firm = $3) limit 1`, [job.id, job.target, job.firm]);
  if (dup.rows.length) {
    await setJob(job.id, { status: 'skipped', note: `Already emailed (job #${dup.rows[0].id})` });
    return event(job.id, 'skipped', 'already emailed');
  }
  const { messageId, conversationId } = await sendNew({ to: job.target, subject: job.subject, html: emailHtml(job.body_text, job.signature_html) });
  await setJob(job.id, { status: 'sent', sent_at: new Date(), message_id: messageId, conversation_id: conversationId, last_error: null });
  await event(job.id, 'email.sent', `to ${job.target}`);
  await markInvestor(job.firm, 'emailed');
}

async function doForm(job, s, t) {
  if (!modelReady() && !job.fills) {
    await setJob(job.id, { status: 'manual', note: 'Forms need ANTHROPIC_API_KEY and ANTHROPIC_MODEL in Railway' });
    return event(job.id, 'manual', 'no model configured');
  }
  if (t.tokens >= config.dailyTokenCap) {
    await setJob(job.id, { status: job.prev }); // try again tomorrow
    return;
  }
  const [{ rows: prof }, { rows: deck }] = await Promise.all([
    db.query('select key, value from outreach_profile order by key'),
    db.query(`select filename, data from outreach_files where name = 'deck'`),
  ]);
  const profile = Object.fromEntries(prof.map((r) => [r.key, r.value]));
  const submit = job.prev === 'submit' || !s.forms_review;
  const budget = Math.min(config.jobTokenCap, config.dailyTokenCap - t.tokens);
  const saveShots = async (shots) => { for (const x of shots ?? []) if (x.image) await event(job.id, x.kind, null, x.image); };
  try {
    const r = await runForm({ url: job.target, profile, deck: deck[0] ?? null, saved: job.fills?.steps ?? null, submit, budget });
    await saveShots(r.shots);
    const tokens = { tokens_in: job.tokens_in + r.usage.in, tokens_out: job.tokens_out + r.usage.out, fills: { steps: r.steps } };
    if (r.status === 'review') {
      await setJob(job.id, { ...tokens, status: 'review', note: 'Filled in. Check the screenshot, then Approve to submit.' });
      return event(job.id, 'form.review');
    }
    await setJob(job.id, { ...tokens, status: 'submitted', sent_at: new Date(), last_error: null, note: null });
    await event(job.id, 'form.submitted', job.target);
    await markInvestor(job.firm, 'applied');
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    await saveShots(e.shots);
    await setJob(job.id, {
      status: 'manual', note: e.message, last_error: e.kind,
      tokens_in: job.tokens_in + (e.usage?.in ?? 0), tokens_out: job.tokens_out + (e.usage?.out ?? 0),
      fills: e.steps?.length ? { steps: e.steps } : job.fills,
    });
    await event(job.id, `manual.${e.kind}`, e.message);
  }
}

async function work() {
  const s = await settings();
  if (s.paused) return;
  if (!s.ignore_window && !inWindow()) return;
  const t = await today();
  const limit = Math.min(s.daily_max, config.hardDailyMax);
  if (t.done >= limit) return;
  if (t.last && Date.now() - new Date(t.last).getTime() < config.minGapMinutes * 60_000) return;
  const job = await claim();
  if (!job) return;
  try {
    const done = await ownerAlreadyDone(job);
    if (done) {
      await setJob(job.id, { status: 'skipped', note: `Checked off by you in Investors (${done.status})` });
      return event(job.id, 'skipped', 'owner already marked this firm');
    }
    if (job.channel === 'email') await doEmail(job);
    else if (job.channel === 'form') await doForm(job, s, t);
    else await setJob(job.id, { status: 'manual' });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    const failed = job.attempts >= 3;
    // An email whose send call errored might still have gone out: never retry it blindly.
    const status = e?.uncertain ? 'manual' : failed ? 'failed' : job.prev;
    await setJob(job.id, { status, last_error: msg, note: status === 'manual' ? 'Send may have failed: check Sent Items, then mark Done or Retry' : null });
    await event(job.id, 'error', msg);
  }
}

async function checkReplies() {
  if (Date.now() - lastReplyCheck < REPLY_CHECK_MS) return;
  lastReplyCheck = Date.now();
  const { rows } = await db.query(
    `select id, firm, conversation_id from outreach_jobs where channel = 'email' and status = 'sent' and conversation_id is not null
        and sent_at > now() - interval '60 days' order by sent_at desc limit 60`);
  for (const j of rows) {
    try {
      const state = await conversationState(j.conversation_id);
      if (!state) continue;
      await setJob(j.id, { status: state, replied_at: new Date() });
      await event(j.id, `email.${state}`); // read only: the agent never answers
    } catch (e) { console.error('reply check', j.id, e.message); }
  }
}

async function recover() {
  // A crash mid-job leaves 'sending'. Forms are safe to try again; an email might have gone out, so the owner checks.
  await db.query(`update outreach_jobs set status = 'approved' where status = 'sending' and channel = 'form'`);
  await db.query(`update outreach_jobs set status = 'manual', note = 'Worker restarted while sending: check Sent Items, then mark Done or Retry'
                   where status = 'sending' and channel = 'email'`);
}

async function main() {
  await recover();
  console.log(`backx-outreach running (mailbox ${config.ms.mailbox}, forms ${modelReady() ? 'on' : 'off'})`);
  while (!stopping) {
    try {
      await db.query('update outreach_settings set heartbeat_at = now() where id = 1');
      await checkReplies();
      await work();
    } catch (e) { console.error('tick', e.message); }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await db.end();
}

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; });
main();
