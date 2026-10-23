import { useState } from 'react';
import { SEO_PAGES, pageUrl, type SeoPage } from '../lib/seoPages';
import { CHAINS, chainSrc } from '../components/home/ChainCarousel';

// Admin "Branding" (owner 2026-10-23): every official image in one place (moved out of Profile → Documents), plus
// how each public page looks as a link preview (title, description, image from src/lib/seoPages.ts, the same list
// the build writes into each page's head). Images are the files in web/public, served as-is.

const BRAND = [
  { name: 'Profile picture', note: '4000 × 4000 · X and other socials', file: 'backx-pfp' },
  { name: 'Banner', note: '4500 × 1500 · X header', file: 'backx-banner' },
  { name: 'Logo', note: '3840 × 1280 · transparent PNG', file: 'backx-logo' },
  { name: 'Mark', note: '3840 × 3840 · transparent PNG', file: 'backx-mark' },
] as const;

const SINGLE = [
  { name: 'End of post', note: '3840 × 2160 · last image in X threads', url: '/brand/backx-end-of-post.png' },
  { name: 'Link preview image', note: '1200 × 630 · og.png, used by every page', url: '/og.png' },
];

const ICONS = [
  { name: 'Favicon', note: 'SVG · browser tab', url: '/favicon.svg' },
  { name: 'App icon', note: '512 × 512 · manifest, search results', url: '/icon-512.png' },
  { name: 'Apple touch icon', note: '180 × 180 · iPhone home screen', url: '/apple-touch-icon.png' },
  { name: 'Logo (Privy)', note: '1024 × 1024 · login window', url: '/backx-logo.png' },
  { name: '$GAZZ', note: 'SVG · Buy $GAZZ button', url: '/gazz-logo.svg' },
];

const LOGINS = ['outlook', 'google', 'x', 'android', 'windows', 'apple'];

function Asset({ name, note, url, tone = 'dark' }: { name: string; note: string; url: string; tone?: 'dark' | 'light' }) {
  const file = url.split('/').pop()!;
  return (
    <figure className={'brand-item ' + tone}>
      <div className="brand-preview"><img src={url} alt={name} loading="lazy" /></div>
      <figcaption>
        <span><b>{name}</b><small className="muted">{note}</small></span>
        <a className="btn btn-primary btn-sm" href={url} download={file}>Download</a>
      </figcaption>
    </figure>
  );
}

/** Roughly how X, Telegram and Discord render a shared link: image on top, domain, title, description. */
function Preview({ p }: { p: SeoPage }) {
  const url = pageUrl(p);
  return (
    <article className="link-card">
      <img src={p.image.replace(/^https:\/\/www\.backx\.trade/, '')} alt="" loading="lazy" />
      <div className="link-card-body">
        <span className="link-card-host">{new URL(url).host}{p.path.startsWith('http') ? '' : p.path === '/' ? '' : p.path}</span>
        <b>{p.title}</b>
        <span className="link-card-desc">{p.description}</span>
        <span className="link-card-foot">
          <span className={'badge ' + (p.indexed ? 'ok' : 'muted')}>{p.indexed ? 'Indexed' : 'noindex'}</span>
          <a href={url} target="_blank" rel="noopener">Open ↗</a>
        </span>
      </div>
    </article>
  );
}

export function AdminBranding() {
  const [tone, setTone] = useState<'dark' | 'light'>('dark');
  return (
    <>
      <section className="card">
        <div className="row-between docs-head">
          <h2>Brand images</h2>
          <div className="seg seg-inline" role="tablist" aria-label="Version">
            <button role="tab" aria-selected={tone === 'dark'} className={tone === 'dark' ? 'active' : ''} onClick={() => setTone('dark')}>Dark</button>
            <button role="tab" aria-selected={tone === 'light'} className={tone === 'light' ? 'active' : ''} onClick={() => setTone('light')}>Light</button>
          </div>
        </div>
        <div className="brand-grid">
          {BRAND.map((b) => <Asset key={b.file} name={b.name} note={b.note} url={`/brand/${b.file}-${tone}.png`} tone={tone} />)}
          {SINGLE.map((b) => <Asset key={b.url} {...b} />)}
        </div>
      </section>

      <section className="card">
        <h2>Link previews</h2>
        <div className="link-grid">{SEO_PAGES.map((p) => <Preview key={p.path} p={p} />)}</div>
      </section>

      <section className="card">
        <h2>Icons</h2>
        <div className="brand-grid">{ICONS.map((b) => <Asset key={b.url} {...b} />)}</div>
      </section>

      <section className="card">
        <h2>Chain logos <span className="muted">{CHAINS.length}</span></h2>
        <ul className="logo-wall">
          {CHAINS.map(([k, name]) => <li key={k}><a href={chainSrc(k)} download><img src={chainSrc(k)} alt="" width="48" height="48" loading="lazy" /><span>{name}</span></a></li>)}
        </ul>
      </section>

      <section className="card">
        <h2>Login logos</h2>
        <ul className="logo-wall">
          {LOGINS.map((k) => <li key={k}><a href={`/logins/${k}.svg`} download><span className="hv-logo big"><img src={`/logins/${k}.svg`} alt="" /></span><span>{k}</span></a></li>)}
        </ul>
      </section>
    </>
  );
}
