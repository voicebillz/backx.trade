import { useEffect, useMemo, useRef, useState } from 'react';

// Short, unambiguous words; a sentence of four is easy to type, impossible to guess.
const WORDS = [
  'amber', 'anchor', 'arrow', 'bamboo', 'beacon', 'blossom', 'bridge', 'canyon', 'cedar', 'comet', 'copper', 'coral',
  'crystal', 'delta', 'desert', 'eagle', 'ember', 'falcon', 'forest', 'garden', 'glacier', 'granite', 'harbor', 'island',
  'jasmine', 'jungle', 'lantern', 'lemon', 'marble', 'meadow', 'meteor', 'mirror', 'nectar', 'ocean', 'orbit', 'orchid',
  'pepper', 'pillar', 'planet', 'prairie', 'quartz', 'rapid', 'raven', 'river', 'saddle', 'salmon', 'silver', 'summit',
  'thunder', 'timber', 'tunnel', 'velvet', 'violet', 'walnut', 'willow', 'winter', 'yellow', 'zephyr',
];

function sentence(n = 4) {
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => WORDS[x % WORDS.length]).join(' ');
}

interface Props { address: string; onConfirm: () => void; onClose: () => void }

/** Gate before showing a private key: read the warnings, then type a random sentence (no paste). */
export function ExportConfirm({ address, onConfirm, onClose }: Props) {
  const phrase = useMemo(() => sentence(), []);
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const match = typed.trim().replace(/\s+/g, ' ').toLowerCase() === phrase;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="export-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
        </div>
        <h2 id="export-title">Export private key</h2>
        <p className="muted small num">{address}</p>
        <ul className="export-warnings">
          <li>Anyone with this key controls every coin in this wallet, on every network.</li>
          <li>backx.trade and support will <b>never</b> ask for it. Anyone who does is trying to steal from you.</li>
          <li>Never paste it into a website, chat or screenshot. Store it offline.</li>
        </ul>
        <label className="export-ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I understand that whoever has this key can take my funds.</span>
        </label>
        <div className="field">
          <label className="label" htmlFor="export-phrase">Type this sentence to continue</label>
          <p className="export-phrase num" aria-live="polite">{phrase}</p>
          <div className={'input-wrap' + (typed && !match ? ' bad' : match ? ' good' : '')}>
            <input
              id="export-phrase" ref={input} value={typed} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              // Typing it means reading it; pasting skips that.
              onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}
              placeholder="Type the words above"
            />
          </div>
        </div>
        <button className="btn btn-danger-solid btn-block" disabled={!match || !ack} onClick={onConfirm}>Show private key</button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
