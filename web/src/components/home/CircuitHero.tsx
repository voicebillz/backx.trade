import { useEffect, useRef } from 'react';

// Front-page hero background (owner 2026-10-22): a processor with circuit traces radiating out and signals
// running along them, seen at an angle. Drawn on a canvas from a fixed seed, so it is ours (no stock footage),
// sharp at any size and light to load. Flat colours only: no glows, no light circles. Pauses when off screen
// or in a background tab; a single still frame for prefers-reduced-motion.

const BRAND = '#FFD100';
// Colours follow the theme through CSS variables on .home (dark and light).
const css = (el: Element, k: string, d: string) => getComputedStyle(el).getPropertyValue(k).trim() || d;

interface Trace { pts: [number, number][]; len: number; seg: number[] }

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Traces leave the chip on all four sides, run straight, bend 45° away from the centre, end in a pad. */
function build(w: number, h: number, cx: number, cy: number, chip: number): Trace[] {
  const r = rng(7), out: Trace[] = [], R = Math.min(w, h), pins = 18;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < pins; i++) {
      const f = (i + 0.5) / pins - 0.5;                         // −0.5..0.5 along the side
      const nx = [0, 1, 0, -1][side], ny = [-1, 0, 1, 0][side];   // outward normal
      const tx = -ny, ty = nx;                                    // along the side
      const sx = cx + nx * chip / 2 + tx * f * chip * 0.9, sy = cy + ny * chip / 2 + ty * f * chip * 0.9;
      const l1 = R * (0.03 + r() * 0.06);
      const bend = Math.sign(f || (r() - 0.5));
      const l2 = R * (0.05 + r() * 0.12) * (0.6 + Math.abs(f));
      const l3 = R * (0.04 + r() * 0.22);
      const p1: [number, number] = [sx + nx * l1, sy + ny * l1];
      const p2: [number, number] = [p1[0] + (nx + tx * bend) * l2 * 0.7, p1[1] + (ny + ty * bend) * l2 * 0.7];
      const p3: [number, number] = [p2[0] + nx * l3, p2[1] + ny * l3];
      const pts: [number, number][] = [[sx, sy], p1, p2, p3];
      const seg = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
      out.push({ pts, seg, len: seg.reduce((a, b) => a + b, 0) });
    }
  }
  return out;
}

function at(tr: Trace, d: number): [number, number] {
  let k = 0;
  while (k < tr.seg.length - 1 && d > tr.seg[k]) { d -= tr.seg[k]; k++; }
  const q = Math.min(1, Math.max(0, d / tr.seg[k])), a = tr.pts[k], b = tr.pts[k + 1];
  return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
}

export function CircuitHero() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, traces: Trace[] = [], base: HTMLCanvasElement | null = null, cx = 0, cy = 0, chip = 0;
    let raf = 0, visible = true;
    const pulses = Array.from({ length: 46 }, (_, i) => ({ tr: (i * 37) % 72, phase: (i * 0.137) % 1, speed: 0.16 + ((i * 53) % 10) / 40 }));

    const layout = () => {
      const rect = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cx = w * 0.5; cy = h * 0.5; chip = Math.min(w, h) * 0.17;
      traces = build(w, h, cx, cy, chip);
      // static layer: traces, pads and the chip, drawn once per size
      base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
      const b = base.getContext('2d')!; b.scale(dpr, dpr);
      const TRACE = css(cv, '--circuit-trace', 'rgba(255,255,255,0.10)'), PAD = css(cv, '--circuit-pad', 'rgba(255,255,255,0.16)');
      b.lineWidth = 1.2; b.strokeStyle = TRACE; b.lineJoin = 'round';
      for (const tr of traces) { b.beginPath(); tr.pts.forEach(([x, y], k) => (k ? b.lineTo(x, y) : b.moveTo(x, y))); b.stroke(); }
      b.fillStyle = PAD;
      for (const tr of traces) { const [x, y] = tr.pts[3]; b.beginPath(); b.arc(x, y, 3.2, 0, Math.PI * 2); b.fill(); }
      const s = chip, x0 = cx - s / 2, y0 = cy - s / 2;
      b.fillStyle = css(cv, '--circuit-chip', '#121212'); b.strokeStyle = css(cv, '--circuit-chip-line', 'rgba(255,255,255,0.18)'); b.lineWidth = 1.5;
      b.beginPath(); b.roundRect(x0, y0, s, s, s * 0.08); b.fill(); b.stroke();
      b.strokeStyle = css(cv, '--circuit-trace', 'rgba(255,255,255,0.07)'); b.lineWidth = 1;
      for (let g = 1; g < 6; g++) { const p = x0 + (s * g) / 6; b.beginPath(); b.moveTo(p, y0 + s * 0.12); b.lineTo(p, y0 + s * 0.88); b.stroke(); b.beginPath(); b.moveTo(x0 + s * 0.12, y0 + (s * g) / 6); b.lineTo(x0 + s * 0.88, y0 + (s * g) / 6); b.stroke(); }
      // the backx mark on the die
      const m = new Path2D('M18.3,60 C22.5,57 26.5,55.6 31,55.6 C38,55.6 43.4,58.4 44.8,62.4 C45.4,64.6 43.8,65.6 41,65.6 C33,65.6 25,63.7 18.3,60 Z M31.5,69.4 L44,68.9 C47,68.7 49.6,67.7 51.6,65.7 L92.5,25.6 C84,39 70,60 60.4,75 C57.2,80 53.4,82 48.6,82 C42.6,82 37.5,77 31.5,69.4 Z');
      b.save(); const k = (s * 0.5) / 75; b.translate(cx - 55.5 * k, cy - 53.75 * k); b.scale(k, k); b.fillStyle = BRAND; b.fill(m); b.restore();
    };

    const frame = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (base) ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = now / 1000;
      ctx.lineCap = 'round'; ctx.lineWidth = 2;
      for (const p of pulses) {
        const tr = traces[p.tr % traces.length]; if (!tr) continue;
        const q = (t * p.speed + p.phase) % 1;              // 0..1 along the trace, outward
        const head = q * (tr.len + 60), tail = Math.max(0, head - 60);
        if (tail < tr.len) {
          const a = at(tr, Math.min(head, tr.len)), b0 = at(tr, tail);
          const g = ctx.createLinearGradient(b0[0], b0[1], a[0], a[1]);
          g.addColorStop(0, 'rgba(255,209,0,0)'); g.addColorStop(1, BRAND);
          ctx.strokeStyle = g; ctx.beginPath();
          // follow the corners between tail and head
          ctx.moveTo(b0[0], b0[1]);
          let acc = 0;
          for (let k = 0; k < tr.seg.length; k++) { acc += tr.seg[k]; if (acc > tail && acc < Math.min(head, tr.len)) ctx.lineTo(tr.pts[k + 1][0], tr.pts[k + 1][1]); }
          ctx.lineTo(a[0], a[1]); ctx.stroke();
        }
        // the pad lights up when the signal arrives, then fades
        const arrive = head - tr.len;
        if (arrive > 0 && arrive < 60) {
          const [x, y] = tr.pts[3];
          ctx.fillStyle = `rgba(255,209,0,${(1 - arrive / 60).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (!still && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    layout(); start();
    const ro = new ResizeObserver(() => { layout(); start(); }); ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }); io.observe(cv);
    const vis = () => { if (!document.hidden) start(); };
    const mo = new MutationObserver(() => { layout(); start(); });   // theme switch: redraw the static layer
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  return <canvas ref={ref} className="circuit" aria-hidden="true" />;
}
