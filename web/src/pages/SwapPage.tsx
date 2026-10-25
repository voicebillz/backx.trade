import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CHAIN_LOGO, EVM_CHAINS, type EvmChain } from '../lib/assets';
import { usd } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';
import { Dropdown } from '../components/Dropdown';

interface SwapToken { id: string; symbol: string; name: string; image: string | null; address: string; price: number | null; native?: boolean }
interface Quote {
  chainId: number; fromAmount: string; toAmount: string; toAmountMin: string;
  fromUsd: number | null; toUsd: number | null; gasUsd: number; feeUsd: number; route: string; slippage: number;
  quotedAt: number; loss: number | null; mev: string;
  approval: { to: `0x${string}`; data: `0x${string}` } | null;
  tx: { to: `0x${string}`; data: `0x${string}`; value: string };
}

const CHAIN_OPTIONS = [
  ...EVM_CHAINS.map((c) => ({ value: c.key as string, label: c.name, icon: <img src={CHAIN_LOGO[c.key]} alt="" width={16} height={16} /> })),
  { value: 'solana', label: 'Solana (soon)', icon: <img src={CHAIN_LOGO.solana} alt="" width={16} height={16} /> },
];
const EXPLORER: Record<EvmChain['key'], string> = { ethereum: 'https://etherscan.io/tx/', base: 'https://basescan.org/tx/', bsc: 'https://bscscan.com/tx/', arbitrum: 'https://arbiscan.io/tx/' };
const ERRORS: Record<string, string> = {
  insufficient: 'Not enough balance.', no_route: 'No route found for this pair and amount.', bad_amount: 'Enter an amount.',
  unknown_token: 'This token is not routable right now.', price_impact: 'Blocked: this route would lose more than 10% of the value. Try a smaller amount.', route_rejected: 'Route rejected by our safety checks. Try again.', unavailable: 'Quotes are unavailable. Try again shortly.',
};
const fmt = (s: string) => { const n = Number(s); return n === 0 ? '0' : n < 0.000001 ? '<0.000001' : n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 8 : 6 }); };

/** Token picker sheet: search over every listed coin that exists on the chosen chain. */
function TokenPicker({ tokens, onPick, onClose, exclude }: { tokens: SwapToken[]; onPick: (t: SwapToken) => void; onClose: () => void; exclude?: string }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = tokens.filter((t) => t.address !== exclude);
    if (!s) return base.slice(0, 200);
    const starts = base.filter((t) => t.symbol.toLowerCase().startsWith(s) || t.address === s);
    const rest = base.filter((t) => !starts.includes(t) && (t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s)));
    return [...starts, ...rest].slice(0, 100);
  }, [q, tokens, exclude]);
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal picker" role="dialog" aria-modal="true" aria-label="Choose token" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Choose token</h2>
        <div className="input-wrap"><input ref={input} placeholder="Search name, ticker or address" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        <ul className="picker-list">
          {list.map((t) => (
            <li key={t.address}>
              <button onClick={() => { onPick(t); onClose(); }}>
                <CoinIcon symbol={t.symbol} src={t.image ?? undefined} size={28} />
                <span className="picker-name"><b>{t.symbol}</b><small>{t.name}</small></span>
                <span className="num muted small">{t.native ? 'Native' : `${t.address.slice(0, 6)}…${t.address.slice(-4)}`}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="empty">No token matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

function TokenButton({ t, onClick }: { t: SwapToken | null; onClick: () => void }) {
  return (
    <button className="token-btn" onClick={onClick}>
      {t ? <><CoinIcon symbol={t.symbol} src={t.image ?? undefined} size={24} /><b>{t.symbol}</b></> : <b>Select</b>}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
  );
}

/** Chains tried, in order, to find a coin the user wants (the swap overlay from Trade / Issue). */
const WANT_ORDER = ['base', 'arbitrum', 'bsc', 'ethereum'];

interface SwapProps {
  onDone: () => void;
  /** Overlay mode: the coin to get (USDC for a trade, the coin for a Short pool). Picks the first chain that lists it. */
  want?: string;
  /** Overlay mode: back to where the user was. */
  onBack?: () => void;
}

export function SwapPage({ onDone, want, onBack }: SwapProps) {
  const { actions } = useAuth();
  const [chain, setChain] = useState<string>('base');
  const tried = useRef<Set<string>>(new Set());
  const [tokens, setTokens] = useState<SwapToken[] | null>(null);
  const [from, setFrom] = useState<SwapToken | null>(null);
  const [to, setTo] = useState<SwapToken | null>(null);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [slippage, setSlippage] = useState('0.005');
  const [step, setStep] = useState<{ kind: 'idle' | 'checking' | 'approve' | 'swap' | 'done' | 'error'; msg?: string }>({ kind: 'idle' });
  const [ackImpact, setAckImpact] = useState(false);
  const evm = chain !== 'solana';

  // Tokens for the chain; default pair: native → USDC.
  useEffect(() => {
    if (!evm) { setTokens([]); return; }
    setTokens(null); setFrom(null); setTo(null); setQuote(null);
    api<{ items: SwapToken[] }>(`/api/swap/tokens?chain=${chain}`).then((r) => {
      const target = r.items.find((t) => t.symbol === (want ?? 'USDC'));
      // The coin is not on this chain: try the next launch chain that might route it.
      tried.current.add(chain);
      const next = want && !target ? WANT_ORDER.find((c) => !tried.current.has(c)) : undefined;
      if (next) { setChain(next); return; }
      setTokens(r.items);
      const usdc = r.items.find((t) => t.symbol === 'USDC');
      setFrom(want && want !== 'USDC' ? usdc ?? r.items[0] ?? null : r.items[0] ?? null);
      setTo(target ?? r.items[1] ?? null);
    }).catch(() => setTokens([]));
  }, [chain, evm, want]);

  useEffect(() => {
    setBalance(null);
    if (!from || !evm) return;
    api<{ amount: string }>(`/api/swap/balance?chain=${chain}&from=${from.address}`).then((r) => setBalance(r.amount)).catch(() => {});
  }, [from, chain, evm, step.kind]);

  // Debounced quote.
  useEffect(() => {
    setQuote(null); setQErr(null);
    if (!from || !to || !amount || Number(amount) <= 0 || !evm) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setQuote(await api<Quote>(`/api/swap/quote?chain=${chain}&from=${from.address}&to=${to.address}&amount=${encodeURIComponent(amount)}&slippage=${slippage}`, { signal: ctl.signal }));
      } catch (e) {
        if (!ctl.signal.aborted) setQErr(e instanceof ApiError ? ERRORS[e.code] ?? 'No quote.' : 'No quote.');
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [from, to, amount, chain, slippage, evm]);

  const flip = () => { setFrom(to); setTo(from); setAmount(''); };

  /** Waits until the transaction is mined (private RPCs only show it once it is in a block). */
  const waitMined = async (hash: string) => {
    for (let i = 0; i < 90; i++) {
      const r = await api<{ status: string }>(`/api/swap/receipt?chain=${chain}&hash=${hash}`).catch(() => ({ status: 'pending' }));
      if (r.status === 'success') return;
      if (r.status === 'reverted') throw new Error('The approval failed on-chain.');
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    throw new Error('The approval is taking long. Try the swap again in a minute.');
  };

  const quoteUrl = () => `/api/swap/quote?chain=${chain}&from=${from!.address}&to=${to!.address}&amount=${encodeURIComponent(amount)}&slippage=${slippage}`;

  const swap = async () => {
    if (!quote || !actions || !from || !to) return;
    try {
      // MEV: never sign a stale route. Re-quote now; if the guaranteed minimum got worse, show it instead.
      setStep({ kind: 'checking' });
      const fresh = await api<Quote>(quoteUrl());
      if (Number(fresh.toAmountMin) < Number(quote.toAmountMin) * 0.998) {
        setQuote(fresh);
        setStep({ kind: 'error', msg: 'The price moved. Check the new minimum and confirm again.' });
        return;
      }
      let q = fresh;
      if (q.approval) {
        setStep({ kind: 'approve' });
        const ah = await actions.sendEvm({ chainId: q.chainId, to: q.approval.to, data: q.approval.data, description: `Allow ${q.fromAmount} ${from.symbol} for this swap` });
        await waitMined(ah);
        // The approval took a block or more: quote again so the swap never signs an old price.
        setStep({ kind: 'checking' });
        const after = await api<Quote>(quoteUrl());
        if (Number(after.toAmountMin) < Number(fresh.toAmountMin) * 0.998) {
          setQuote(after);
          setStep({ kind: 'error', msg: 'Approved. The price moved meanwhile: check the new minimum and press Swap again.' });
          return;
        }
        q = after;
      }
      setStep({ kind: 'swap' });
      const hash = await actions.sendEvm({
        chainId: q.chainId, to: q.tx.to, data: q.tx.data, value: BigInt(q.tx.value),
        description: `Swap ${q.fromAmount} ${from.symbol} → ~${fmt(q.toAmount)} ${to.symbol}`,
      });
      setStep({ kind: 'done', msg: hash });
      setAmount('');
      onDone();
    } catch (e) {
      setStep({ kind: 'error', msg: e instanceof ApiError ? ERRORS[e.code] ?? 'No quote.' : e instanceof Error ? e.message.slice(0, 140) : 'Not sent' });
    }
  };

  const impact = quote?.loss != null ? -quote.loss * 100 : null;
  const highImpact = impact != null && impact < -3;
  const busy = step.kind === 'checking' || step.kind === 'approve' || step.kind === 'swap';
  useEffect(() => { setAckImpact(false); }, [quote?.quotedAt]);

  const Wrap = onBack ? 'div' : 'main';
  return (
    <Wrap {...(onBack ? { className: 'swap-embed' } : { id: 'main', className: 'page swap-page' })}>
      {!onBack && <h1 className="swap-title">Swap portal</h1>}

      <div className="swap-wrap">
        <section className="card swap-card">
          <div className="row-between">
            <Dropdown label="Network" value={chain} options={CHAIN_OPTIONS} onChange={(v) => { setChain(v); setStep({ kind: 'idle' }); }} />
            <Dropdown label="Max slippage" value={slippage} compact
              options={[{ value: '0.001', label: '0.1%' }, { value: '0.005', label: '0.5%' }, { value: '0.01', label: '1%' }, { value: '0.03', label: '3%' }]}
              onChange={setSlippage} />
          </div>

          {!evm ? (
            <p className="note">Solana swaps come next. Your SOL and Solana tokens are safe in your wallet meanwhile.</p>
          ) : (
            <>
              <div className="swap-box">
                <div className="field-head"><span className="label">You pay</span>
                  <span className="label">Balance <span className="num">{balance != null ? fmt(balance) : '—'}</span>
                    {balance && Number(balance) > 0 && <button className="max-btn" onClick={() => setAmount(balance)}>Max</button>}
                  </span>
                </div>
                <div className="swap-row">
                  <input className="num swap-amt" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Amount to pay" />
                  <TokenButton t={from} onClick={() => setPicker('from')} />
                </div>
                <span className="muted small num">{quote?.fromUsd != null ? usd(quote.fromUsd) : ' '}</span>
              </div>

              <button className="swap-flip" onClick={flip} aria-label="Swap direction">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M7 4v16M7 20l-4-4M7 20l4-4M17 20V4M17 4l-4 4M17 4l4 4" /></svg>
              </button>

              <div className="swap-box">
                <div className="field-head"><span className="label">You receive</span></div>
                <div className="swap-row">
                  <span className={'num swap-amt out' + (loading ? ' loading' : '')}>{quote ? fmt(quote.toAmount) : loading ? '…' : '0'}</span>
                  <TokenButton t={to} onClick={() => setPicker('to')} />
                </div>
                <span className="muted small num">{quote?.toUsd != null ? usd(quote.toUsd) : ' '}</span>
              </div>

              {qErr && <p className="field-err">{qErr}</p>}
              {quote && (
                <dl className="kv small swap-details">
                  <div><dt>Route</dt><dd>{quote.route}</dd></div>
                  <div><dt>Minimum received</dt><dd className="num">{fmt(quote.toAmountMin)} {to?.symbol}</dd></div>
                  {impact != null && <div><dt>Price impact incl. fees</dt><dd className={'num ' + (impact < -3 ? 'down' : '')}>{impact.toFixed(2)}%</dd></div>}
                  <div><dt>Network fee (est.)</dt><dd className="num">{usd(quote.gasUsd)}</dd></div>
                  {quote.feeUsd > 0 && <div><dt>Routing fee</dt><dd className="num">{usd(quote.feeUsd)}</dd></div>}
                  {quote.approval && <div><dt>Approval</dt><dd>Exact amount, one extra signature</dd></div>}
                  <div><dt>MEV protection</dt><dd className="ok">{quote.mev}</dd></div>
                </dl>
              )}

              {highImpact && quote && (
                <label className="export-ack">
                  <input type="checkbox" checked={ackImpact} onChange={(e) => setAckImpact(e.target.checked)} />
                  <span>This swap loses {Math.abs(impact!).toFixed(1)}% to fees and price impact. I understand.</span>
                </label>
              )}
              <button className="btn btn-primary btn-block" disabled={!quote || !actions || busy || (highImpact && !ackImpact)} onClick={swap}>
                {step.kind === 'checking' ? 'Checking the latest price…'
                  : step.kind === 'approve' ? 'Step 1 of 2: approve in the wallet window…'
                  : step.kind === 'swap' ? (quote?.approval ? 'Step 2 of 2: confirm the swap…' : 'Confirm the swap in the wallet window…')
                  : !from || !to ? 'Select tokens' : !amount ? 'Enter an amount' : loading ? 'Finding the best route…' : quote ? `Swap ${from.symbol} → ${to.symbol}` : 'No route'}
              </button>
              {!actions && <p className="hint">Sign in again to sign swaps with your wallet.</p>}
              {step.kind === 'done' && <p className="ok small">Swapped. <a href={EXPLORER[chain as EvmChain['key']] + step.msg} target="_blank" rel="noopener">View transaction</a></p>}
              {step.kind === 'done' && onBack && <button className="btn btn-gold btn-block" onClick={onBack}>Back</button>}
              {step.kind === 'error' && <p className="field-err">Not swapped: {step.msg}</p>}
            </>
          )}
        </section>
      </div>

      {picker && tokens && (
        <TokenPicker tokens={tokens} exclude={(picker === 'from' ? to : from)?.address}
          onPick={(t) => (picker === 'from' ? setFrom(t) : setTo(t))} onClose={() => setPicker(null)} />
      )}
    </Wrap>
  );
}

/** Swap in an overlay over Trade / Issue: the coin you need is preselected, and Back returns to where you were. */
export function SwapOverlay({ want, onClose }: { want: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-scrim center swap-overlay" onClick={onClose}>
      <div className="modal swap-modal" role="dialog" aria-modal="true" aria-label={`Get ${want}`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={want} size={32} /><div><p className="eyebrow gold">Swap</p><h2>Get {want}</h2></div></div>
        <SwapPage want={want} onDone={() => {}} onBack={onClose} />
      </div>
    </div>
  );
}
