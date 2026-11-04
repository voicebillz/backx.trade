import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

// Admin "Proposals" (owner 2026-11-04): write what the community signals on. Always Yes / No. Draft = only here,
// Open = front-page banner + www.backx.trade/proposal take signals, Closed = the page shows the final split.
// Admins see the counts; the public page shows only percentages.

interface Item {
  id: number; code: string; title: string; question: string; body: string; banner: string;
  status: 'draft' | 'open' | 'closed'; createdAt: string; openedAt: string | null; closedAt: string | null; yes: number; no: number;
}
type Form = Pick<Item, 'title' | 'question' | 'body' | 'banner' | 'status'>;
const EMPTY: Form = { title: '', question: '', body: '', banner: '', status: 'draft' };
const STATUS_LABEL = { draft: 'Draft', open: 'Open', closed: 'Closed' } as const;
const PUBLIC = 'https://www.backx.trade/proposal';

function Editor({ item, onSaved, onCancel }: { item: Item | null; onSaved: (i: Item) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Form>(item ? { title: item.title, question: item.question, body: item.body, banner: item.banner, status: item.status } : EMPTY);
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
  const field = (k: keyof Form, label: string, ph: string, rows = 0, max = 200) => (
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

export function AdminProposals() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const load = () => api<{ items: Item[] }>('/api/admin/proposals').then((r) => { setItems(r.items); setErr(false); }).catch(() => setErr(true));
  useEffect(() => { void load(); }, []);
  const saved = () => { setEdit(null); void load(); };

  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>New proposal</h2>
          <a className="btn btn-sm" href={PUBLIC} target="_blank" rel="noopener noreferrer">Public page</a>
        </div>
        <Editor item={null} onSaved={saved} />
      </section>
      <section className="card">
        <h2>Proposals</h2>
        {err && <p className="field-err" role="alert">Could not load proposals.</p>}
        {!items ? <span className="sk sk-w60" /> : items.length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="inv-list">
            {items.map((i) => {
              const total = i.yes + i.no;
              const yp = total ? Math.round((i.yes * 1000) / total) / 10 : null;
              return (
                <li key={i.id} className={'inv-row' + (edit === i.id ? ' open' : '')}>
                  <button className="inv-head" aria-expanded={edit === i.id} onClick={() => setEdit(edit === i.id ? null : i.id)}>
                    <span className="inv-name"><b>{i.code} · {i.title}</b><small>{i.question}</small></span>
                    <span className="inv-stage num">{STATUS_LABEL[i.status]} · Yes {i.yes} / No {i.no}{yp !== null ? ` (${yp} % yes)` : ''}</span>
                    <span className="inv-chev" aria-hidden="true">{edit === i.id ? '−' : '+'}</span>
                  </button>
                  {edit === i.id && <div className="inv-body"><Editor item={i} onSaved={saved} onCancel={() => setEdit(null)} /></div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
