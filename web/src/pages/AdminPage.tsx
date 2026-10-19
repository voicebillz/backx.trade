import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { go, href, type Route } from '../lib/router';
import { CoinIcon } from '../components/CoinIcon';

// Admin portal (owner 2026-10-19). Its own chunk, only rendered for admins; the server checks ADMIN_WALLETS on
// every /api/admin call and answers 404 to anyone else, so this file holds no secrets and grants nothing.

interface Asset {
  id: number; chainId: number; symbol: string; name: string; tokenAddress: string; decimals: number;
  poolAddress: string | null; oracleAddress: string | null; poolFeeBps: number; maxM: number; liqMarginBps: number;
  logoUrl: string | null; enabled: boolean; notes: string | null; updatedAt: string; updatedBy: string;
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

const ROBINHOOD = 4663;
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
          <h1>{route === 'adminUsers' ? 'Users' : 'Listed assets'}</h1>
          <p className="page-sub">Only wallets in ADMIN_WALLETS can open this. Every change is logged.</p>
        </div>
      </header>
      <div className="admin-grid">
        <nav className="profile-tabs" aria-label="Admin sections">
          <a href={href('admin')} onClick={go('admin')} className={route === 'admin' ? 'active' : ''} aria-current={route === 'admin' ? 'page' : undefined}>Listed assets</a>
          <a href={href('adminUsers')} onClick={go('adminUsers')} className={route === 'adminUsers' ? 'active' : ''} aria-current={route === 'adminUsers' ? 'page' : undefined}>Users</a>
          <a href={href('profile')} onClick={go('profile')}>← Back to profile</a>
        </nav>
        <div className="admin-body">{route === 'adminUsers' ? <Users /> : <Assets />}</div>
      </div>
    </main>
  );
}

// ---- Listed assets ----------------------------------------------------------------------------

function Assets() {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api<{ items: Asset[] }>('/api/admin/assets'), api<{ items: AuditRow[] }>('/api/admin/audit')]);
      setItems(a.items); setAudit(l.items); setErr(false);
    } catch { setErr(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Asset) => {
    try { await api(`/api/admin/assets/${a.id}`, json({ ...a, logoUrl: a.logoUrl ?? '', poolAddress: a.poolAddress ?? '', oracleAddress: a.oracleAddress ?? '', notes: a.notes ?? '', enabled: !a.enabled })); load(); }
    catch { setErr(true); }
  };

  const enabled = items?.filter((a) => a.enabled).length ?? 0;
  return (
    <>
      <section className="card">
        <div className="row-between">
          <dl className="admin-stats">
            <div><dt className="label">Listed</dt><dd className="num">{items ? items.length : '—'}</dd></div>
            <div><dt className="label">Enabled</dt><dd className="num">{items ? enabled : '—'}</dd></div>
            <div><dt className="label">Chain</dt><dd>Robinhood Chain <span className="muted num">4663</span></dd></div>
          </dl>
          <button className="btn btn-gold" onClick={() => setEditing('new')}>+ Add asset</button>
        </div>
        <p className="hint">This list is what the team prepares. The contracts are configured by the Safe; an asset here does nothing on-chain by itself.</p>
      </section>

      {err && <p className="field-err" role="alert">Could not reach the admin API. Sign in again or try later.</p>}

      <section className="card">
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Asset</th><th>Token</th><th>Pool</th><th className="r">Pool fee</th><th className="r">Max</th><th className="r">Liq. margin</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {items === null && !err && Array.from({ length: 4 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={8}><span className="sk sk-w60" /></td></tr>)}
              {items?.length === 0 && <tr><td colSpan={8} className="muted admin-empty">No assets yet. Add the first one.</td></tr>}
              {items?.map((a) => (
                <tr key={a.id}>
                  <td><span className="cell-market"><CoinIcon symbol={a.symbol} src={a.logoUrl ?? undefined} size={24} /><span><b>{a.symbol}</b><small className="muted"> {a.name}</small></span></span></td>
                  <td><CopyAddr value={a.tokenAddress} /> <small className="muted num">{a.decimals} dec</small></td>
                  <td>{a.poolAddress ? <CopyAddr value={a.poolAddress} /> : <span className="muted">—</span>}</td>
                  <td className="r num">{pct(a.poolFeeBps)}</td>
                  <td className="r num">{a.maxM}×</td>
                  <td className="r num">{pct(a.liqMarginBps)}</td>
                  <td>
                    <button className={'status-pill ' + (a.enabled ? 'on' : 'off')} onClick={() => toggle(a)} aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.symbol}`}>
                      <span aria-hidden="true">{a.enabled ? '●' : '○'}</span> {a.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="r admin-actions">
                    <button className="btn-mini" onClick={() => setEditing(a)}>Edit</button>
                    <button className="btn-mini danger" onClick={() => setDeleting(a)}>Delete</button>
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
              <li key={i}><span className="num muted">{when(r.at)}</span> <b>{r.action.replace('asset.', '')}</b> {r.target?.split(' ')[0]} <span className="muted num">by {short(r.admin)}</span></li>
            ))}
          </ul>
        )}
      </section>

      {editing && <AssetForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && <DeleteAsset asset={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
    </>
  );
}

interface FormState {
  symbol: string; name: string; tokenAddress: string; decimals: string; poolAddress: string; oracleAddress: string;
  poolFeeBps: number; maxM: number; liqMargin: string; logoUrl: string; enabled: boolean; notes: string;
}

const toForm = (a: Asset | null): FormState => ({
  symbol: a?.symbol ?? '', name: a?.name ?? '', tokenAddress: a?.tokenAddress ?? '', decimals: String(a?.decimals ?? 18),
  poolAddress: a?.poolAddress ?? '', oracleAddress: a?.oracleAddress ?? '', poolFeeBps: a?.poolFeeBps ?? 30,
  maxM: a?.maxM ?? 5, liqMargin: a ? String(a.liqMarginBps / 100) : '1', logoUrl: a?.logoUrl ?? '', enabled: a?.enabled ?? false,
  notes: a?.notes ?? '',
});

/** Same rules as server/src/admin.js; the server checks again and its answer wins. */
function check(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Za-z0-9$._-]{1,16}$/.test(f.symbol.trim())) e.symbol = '1–16 letters, digits or $ . _ -';
  if (!f.name.trim() || f.name.trim().length > 64) e.name = '1–64 characters';
  if (!ADDR.test(f.tokenAddress.trim())) e.tokenAddress = 'A 0x address (42 characters)';
  const d = Number(f.decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) e.decimals = '0–36';
  if (f.poolAddress.trim() && !ADDR.test(f.poolAddress.trim())) e.poolAddress = 'A 0x address, or leave empty';
  if (f.oracleAddress.trim() && !ADDR.test(f.oracleAddress.trim())) e.oracleAddress = 'A 0x address, or leave empty';
  const mg = Number(f.liqMargin);
  if (!Number.isFinite(mg) || mg < 0 || mg > 5) e.liqMarginBps = '0–5 %';
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

function AssetForm({ initial, onClose, onSaved }: { initial: Asset | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [f, setF] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local = check(f);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true); setFail(null);
    const body = {
      chainId: ROBINHOOD, symbol: f.symbol.trim(), name: f.name.trim(), tokenAddress: f.tokenAddress.trim(), decimals: Number(f.decimals),
      poolAddress: f.poolAddress.trim(), oracleAddress: f.oracleAddress.trim(), poolFeeBps: f.poolFeeBps, maxM: f.maxM,
      liqMarginBps: Math.round(Number(f.liqMargin) * 100), logoUrl: f.logoUrl.trim(), enabled: f.enabled, notes: f.notes.trim(),
    };
    try {
      const r = await fetchJson(initial ? `/api/admin/assets/${initial.id}` : '/api/admin/assets', body);
      if (r.fields) { setErrors(r.fields); setBusy(false); return; }
      onSaved();
    } catch {
      setFail('Not saved. Check your connection and that you are still signed in.');
      setBusy(false);
    }
  };

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

        <fieldset className="form-section">
          <legend>Token</legend>
          <div className="form-grid">
            <Field id={id + 'symbol'} label="Symbol" error={errors.symbol}>{inp('symbol', { placeholder: 'PONS', maxLength: 16, className: 'upper' })}</Field>
            <Field id={id + 'name'} label="Name" error={errors.name}>{inp('name', { placeholder: 'Pons Token', maxLength: 64 })}</Field>
          </div>
          <Field id={id + 'tokenAddress'} label="Token contract" hint="On Robinhood Chain (4663)." error={errors.tokenAddress}>
            {inp('tokenAddress', { placeholder: '0x…', className: 'num', maxLength: 42 })}
          </Field>
          <div className="form-grid">
            <Field id={id + 'decimals'} label="Decimals" error={errors.decimals}>{inp('decimals', { inputMode: 'numeric', className: 'num', maxLength: 2 })}</Field>
            <Field id={id + 'logoUrl'} label="Logo URL" hint="CoinGecko or backx.trade image." error={errors.logoUrl}>{inp('logoUrl', { placeholder: 'https://coin-images.coingecko.com/…' })}</Field>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Pool and price</legend>
          <Field id={id + 'poolAddress'} label="Pool contract" hint="PCS Infinity / Uniswap v4 pool the swap adapter uses." error={errors.poolAddress}>
            {inp('poolAddress', { placeholder: '0x… (optional)', className: 'num', maxLength: 42 })}
          </Field>
          <Field id={id + 'oracleAddress'} label="TWAP oracle" hint="Price source for liquidations and limits." error={errors.oracleAddress}>
            {inp('oracleAddress', { placeholder: '0x… (optional)', className: 'num', maxLength: 42 })}
          </Field>
          <div className="field">
            <span className="label" id={id + 'fee'}>Pool fee</span>
            <div className="fee-tiers" role="radiogroup" aria-labelledby={id + 'fee'}>
              {FEE_TIERS.map((b) => (
                <button type="button" key={b} role="radio" aria-checked={f.poolFeeBps === b} className={'chip-btn' + (f.poolFeeBps === b ? ' on' : '')} onClick={() => set('poolFeeBps', b)}>{pct(b)}</button>
              ))}
            </div>
            {errors.poolFeeBps && <span className="field-err">{errors.poolFeeBps}</span>}
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Risk</legend>
          <div className="field">
            <div className="field-head"><label className="label" htmlFor={id + 'maxM'}>Max multiplication</label><span className="num m-value">{f.maxM}×</span></div>
            <input id={id + 'maxM'} type="range" min={1} max={20} value={f.maxM} onChange={(e) => set('maxM', Number(e.target.value))} className="range" />
            <span className="hint">Guide (sim5): Major 20×, Large 5×, Mid 3×, Small 2×.</span>
          </div>
          <Field id={id + 'liqMargin'} label="Liquidation margin (%)" hint="Guide: Major/Large 1 %, Mid 1.5 %, Small 2 %." error={errors.liqMarginBps}>
            {inp('liqMargin', { inputMode: 'decimal', className: 'num', maxLength: 4 })}
          </Field>
        </fieldset>

        <Field id={id + 'notes'} label="Notes" hint="Internal only." error={errors.notes}>
          <div className="input-wrap"><textarea id={id + 'notes'} rows={2} maxLength={500} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </Field>

        <label className="switch-row">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span><b>Enabled</b><small className="muted"> Show it in the app once the contracts list it.</small></span>
        </label>

        {fail && <p className="field-err" role="alert">{fail}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Add asset'}</button>
        </div>
      </form>
    </div>
  );
}

/** POST that returns the server's field errors (400/409) instead of throwing them. */
async function fetchJson(path: string, body: unknown): Promise<{ fields?: Record<string, string> }> {
  try {
    await api(path, json(body));
    return {};
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 409)) {
      return { fields: (e.body.fields as Record<string, string>) ?? { symbol: 'Rejected by the server' } };
    }
    throw e;
  }
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
        <p className="muted">It is removed from the list. The change is logged. Type <b>{asset.symbol}</b> to confirm.</p>
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
