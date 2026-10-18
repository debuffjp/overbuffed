export type UpgradeId = "seeds" | "petals" | "pulse" | "might" | "haste" | "swift" | "magnet" | "heart";

/**
 * Everything a level-up can offer: weapons (new or levelled) and passives, up to `MAX_LEVEL` each.
 * `text(level)` says what taking it does, where `level` is the level you'd reach.
 */
export interface Upgrade {
  id: UpgradeId;
  name: string;
  kind: "weapon" | "passive";
  text: (level: number) => string;
}

export const MAX_LEVEL = 5;

export const UPGRADES: readonly Upgrade[] = [
  { id: "seeds", name: "seed shot", kind: "weapon", text: (l) => (l === 1 ? "fires at the nearest critter" : l % 2 ? "+1 seed per volley" : "fires faster") },
  { id: "petals", name: "petals", kind: "weapon", text: (l) => (l === 1 ? "a petal orbits you" : "+1 petal, wider orbit") },
  { id: "pulse", name: "pulse", kind: "weapon", text: (l) => (l === 1 ? "a ring that shoves critters" : "bigger and more often") },
  { id: "might", name: "might", kind: "passive", text: () => "+25% damage" },
  { id: "haste", name: "haste", kind: "passive", text: () => "weapons recharge 12% faster" },
  { id: "swift", name: "swift", kind: "passive", text: () => "+12% move speed" },
  { id: "magnet", name: "magnet", kind: "passive", text: () => "+50% pickup range" },
  { id: "heart", name: "heart", kind: "passive", text: () => "+1 max health, heal 1" },
];
