// backx-outreach worker config. Every value comes from Railway variables of THIS service only (never git, never
// VITE_*). The worker refuses to start without the mail and database settings; the model settings are only needed
// for forms (without them, form jobs go to the owner's manual queue instead).

function required(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  ms: {
    tenant: required('MS_TENANT_ID'),
    clientId: required('MS_CLIENT_ID'),
    secret: required('MS_CLIENT_SECRET'),
    mailbox: required('OUTREACH_MAILBOX').toLowerCase(),
    // Only for local tests against a fake Microsoft endpoint; leave unset on Railway.
    graphBase: process.env.MS_GRAPH_BASE || 'https://graph.microsoft.com/v1.0',
    loginBase: process.env.MS_LOGIN_BASE || 'https://login.microsoftonline.com',
  },
  // Forms only. The model id is a Railway variable on purpose (set it there; nothing is hard-coded).
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
  model: process.env.ANTHROPIC_MODEL?.trim() || null,
  // Hard limits that the Admin settings can never exceed.
  hardDailyMax: 50,
  minGapMinutes: Number(process.env.OUTREACH_MIN_GAP_MIN ?? 10),
  tickMs: Number(process.env.OUTREACH_TICK_MS ?? 60_000),
  dailyTokenCap: Number(process.env.OUTREACH_DAILY_TOKENS) || 300_000,
  jobTokenCap: 60_000,
  maxModelCallsPerJob: 12,
  maxFormSteps: 10,
  // Weekdays 09:00–18:00 in this time zone, unless "Ignore send window" is on in Admin.
  sendZone: process.env.OUTREACH_TZ || 'America/New_York',
};
