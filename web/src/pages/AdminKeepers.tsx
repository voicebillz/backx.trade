import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Admin "Keepers" (owner 2026-10-23, docs/KEEPERS.md): health of every keeper from its signed reports, gas balance
// read from Robinhood Chain, and a Safe Transaction Builder file to top them up. Keepers balance among themselves;
// the Safe only refills the pool. The portal never holds keys or sends money itself.

interface Hb { rank: number | null; version: string; block: string; open: number | null; sent: number | null; landed: number | null; failed: number | null; p50ms: number | null; p95ms: number | null; at: number }
interface Row { id: string; address: string; host: string; balanceWei: string | null; heartbeat: Hb | null; ageMs: number | null; status: 'up' | 'late' | 'down' | 'never' }
interface Resp { keepers: Row[]; targetWei: string; lowWei: string; safe: string; chainId: number }

const eth = (wei: string | null) => (wei == null ? '—' : (Number(BigInt(wei) / 10n ** 12n) / 1e6).toFixed(4));
const ago = (ms: number | null) => (ms == null ? 'never' : ms < 60_000 ? `${Math.round(ms / 1000)} s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`);
const STATUS = { up: '▲ Up', late: '● Late', down: '▼ Down', never: '○ No report' } as const;

export function AdminKeepers() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => api<Resp>('/api/admin/keepers').then((r) => live && (setData(r), setErr(null))).catch(() => live && setErr('Could not load keepers.'));
    load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const fundFile = async (mode: 'low' | 'all') => {
    setBusy(true);
    try {
      const batch = await api<object>('/api/admin/keepers/fund-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' }));
      a.download = `backx-fund-keepers-${mode}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { setErr('Nothing to fund right now.'); }
    setBusy(false);
  };

  const rows = data?.keepers ?? [];
  const up = rows.filter((r) => r.status === 'up').length;
  const total = rows.reduce((s, r) => s + (r.balanceWei ? BigInt(r.balanceWei) : 0n), 0n);
  const low = data ? rows.filter((r) => r.balanceWei != null && BigInt(r.balanceWei) < BigInt(data.lowWei)).length : 0;
  const p95 = rows.map((r) => r.heartbeat?.p95ms).filter((v): v is number => v != null);
  const best = p95.length ? Math.min(...p95) : null;

  return (
    <>
      <section className="admin-tiles">
        {[['Keepers up', data ? `${up} / ${rows.length}` : null], ['Gas pool', data ? `${eth(total.toString())} ETH` : null],
          ['Low on gas', data ? String(low) : null], ['Fastest p95', best != null ? `${(best / 1000).toFixed(2)} s` : data ? '—' : null]].map(([label, v]) => (
          <div className="card tile" key={label as string}><span className="label">{label}</span><span className="num tile-value">{v ?? <span className="sk sk-w30" />}</span></div>
        ))}
      </section>
      <section className="card">
        <div className="row-between docs-head">
          <h2>Keepers</h2>
          <span className="link-buttons">
            <button className="btn btn-gold btn-sm" disabled={busy || !data} onClick={() => fundFile('low')}>Top up low keepers</button>
            <button className="btn btn-ghost btn-sm" disabled={busy || !data} onClick={() => fundFile('all')}>Fund all</button>
          </span>
        </div>
        {err && <p className="field-err" role="alert">{err}</p>}
        {data && !rows.length && <p className="muted">No keepers configured. Add them to KEEPERS on Railway (docs/KEEPERS.md).</p>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Keeper</th><th>Status</th><th>Rank</th><th className="r">Gas (ETH)</th><th className="r">Watching</th><th className="r">Sent / landed / failed</th><th className="r">p50 / p95</th><th>Last report</th></tr></thead>
            <tbody>
              {!data && !err && Array.from({ length: 4 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={8}><span className="sk sk-w60" /></td></tr>)}
              {rows.map((r) => {
                const h = r.heartbeat;
                const isLow = data && r.balanceWei != null && BigInt(r.balanceWei) < BigInt(data.lowWei);
                return (
                  <tr key={r.id}>
                    <td><b>{r.id}</b><small className="muted block num">{r.address.slice(0, 8)}…{r.address.slice(-4)}</small></td>
                    <td className={'kp-' + r.status}>{STATUS[r.status]}</td>
                    <td className="num">{h?.rank ?? '—'}</td>
                    <td className={'num r' + (isLow ? ' down' : '')}>{isLow ? '▼ ' : ''}{eth(r.balanceWei)}</td>
                    <td className="num r">{h?.open ?? '—'}</td>
                    <td className="num r">{h ? `${h.sent ?? 0} / ${h.landed ?? 0} / ${h.failed ?? 0}` : '—'}</td>
                    <td className="num r">{h?.p50ms != null ? `${(h.p50ms / 1000).toFixed(2)} / ${((h.p95ms ?? 0) / 1000).toFixed(2)} s` : '—'}</td>
                    <td className="num">{ago(r.ageMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
