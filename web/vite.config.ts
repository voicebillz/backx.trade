import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEO_PAGES, pageUrl } from './src/lib/seoPages';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Writes dist/<page>.html for SPA pages that need their own head (title, description, canonical, Open Graph).
 *  Vercel serves it at the clean path (cleanUrls), so crawlers and link previews see the page's own meta. */
function pageHeads(): Plugin {
  let outDir = 'dist';
  return {
    name: 'backx-page-heads',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const base = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const p of SEO_PAGES.filter((x) => x.file)) {
        const url = pageUrl(p), t = esc(p.title), d = esc(p.description);
        const html = base
          .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
          .replace(/(<meta name="description" content=")[^"]*"/, `$1${d}"`)
          .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
          .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
          .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`)
          .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${d}"`)
          .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`)
          .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${d}"`);
        writeFileSync(join(outDir, p.file!), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pageHeads()],
});
