// debuff's "squish" palette. Soft, flat, rounded shapes on a dark olive ink; no outlines, no pixel art.
// Lime is buff and XP only, so the player always reads first. Each enemy family has its own colour *and*
// its own silhouette, so the swarm stays readable without telling hues apart.
export const C = {
  ink: "#11140d", // background, and the colour of every eye
  panel: "#1b2014", // panels, ground pebbles
  panelAlt: "#20261a",
  highlight: "#2a3320", // selected card, empty HUD pips
  text: "#d3dcc2",
  muted: "#6b7560",
  buff: "#cffb2d", // the player and XP
  sky: "#38bdf8", // buff's weapons: seeds, petals, pulse
  pink: "#f472b6", // blob (round)
  amber: "#fbbf24", // spiker (diamond)
  lilac: "#a78bfa", // brute, the elite (pill)
  mint: "#34d399", // healing dew (drop)
} as const;
