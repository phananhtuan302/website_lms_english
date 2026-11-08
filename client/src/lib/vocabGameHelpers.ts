import type { GameWordDTO } from '@platform/shared';

/** Fisher-Yates shuffle — shared by all three "Vocab Studio" games (previously
 * duplicated per-game; extracted once a third copy would have made it the same code in
 * three files). */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Picks `n` decoy words distinct from `target`, padding with repeats if the set is too
 * small to have `n` distinct alternatives (a small demo set of 2-3 words should still be
 * playable, just with an occasional repeated decoy). */
export function pickDecoys(words: GameWordDTO[], target: GameWordDTO, n: number): GameWordDTO[] {
  const pool = shuffle(words.filter((w) => w.cardId !== target.cardId));
  const result: GameWordDTO[] = [];
  for (let i = 0; i < n; i++) {
    result.push(pool.length > 0 ? pool[i % pool.length] : target);
  }
  return result;
}
