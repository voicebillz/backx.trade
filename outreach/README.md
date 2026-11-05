# backx-outreach

The outreach worker (plan and rules: `docs/backx/OUTREACH-AGENT-PLAN.md`). It sends the first outreach emails and
fills pitch / apply forms that the owner queues and approves in **Admin → Outreach**. It never replies to, forwards or
deletes email: it only reads a conversation to mark a firm *Replied* or *Bounced* and stop.

## Railway (owner)

1. Service `backx-outreach` → Settings → Source: this repo, **Root Directory `outreach`**, builder Dockerfile.
   **No public domain** (Networking: leave it off).
2. Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (the main BackX Postgres) |
   | `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | the "BackX Outreach" app in Microsoft Entra |
   | `OUTREACH_MAILBOX` | `partner@backx.trade` |
   | `ANTHROPIC_API_KEY` | Anthropic Console key (set a monthly spend limit there) |
   | `ANTHROPIC_MODEL` | the model id for forms (only forms use the model; emails never do) |
   | `OUTREACH_DAILY_TOKENS` (optional) | model-token cap per day, default 300000 |
   | `OUTREACH_TZ` (optional) | send window zone, default `America/New_York` (weekdays 09–18) |

   Never set `MS_GRAPH_BASE` / `MS_LOGIN_BASE` there: they only exist for local tests.
3. Deploy. Admin → Outreach shows **Worker online** within a minute. The agent starts **paused** with a daily
   maximum of 0: nothing goes out until you press *Start agent* and set the maximum.

## Lock the app to one mailbox (do this before the first send)

Right now the Entra app may send as any mailbox in backx.trade. Scope it to `partner@backx.trade` with Exchange
Online "RBAC for Applications" (Microsoft 365 admin, PowerShell in the browser: shell.cloud.microsoft or Azure Cloud
Shell):

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # once
Connect-ExchangeOnline
# Object ID from Entra → Enterprise applications → BackX Outreach (NOT the app registration's object id)
New-ServicePrincipal -AppId <MS_CLIENT_ID> -ObjectId <ENTERPRISE_APP_OBJECT_ID> -DisplayName "BackX Outreach"
New-ManagementScope -Name "BackX Outreach mailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'partner@backx.trade'"
New-ManagementRoleAssignment -App <MS_CLIENT_ID> -Role "Application Mail.Send" -CustomResourceScope "BackX Outreach mailbox"
New-ManagementRoleAssignment -App <MS_CLIENT_ID> -Role "Application Mail.ReadWrite" -CustomResourceScope "BackX Outreach mailbox"
Test-ServicePrincipalAuthorization -Identity <MS_CLIENT_ID> -Resource partner@backx.trade   # shows InScope True
```

Then in Entra → App registrations → BackX Outreach → API permissions, **remove** the tenant-wide `Mail.Send` and
`Mail.ReadWrite` application permissions (the scoped Exchange roles replace them; leaving them would keep access to
every mailbox).

## Guardrails (in code)

- Paused by default; daily maximum set in Admin, never above 50; at least 10 minutes between sends; weekdays 09–18.
- Only addresses and form links from `web/src/lib/investors.ts` (published by the firms). One first email per firm
  and per address, ever. A firm checked off by the owner in Admin → Investors is skipped.
- Email text = the text the owner approved; a signature and one opt-out line are added. No attachments in emails.
- Forms: answers only from the approved company profile; a required answer it lacks, a CAPTCHA, a bot check or a
  login → the owner's queue (never worked around). Stays on the form's site. Review mode shows a screenshot before
  Submit; after approval the saved answers are replayed without a new model call.
- Model cost: forms only, compact field list (no screenshots or HTML sent), cached system prompt, low effort,
  ≤ 12 calls and 60k tokens per form, daily token cap.
- A send whose result is unclear is never retried automatically (owner checks Sent Items).
- Every step is logged in `outreach_events` (with screenshots for forms) and shown in Admin → Outreach → History.

## Local check

`npm ci && npm run check`. The form filler can be tested against a local page with `CHROMIUM_PATH` set to a local
Chromium and an injected `mapper` (see `runForm`).
