import { useState } from 'react';

const TABS = [
  { id: 'positions', label: 'Positions', empty: 'No positions yet. Open your first hedge.' },
  { id: 'history', label: 'History', empty: 'No trades yet.' },
  { id: 'vaults', label: 'My vaults', empty: 'No vault deposits yet. Issue to a vault to start earning.' },
] as const;

export function BottomPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('positions');
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <section className="panel bottom" aria-label="Account">
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="table-wrap" role="tabpanel">
        <table>
          <thead>
            <tr><th>Market</th><th>Side</th><th>Size</th><th>m</th><th>Entry</th><th>Liq. price</th><th>PnL</th></tr>
          </thead>
        </table>
        <p className="empty">{t.empty}</p>
      </div>
    </section>
  );
}
