import { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { useTheme } from '../lib/theme';
import { AdminPitch } from './AdminPitch';
import { AdminMemo } from './AdminMemo';

// www.backx.trade/pitch (owner 2026-10-28): the public investor page. Two tabs, the pitch deck (present, PowerPoint,
// PDF) and the pitch whitepaper (the investor memo, PDF). ?view=whitepaper opens the second. Not indexed (noindex
// header and meta), not linked from the site: investors get the link. Same components as Admin → Pitch deck / memo.

type View = 'deck' | 'whitepaper';

export default function PitchSite() {
  const [view, setView] = useState<View>(() => (new URLSearchParams(location.search).get('view') === 'whitepaper' ? 'whitepaper' : 'deck'));
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    document.title = view === 'deck' ? 'Pitch deck · BackX' : 'Pitch whitepaper · BackX';
    history.replaceState(null, '', view === 'deck' ? '/pitch' : '/pitch?view=whitepaper');
  }, [view]);
  return (
    <div className="home home-doc">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><a href="/" aria-label="BackX home"><Logo /></a></span>
        <div className="seg seg-inline pitch-tabs" role="tablist" aria-label="Document">
          {(['deck', 'whitepaper'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v === 'deck' ? 'Pitch deck' : 'Pitch whitepaper'}</button>
          ))}
        </div>
        <div className="h-header-cta">
          <button className="h-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>
      <main id="main" className="pitch-site">
        {view === 'deck' ? <AdminPitch isPublic /> : <AdminMemo isPublic />}
      </main>
    </div>
  );
}
