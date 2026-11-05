import pg from 'pg';
import { config } from './config.js';

// The main BackX Postgres over Railway's private network. The API (server/src/db.js) owns the schema; this worker
// only reads and writes the outreach_* tables and investor_status.
export const db = new pg.Pool({ connectionString: config.databaseUrl, max: 3 });

export const event = (jobId, kind, detail = null, image = null) =>
  db.query('insert into outreach_events (job_id, kind, detail, image) values ($1, $2, $3, $4)',
    [jobId, kind, detail ? String(detail).slice(0, 2000) : null, image]);

export async function settings() {
  const { rows } = await db.query('select * from outreach_settings where id = 1');
  return rows[0] ?? { paused: true, daily_max: 0, mode: 'approve', forms_review: true, ignore_window: false };
}

/** Emails + forms sent today (UTC) and model tokens used today. */
export async function today() {
  const { rows } = await db.query(
    `select count(*) filter (where status in ('sent','replied','bounced','submitted'))::int as done,
            coalesce(sum(tokens_in + tokens_out), 0)::int as tokens,
            max(sent_at) as last
       from outreach_jobs where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`);
  const last = await db.query(`select max(sent_at) as last from outreach_jobs where sent_at is not null`);
  return { ...rows[0], last: last.rows[0].last };
}

/** Ticks the checkmark in Admin → Investors, unless the owner already set one. */
export const markInvestor = (firm, status) =>
  db.query(`insert into investor_status (firm, status, updated_by) values ($1, $2, 'outreach-agent') on conflict (firm) do nothing`, [firm, status]);
