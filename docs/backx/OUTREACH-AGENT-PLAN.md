# Outreach agent: plan (owner 2026-11-05)

Status: PLAN, nothing built yet. The owner sets up the keys (section 3); then we build it in the phases of section 8.

## 1. What it does

An agent that works the list in Admin → Investors for the owner:

- **Sends the outreach emails** that are already written per firm (`email()` in `AdminInvestors.tsx`, WHY line per fund,
  links to /pitch, /pitch?view=whitepaper and the Google Slides deck, the BackX signature), from the BackX mailbox.
- **Fills in pitch / apply forms** (Base Ecosystem Fund, Alliance DAO, Delphi, Symbolic, Arbitrum Security Program …),
  including uploads such as the deck PDF, from an approved company profile.
- **Never sends more than the daily maximum** the owner sets in Admin.
- Anything it cannot finish (CAPTCHA, login wall, a required answer it does not have, an X DM) goes to a
  **manual queue** for the owner, with the answers ready to copy.
- **Everything is logged** in Railway Postgres: every email (message id, time, recipient), every form (screenshots
  before and after submit), every failure, every replied / bounced status.

## 2. Where it runs

- New Railway service `backx-outreach` in the backx project, built from `outreach/` in this repo, Node 24 + Playwright
  (Chromium). **No public domain** (like the validators). It shares the main Postgres over Railway's private network
  (own tables, below) and has a small Railway volume for screenshots and the uploaded deck.
- Admin → **Outreach** (new page, admins only, under the existing `/api/admin/*` rules: session + ADMIN_WALLETS,
  audited) shows the queue, the manual queue, the history and the settings. The API only writes jobs and settings;
  the worker does the sending.
- The worker checks Postgres every minute: paused? daily maximum reached? next job due? Then it does one job at a time.

## 3. What the owner sets up (keys and accounts)

All values go into Railway variables of the `backx-outreach` service only. Never in git, never in `VITE_*`.

| Variable | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. Set a **monthly spend limit** there first. |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Microsoft Entra admin center → App registrations → "BackX Outreach" (section 4). |
| `OUTREACH_MAILBOX` | The mailbox it sends from, e.g. `partner@backx.trade` (or the founder's own address). |
| `DATABASE_URL` | Railway reference to the main Postgres (`${{Postgres.DATABASE_URL}}`). |
| `DECK_URL` (optional) | Not needed: the deck PDF is uploaded in Admin → Outreach and kept on the volume. |

Nothing else: no Gmail/Outlook password is ever given to the agent.

## 4. Email access (Microsoft 365)

- Use the **Microsoft Graph API** with an app registration, not a password and not SMTP (Microsoft is retiring
  basic-auth SMTP). Permissions: `Mail.Send` and `Mail.ReadWrite` (application), admin consent.
- **Lock it to one mailbox**: an Exchange Online *RBAC for Applications* scope (or Application Access Policy) so the
  app can only touch `OUTREACH_MAILBOX`, never anyone else's mail.
- Sent mail lands in that mailbox's **Sent** folder like normal mail, so the owner sees every message in Outlook too.
- The worker reads replies in the same mailbox (thread / conversation id) to mark a firm **Replied** and stop, and
  reads bounces to mark **Bounced**.
- **GoDaddy note**: backx.trade's Microsoft 365 is resold by GoDaddy (tenant `NETORGFT…`). GoDaddy tenants often block
  Entra app registrations and admin consent. If the Entra admin center refuses, the fix is to move the tenant off
  GoDaddy ("defederate", Microsoft-documented, keeps the mailboxes) or to open a direct Microsoft 365 Business Basic
  subscription for the sending mailbox. Check this first (section 9, step 1).

## 5. Sending rules (hard limits in code, not only in the UI)

- **Daily maximum** set by the owner in Admin (default 0 = nothing goes out until the owner sets it). Counted per
  UTC day across email and forms. A kill switch (Pause all) stops the worker within a minute.
- **Mode**: `approve` (each job waits for the owner's Approve button) or `auto` (approved firms go out by themselves
  within the daily maximum). Start in `approve` for the first week.
- **Only addresses from `CONTACT` in `web/src/lib/investors.ts`** (published by the firm). The agent never guesses or
  searches for personal emails.
- **One first email per firm.** Follow-ups only if the owner turns them on (one follow-up after N days, never more),
  and never after a reply or a bounce.
- Spacing: at least 10 minutes between sends, only on weekdays 08–18 in the firm's region (better reply rates and
  normal sending behaviour for a new domain).
- No attachment in emails by default (links to /pitch instead): attachments in a first email from a new domain hurt
  delivery. Forms may upload the deck because they ask for it.
- Every email ends with the signature and one opt-out line ("If this isn't relevant, just reply and we won't write
  again."). Business addresses published for pitches are fine to contact this way; we honour every opt-out.
- The email text is the one already in Admin → Investors (the owner reads it there). The model does not rewrite it.

## 6. Forms

- Playwright opens the form URL from `CONTACT.apply`. The model reads the page (fields, labels, required marks) and
  maps each field to the **company profile**: one approved set of facts in Admin → Outreach (company, founder name,
  email, website, X, chain list, stage, amount raised / raising, use of funds, deck PDF, one-paragraph pitch, team,
  traction). It never invents an answer: a required field the profile does not cover sends the job to the manual
  queue with that question, so the owner adds the answer to the profile once and it is reused.
- Uploads: the deck PDF (and a logo if asked) from the volume.
- Screenshot of the filled form **before** submit and of the confirmation **after**, kept with the job.
  `review` setting: in the first week the agent stops before Submit and puts the filled screenshot in the queue for
  Approve; after that it submits by itself.
- **CAPTCHA, bot check, login or e-mail verification** → manual queue at once. The agent never tries to get around a
  CAPTCHA or a bot check.
- Multi-step forms (Typeform, Airtable, Google Forms, Tally, monday.com, HubSpot) are handled step by step; anything
  it cannot recognise goes to the manual queue.

## 7. Data (main Postgres, new tables)

- `outreach_settings` (one row): `daily_max`, `mode` (approve / auto), `forms_review` (bool), `paused`, `followup_days`.
- `outreach_profile` (key, value): the approved company facts for forms.
- `outreach_jobs`: firm, channel (email / form / x), target (address or URL), status (queued, approved, sending,
  sent, submitted, replied, bounced, failed, manual), attempts, last_error, message_id / conversation_id,
  created_at, sent_at, approved_by.
- `outreach_events`: job id, time, what happened, screenshot path. This is the history the owner asked for.
- When a job is sent / submitted, `investor_status` for that firm is set to Emailed / Applied, so the checkmarks in
  Admin → Investors stay in step.

## 8. Phases

1. **Email, approve mode.** Settings, profile, queue, history, Graph sending, Sent folder, Pause, daily maximum.
2. **Auto mode + replies.** Auto sending within the maximum, reply / bounce detection, optional single follow-up.
3. **Forms.** Playwright + model form filling, uploads, screenshots, review before submit, manual queue.
4. X: DMs stay manual (X does not allow automated DMs for this); the manual queue gets the text ready to paste.

## 9. Owner checklist (in this order)

1. Microsoft Entra admin center (entra.microsoft.com) with the backx.trade admin account: can you open
   *App registrations → New registration*? If yes, continue; if GoDaddy blocks it, tell us (section 4, GoDaddy note).
2. Create the app "BackX Outreach", add Graph application permissions `Mail.Send` + `Mail.ReadWrite`, grant admin
   consent, create a client secret (24 months). Copy tenant id, client id, secret.
3. Anthropic Console: create an API key for BackX, set a monthly spend limit.
4. Railway: new empty service `backx-outreach` in the BackX project, no domain; add the variables of section 3.
5. Tell us when it is done; we build phase 1 and restrict the app to the one mailbox together with you.
