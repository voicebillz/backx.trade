import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

// Admin "Proposals" (owner 2026-11-04): write what the community signals on. Always Yes / No. Draft = only here,
// Open = front-page banner + www.backx.trade/proposal take signals, Closed = the page shows the final split.
// Admins see the counts; the public page shows only percentages.

interface Item {
  id: number; code: string; title: string; question: string; body: string; banner: string;
  status: 'draft' | 'open' | 'closed'; createdAt: string; openedAt: string | null; closedAt: string | null; endsAt: string | null; days: number; yes: number; no: number; agents: number;
}
type Form = Pick<Item, 'title' | 'question' | 'body' | 'banner' | 'status' | 'days'>;
const EMPTY: Form = { title: '', question: '', body: '', banner: '', status: 'draft', days: 14 };
const STATUS_LABEL = { draft: 'Draft', open: 'Open', closed: 'Closed' } as const;
const PUBLIC = 'https://www.backx.trade/proposals';
const when = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function Editor({ item, onSaved, onCancel }: { item: Item | null; onSaved: (i: Item) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Form>(item ? { title: item.title, question: item.question, body: item.body, banner: item.banner, status: item.status, days: item.days } : EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (status: Form['status'] = f.status) => {
    setBusy(true); setErrs({}); setMsg(null);
    try {
      const r = await api<{ item: Item }>(item ? `/api/admin/proposals/${item.id}` : '/api/admin/proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, status }),
      });
      onSaved(r.item);
      if (!item) setF(EMPTY);
      setMsg('Saved');
    } catch (e) {
      if (e instanceof ApiError && e.body.fields) setErrs(e.body.fields as Record<string, string>);
      else setMsg('Could not save. Try again.');
    } finally { setBusy(false); }
  };
  const field = (k: 'title' | 'question' | 'body' | 'banner', label: string, ph: string, rows = 0, max = 200) => (
    <label className="field"><span className="label">{label}</span>
      {rows ? <textarea rows={rows} maxLength={max} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <div className="input-wrap"><input maxLength={max} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>}
      {errs[k] && <span className="field-err">{errs[k]}</span>}
    </label>
  );
  return (
    <div className="bxp-admin-form">
      {field('title', 'Title', 'Open issuing before launch?', 0, 80)}
      {field('question', 'Question (answered Yes or No)', 'Should BackX open issuing to the community before launch?', 0, 200)}
      {field('body', 'Text (blank line = new paragraph)', 'Why we ask …', 8, 4000)}
      {field('banner', 'Rolling banner text (empty = title + question)', 'BXP-1 is live: …', 0, 200)}
      <label className="field"><span className="label">Runs for (days){item?.status === 'open' && item.openedAt ? ` · started ${when(item.openedAt)}, ends ${when(item.endsAt)}` : ''}</span>
        <div className="input-wrap"><input type="number" inputMode="numeric" min={1} max={365} value={f.days}
          onChange={(e) => setF({ ...f, days: Math.max(1, Math.min(365, Math.floor(Number(e.target.value) || 1))) })} /></div>
        {errs.days && <span className="field-err">{errs.days}</span>}
      </label>
      <div className="link-buttons">
        {!item && <button className="btn btn-sm" disabled={busy} onClick={() => save('draft')}>Save draft</button>}
        {!item && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save('open')}>Publish and open</button>}
        {item && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save()}>Save</button>}
        {item && item.status !== 'open' && <button className="btn btn-sm" disabled={busy} onClick={() => save('open')}>Open</button>}
        {item && item.status === 'open' && <button className="btn btn-sm" disabled={busy} onClick={() => save('closed')}>Close</button>}
        {onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>}
        {msg && <span className="muted small" aria-live="polite">{msg}</span>}
      </div>
    </div>
  );
}

const pctYes = (i: Item) => (i.yes + i.no ? Math.round((i.yes * 1000) / (i.yes + i.no)) / 10 : null);

function Row({ i, open, onToggle, onSaved }: { i: Item; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const y = pctYes(i);
  const o = y === null ? null : y > 50 ? 'Yes' : y < 50 ? 'No' : 'Tie';
  const sub = i.status === 'open' ? `Ends ${when(i.endsAt)}` : i.status === 'closed' ? `Ended ${when(i.closedAt)}` : `${i.days} days when opened`;
  return (
    <li className={'inv-row' + (open ? ' open' : '')}>
      <button className="inv-head" aria-expanded={open} onClick={onToggle}>
        <span className="inv-name"><b>{i.code} · {i.title}</b><small>{sub}</small></span>
        <span className="inv-stage num">
          {i.status === 'closed' ? <b className={'bxp-h-out ' + (o === 'Yes' ? 'yes' : o === 'No' ? 'no' : 'none')}>{o ?? 'No signals'}</b> : STATUS_LABEL[i.status]}
          {' '}Yes {i.yes} / No {i.no}{i.agents ? ` (${i.agents} agents)` : ''}
        </span>
        <span className="inv-chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {i.status !== 'draft' && (
        <span className="bxp-mini bxp-admin-mini" aria-hidden="true"><i className="y" style={{ width: `${y ?? 0}%` }} /><i className="n" style={{ width: `${y === null ? 0 : 100 - y}%` }} /></span>
      )}
      {open && <div className="inv-body"><Editor item={i} onSaved={onSaved} /></div>}
    </li>
  );
}

export function AdminProposals() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const load = () => api<{ items: Item[] }>('/api/admin/proposals').then((r) => { setItems(r.items); setErr(false); }).catch(() => setErr(true));
  useEffect(() => { void load(); }, []);
  const saved = () => { setEdit(null); void load(); };
  const group = (st: Item['status']) => (items ?? []).filter((i) => i.status === st)
    .sort((a, b) => Date.parse(b.closedAt ?? b.openedAt ?? b.createdAt) - Date.parse(a.closedAt ?? a.openedAt ?? a.createdAt));
  const list = (title: string, rows: Item[]) => rows.length > 0 && (
    <section className="card" key={title}>
      <h2>{title} <span className="muted num">{rows.length}</span></h2>
      <ul className="inv-list">{rows.map((i) => <Row key={i.id} i={i} open={edit === i.id} onToggle={() => setEdit(edit === i.id ? null : i.id)} onSaved={saved} />)}</ul>
    </section>
  );

  return (
    <>
      {err && <p className="field-err" role="alert">Could not load proposals.</p>}
      {!items ? <section className="card"><span className="sk sk-w60" /></section> : (
        <>
          {list('Running', group('open'))}
          {list('Drafts', group('draft'))}
        </>
      )}
      <section className="card">
        <div className="row-between">
          <h2>New proposal</h2>
          <a className="btn btn-sm" href={PUBLIC} target="_blank" rel="noopener noreferrer">Public page</a>
        </div>
        <Editor item={null} onSaved={saved} />
      </section>
      {items && list('History', group('closed'))}
    </>
  );
}
