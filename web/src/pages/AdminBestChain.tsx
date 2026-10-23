import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';

// "Best chain" finder (owner 2026-10-23): BackX launches on Robinhood Chain, BNB Chain, Base and Arbitrum and lists a
// coin like BTC or ETH on the chain where it passes the listing rules with the highest tier (more multiplication),
// then the cheapest liquidation gas, then the deepest liquidity. The server runs the check in the background
// (GeckoTerminal is rate limited) and caches it for an hour.

interface BestRow { chainId: number; chain: string; token: { address: string; symbol: string } | null; pass: boolean; tier: string | null; maxM: number; liquidity: number | null; gasUsd: number | null }
interface Best { symbol: string; best: number | null; rows: BestRow[]; checkedAt: string }

const usdM = (v: number | null) => (v == null ? '—' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);

export function AdminBestChain() {
  const [q, setQ] = useState('BTC');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [data, setData] = useState<Best | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');

  useEffect(() => {
    if (!symbol) return;
    let live = true, t = 0;
    const poll = async () => {
      try {
        const r = await api<Best | { pending: true }>(`/api/admin/listing-best?symbol=${encodeURIComponent(symbol)}`);
        if (!live) return;
        if ('pending' in r) { setState('checking'); t = window.setTimeout(poll, 5000); }
        else { setData(r); setState('idle'); }
      } catch (e) { if (live) setState(e instanceof ApiError && e.status === 400 ? 'error' : 'error'); }
    };
    setData(null); setState('checking'); poll();
    return () => { live = false; clearTimeout(t); };
  }, [symbol]);

  const submit = (e: FormEvent) => { e.preventDefault(); const s = q.trim().toUpperCase(); if (s) setSymbol(s); };

  return (
    <section className="card">
      <div className="row-between docs-head">
        <h2>Best chain</h2>
        <form className="best-form" onSubmit={submit}>
          <div className="input-wrap"><input aria-label="Coin symbol" value={q} onChange={(e) => setQ(e.target.value)} placeholder="BTC, ETH, SOL…" autoComplete="off" spellCheck={false} /></div>
          <button className="btn btn-gold btn-sm" type="submit" disabled={state === 'checking'}>Check</button>
        </form>
      </div>
      {state === 'checking' && <p className="muted" aria-live="polite"><span className="sk sk-w30" /> Checking {symbol} on 4 chains (1–2 min)…</p>}
      {state === 'error' && <p className="field-err" role="alert">Checks unavailable right now. Try again in a minute.</p>}
      {data && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Chain</th><th>Token</th><th>Rules</th><th>Tier</th><th className="r">Max</th><th className="r">Liquidity</th><th className="r">Liquidation gas</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.chainId} className={data.best === r.chainId ? 'best-row' : ''}>
                  <td><b>{r.chain}</b>{data.best === r.chainId && <span className="badge ok best-badge">Best</span>}</td>
                  <td className="num">{r.token ? <>{r.token.symbol} <small className="muted">{r.token.address.slice(0, 6)}…{r.token.address.slice(-4)}</small></> : <span className="muted">not found</span>}</td>
                  <td className={r.pass ? 'up' : 'down'}>{r.pass ? '▲ Pass' : '▼ Fail'}</td>
                  <td>{r.tier ?? '—'}</td>
                  <td className="num r">{r.maxM ? `${r.maxM}×` : '—'}</td>
                  <td className="num r">{usdM(r.liquidity)}</td>
                  <td className="num r">{r.gasUsd == null ? '—' : `$${r.gasUsd.toFixed(3)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
