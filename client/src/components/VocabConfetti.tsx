const COLORS = ['#f97362', '#ffb703', '#38a169', '#3b82f6', '#a855f7', '#ec4899'];
const PIECE_COUNT = 18;

/** Deterministic-enough pseudo-random spread so pieces don't all fall in a dead-straight
 * line (a real RNG is unnecessary here — this never needs to be reproducible). `left`
 * uses the golden-ratio-conjugate step (×100 ≈ 61.8) — unlike a step close to 100 (e.g.
 * 97), which only decrements by a few % each time and clusters every piece into one
 * half of the width, this step is irrational enough relative to 100 that `(i * 61.8) %
 * 100` scatters evenly across the full 0–100% range for any small piece count. */
const PIECES = Array.from({ length: PIECE_COUNT }, (_, i) => ({
  left: `${(i * 61.8) % 100}%`,
  delay: `${(i % 6) * 0.06}s`,
  color: COLORS[i % COLORS.length],
  rotate: (i * 53) % 360,
}));

/**
 * A brief CSS-only confetti burst (`.vocab-confetti` in `index.css` animates these
 * `span`s) — no canvas, no animation library. Purely decorative (`aria-hidden`), used
 * for "Vocab Studio" celebration moments (a card marked known, a round/set completed).
 * Mount it conditionally for ~1.2s (its animation duration) and unmount — it does not
 * loop or clean up after itself.
 */
function VocabConfetti() {
  return (
    <div className="vocab-confetti" aria-hidden="true">
      {PIECES.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: p.left,
              backgroundColor: p.color,
              animationDelay: p.delay,
              // Read by the `100%` keyframe in index.css (`rotate(var(--vz-confetti-spin))`)
              // — a plain inline `transform` here would just get overridden for the whole
              // animation's duration, since a running CSS animation owns any property it
              // animates (here `transform`) for as long as it's active.
              '--vz-confetti-spin': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default VocabConfetti;
