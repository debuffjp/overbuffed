/** Enemy families as data. Each kind is drawn with the shape of the same name (src/systems/shapes.ts). */
export interface EnemyKind {
  frames: string;
  size: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  /** How far knockback shoves it (0 = immovable). */
  weight: number;
  /** Chance to drop a healing dew. */
  dew: number;
}

export const ENEMIES = {
  blob: { frames: "blob", size: 14, hp: 2, speed: 22, damage: 1, xp: 1, weight: 1, dew: 0.01 },
  spiker: { frames: "spiker", size: 13, hp: 2, speed: 36, damage: 1, xp: 2, weight: 1.4, dew: 0.01 },
  brute: { frames: "brute", size: 26, hp: 30, speed: 18, damage: 2, xp: 12, weight: 0.2, dew: 0.6 },
} satisfies Record<string, EnemyKind>;

export type EnemyName = keyof typeof ENEMIES;

/** The swarm's mix over a run: from `from` seconds on, each kind spawns in proportion to its weight. */
export const WAVES: readonly { from: number; mix: Partial<Record<EnemyName, number>> }[] = [
  { from: 0, mix: { blob: 1 } },
  { from: 90, mix: { blob: 4, spiker: 1 } },
  { from: 180, mix: { blob: 2, spiker: 2 } },
  { from: 360, mix: { blob: 1, spiker: 3 } },
];

/** Brutes are timed elites: the first at `first` seconds, then every `every`. */
export const ELITES = { first: 120, every: 60 };
