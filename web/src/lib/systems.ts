// Admin → Data risk (owner 2026-11-05): every outside system BackX uses, what it holds, how risky it is, what
// protects it and what is still open. The admin chunk is a PUBLIC file: names, purposes and dashboard links only,
// never keys, account ids, addresses or confidential numbers. Review this list whenever a system is added or removed.

export type Risk = 'critical' | 'high' | 'medium' | 'low';
export type Group = 'Hosting and code' | 'Login and wallets' | 'Email and identity' | 'Money and chain' | 'Market data' | 'AI and marketing' | 'Validator servers';

export interface System {
  name: string;
  group: Group;
  use: string;
  data: string;            // what it holds or sees
  personal: boolean;       // holds or sees personal data
  risk: Risk;
  safeguards: string[];    // in place today (code or set up)
  actions: string[];       // still open (owner to check / do)
  links: [string, string][];
  planned?: boolean;
}

export const SYSTEMS: System[] = [
  // Hosting and code
  { name: 'Vercel', group: 'Hosting and code', use: 'Hosts www.backx.trade and app.backx.trade (the web build).', data: 'The public web app; visitor IP addresses in request logs. No secrets (VITE_* values are public).', personal: true, risk: 'medium',
    safeguards: ['CSP enforced in vercel.json (no inline scripts, no unsafe-eval)', 'X-Frame-Options DENY, frame-ancestors none', 'app host sends noindex', 'No secrets in the web build'],
    actions: ['Turn on 2FA for every Vercel account member', 'Limit team members to who needs it'],
    links: [['Dashboard', 'https://vercel.com/dashboard'], ['Status', 'https://www.vercel-status.com']] },
  { name: 'Railway (BackX project)', group: 'Hosting and code', use: 'Runs the API (api.backx.trade), Postgres, Redis and the outreach worker.', data: 'Postgres: account ids, wallet addresses, login method, session hashes, participation, proposal signals, admin audit, investor and outreach records, the outreach company profile. All server secrets (Privy secret, Microsoft app secret, Anthropic key).', personal: true, risk: 'high',
    safeguards: ['Postgres and Redis have no public networking', 'Secrets only in Railway variables, each in the one service that needs it', 'Outreach worker has no public domain', 'Server refuses to boot without required env', 'Sessions stored as SHA-256 hashes only'],
    actions: ['Turn on 2FA for every Railway account member', 'Check Postgres backups are on and test one restore', 'Rotate MS_CLIENT_SECRET before it expires (24 months from Nov 2026)'],
    links: [['Dashboard', 'https://railway.com/dashboard'], ['Status', 'https://status.railway.com']] },
  { name: 'Railway (backx-mcp project)', group: 'Hosting and code', use: 'Runs the MCP server mcp.backx.trade with its own Redis.', data: 'OAuth tokens (SHA-256 hashed), its own ed25519 signing key, the user id and wallet of connected accounts.', personal: true, risk: 'high',
    safeguards: ['Separate project, no access to the main database or secrets', 'Never holds a wallet key; users sign every step after the API checks it', 'Admin pause switch (Admin → Users) fails closed', 'Tokens: access 15 min, refresh 30 days rotated'],
    actions: ['Same 2FA check as the BackX project'],
    links: [['Dashboard', 'https://railway.com/dashboard'], ['MCP guide', 'https://www.backx.trade/mcp']] },
  { name: 'GitHub', group: 'Hosting and code', use: 'Source code (backx.trade, mcp.backx.trade), Actions (agent manifest, validator image), GHCR image ghcr.io/voicebillz/backx-keeper.', data: 'All code and history; Actions variables. Railway and Vercel deploy from main.', personal: false, risk: 'high',
    safeguards: ['No secrets, keys or .env files in git (rule in CLAUDE.md)', 'Pinned dependency versions'],
    actions: ['Turn on 2FA for every GitHub account with access', 'Protect the main branch (require review or at least block force-push)', 'Turn on Dependabot alerts and secret scanning'],
    links: [['backx.trade repo', 'https://github.com/voicebillz/backx.trade'], ['mcp repo', 'https://github.com/voicebillz/mcp.backx.trade'], ['Status', 'https://www.githubstatus.com']] },
  { name: 'GoDaddy', group: 'Hosting and code', use: 'Domain backx.trade, DNS, and the Microsoft 365 subscription (resold).', data: 'Who controls the domain, all DNS records (web, API, email, SPF/DKIM/DMARC), billing.', personal: false, risk: 'high',
    safeguards: ['SPF, DKIM and DMARC published for backx.trade'],
    actions: ['Turn on 2FA on the GoDaddy account', 'Turn on domain lock (transfer lock)', 'Set DMARC to p=reject after the DKIM check', 'Keep auto-renew on for backx.trade'],
    links: [['Domains', 'https://dcc.godaddy.com/control/portfolio'], ['Account', 'https://account.godaddy.com']] },
  { name: 'Google Fonts', group: 'Hosting and code', use: 'Web fonts on the site and in the pitch export.', data: 'Every visitor\'s IP address is sent to Google when fonts load.', personal: true, risk: 'low',
    safeguards: ['Allowed hosts listed in the CSP'],
    actions: ['Consider self-hosting the fonts (EU/GDPR: sending visitor IPs to Google has been ruled unlawful without consent)'],
    links: [['Google Fonts', 'https://fonts.google.com']] },

  // Login and wallets
  { name: 'Privy', group: 'Login and wallets', use: 'Login (email, SMS, Google, X, Discord, Twitch, Telegram, Farcaster, passkey, external wallet) and every user\'s embedded wallet.', data: 'Users\' emails, phone numbers and social accounts; wallet key shares (non-custodial). The API reads the embedded wallet with the app secret.', personal: true, risk: 'critical',
    safeguards: ['Own Privy app for BackX', 'App secret only on Railway (API)', 'Access tokens verified server-side with jose', 'CSP allows only Privy\'s hosts'],
    actions: ['Turn on 2FA on the Privy dashboard', 'Check allowed origins = only www.backx.trade and app.backx.trade', 'Check every enabled login method is still wanted'],
    links: [['Dashboard', 'https://dashboard.privy.io'], ['Status', 'https://status.privy.io']] },
  { name: 'WalletConnect (Reown)', group: 'Login and wallets', use: 'Relay for external wallets in the Privy login.', data: 'Wallet addresses and pairing messages while a user connects.', personal: true, risk: 'low',
    safeguards: ['Hosts listed in the CSP'], actions: [],
    links: [['Reown dashboard', 'https://cloud.reown.com']] },
  { name: 'Telegram login', group: 'Login and wallets', use: 'Telegram login widget (through Privy).', data: 'Telegram user id and name of users who log in with Telegram.', personal: true, risk: 'low',
    safeguards: ['Hosts listed in the CSP'], actions: ['Keep the bot token (BotFather) only in Privy'],
    links: [['BotFather', 'https://t.me/BotFather']] },
  { name: 'Cloudflare Turnstile', group: 'Login and wallets', use: 'Bot check inside the Privy login.', data: 'Browser signals during login.', personal: true, risk: 'low',
    safeguards: ['Loaded only through Privy; host listed in the CSP'], actions: [],
    links: [['Turnstile', 'https://www.cloudflare.com/products/turnstile/']] },

  // Email and identity
  { name: 'Microsoft 365 / Exchange', group: 'Email and identity', use: 'partner@backx.trade mailbox (outreach, partners, investors).', data: 'All emails sent and received, contacts.', personal: true, risk: 'high',
    safeguards: ['DKIM keys published', 'SPF includes Microsoft', 'DMARC published'],
    actions: ['Turn on MFA for every mailbox user', 'Enable DKIM signing in Defender (check it says Enabled)', 'Set DMARC to p=reject once mail passes'],
    links: [['Admin center', 'https://admin.microsoft.com'], ['Outlook', 'https://outlook.office.com'], ['Defender (DKIM)', 'https://security.microsoft.com'], ['Status', 'https://status.cloud.microsoft']] },
  { name: 'Microsoft Entra (app "BackX Outreach")', group: 'Email and identity', use: 'Lets the outreach worker send first outreach emails and read replies (Microsoft Graph).', data: 'With today\'s permissions the app could read and send mail for every mailbox in backx.trade.', personal: true, risk: 'high',
    safeguards: ['Client secret only on Railway (outreach service)', 'The worker has no code to reply, forward or delete mail', 'Outreach starts paused with a daily max of 0'],
    actions: ['Scope the app to partner@backx.trade (RBAC for Applications, outreach/README.md)', 'Then remove the tenant-wide Mail.Send / Mail.ReadWrite permissions', 'Note the secret\'s expiry date and rotate it before then'],
    links: [['Entra admin center', 'https://entra.microsoft.com'], ['Exchange admin', 'https://admin.exchange.microsoft.com']] },
  { name: 'GoDaddy DMARC reports', group: 'Email and identity', use: 'Receives the DMARC aggregate reports (rua address).', data: 'Sending-server IPs and pass / fail counts for mail using backx.trade.', personal: false, risk: 'low',
    safeguards: [], actions: [],
    links: [['GoDaddy account', 'https://account.godaddy.com']] },

  // Money and chain
  { name: 'Safe (Safe{Wallet})', group: 'Money and chain', use: 'The Safe that owns every BackX contract (upgrades, settings, Treasury).', data: 'Control of all contracts and the Treasury once deployed.', personal: false, risk: 'critical',
    safeguards: ['Owner keys are never handled by a server or script', 'The admin portal only builds Safe Transaction Builder files; the Safe signs'],
    actions: ['Use hardware wallets for the Safe signers', 'More than one signer with a threshold above 1 before launch', 'Create the Safe on Arbitrum before launch'],
    links: [['Safe app', 'https://app.safe.global']] },
  { name: 'LI.FI', group: 'Money and chain', use: 'Swap routes and USDC bridging.', data: 'User wallet addresses and swap amounts when quoting.', personal: true, risk: 'medium',
    safeguards: ['Routes only accepted when every tx targets the LI.FI Diamond', 'Exact approvals, re-quote before signing, >10 % loss refused'],
    actions: [],
    links: [['LI.FI', 'https://li.fi'], ['Status', 'https://status.li.fi']] },
  { name: 'RPC providers', group: 'Money and chain', use: 'Read chain data and send signed transactions (Robinhood Chain, PublicNode, BNB Chain, Arbitrum, Optimism, Polygon, Avalanche, Privy RPC).', data: 'Wallet addresses being read; transactions users sign.', personal: true, risk: 'medium',
    safeguards: ['Server-side reads are read-only', 'Several RPCs per chain for validators'],
    actions: ['Move to keyed RPC plans before launch (rate limits on public RPCs)'],
    links: [['PublicNode', 'https://publicnode.com'], ['Robinhood Chain', 'https://robinhood.com/us/en/chain/']] },
  { name: 'MEV Blocker / PancakeSwap MEV Guard', group: 'Money and chain', use: 'Private transaction routes on Ethereum and BNB Chain.', data: 'Signed transactions before they are mined.', personal: false, risk: 'low',
    safeguards: ['Only used as send routes; hosts listed in the CSP'], actions: [],
    links: [['MEV Blocker', 'https://mevblocker.io'], ['PancakeSwap', 'https://pancakeswap.finance']] },
  { name: 'Pyth', group: 'Money and chain', use: 'Fast price oracle (chosen; integration before the audit).', data: 'Public prices.', personal: false, risk: 'medium', planned: true,
    safeguards: [], actions: ['Integrate before the audit (open flaw in CLAUDE.md)'],
    links: [['Pyth', 'https://www.pyth.network']] },

  // Market data
  { name: 'CoinGecko', group: 'Market data', use: 'Prices, market list and coin platforms.', data: 'Public market data only.', personal: false, risk: 'low',
    safeguards: ['Cached in Redis'], actions: [],
    links: [['CoinGecko API', 'https://www.coingecko.com/en/api'], ['Status', 'https://status.coingecko.com']] },
  { name: 'GeckoTerminal', group: 'Market data', use: 'Pool and liquidity data for listing rules and the best launch chain.', data: 'Public market data only.', personal: false, risk: 'low',
    safeguards: ['Cached 1 h, background only'], actions: [],
    links: [['GeckoTerminal', 'https://www.geckoterminal.com']] },
  { name: 'GoPlus', group: 'Market data', use: 'Token security audit in the listing rules.', data: 'Public token addresses.', personal: false, risk: 'low',
    safeguards: [], actions: [],
    links: [['GoPlus', 'https://gopluslabs.io']] },
  { name: 'OpenSea', group: 'Market data', use: 'Gazz Tanks ownership (when OPENSEA_API_KEY is set; today an on-chain scan is used).', data: 'Public NFT ownership.', personal: false, risk: 'low', planned: true,
    safeguards: [], actions: [],
    links: [['OpenSea', 'https://opensea.io']] },

  // AI and marketing
  { name: 'Anthropic (Claude API)', group: 'AI and marketing', use: 'Outreach worker: maps pitch-form fields to the company profile. Emails never use it.', data: 'Form field labels and the outreach company profile (founder name, contacts, address if filled in).', personal: true, risk: 'medium',
    safeguards: ['Key only on Railway (outreach service)', 'Per-form and daily token caps in code', 'No screenshots or page HTML sent, only a field list'],
    actions: ['Set a monthly spend limit in the console', 'Use a separate key per service'],
    links: [['Console', 'https://platform.claude.com'], ['Status', 'https://status.claude.com']] },
  { name: 'OpenArt', group: 'AI and marketing', use: 'Marketing images (hook images, campaign art).', data: 'Prompts and generated images; uploaded reference images.', personal: false, risk: 'low',
    safeguards: ['Only AI-generated faces, no real people'], actions: [],
    links: [['OpenArt', 'https://openart.ai']] },

  // Validator servers
  { name: 'Validator servers', group: 'Validator servers', use: 'Our validators: 10 per chain on 5 servers (Railway, Oracle Cloud, Google Cloud, Northflank, Azure).', data: 'Hot gas keys per validator (capped at 0.02 ETH, excess swept to the Safe), encrypted at rest, rotated every 30 days.', personal: false, risk: 'medium', planned: true,
    safeguards: ['Keys made on each server, never sent anywhere', 'Signed heartbeats to the API', 'Gas cap and sweep to the Safe'],
    actions: ['2FA on each cloud account', 'Set KEY_SECRET per server and keep it only there'],
    links: [['Oracle Cloud', 'https://cloud.oracle.com'], ['Google Cloud', 'https://console.cloud.google.com'], ['Northflank', 'https://app.northflank.com'], ['Azure', 'https://portal.azure.com']] },
];

/** Where personal data lives (for the privacy policy and GDPR records). */
export const PERSONAL_DATA: [string, string, string][] = [
  ['Login identities (email, phone, social accounts)', 'Privy', 'Needed to log in; Privy is the processor'],
  ['Account id, wallet address, login method, session hashes', 'Railway Postgres', 'Running the account and sessions'],
  ['Participation and proposal signals', 'Railway Postgres', 'Participation list, Validator Proposals (shown publicly only as percentages)'],
  ['Admin audit log (admin wallet, action, time)', 'Railway Postgres', 'Security'],
  ['Investor outreach: firm contacts, emails sent, replies', 'Railway Postgres + Microsoft 365', 'Fundraising (business contacts published by the firms)'],
  ['Founder profile for forms (name, contacts, address if filled in)', 'Railway Postgres + Anthropic (per form)', 'Filling pitch forms'],
  ['Visitor IP addresses', 'Vercel, Railway logs, Google Fonts', 'Hosting and security'],
];
