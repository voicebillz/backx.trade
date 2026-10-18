import { useState } from 'react';
import type { Balances } from '../lib/useBalances';
import { CHAIN_LOGO } from '../lib/assets';
import { usd } from '../lib/format';
import { CoinIcon } from './CoinIcon';
import { go, href } from '../lib/router';

const amt = (s: string) => {
  const n = Number(s);
  return n === 0 ? '0' : n < 0.0001 ? '<0.0001' : n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 4 });
};

/** Total balance in USD; hover or focus shows every asset per chain. */
export function BalanceButton({ data, error }: { data: Balances | null; error: boolean }) {
  const [open, setOpen] = useState(false);
  const held = data?.assets.filter((a) => Number(a.amount) > 0) ?? [];
  return (
    <div className="bal" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <a className="bal-btn" href={href('wallet')} onClick={go('wallet')} aria-label={data ? `Balance ${usd(data.totalUsd)}` : 'Balance'}>
        <span className="label">Balance</span>
        {data ? <span className="num bal-total">{usd(data.totalUsd)}</span> : error ? <span className="num muted">—</span> : <span className="sk sk-bal" aria-busy="true" />}
      </a>
      {open && (
        <div className="bal-pop" role="dialog" aria-label="Balances">
          <div className="bal-pop-head"><span className="label">Your wallet</span>{data?.partial && <span className="muted small">Some chains did not answer</span>}</div>
          {held.length === 0 && <p className="muted small bal-empty">{data ? 'No funds yet. Deposit to start.' : 'Loading balances…'}</p>}
          <ul>
            {held.map((a) => (
              <li key={a.chain + a.symbol}>
                <span className="bal-asset">
                  <span className="bal-logo"><CoinIcon symbol={a.symbol} size={22} /><img className="bal-chain" src={CHAIN_LOGO[a.chain]} alt="" width={11} height={11} /></span>
                  <span><b>{a.symbol}</b><small>{a.chainName}</small></span>
                </span>
                <span className="r"><span className="num">{amt(a.amount)}</span><small className="num">{a.usd != null ? usd(a.usd) : '—'}</small></span>
              </li>
            ))}
          </ul>
          <a className="bal-link" href={href('wallet')} onClick={go('wallet')}>Deposit or withdraw →</a>
        </div>
      )}
    </div>
  );
}
