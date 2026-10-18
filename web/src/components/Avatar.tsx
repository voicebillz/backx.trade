// Random profile picture assigned at sign-up (avatar_seed from the server): a two-tone gradient orb.
export function Avatar({ seed, src, size = 32 }: { seed: number; src?: string | null; size?: number }) {
  if (src) return <img className="avatar" src={src} alt="" width={size} height={size} style={{ objectFit: 'cover' }} />;
  const h1 = seed % 360;
  const h2 = (h1 + 40 + ((seed >> 9) % 120)) % 360;
  const angle = (seed >> 3) % 360;
  const x = 20 + ((seed >> 5) % 60), y = 20 + ((seed >> 7) % 60);
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at ${x}% ${y}%, hsl(${h2} 95% 70%) 0%, transparent 55%), linear-gradient(${angle}deg, hsl(${h1} 85% 52%), hsl(${h2} 80% 38%))`,
      }}
    />
  );
}
