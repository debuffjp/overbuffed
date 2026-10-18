/** Enemy families as data. `frames` is the asset name of a 3-frame boil sheet. */
export interface EnemyKind {
  frames: string;
  size: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
}

export const ENEMIES = {
  blob: { frames: "blob", size: 12, hp: 3, speed: 28, damage: 1, xp: 1 },
} satisfies Record<string, EnemyKind>;

export type EnemyName = keyof typeof ENEMIES;
