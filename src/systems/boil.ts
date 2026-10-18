import type { Game } from "@debuffjp/core";

const FPS = 8;

/** Which of the 3 boil frames to draw. `phase` offsets each entity so crowds shimmer, not pulse. */
export function boil(game: Game, phase = 0): number {
  if (game.reducedMotion) return 0;
  return Math.floor(game.clock.time * FPS + phase) % 3;
}
