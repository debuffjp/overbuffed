import type { Game } from "@debuffjp/core";

const FPS = 8;

/** Which of the 3 boil frames to draw. `phase` offsets each entity so crowds shimmer, not pulse. */
export function boil(game: Game, phase = 0): number {
  if (game.reducedMotion) return 0;
  const n = Math.floor(game.clock.time * FPS + phase) % 3;
  return n < 0 ? n + 3 : n; // phases can be negative (world x), and % keeps the sign
}
