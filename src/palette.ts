// "Night garden", silhouette-first. Every sprite is one flat fill; shapes are separated by
// boiling contour gaps of `ink`, never by outlines, shading or gradients.
// Buff is the only lime thing on screen, so the player always reads first.
// Enemies are warm; rose and amber also differ by silhouette, never by colour alone.
export const C = {
  ink: "#0e0f14", // ground, and the colour of every contour gap
  deep: "#1d2030", // background silhouettes (props, terrain)
  slate: "#3a3f58", // midground silhouettes, UI panels
  buff: "#cffb2d", // player and XP only
  shot: "#f4ffd0", // player projectiles
  rose: "#ff5d73", // enemy family A
  amber: "#ff9f43", // enemy family B
  violet: "#b06cff", // elites and bosses
  cyan: "#5ee6ff", // pickups and UI accent
  text: "#eef0f6",
} as const;
