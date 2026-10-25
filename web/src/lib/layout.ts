import { useEffect, useState } from 'react';

// Trading terminal layout (owner 2026-10-25): the chart and the ticket are always there; the side panel, the bottom
// panel and the coin header can be swapped or removed. Ten presets, sizes can be dragged on desktop. Saved per browser.

export type PanelKind = 'markets' | 'positions' | 'none';

export interface Layout {
  ticketSide: 'left' | 'right';
  side: PanelKind;          // the column next to the chart
  bottom: PanelKind;        // the row under everything
  header: boolean;          // coin header with price and stats
  sideW: number;            // px
  ticketW: number;          // px
  bottomH: number;          // px
}

export const LIMITS = { sideW: [200, 520], ticketW: [280, 460], bottomH: [140, 520] } as const;

const STD: Layout = { ticketSide: 'right', side: 'markets', bottom: 'positions', header: true, sideW: 280, ticketW: 320, bottomH: 240 };

// Preview images: public/layouts/<index>.webp, real screenshots of each preset (regenerate when the terminal changes).
export const PRESETS: { name: string; layout: Layout }[] = [
  { name: 'Standard', layout: STD },
  { name: 'Mirrored', layout: { ...STD, ticketSide: 'left' } },
  { name: 'Chart focus', layout: { ...STD, side: 'none', bottom: 'none' } },
  { name: 'Chart + positions', layout: { ...STD, side: 'none' } },
  { name: 'Markets only', layout: { ...STD, bottom: 'none' } },
  { name: 'Tall positions', layout: { ...STD, bottomH: 380 } },
  { name: 'Wide markets', layout: { ...STD, sideW: 400 } },
  { name: 'Positions on the side', layout: { ...STD, side: 'positions', bottom: 'markets', sideW: 420 } },
  { name: 'Compact', layout: { ...STD, sideW: 220, ticketW: 290, bottomH: 180 } },
  { name: 'Minimal', layout: { ...STD, side: 'none', bottom: 'none', header: false } },
];

const KEY = 'backx.layout.v1';
const EVENT = 'backx-layout';
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

function read(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return sanitize({ ...STD, ...v });
  } catch { /* storage off */ }
  return STD;
}

function sanitize(l: Layout): Layout {
  const kinds: PanelKind[] = ['markets', 'positions', 'none'];
  return {
    ticketSide: l.ticketSide === 'left' ? 'left' : 'right',
    side: kinds.includes(l.side) ? l.side : STD.side,
    bottom: kinds.includes(l.bottom) ? l.bottom : STD.bottom,
    header: l.header !== false,
    sideW: clamp(Number(l.sideW) || STD.sideW, LIMITS.sideW),
    ticketW: clamp(Number(l.ticketW) || STD.ticketW, LIMITS.ticketW),
    bottomH: clamp(Number(l.bottomH) || STD.bottomH, LIMITS.bottomH),
  };
}

/** Shared between the header's gear and the terminal (same tab via an event, other tabs via storage). */
export function useLayout() {
  const [layout, setState] = useState<Layout>(read);
  useEffect(() => {
    const sync = () => setState(read());
    addEventListener(EVENT, sync);
    addEventListener('storage', sync);
    return () => { removeEventListener(EVENT, sync); removeEventListener('storage', sync); };
  }, []);
  const set = (next: Partial<Layout>) => {
    const l = sanitize({ ...read(), ...next });
    // The same panel cannot be in two places: the other slot gives way.
    if (next.side && next.side !== 'none' && l.bottom === next.side) l.bottom = 'none';
    if (next.bottom && next.bottom !== 'none' && l.side === next.bottom) l.side = 'none';
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage off: this tab only */ }
    setState(l);
    dispatchEvent(new Event(EVENT));
  };
  return { layout, set };
}

/** CSS grid for the desktop terminal. */
export function gridOf(l: Layout) {
  const hasSide = l.side !== 'none', hasBottom = l.bottom !== 'none';
  const cols = l.ticketSide === 'right'
    ? [...(hasSide ? [['markets', `${l.sideW}px`]] : []), ['center', 'minmax(0, 1fr)'], ['ticket', `${l.ticketW}px`]]
    : [['ticket', `${l.ticketW}px`], ['center', 'minmax(0, 1fr)'], ...(hasSide ? [['markets', `${l.sideW}px`]] : [])];
  const top = cols.map((c) => c[0]).join(' ');
  return {
    '--t-cols': cols.map((c) => c[1]).join(' '),
    '--t-rows': hasBottom ? `minmax(0, 1fr) ${l.bottomH}px` : 'minmax(0, 1fr)',
    '--t-areas': hasBottom ? `"${top}" "${cols.map(() => 'bottom').join(' ')}"` : `"${top}"`,
  } as Record<string, string>;
}

