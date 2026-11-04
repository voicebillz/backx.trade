import { useProposal, useCountdown, proposalHref } from '../lib/proposals';

/** Rolling strip at the very top of the front page while a proposal is open (owner 2026-11-04). The whole strip
 *  links to the proposal page; it pauses on hover/focus and stands still with prefers-reduced-motion. */
export function ProposalBanner() {
  const { proposal: p } = useProposal();
  const left = useCountdown(p?.endsAt ?? null);
  if (!p || p.status !== 'open') return null;
  const href = proposalHref(p.id);
  const text = p.banner || `${p.title} ${p.question}`;
  const run = (hidden: boolean) => (
    <span className="bxp-run" aria-hidden={hidden || undefined}>
      {[0, 1, 2].map((i) => <span key={i}>{text}<i className="bxp-dot" aria-hidden="true" /></span>)}
    </span>
  );
  return (
    <div className="bxp-banner" role="region" aria-label={`${p.code} is open`}>
      <a className="bxp-strip" href={href}>
        <span className="bxp-tag">{p.code}</span>
        {left && <span className="bxp-left num" aria-label={`${left} left`}>{left}</span>}
        <span className="bxp-live" aria-hidden="true" />
        <span className="bxp-marquee"><span className="bxp-track">{run(false)}{run(true)}</span></span>
      </a>
      <a className="bxp-cta" href={href}>Signal now</a>
    </div>
  );
}
