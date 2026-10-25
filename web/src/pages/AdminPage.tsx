import { AdminBranding } from './AdminBranding';
import { AdminKeepers } from './AdminKeepers';
import { AdminBestChain } from './AdminBestChain';
import { AdminKeeperRecipe } from './AdminKeeperRecipe';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { go, href, type Route } from '../lib/router';
import { CoinIcon } from '../components/CoinIcon';

// Admin portal (owner 2026-10-19). Its own chunk, only rendered for admins; the server checks ADMIN_WALLETS on
// every /api/admin call and answers 404 to anyone else, so this file holds no secrets and grants nothing.

interface Asset {
  id: number; chainId: number; symbol: string; name: string; tokenAddress: string; decimals: number;
  poolAddress: string | null; oracleAddress: string | null; adapterAddress: string | null; poolFeeBps: number; maxM: number;
  liqMarginBps: number; maxPositionUsd: number; maxOpenUsd: number; logoUrl: string | null; enabled: boolean; notes: string | null;
  updatedAt: string; updatedBy: string; deployStatus: 'draft' | 'proposed' | 'deployed';
  deployed: { manager: string; usdVault: string; hedgeFund: string; factory: string } | null;
}
interface Chain {
  id: number; key: string; name: string; explorer: string; factory: string | null;
  stable: { symbol: string; address: string; decimals: number } | null;
  wrappedNative: { symbol: string; address: string; decimals: number };
}
interface TokenHit { symbol: string; name: string; address: string; decimals: number }
interface CheckItem { key: string; label: string; ok: boolean; value: number | string | null; required: boolean }
interface Report {
  pass: boolean; checkedAt: string; tier: string | null; maxM: number; minMarginBps: number; maxPositionUsd: number; maxOpenUsd: number;
  market: { marketCap: number | null; liquidity: number | null; volume: number | null; ageDays: number | null; logo: string | null };
  items: CheckItem[];
}
const usdShort = (n: number | null) => n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`;

/** The listing recipe: the same rules the server enforces before it builds a deploy transaction. */
function Requirements() {
  return (
    <details className="recipe" open>
      <summary><b>Listing requirements</b> <span className="muted">· checked live, a coin that fails is rejected</span></summary>
      <ol>
        <li>Market cap at least <b>$10M</b> and DEX liquidity on the chosen chain at least <b>$1M</b>.</li>
        <li>24 h volume at least <b>$500k</b>, trading for at least <b>30 days</b>.</li>
        <li>Automated on-chain audit (GoPlus) passes: verified source, not a honeypot, <b>no buy/sell/transfer tax</b>, no hidden minting or owner, transfers cannot be paused or blacklisted, no self-destruct.</li>
        <li>A <b>swap adapter</b> and a <b>TWAP oracle</b> (1–5 min window) for the coin's pool, reviewed in the audit.</li>
        <li>Tier sets the limits: <b>Major</b> (≥ $10B cap, ≥ $20M liquidity) 20× / margin ≥ 1.5 % · <b>Large</b> (≥ $1B, ≥ $5M) 5× / 2 % · <b>Mid</b> (≥ $100M, ≥ $2M) 3× / 3 % · <b>Small</b> 2× / 4 %.</li>
        <li>Max position at most <b>0.5 % of DEX liquidity</b>, and all open hedges together at most <b>10 %</b> (5 % recommended), so even a crash that liquidates everyone can be sold fast with little price impact.</li>
      </ol>
    </details>
  );
}

function ReportView({ r }: { r: Report }) {
  return (
    <div className={'check-report ' + (r.pass ? 'pass' : 'fail')} role="status">
      <p className="check-head">
        <b>{r.pass ? '✓ Passes the listing requirements' : '✕ Rejected: does not meet the requirements'}</b>
        {r.tier && <span className="muted"> · tier {r.tier}: up to {r.maxM}×, margin ≥ {r.minMarginBps / 100} %, max position {usdShort(r.maxPositionUsd)}</span>}
      </p>
      <p className="muted num">Cap {usdShort(r.market.marketCap)} · liquidity {usdShort(r.market.liquidity)} · 24 h volume {usdShort(r.market.volume)} · {r.market.ageDays ?? '—'} days</p>
      <ul className="check-list">
        {r.items.map((i) => <li key={i.key} className={i.ok ? 'ok' : i.required ? 'bad' : 'warn'}><span aria-hidden="true">{i.ok ? '✓' : i.required ? '✕' : '!'}</span> {i.label}{!i.required && !i.ok ? ' (check by hand)' : ''}</li>)}
      </ul>
    </div>
  );
}
interface AuditRow { at: string; admin: string; action: string; target: string | null }
interface UserRow {
  address: string; solanaAddress: string | null; signupMethod: string | null; lastLoginMethod: string | null;
  signedUpAt: string; lastLoginAt: string; activeSessions: number; isAdmin: boolean;
}
interface UsersResp {
  items: UserRow[]; hasMore: boolean; page: number;
  stats: { total: number; day: number; week: number; active_day: number; methods: { method: string; n: number }[] };
}

const FEE_TIERS = [1, 5, 25, 30, 100];
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function CopyAddr({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="addr-copy num" title={value} aria-label={`Copy ${value}`}
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}>
      {done ? 'Copied' : short(value)}
    </button>
  );
}

export default function AdminPage({ route }: { route: Route }) {
  return (
    <main id="main" className="page admin-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Admin portal</p>
          <h1>{route === 'adminUsers' ? 'Users' : route === 'adminParticipants' ? 'Participants' : route === 'adminContracts' ? 'Contracts' : route === 'adminBranding' ? 'Branding' : route === 'adminKeepers' ? 'Validators' : 'Listed assets'}</h1>
        </div>
      </header>
      <div className="admin-grid">
        <nav className="profile-tabs" aria-label="Admin sections">
          <a href={href('admin')} onClick={go('admin')} className={route === 'admin' ? 'active' : ''} aria-current={route === 'admin' ? 'page' : undefined}>Listed assets</a>
          <a href={href('adminUsers')} onClick={go('adminUsers')} className={route === 'adminUsers' ? 'active' : ''} aria-current={route === 'adminUsers' ? 'page' : undefined}>Users</a>
          <a href={href('adminContracts')} onClick={go('adminContracts')} className={route === 'adminContracts' ? 'active' : ''} aria-current={route === 'adminContracts' ? 'page' : undefined}>Contracts</a>
          <a href={href('adminKeepers')} onClick={go('adminKeepers')} className={route === 'adminKeepers' ? 'active' : ''} aria-current={route === 'adminKeepers' ? 'page' : undefined}>Validators</a>
          <a href={href('adminParticipants')} onClick={go('adminParticipants')} className={route === 'adminParticipants' ? 'active' : ''} aria-current={route === 'adminParticipants' ? 'page' : undefined}>Participants</a>
          <a href={href('adminBranding')} onClick={go('adminBranding')} className={route === 'adminBranding' ? 'active' : ''} aria-current={route === 'adminBranding' ? 'page' : undefined}>Branding</a>
          <a href={href('profile')} onClick={go('profile')}>← Back to profile</a>
        </nav>
        <div className="admin-body">{route === 'adminUsers' ? <Users /> : route === 'adminParticipants' ? <Participants /> : route === 'adminContracts' ? <Contracts /> : route === 'adminBranding' ? <AdminBranding /> : route === 'adminKeepers' ? <AdminKeepers /> : <Assets />}</div>
      </div>
    </main>
  );
}

// ---- Listed assets ----------------------------------------------------------------------------

const STATUS: Record<Asset['deployStatus'], string> = { draft: 'Draft', proposed: 'Waiting for Safe', deployed: 'Live contracts' };

function Assets() {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [deploying, setDeploying] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, l, c] = await Promise.all([
        api<{ items: Asset[] }>('/api/admin/assets'), api<{ items: AuditRow[] }>('/api/admin/audit'), api<{ items: Chain[] }>('/api/admin/chains'),
      ]);
      setItems(a.items); setAudit(l.items); setChains(c.items); setErr(false);
    } catch { setErr(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Asset) => {
    try { await api(`/api/admin/assets/${a.id}`, json({ ...toBody(toForm(a)), enabled: !a.enabled })); load(); }
    catch { setErr(true); }
  };
  const chainName = (id: number) => chains.find((c) => c.id === id)?.name ?? `Chain ${id}`;

  const enabled = items?.filter((a) => a.enabled).length ?? 0;
  const live = items?.filter((a) => a.deployStatus === 'deployed').length ?? 0;
  return (
    <>
      <section className="card">
        <div className="row-between">
          <dl className="admin-stats">
            <div><dt className="label">Listed</dt><dd className="num">{items ? items.length : '—'}</dd></div>
            <div><dt className="label">Enabled</dt><dd className="num">{items ? enabled : '—'}</dd></div>
            <div><dt className="label">Live contracts</dt><dd className="num">{items ? live : '—'}</dd></div>
            <div><dt className="label">Chains</dt><dd className="num">{chains.length || '—'}</dd></div>
          </dl>
          <button className="btn btn-gold" onClick={() => setEditing('new')} disabled={!chains.length}>+ Add asset</button>
        </div>
        <p className="hint">Add and save, then <b>Deploy contracts</b>: the portal prepares one transaction that creates the coin's own reserve, security fund and trading contract. The Safe signs it; the server never holds keys.</p>
      </section>
      <AdminBestChain />

      {err && <p className="field-err" role="alert">Could not reach the admin API. Sign in again or try later.</p>}

      <section className="card">
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Asset</th><th>Chain</th><th>Token</th><th className="r">Max</th><th className="r">Liq. margin</th><th>Contracts</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {items === null && !err && Array.from({ length: 4 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={8}><span className="sk sk-w60" /></td></tr>)}
              {items?.length === 0 && <tr><td colSpan={8} className="muted admin-empty">No assets yet. Add the first one.</td></tr>}
              {items?.map((a) => (
                <tr key={a.id}>
                  <td><span className="cell-market"><CoinIcon symbol={a.symbol} src={a.logoUrl ?? undefined} size={24} /><span><b>{a.symbol}</b><small className="muted"> {a.name}</small></span></span></td>
                  <td>{chainName(a.chainId)}</td>
                  <td><CopyAddr value={a.tokenAddress} /></td>
                  <td className="r num">{a.maxM}×</td>
                  <td className="r num">{pct(a.liqMarginBps)}</td>
                  <td>
                    <span className={'deploy-pill ' + a.deployStatus}>{STATUS[a.deployStatus]}</span>
                    {a.deployStatus !== 'deployed' && <button className="btn-mini" onClick={() => setDeploying(a)}>{a.deployStatus === 'proposed' ? 'Continue' : 'Deploy contracts'}</button>}
                    {a.deployed && <CopyAddr value={a.deployed.manager} />}
                  </td>
                  <td>
                    <button className={'status-pill ' + (a.enabled ? 'on' : 'off')} onClick={() => toggle(a)} aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.symbol}`}>
                      <span aria-hidden="true">{a.enabled ? '●' : '○'}</span> {a.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="r admin-actions">
                    <button className="btn-mini" onClick={() => setEditing(a)}>Edit</button>
                    {a.deployStatus === 'draft' && <button className="btn-mini danger" onClick={() => setDeleting(a)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Recent changes</h2>
        {audit.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <ul className="audit-list">
            {audit.slice(0, 12).map((r, i) => (
              <li key={i}><span className="num muted">{when(r.at)}</span> <b>{r.action.replace('asset.', '').replace('_', ' ')}</b> {r.target?.split(' ')[0]} <span className="muted num">by {short(r.admin)}</span></li>
            ))}
          </ul>
        )}
      </section>

      {editing && <AssetForm chains={chains} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={(saved, deploy) => { setEditing(null); load(); if (deploy) setDeploying(saved); }} />}
      {deleting && <DeleteAsset asset={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
      {deploying && <Deploy asset={deploying} chain={chains.find((c) => c.id === deploying.chainId)} onClose={() => { setDeploying(null); load(); }} />}
    </>
  );
}

interface FormState {
  chainId: number; symbol: string; name: string; tokenAddress: string; decimals: string; poolAddress: string; oracleAddress: string;
  adapterAddress: string; poolFeeBps: number; maxM: number; liqMargin: string; maxPositionUsd: string; maxOpenUsd: string;
  logoUrl: string; enabled: boolean; notes: string;
}

const toForm = (a: Asset | null, chainId = 4663): FormState => ({
  chainId: a?.chainId ?? chainId, symbol: a?.symbol ?? '', name: a?.name ?? '', tokenAddress: a?.tokenAddress ?? '',
  decimals: String(a?.decimals ?? 18), poolAddress: a?.poolAddress ?? '', oracleAddress: a?.oracleAddress ?? '',
  adapterAddress: a?.adapterAddress ?? '', poolFeeBps: a?.poolFeeBps ?? 30, maxM: a?.maxM ?? 5,
  liqMargin: a ? String(a.liqMarginBps / 100) : '1.5', maxPositionUsd: String(a?.maxPositionUsd ?? 50_000),
  maxOpenUsd: String(a?.maxOpenUsd ?? 2_000_000), logoUrl: a?.logoUrl ?? '', enabled: a?.enabled ?? false, notes: a?.notes ?? '',
});

const toBody = (f: FormState) => ({
  chainId: f.chainId, symbol: f.symbol.trim(), name: f.name.trim(), tokenAddress: f.tokenAddress.trim(), decimals: Number(f.decimals),
  poolAddress: f.poolAddress.trim(), oracleAddress: f.oracleAddress.trim(), adapterAddress: f.adapterAddress.trim(),
  poolFeeBps: f.poolFeeBps, maxM: f.maxM, liqMarginBps: Math.round(Number(f.liqMargin) * 100),
  maxPositionUsd: Number(f.maxPositionUsd), maxOpenUsd: Number(f.maxOpenUsd), logoUrl: f.logoUrl.trim(), enabled: f.enabled, notes: f.notes.trim(),
});

/** Same rules as server/src/admin.js; the server checks again and its answer wins. */
function check(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Za-z0-9$._-]{1,16}$/.test(f.symbol.trim())) e.symbol = '1–16 letters, digits or $ . _ -';
  if (!f.name.trim() || f.name.trim().length > 64) e.name = '1–64 characters';
  if (!ADDR.test(f.tokenAddress.trim())) e.tokenAddress = 'A 0x address (42 characters)';
  const d = Number(f.decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) e.decimals = '0–36';
  for (const k of ['poolAddress', 'oracleAddress', 'adapterAddress'] as const) {
    if (f[k].trim() && !ADDR.test(f[k].trim())) e[k] = 'A 0x address, or leave empty';
  }
  const mg = Number(f.liqMargin);
  if (!Number.isFinite(mg) || mg < 0 || mg > 5) e.liqMarginBps = '0–5 %';
  const mp = Number(f.maxPositionUsd), mo = Number(f.maxOpenUsd);
  if (!Number.isInteger(mp) || mp < 100 || mp > 10_000_000) e.maxPositionUsd = '$100 – $10M';
  if (!Number.isInteger(mo) || mo < 1_000 || mo > 1_000_000_000 || mo < mp) e.maxOpenUsd = 'At least the max position, up to $1B';
  if (f.logoUrl.trim() && !/^https:\/\//.test(f.logoUrl.trim())) e.logoUrl = 'An https:// link, or leave empty';
  if (f.notes.length > 500) e.notes = 'Max 500 characters';
  return e;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-err" id={id + '-err'}>{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function AssetForm({ chains, initial, onClose, onSaved }: {
  chains: Chain[]; initial: Asset | null; onClose: () => void; onSaved: (a: Asset, deploy: boolean) => void;
}) {
  const id = useId();
  const [f, setF] = useState<FormState>(() => toForm(initial, chains[0]?.id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TokenHit[] | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [checking, setChecking] = useState(false);
  const runChecks = async () => {
    if (!ADDR.test(f.tokenAddress.trim())) { setErrors((e) => ({ ...e, tokenAddress: 'A 0x address (42 characters)' })); return; }
    setChecking(true); setReport(null);
    try {
      const r = await api<Report>(`/api/admin/listing-check?chainId=${f.chainId}&token=${f.tokenAddress.trim().toLowerCase()}`);
      setReport(r);
      // Apply the tier's limits so the form can only ask for what the server will accept.
      if (r.tier) setF((x) => ({
        ...x,
        maxM: Math.min(x.maxM, r.maxM),
        liqMargin: String(Math.max(Number(x.liqMargin) || 0, r.minMarginBps / 100)),
        maxPositionUsd: String(Math.min(Number(x.maxPositionUsd) || r.maxPositionUsd, r.maxPositionUsd)),
        maxOpenUsd: String(Math.min(Number(x.maxOpenUsd) || r.maxOpenUsd, Math.floor(r.maxOpenUsd / 2))), // 5 % recommended
        logoUrl: x.logoUrl || r.market.logo || '',
      }));
    } catch { setFail('Listing checks are unavailable right now. Try again in a minute.'); }
    setChecking(false);
  };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const locked = !!initial && initial.deployStatus !== 'draft'; // contracts exist (or are being made) for this token
  const chain = chains.find((c) => c.id === f.chainId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  // Token search on the chosen chain (LI.FI list via the server): BTC → cbBTC / WBTC, SOL → Wormhole SOL, …
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<{ items: TokenHit[] }>(`/api/admin/tokens?chainId=${f.chainId}&q=${encodeURIComponent(q.trim())}`)
        .then((r) => live && setHits(r.items)).catch(() => live && setHits([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, f.chainId]);

  const pick = (t: TokenHit) => {
    setF((x) => ({ ...x, symbol: t.symbol.toUpperCase().replace(/[^A-Z0-9$._-]/g, '').slice(0, 16), name: t.name, tokenAddress: t.address, decimals: String(t.decimals) }));
    setQ(''); setHits(null); setVerified(null);
  };

  const verify = async () => {
    setVerified(null);
    if (!ADDR.test(f.tokenAddress.trim())) { setErrors((e) => ({ ...e, tokenAddress: 'A 0x address (42 characters)' })); return; }
    try {
      const r = await api<{ name: string; symbol: string; decimals: number }>('/api/admin/assets/verify', json({ chainId: f.chainId, tokenAddress: f.tokenAddress.trim() }));
      setF((x) => ({ ...x, decimals: String(r.decimals), name: x.name || r.name, symbol: x.symbol || r.symbol.toUpperCase().slice(0, 16) }));
      setVerified(`On ${chain?.name}: ${r.symbol} · ${r.name} · ${r.decimals} decimals`);
      setErrors((e) => ({ ...e, tokenAddress: '' }));
    } catch {
      setErrors((e) => ({ ...e, tokenAddress: `Not a token on ${chain?.name ?? 'this chain'}` }));
    }
  };

  const save = async (deploy: boolean) => {
    const local = check(f);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true); setFail(null);
    try {
      const saved = await api<Asset>(initial ? `/api/admin/assets/${initial.id}` : '/api/admin/assets', json(toBody(f)));
      onSaved(saved, deploy);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setErrors((e.body.fields as Record<string, string>) ?? {});
      else setFail('Not saved. Check your connection and that you are still signed in.');
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save(false); };

  const inp = (k: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="input-wrap">
      <input id={id + k} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? id + k + '-err' : undefined} autoComplete="off" spellCheck={false} {...props} />
    </div>
  );

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <form className="modal admin-form" role="dialog" aria-modal="true" aria-label={initial ? `Edit ${initial.symbol}` : 'Add asset'}
        onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title">
          <CoinIcon symbol={f.symbol || '?'} src={/^https:\/\//.test(f.logoUrl) ? f.logoUrl : undefined} size={32} />
          <div><p className="eyebrow gold">{initial ? 'Edit asset' : 'New asset'}</p><h2>{f.symbol.toUpperCase() || 'Listed asset'}</h2></div>
        </div>

        <Requirements />

        <fieldset className="form-section">
          <legend>Chain</legend>
          <div className="chain-pick" role="radiogroup" aria-label="Chain">
            {chains.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={f.chainId === c.id} disabled={locked && f.chainId !== c.id}
                className={'chip-btn' + (f.chainId === c.id ? ' on' : '')} onClick={() => { set('chainId', c.id); setVerified(null); }}>
                {c.name}{!c.factory && <small className="muted"> · no factory</small>}
              </button>
            ))}
          </div>
          <span className="hint">
            Bitcoin, Solana, Cardano, XRP, Dogecoin and other non-EVM coins: pick an EVM chain and search their wrapped token
            (cbBTC, WBTC, Wormhole SOL, Binance-Peg ADA …). Reserve currency here: {chain?.stable ? chain.stable.symbol : 'not set yet (owner decides)'}.
          </span>
        </fieldset>

        <fieldset className="form-section">
          <legend>Token</legend>
          {!locked && (
            <div className="field token-search">
              <label className="label" htmlFor={id + 'q'}>Find token on {chain?.name}</label>
              <div className="input-wrap"><input id={id + 'q'} placeholder="Symbol or name, e.g. PEPE, cbBTC" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
              {hits && (
                <ul className="token-hits" role="listbox" aria-label="Tokens">
                  {hits.length === 0 && <li className="muted">No match on {chain?.name}.</li>}
                  {hits.map((t) => (
                    <li key={t.address}><button type="button" onClick={() => pick(t)}><b>{t.symbol}</b> <span className="muted">{t.name}</span> <span className="num muted">{short(t.address)}</span></button></li>
                  ))}
                </ul>
              )}
              {chain && <button type="button" className="btn-mini" onClick={() => pick({ ...chain.wrappedNative, name: `Wrapped ${chain.wrappedNative.symbol.slice(1)} (native coin)` })}>Use {chain.name}'s native coin ({chain.wrappedNative.symbol})</button>}
            </div>
          )}
          <div className="form-grid">
            <Field id={id + 'symbol'} label="Symbol" error={errors.symbol}>{inp('symbol', { placeholder: 'PONS', maxLength: 16, className: 'upper' })}</Field>
            <Field id={id + 'name'} label="Name" error={errors.name}>{inp('name', { placeholder: 'Pons Token', maxLength: 64 })}</Field>
          </div>
          <Field id={id + 'tokenAddress'} label="Token contract" error={errors.tokenAddress} hint={verified ?? undefined}>
            <div className="input-row">
              {inp('tokenAddress', { placeholder: '0x…', className: 'num', maxLength: 42, readOnly: locked })}
              <button type="button" className="btn btn-ghost btn-sm" onClick={verify}>Check on chain</button>
            </div>
          </Field>
          <div className="field">
            <button type="button" className="btn btn-gold btn-sm" onClick={runChecks} disabled={checking}>{checking ? 'Checking…' : 'Run listing checks'}</button>
            {report && <ReportView r={report} />}
          </div>
          <div className="form-grid">
            <Field id={id + 'decimals'} label="Decimals" error={errors.decimals}>{inp('decimals', { inputMode: 'numeric', className: 'num', maxLength: 2 })}</Field>
            <Field id={id + 'logoUrl'} label="Logo URL" hint="CoinGecko or backx.trade image." error={errors.logoUrl}>{inp('logoUrl', { placeholder: 'https://coin-images.coingecko.com/…' })}</Field>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Pool and price (needed to deploy)</legend>
          <Field id={id + 'adapterAddress'} label="Swap adapter" hint="backx adapter contract that routes this coin's swaps." error={errors.adapterAddress}>
            {inp('adapterAddress', { placeholder: '0x…', className: 'num', maxLength: 42 })}
          </Field>
          <Field id={id + 'oracleAddress'} label="TWAP oracle" hint="Price source for liquidations and limits." error={errors.oracleAddress}>
            {inp('oracleAddress', { placeholder: '0x…', className: 'num', maxLength: 42 })}
          </Field>
          <Field id={id + 'poolAddress'} label="Pool (for reference)" error={errors.poolAddress}>
            {inp('poolAddress', { placeholder: '0x… (optional)', className: 'num', maxLength: 42 })}
          </Field>
          <div className="field">
            <span className="label" id={id + 'fee'}>Pool fee</span>
            <div className="fee-tiers" role="radiogroup" aria-labelledby={id + 'fee'}>
              {FEE_TIERS.map((b) => (
                <button type="button" key={b} role="radio" aria-checked={f.poolFeeBps === b} className={'chip-btn' + (f.poolFeeBps === b ? ' on' : '')} onClick={() => set('poolFeeBps', b)}>{pct(b)}</button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Risk</legend>
          <div className="field">
            <div className="field-head"><label className="label" htmlFor={id + 'maxM'}>Max multiplication</label><span className="num m-value">{f.maxM}×</span></div>
            <input id={id + 'maxM'} type="range" min={1} max={report?.tier ? report.maxM : 20} value={f.maxM} onChange={(e) => set('maxM', Number(e.target.value))} className="range" />
            <span className="hint">The standard cap. What a trader gets is also limited by the USDC issuers have free. Guide (sim5): Major 20×, Large 5×, Mid 3×, Small 2×.</span>
          </div>
          <div className="form-grid">
            <Field id={id + 'liqMargin'} label="Liquidation margin (%)" hint="Major 1.5 %, Large 2 %, Mid 3 %, Small 4 % (security review)." error={errors.liqMarginBps}>
              {inp('liqMargin', { inputMode: 'decimal', className: 'num', maxLength: 4 })}
            </Field>
            <Field id={id + 'maxPositionUsd'} label="Max position (USD)" hint="≈ 0.5 % of pool depth." error={errors.maxPositionUsd}>
              {inp('maxPositionUsd', { inputMode: 'numeric', className: 'num', maxLength: 8 })}
            </Field>
          </div>
          <Field id={id + 'maxOpenUsd'} label="Max open hedges, all traders (USD)" error={errors.maxOpenUsd}>
            {inp('maxOpenUsd', { inputMode: 'numeric', className: 'num', maxLength: 10 })}
          </Field>
        </fieldset>

        <Field id={id + 'notes'} label="Notes" hint="Internal only." error={errors.notes}>
          <div className="input-wrap"><textarea id={id + 'notes'} rows={2} maxLength={500} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </Field>

        <label className="switch-row">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span><b>Enabled</b><small className="muted"> Show it in the app once its contracts are live.</small></span>
        </label>

        {fail && <p className="field-err" role="alert">{fail}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {(!initial || initial.deployStatus !== 'deployed') && (
            <button type="button" className="btn btn-gold" disabled={busy || (report != null && !report.pass)} onClick={() => save(true)}
              title={report && !report.pass ? 'This coin does not meet the listing requirements' : undefined}>Save and deploy contracts</button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Prepares factory.createMarket for the Safe, then watches the factory until the contracts exist. */
function Deploy({ asset, chain, onClose }: { asset: Asset; chain?: Chain; onClose: () => void }) {
  const [state, setState] = useState<{ batch?: unknown; safeUrl?: string; missing?: string[]; err?: string; done?: Asset }>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api<{ batch: unknown; safeUrl: string }>(`/api/admin/assets/${asset.id}/deploy`, json({}))
      .then((r) => setState(r))
      .catch((e) => setState(e instanceof ApiError && (e.code === 'not_ready' || e.code === 'listing_rejected')
        ? { missing: e.body.missing as string[] }
        : { err: e instanceof ApiError && e.code === 'already_deployed' ? 'Already live.' : 'Could not prepare the transaction.' }));
  }, [asset.id]);

  const download = () => {
    const blob = new Blob([JSON.stringify(state.batch, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backx-deploy-${asset.symbol}-${asset.chainId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const check = async () => {
    setChecking(true);
    try {
      const r = await api<Asset>(`/api/admin/assets/${asset.id}/check`, json({}));
      if (r.deployStatus === 'deployed') setState((s) => ({ ...s, done: r }));
      else setState((s) => ({ ...s, err: 'Not on-chain yet. Sign and execute in the Safe, then check again.' }));
    } catch { setState((s) => ({ ...s, err: 'Could not read the chain right now.' })); }
    setChecking(false);
  };

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal admin-form" role="dialog" aria-modal="true" aria-label={`Deploy ${asset.symbol}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={asset.symbol} src={asset.logoUrl ?? undefined} size={32} /><div><p className="eyebrow gold">Deploy contracts</p><h2>{asset.symbol} on {chain?.name}</h2></div></div>
        {state.done ? (
          <>
            <p className="ok">Live. {asset.symbol} has its own contracts on {chain?.name}.</p>
            <dl className="kv">
              <div><dt>Trading contract</dt><dd><CopyAddr value={state.done.deployed!.manager} /></dd></div>
              <div><dt>Issue Reserve (USDC)</dt><dd><CopyAddr value={state.done.deployed!.usdVault} /></dd></div>
              <div><dt>Reserve Security Fund</dt><dd><CopyAddr value={state.done.deployed!.hedgeFund} /></dd></div>
            </dl>
          </>
        ) : state.missing ? (
          <>
            <p>Not ready to deploy. {state.missing.length ? 'Fix these first:' : ''}</p>
            <ul className="missing-list">{state.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        ) : !state.batch && !state.err ? (
          <p className="muted" aria-busy="true"><span className="sk sk-w60" /></p>
        ) : (
          <ol className="deploy-steps">
            <li><b>Download the transaction</b> (one call: <span className="num">factory.createMarket</span> for {asset.symbol}).
              <div><button className="btn btn-gold btn-sm" onClick={download} disabled={!state.batch}>Download for Safe</button></div></li>
            <li><b>Open the Safe</b> → Transaction Builder → drag the file in → sign and execute.
              <div><a className="btn btn-ghost btn-sm" href={state.safeUrl} target="_blank" rel="noopener">Open Safe ↗</a></div></li>
            <li><b>Check</b>: the portal reads the factory and saves the new addresses.
              <div><button className="btn btn-ghost btn-sm" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check deployment'}</button></div></li>
          </ol>
        )}
        {state.err && <p className="field-err" role="alert">{state.err}</p>}
        <p className="hint">Each coin gets its own Issue Reserve, Reserve Security Fund and trading contract, all owned by the Safe and upgradeable through the factory's beacons without redeploying.</p>
      </div>
    </div>
  );
}

function DeleteAsset({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const ok = typed.trim().toUpperCase() === asset.symbol;
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={`Delete ${asset.symbol}`} onClick={(e) => e.stopPropagation()}>
        <h2>Delete {asset.symbol}?</h2>
        <p className="muted">Only drafts can be deleted (live contracts are disabled instead). The change is logged. Type <b>{asset.symbol}</b> to confirm.</p>
        <div className="input-wrap"><input aria-label="Type the symbol" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></div>
        {fail && <p className="field-err" role="alert">Not deleted. Try again.</p>}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={!ok || busy} onClick={async () => {
            setBusy(true);
            try { await api(`/api/admin/assets/${asset.id}`, { method: 'DELETE' }); onDone(); } catch { setFail(true); setBusy(false); }
          }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ---- Users ------------------------------------------------------------------------------------

function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<UsersResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setData((d) => (d ? { ...d, items: [] } : d));
    api<UsersResp>(`/api/admin/users?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((r) => { if (live) { setData(r); setErr(null); } })
      .catch((e) => live && setErr(e instanceof ApiError && e.status === 400 ? 'Search by wallet address or sign-up method (letters and digits only).' : 'Could not load users.'));
    return () => { live = false; };
  }, [page, query]);

  const s = data?.stats;
  return (
    <>
      <section className="admin-tiles">
        {[['Users', s?.total], ['New 24 h', s?.day], ['New 7 days', s?.week], ['Active 24 h', s?.active_day]].map(([label, v]) => (
          <div className="card tile" key={label as string}><span className="label">{label}</span><span className="num tile-value">{v ?? <span className="sk sk-w30" />}</span></div>
        ))}
      </section>
      {s && s.methods.length > 0 && (
        <p className="method-chips">
          {s.methods.map((m) => (
            <button key={m.method} className={'chip-btn' + (query === m.method ? ' on' : '')} onClick={() => setQ(query === m.method ? '' : m.method)}>
              {m.method} <span className="num">{m.n}</span>
            </button>
          ))}
        </p>
      )}

      <section className="card">
        <div className="field">
          <label className="label" htmlFor="admin-user-q">Search</label>
          <div className="input-wrap"><input id="admin-user-q" placeholder="Wallet address or sign-up method" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        </div>
        {err && <p className="field-err" role="alert">{err}</p>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>EVM wallet</th><th>Solana</th><th>Signed up with</th><th>Signed up</th><th>Last login</th><th className="r">Sessions</th></tr></thead>
            <tbody>
              {!data && !err && Array.from({ length: 6 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={6}><span className="sk sk-w60" /></td></tr>)}
              {data?.items.length === 0 && !err && <tr><td colSpan={6} className="muted admin-empty">No users match.</td></tr>}
              {data?.items.map((u) => (
                <tr key={u.address}>
                  <td><CopyAddr value={u.address} /> {u.isAdmin && <span className="chip chip-admin">Admin</span>}</td>
                  <td>{u.solanaAddress ? <CopyAddr value={u.solanaAddress} /> : <span className="muted">—</span>}</td>
                  <td>{u.signupMethod ?? <span className="muted">—</span>}{u.lastLoginMethod && u.lastLoginMethod !== u.signupMethod && <small className="muted"> · last {u.lastLoginMethod}</small>}</td>
                  <td className="num">{when(u.signedUpAt)}</td>
                  <td className="num">{when(u.lastLoginAt)}</td>
                  <td className="r num">{u.activeSessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-between pager">
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Newer</button>
          <span className="muted num">Page {page + 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>Older →</button>
        </div>
      </section>
    </>
  );
}

// ---- Venture participants ("Join the venture!") -------------------------------------------------

interface ParticipantsResp {
  items: { address: string; joinedAt: string; signupMethod: string | null; signedUpAt: string }[];
  hasMore: boolean; page: number;
  stats: { total: number; day: number; week: number; users: number };
}

function Participants() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ParticipantsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setData((d) => (d ? { ...d, items: [] } : d));
    api<ParticipantsResp>(`/api/admin/participants?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((r) => { if (live) { setData(r); setErr(null); } })
      .catch((e) => live && setErr(e instanceof ApiError && e.status === 400 ? 'Search by wallet address (0x… hex).' : 'Could not load participants.'));
    return () => { live = false; };
  }, [page, query]);

  const s = data?.stats;
  const share = s && s.users ? `${Math.floor((s.total / s.users) * 1000) / 10}%` : undefined;
  return (
    <>
      <section className="admin-tiles">
        {[['Participants', s?.total], ['New 24 h', s?.day], ['New 7 days', s?.week], ['Of all users', share]].map(([label, v]) => (
          <div className="card tile" key={label as string}><span className="label">{label}</span><span className="num tile-value">{v ?? <span className="sk sk-w30" />}</span></div>
        ))}
      </section>
      <section className="card">
        <p className="muted small">Everyone who pressed Participate on “Join the venture!”. One per account; signed-in users only.</p>
        <div className="field">
          <label className="label" htmlFor="admin-part-q">Search</label>
          <div className="input-wrap"><input id="admin-part-q" placeholder="Wallet address" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        </div>
        {err && <p className="field-err" role="alert">{err}</p>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>#</th><th>Wallet</th><th>Signed up with</th><th>Account since</th><th>Participated</th></tr></thead>
            <tbody>
              {!data && !err && Array.from({ length: 6 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={5}><span className="sk sk-w60" /></td></tr>)}
              {data?.items.length === 0 && !err && <tr><td colSpan={5} className="muted admin-empty">{query ? 'No participants match.' : 'No participants yet.'}</td></tr>}
              {data?.items.map((p, i) => (
                <tr key={p.address}>
                  <td className="num muted">{(s?.total ?? 0) - page * 50 - i}</td>
                  <td><CopyAddr value={p.address} /></td>
                  <td>{p.signupMethod ?? <span className="muted">—</span>}</td>
                  <td className="num">{when(p.signedUpAt)}</td>
                  <td className="num">{when(p.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-between pager">
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Newer</button>
          <span className="muted num">Page {page + 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>Older →</button>
        </div>
      </section>
    </>
  );
}

// ---- Contracts (core contracts per chain, owner 2026-10-22) -------------------------------------

interface CItem {
  key: string; label: string; role: string; kind: 'implementation' | 'proxy'; address: string | null; runtimeSize: number | null;
  status: 'ready' | 'proposed' | 'deployed'; blocked: string[]; markets?: number | null; config?: Record<string, string> | null;
}
interface CChain {
  chainId: number; name: string; explorer?: string; stable?: Chain['stable']; safe?: boolean | null; deployer?: boolean | null;
  items?: CItem[]; planned?: { key: string; label: string; role: string; note: string }[]; error?: string;
}
interface ContractsResp { safe: string; deployer: string; maxRuntime: number; sourceCommit: string | null; chains: CChain[] }

const C_STATUS: Record<CItem['status'], string> = { ready: 'Not deployed', proposed: 'Waiting for Safe', deployed: 'Deployed' };
const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
// Launch focus first (owner 2026-10-21: BNB Chain main focus, Robinhood Chain home).
const CHAIN_ORDER = [4663, 56, 8453, 1, 42161, 10, 137, 43114];

function chainState(c: CChain) {
  if (!c.items) return { label: 'Chain not reachable', cls: 'draft' };
  const done = c.items.filter((i) => i.status === 'deployed').length;
  if (done === c.items.length) return { label: 'Live', cls: 'deployed' };
  return { label: `${done}/${c.items.length} deployed`, cls: done ? 'proposed' : 'draft' };
}

function Contracts() {
  const [data, setData] = useState<ContractsResp | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<number>(4663);
  const [deploying, setDeploying] = useState<CItem | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    api<ContractsResp>('/api/admin/contracts').then((r) => { setData(r); setErr(false); }).catch(() => setErr(true));
  }, []);
  useEffect(load, [load]);

  const chain = data?.chains.find((c) => c.chainId === sel);
  const recheck = async () => {
    setChecking(true);
    try {
      const c = await api<CChain>('/api/admin/contracts/check', json({ chainId: sel }));
      setData((d) => d && { ...d, chains: d.chains.map((x) => (x.chainId === sel ? c : x)) });
    } catch { /* keep the last state */ }
    setChecking(false);
  };

  return (
    <>
      <section className="card contracts-intro">
        <p className="muted small">
          The core contracts each chain needs once: three contract types (used by every coin through upgradeable beacons) and the Market Factory that
          creates each coin's set. Deploying never uses a server key: the portal prepares a file, the Safe signs it, and the address is known in advance (CREATE2).
          Coins are added afterwards under Listed assets.
        </p>
        <p className="warn small">Not audited. Deploy to mainnet only after the external audit and your sign-off on the open decisions.</p>
      </section>

      <div className="chain-grid" role="tablist" aria-label="Chains">
        {!data && !err && Array.from({ length: 8 }, (_, i) => <div key={i} className="chain-card" aria-hidden="true"><span className="sk sk-w60" /></div>)}
        {data && [...data.chains].sort((a, b) => CHAIN_ORDER.indexOf(a.chainId) - CHAIN_ORDER.indexOf(b.chainId)).map((c) => {
          const st = chainState(c);
          return (
            <button key={c.chainId} role="tab" aria-selected={sel === c.chainId} className={'chain-card' + (sel === c.chainId ? ' on' : '')} onClick={() => setSel(c.chainId)}>
              <b>{c.name}</b>
              <span className={'deploy-pill ' + st.cls}>{st.label}</span>
            </button>
          );
        })}
      </div>
      {err && <p className="field-err" role="alert">Could not load contracts.</p>}

      {chain && (
        <section className="card">
          <div className="row-between">
            <h2 className="contracts-h">{chain.name}</h2>
            <button className="btn btn-ghost btn-sm" onClick={recheck} disabled={checking}>{checking ? 'Checking…' : 'Check on chain'}</button>
          </div>
          {chain.error && <p className="field-err">Could not read {chain.name} right now.</p>}
          {chain.items && (
            <p className="muted small">
              Safe on this chain: {chain.safe ? <span className="ok-text">▲ yes</span> : <span className="down">▼ no</span>} ·
              CREATE2 deployer: {chain.deployer ? <span className="ok-text">▲ yes</span> : <span className="down">▼ no</span>} ·
              Reserve currency: {chain.stable ? chain.stable.symbol : 'not chosen yet'}
            </p>
          )}
          <div className="table-wrap">
            <table className="admin-table contracts-table">
              <thead><tr><th>Contract</th><th>Status</th><th>Address</th><th className="r">Size</th><th /></tr></thead>
              <tbody>
                {chain.items?.map((it) => (
                  <tr key={it.key}>
                    <td><b>{it.label}</b><small className="muted block">{it.role}</small></td>
                    <td><span className={'deploy-pill ' + (it.status === 'ready' ? 'draft' : it.status)}>{C_STATUS[it.status]}</span>
                      {it.markets != null && <small className="muted block">{it.markets} coin{it.markets === 1 ? '' : 's'} listed</small>}</td>
                    <td>{it.address ? (it.status === 'deployed' && chain.explorer
                      ? <a className="num small" href={`${chain.explorer}/address/${it.address}`} target="_blank" rel="noopener noreferrer">{short(it.address)} ↗</a>
                      : <CopyAddr value={it.address} />) : <span className="muted">After setup</span>}</td>
                    <td className={'r num' + (it.runtimeSize && data && it.runtimeSize > data.maxRuntime ? ' down' : '')}>{it.runtimeSize ? kb(it.runtimeSize) : '—'}</td>
                    <td className="r">
                      {it.status === 'deployed' ? <span className="ok-text small">✓ Live</span>
                        : it.blocked.length ? <span className="muted small" title={it.blocked.join(' ')}>Blocked</span>
                        : <button className="btn btn-gold btn-sm" onClick={() => setDeploying(it)}>{it.status === 'proposed' ? 'Prepare again' : 'Deploy'}</button>}
                    </td>
                  </tr>
                ))}
                {chain.planned?.map((p) => (
                  <tr key={p.key} className="muted">
                    <td><b>{p.label}</b><small className="muted block">{p.role}</small></td>
                    <td><span className="deploy-pill draft">Planned</span></td>
                    <td colSpan={3} className="small">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chain.items?.some((i) => i.status !== 'deployed' && i.blocked.length) && (
            <ul className="missing-list">
              {[...new Set(chain.items.flatMap((i) => (i.status !== 'deployed' ? i.blocked.map((b) => `${i.label}: ${b}`) : [])))].map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {data?.sourceCommit && <p className="hint">Contract code from commit <span className="num">{data.sourceCommit}</span>. Same code = same address on every chain.</p>}
        </section>
      )}

      <AdminKeeperRecipe />

      {deploying && chain && <DeployCore item={deploying} chain={chain} onClose={() => { setDeploying(null); load(); }} />}
    </>
  );
}

function DeployCore({ item, chain, onClose }: { item: CItem; chain: CChain; onClose: () => void }) {
  const isFactory = item.key === 'factory';
  const [cfg, setCfg] = useState({ feeCollector: item.config?.feeCollector ?? '' });
  const [state, setState] = useState<{ batch?: unknown; safeUrl?: string; address?: string; missing?: string[]; fields?: Record<string, string>; err?: string; live?: boolean }>({});
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await api<{ batch: unknown; safeUrl: string; address: string }>('/api/admin/contracts/deploy', json({ chainId: chain.chainId, key: item.key, ...(isFactory ? cfg : {}) }));
      setState(r);
    } catch (e) {
      setState(e instanceof ApiError && e.code === 'not_ready' ? { missing: e.body.missing as string[] }
        : e instanceof ApiError && e.code === 'invalid' && e.body.fields ? { fields: e.body.fields as Record<string, string> }
        : { err: e instanceof ApiError && e.code === 'already_deployed' ? 'Already deployed.' : 'Could not prepare the transaction.' });
    }
    setBusy(false);
  };
  useEffect(() => { if (!isFactory) void prepare(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const blob = new Blob([JSON.stringify(state.batch, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backx-${item.key}-${chain.chainId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const check = async () => {
    setBusy(true);
    try {
      const c = await api<CChain>('/api/admin/contracts/check', json({ chainId: chain.chainId }));
      const now = c.items?.find((i) => i.key === item.key);
      if (now?.status === 'deployed') setState((s) => ({ ...s, live: true, err: undefined }));
      else setState((s) => ({ ...s, err: 'Not on-chain yet. Sign and execute in the Safe, then check again.' }));
    } catch { setState((s) => ({ ...s, err: 'Could not read the chain right now.' })); }
    setBusy(false);
  };

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal admin-form" role="dialog" aria-modal="true" aria-label={`Deploy ${item.label}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><div><p className="eyebrow gold">Deploy contract</p><h2>{item.label} on {chain.name}</h2></div></div>
        {state.live ? (
          <p className="ok">Live at <span className="num">{state.address}</span>. Owned by the Safe.</p>
        ) : state.missing ? (
          <><p>Not ready to deploy:</p><ul className="missing-list">{state.missing.map((m) => <li key={m}>{m}</li>)}</ul></>
        ) : isFactory && !state.batch ? (
          <form onSubmit={(e) => { e.preventDefault(); void prepare(); }}>
            <p className="muted small">The factory is set up once per chain (the Safe can change it later). Reserve currency: {chain.stable?.symbol}. Liquidations and fills are open to every validator; each position escrows its own gas, so no validator address is needed.</p>
            <Field id="cf-feeCollector" label="Fee collector" hint="Receives the holders fee (gazz.fun / treasury split is open)" error={state.fields?.feeCollector}>
              <input id="cf-feeCollector" className="num" value={cfg.feeCollector} onChange={(e) => setCfg({ feeCollector: e.target.value.trim() })} placeholder="0x…" autoComplete="off" spellCheck={false} />
            </Field>
            <button className="btn btn-gold btn-block" disabled={busy || !ADDR.test(cfg.feeCollector)}>{busy ? 'Preparing…' : 'Prepare Safe transaction'}</button>
          </form>
        ) : !state.batch && !state.err ? (
          <p className="muted" aria-busy="true"><span className="sk sk-w60" /></p>
        ) : state.batch ? (
          <ol className="deploy-steps">
            <li><b>Download the transaction</b>. It will create the contract at <span className="num">{state.address && short(state.address)}</span>, owned by the Safe.
              <div><button className="btn btn-gold btn-sm" onClick={download}>Download for Safe</button></div></li>
            <li><b>Open the Safe</b> on {chain.name} → Transaction Builder → drag the file in → sign and execute.
              <div><a className="btn btn-ghost btn-sm" href={state.safeUrl} target="_blank" rel="noopener noreferrer">Open Safe ↗</a></div></li>
            <li><b>Check</b>: the portal reads the chain. Once it is there, the Deploy button disappears.
              <div><button className="btn btn-ghost btn-sm" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check deployment'}</button></div></li>
          </ol>
        ) : null}
        {state.err && <p className="field-err" role="alert">{state.err}</p>}
      </div>
    </div>
  );
}
