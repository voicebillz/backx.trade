import express from 'express';
import { db } from './db.js';

// Outreach agent, admin side (owner 2026-11-05, docs/backx/OUTREACH-AGENT-PLAN.md). The API only stores settings,
// the company profile, the deck and the jobs; the separate `backx-outreach` worker (outreach/, no public domain)
// sends and fills forms. Every route here sits behind adminRouter (session + ADMIN_WALLETS, own rate limit) and
// every write is audited. The agent only ever sends first outreach emails and pitch / apply forms: it never answers
// email.

const HARD_MAX = 50;                  // the daily maximum can never be set above this
const EMAIL = /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const ACTIVE = ['queued', 'approved', 'sending', 'review', 'submit', 'sent', 'submitted', 'replied', 'manual', 'done'];

const str = (v, max, { multiline = false, empty = false } = {}) =>
  typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0)
  && !(multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v);
const httpsUrl = (v) => { try { const u = new URL(v); return u.protocol === 'https:' && v.length <= 600; } catch { return false; } };

const jobOut = (r) => ({
  id: r.id, firm: r.firm, channel: r.channel, target: r.target, subject: r.subject, text: r.body_text, status: r.status,
  note: r.note, lastError: r.last_error, attempts: r.attempts, createdAt: r.created_at, approvedAt: r.approved_at,
  sentAt: r.sent_at, repliedAt: r.replied_at, shots: r.shots ?? 0, tokens: (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
});

export function mountOutreachAdmin(router, audit) {
  router.get('/outreach', async (_req, res, next) => {
    try {
      const [s, jobs, prof, deck, today] = await Promise.all([
        db.query('select * from outreach_settings where id = 1'),
        db.query(`select j.*, (select count(*) from outreach_events e where e.job_id = j.id and e.image is not null)::int as shots
                    from outreach_jobs j order by j.id desc limit 400`),
        db.query('select key, value from outreach_profile order by key'),
        db.query(`select filename, octet_length(data) as size, updated_at from outreach_files where name = 'deck'`),
        db.query(`select count(*) filter (where status in ('sent','replied','bounced') and channel = 'email')::int as emails,
                         count(*) filter (where status = 'submitted')::int as forms,
                         coalesce(sum(tokens_in + tokens_out), 0)::int as tokens
                    from outreach_jobs where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`),
      ]);
      const st = s.rows[0] ?? {};
      res.json({
        settings: { dailyMax: st.daily_max ?? 0, mode: st.mode ?? 'approve', formsReview: st.forms_review ?? true, paused: st.paused ?? true,
          ignoreWindow: st.ignore_window ?? false, hardMax: HARD_MAX },
        today: today.rows[0],
        heartbeat: st.heartbeat_at ?? null,
        jobs: jobs.rows.map(jobOut),
        profile: Object.fromEntries(prof.rows.map((r) => [r.key, r.value])),
        deck: deck.rows[0] ? { filename: deck.rows[0].filename, size: Number(deck.rows[0].size), at: deck.rows[0].updated_at } : null,
      });
    } catch (e) { next(e); }
  });

  router.post('/outreach/settings', async (req, res, next) => {
    const b = req.body ?? {};
    if (!Number.isInteger(b.dailyMax) || b.dailyMax < 0 || b.dailyMax > HARD_MAX || !['approve', 'auto'].includes(b.mode)
      || typeof b.formsReview !== 'boolean' || typeof b.paused !== 'boolean' || typeof b.ignoreWindow !== 'boolean') {
      return res.status(400).json({ error: 'invalid' });
    }
    try {
      await db.query(
        `insert into outreach_settings (id, daily_max, mode, forms_review, paused, ignore_window, updated_at) values (1, $1, $2, $3, $4, $5, now())
         on conflict (id) do update set daily_max = $1, mode = $2, forms_review = $3, paused = $4, ignore_window = $5, updated_at = now()`,
        [b.dailyMax, b.mode, b.formsReview, b.paused, b.ignoreWindow]);
      await audit(req, 'outreach.settings', 'settings', b);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // The facts the agent may use in forms. It never invents an answer outside these.
  router.post('/outreach/profile', async (req, res, next) => {
    const entries = req.body?.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return res.status(400).json({ error: 'invalid' });
    const list = Object.entries(entries);
    if (list.length > 80 || !list.every(([k, v]) => /^[a-z0-9_]{1,60}$/.test(k) && str(v, 3000, { multiline: true, empty: true }))) {
      return res.status(400).json({ error: 'invalid' });
    }
    try {
      await db.query('begin');
      await db.query('delete from outreach_profile');
      for (const [k, v] of list) if (v.trim()) await db.query('insert into outreach_profile (key, value) values ($1, $2)', [k, v.trim()]);
      await db.query('commit');
      await audit(req, 'outreach.profile', `${list.length} entries`, null);
      res.json({ ok: true });
    } catch (e) { await db.query('rollback').catch(() => {}); next(e); }
  });

  // The pitch deck PDF that forms may upload (max 15 MB). Raw body, not JSON (the admin JSON rule allows this path).
  router.post('/outreach/deck', express.raw({ type: 'application/pdf', limit: '15mb' }), async (req, res, next) => {
    const name = String(req.get('x-filename') || 'BackX-deck.pdf').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'BackX-deck.pdf';
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000 || req.body.subarray(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'pdf_only' });
    try {
      await db.query(
        `insert into outreach_files (name, filename, mime, data, updated_at) values ('deck', $1, 'application/pdf', $2, now())
         on conflict (name) do update set filename = $1, data = $2, updated_at = now()`, [name, req.body]);
      await audit(req, 'outreach.deck', name, { size: req.body.length });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Queue jobs. A firm that already has a job, or that you marked in Admin → Investors, is skipped.
  router.post('/outreach/jobs', async (req, res, next) => {
    const jobs = req.body?.jobs;
    if (!Array.isArray(jobs) || !jobs.length || jobs.length > 100) return res.status(400).json({ error: 'invalid' });
    for (const j of jobs) {
      const ok = str(j.firm, 120) && ['email', 'form', 'manual'].includes(j.channel)
        && (j.channel === 'email' ? EMAIL.test(j.target ?? '') && str(j.subject, 200) && str(j.text, 8000, { multiline: true }) && str(j.signatureHtml, 40000, { multiline: true, empty: true })
          : j.channel === 'form' ? httpsUrl(j.target)
          : str(j.target ?? '', 600, { empty: true }))
        && str(j.note ?? '', 600, { empty: true });
      if (!ok) return res.status(400).json({ error: 'invalid', firm: typeof j.firm === 'string' ? j.firm.slice(0, 120) : null });
    }
    try {
      const st = (await db.query('select mode from outreach_settings where id = 1')).rows[0];
      const first = st?.mode === 'auto' ? 'approved' : 'queued';
      let added = 0, skipped = 0;
      for (const j of jobs) {
        const busy = await db.query(
          `select 1 from outreach_jobs where firm = $1 and status = any($2)
            union all select 1 from investor_status where firm = $1 limit 1`, [j.firm, ACTIVE]);
        if (busy.rows.length) { skipped++; continue; }
        await db.query(
          `insert into outreach_jobs (firm, channel, target, subject, body_text, signature_html, note, status, approved_at, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8::text, case when $8::text = 'approved' then now() end, $9)`,
          [j.firm, j.channel, j.target ?? '', j.subject ?? null, j.text ?? null, j.signatureHtml ?? null, j.note ?? null,
            j.channel === 'manual' ? 'manual' : first, req.user.address]);
        added++;
      }
      await audit(req, 'outreach.queue', `${added} added, ${skipped} skipped`, null);
      res.json({ added, skipped });
    } catch (e) { next(e); }
  });

  // approve: queued → approved, review → submit (form filled, now submit it). cancel, retry, done (you did it yourself).
  router.post('/outreach/jobs/:id', async (req, res, next) => {
    const id = Number.parseInt(req.params.id, 10);
    const action = req.body?.action;
    if (!Number.isInteger(id) || id < 1 || !['approve', 'cancel', 'retry', 'done'].includes(action)) return res.status(400).json({ error: 'invalid' });
    try {
      const { rows } = await db.query('select * from outreach_jobs where id = $1', [id]);
      const j = rows[0];
      if (!j) return res.status(404).json({ error: 'not_found' });
      const to = action === 'approve' ? ({ queued: 'approved', review: 'submit' })[j.status]
        : action === 'cancel' ? (['queued', 'approved', 'review', 'manual', 'failed'].includes(j.status) ? 'cancelled' : null)
        : action === 'retry' ? (['failed', 'manual', 'cancelled'].includes(j.status) && j.channel !== 'manual' ? 'approved' : null)
        : (['manual', 'failed', 'review', 'queued'].includes(j.status) ? 'done' : null);
      if (!to) return res.status(409).json({ error: 'wrong_state', status: j.status });
      await db.query(
        `update outreach_jobs set status = $2, approved_at = case when $2 in ('approved','submit') then now() else approved_at end,
                last_error = case when $2 = 'approved' then null else last_error end where id = $1`, [id, to]);
      await db.query('insert into outreach_events (job_id, kind, detail) values ($1, $2, $3)', [id, `admin.${action}`, req.user.address]);
      if (to === 'done') {
        await db.query(
          `insert into investor_status (firm, status, updated_by) values ($1, $2, $3) on conflict (firm) do nothing`,
          [j.firm, j.channel === 'email' ? 'emailed' : 'applied', req.user.address]);
      }
      await audit(req, `outreach.${action}`, `#${id} ${j.firm}`, null);
      res.json({ ok: true, status: to });
    } catch (e) { next(e); }
  });

  // One job's history with screenshots (JPEG, base64).
  router.get('/outreach/jobs/:id/events', async (req, res, next) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid' });
    try {
      const { rows } = await db.query('select at, kind, detail, image from outreach_events where job_id = $1 order by id limit 60', [id]);
      res.json({ items: rows.map((r) => ({ at: r.at, kind: r.kind, detail: r.detail, image: r.image ? r.image.toString('base64') : null })) });
    } catch (e) { next(e); }
  });
}
