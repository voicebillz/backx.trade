import { useEffect, useState } from 'react';

// Email signature for everyone at BackX (owner 2026-11-02), in Admin → Branding. One fixed design; each person fills
// in their own details and copies it into Gmail / Outlook / Apple Mail. Email clients need plain HTML tables with
// inline styles and a PNG logo (no SVG, no CSS classes). The logo is served from our own site at a versioned path
// (/email/backx-mark-v1.png, cached as immutable): never edit or delete that file; a new logo gets a new name (-v2)
// so signatures already in sent mail keep working.

const LOGO = 'https://www.backx.trade/email/backx-mark-v1.png';
const SITE = 'https://www.backx.trade';
const X = 'https://x.com/BACKXTRADE';
const KEY = 'backx.signature.v1';

export interface Fields { name: string; title: string; email: string; phone: string; telegram: string }
const EMPTY: Fields = { name: '', title: '', email: '', phone: '', telegram: '' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The signature as email-safe HTML (tables, inline styles, absolute image URL). */
export function signatureHtml(f: Fields): string {
  const sep = '<span style="color:#C8C8C8;padding:0 6px;">|</span>';
  const link = (href: string, text: string, strong = false) =>
    `<a href="${esc(href)}" style="color:#111111;text-decoration:none;${strong ? 'font-weight:600;' : ''}">${esc(text)}</a>`;
  const contact = [
    link(SITE, 'backx.trade', true),
    link(X, '@BACKXTRADE'),
    f.email && link(`mailto:${f.email}`, f.email),
  ].filter(Boolean).join(sep);
  const extra = [
    f.phone && link(`tel:${f.phone.replace(/[^+\d]/g, '')}`, f.phone),
    f.telegram && link(`https://t.me/${f.telegram.replace(/^@/, '')}`, `Telegram @${f.telegram.replace(/^@/, '')}`),
  ].filter(Boolean).join(sep);
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:auto;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
<tr>
<td style="padding:0 14px 0 0;vertical-align:top;"><a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="56" height="56" alt="BackX" style="display:block;border:0;width:56px;height:56px;border-radius:12px;"></a></td>
<td style="border-left:2px solid #FFD100;padding:0 0 0 14px;vertical-align:top;">
<div style="font-size:15px;line-height:20px;font-weight:700;color:#111111;">${esc(f.name || 'Your name')}</div>
<div style="font-size:13px;line-height:18px;color:#555555;">${esc(f.title ? `${f.title}, BackX` : 'BackX')}</div>
<div style="font-size:13px;line-height:20px;padding-top:6px;color:#111111;">${contact}</div>
${extra ? `<div style="font-size:13px;line-height:20px;color:#111111;">${extra}</div>` : ''}
<div style="font-size:12px;line-height:18px;padding-top:4px;color:#8A8A8A;">Future Trading for Agents &#8644; Capital</div>
</td>
</tr>
</table>`;
}

/** The signature saved in this browser from Admin → Branding (null when none is filled in yet). */
export function savedSignature(): Fields | null {
  try { const f = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; return f.name ? f : null; } catch { return null; }
}

/** Copies the signature as rich HTML (pastes formatted into Gmail, Outlook and Apple Mail), plain text as fallback. */
export async function copySignature(f: Fields) {
  const html = signatureHtml(f);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain(f)], { type: 'text/plain' }) })]);
  } catch { await navigator.clipboard?.writeText(plain(f)); }
}

export function EmailSignature() {
  const [f, setF] = useState<Fields>(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return EMPTY; }
  });
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* private mode: fine */ } }, [f]);
  const html = signatureHtml(f);
  const flash = (t: string) => { setDone(t); setTimeout(() => setDone(null), 1500); };

  // Rich copy so it pastes as a formatted signature into Gmail / Outlook / Apple Mail settings.
  const copyRich = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain(f)], { type: 'text/plain' }) })]);
      flash('Copied');
    } catch {
      const el = document.getElementById('sig-preview');
      if (el) { const r = document.createRange(); r.selectNode(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); document.execCommand('copy'); s?.removeAllRanges(); flash('Copied'); }
    }
  };
  const copyHtml = () => navigator.clipboard?.writeText(html).then(() => flash('HTML copied'));
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`], { type: 'text/html' }));
    a.download = 'backx-signature.htm';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const field = (k: keyof Fields, label: string, ph: string, type = 'text') => (
    <label className="field"><span className="label">{label}</span>
      <input type={type} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );

  return (
    <section className="card">
      <div className="row-between">
        <h2>Email signature</h2>
        <span className="link-buttons">
          <button className="btn btn-primary btn-sm" onClick={copyRich}>{done ?? 'Copy signature'}</button>
          <button className="btn btn-ghost btn-sm" onClick={copyHtml}>Copy HTML</button>
          <button className="btn btn-ghost btn-sm" onClick={download}>Download .htm</button>
        </span>
      </div>
      <div className="sig-grid">
        <div className="sig-fields">
          {field('name', 'Name', 'Full name')}
          {field('title', 'Title', 'Founder')}
          {field('email', 'Email', 'name@backx.trade', 'email')}
          {field('phone', 'Phone (optional)', '+1 555 123 4567', 'tel')}
          {field('telegram', 'Telegram (optional)', '@handle')}
        </div>
        <div className="sig-preview-wrap">
          {/* White like an email body, whatever the admin theme. */}
          <div id="sig-preview" className="sig-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </section>
  );
}

function plain(f: Fields) {
  return [f.name, f.title ? `${f.title}, BackX` : 'BackX', ['backx.trade', '@BACKXTRADE', f.email].filter(Boolean).join(' | '),
    [f.phone, f.telegram && `Telegram @${f.telegram.replace(/^@/, '')}`].filter(Boolean).join(' | '), 'Future Trading for Agents ⇄ Capital'].filter(Boolean).join('\n');
}
