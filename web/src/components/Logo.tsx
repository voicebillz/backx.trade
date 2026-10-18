const HEAD = 'M18.3,60 C22.5,57 26.5,55.6 31,55.6 C38,55.6 43.4,58.4 44.8,62.4 C45.4,64.6 43.8,65.6 41,65.6 C33,65.6 25,63.7 18.3,60 Z';
const BODY = 'M31.5,69.4 L44,68.9 C47,68.7 49.6,67.7 51.6,65.7 L92.5,25.6 C84,39 70,60 60.4,75 C57.2,80 53.4,82 48.6,82 C42.6,82 37.5,77 31.5,69.4 Z';

export function Mark({ size = 22, color = 'var(--brand)' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="18 25 75 57.5" height={size} width={(size * 75) / 57.5} fill={color} aria-hidden="true">
      <path d={HEAD} />
      <path d={BODY} />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="backx.trade home">
      <span className="logo-tile"><Mark size={15} /></span>
      <span className="logo-word">backx<span>.trade</span></span>
    </a>
  );
}
