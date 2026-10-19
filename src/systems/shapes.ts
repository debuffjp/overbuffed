import type { Frame } from "@debuffjp/core";
import { C } from "../palette";

/**
 * Every shape in the game, painted in code once at startup into one atlas canvas, then drawn as sprites.
 * A crowd of 400 critters is then 400 quads in a handful of `draw.sprites` calls, instead of thousands of
 * circles and rects. Shapes are painted at `RES` texture pixels per game pixel, so they stay soft and crisp
 * at any screen scale: draw them with `scale: 1 / RES` (see `S`).
 */
export const RES = 8;
/** Base sprite scale: one texture pixel is 1/RES of a game pixel. */
export const S = 1 / RES;

export type ShapeName = "buff" | "blob" | "spiker" | "brute" | "shot" | "petal" | "gem" | "dew";

type Ctx = CanvasRenderingContext2D;

/** A filled rect with round corners, like squish's `roundRect`, in game pixels. */
function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

function circle(g: Ctx, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** Two ink dot eyes, like every squish piece. */
function eyes(g: Ctx, x: number, y: number, apart: number, r: number) {
  g.fillStyle = C.ink;
  circle(g, x - apart, y, r);
  circle(g, x + apart, y, r);
}

/** Each shape: its box in game pixels and a painter that draws it centred on (0, 0). */
const SHAPES: Record<ShapeName, { w: number; h: number; paint: (g: Ctx) => void }> = {
  // buff: a soft lime blob, eyes a little forward (it faces right; flipped when moving left).
  buff: {
    w: 20,
    h: 18,
    paint: (g) => {
      g.fillStyle = C.buff;
      roundRect(g, -9, -8, 18, 16, 7.5);
      eyes(g, 1.5, -1.5, 3, 1.5);
    },
  },
  // blob: round.
  blob: {
    w: 16,
    h: 16,
    paint: (g) => {
      g.fillStyle = C.pink;
      circle(g, 0, 0, 7);
      eyes(g, 0, -0.5, 2.4, 1.2);
    },
  },
  // spiker: a diamond, pointy and quick.
  spiker: {
    w: 16,
    h: 16,
    paint: (g) => {
      g.fillStyle = C.amber;
      g.save();
      g.rotate(Math.PI / 4);
      roundRect(g, -5, -5, 10, 10, 2.5);
      g.restore();
      eyes(g, 0, 0, 2.2, 1.1);
    },
  },
  // brute: a big, heavy pill.
  brute: {
    w: 30,
    h: 26,
    paint: (g) => {
      g.fillStyle = C.lilac;
      roundRect(g, -14, -11, 28, 22, 10);
      eyes(g, 0, -2, 4.5, 2);
    },
  },
  shot: {
    w: 6,
    h: 6,
    paint: (g) => {
      g.fillStyle = C.sky;
      circle(g, 0, 0, 2.5);
    },
  },
  // petals are drawn rotated along their orbit.
  petal: {
    w: 10,
    h: 6,
    paint: (g) => {
      g.fillStyle = C.sky;
      roundRect(g, -4.5, -2.5, 9, 5, 2.5);
    },
  },
  gem: {
    w: 8,
    h: 8,
    paint: (g) => {
      g.fillStyle = C.buff;
      g.rotate(Math.PI / 4);
      roundRect(g, -2.5, -2.5, 5, 5, 1.5);
    },
  },
  // dew: a drop, pointing up.
  dew: {
    w: 10,
    h: 10,
    paint: (g) => {
      g.fillStyle = C.mint;
      g.rotate(-Math.PI / 4 - Math.PI / 2);
      roundRect(g, -3.4, -3.4, 6.8, 6.8, 3.4);
      g.fillRect(-3.4, -3.4, 3.4, 3.4);
    },
  },
};

/** Paints every shape into one canvas and returns a frame for each. Without a 2D canvas (logic tests), frames stay blank. */
export function bakeShapes(): Record<ShapeName, Frame> {
  const names = Object.keys(SHAPES) as ShapeName[];
  const pad = 1; // game pixels around each shape, so smooth filtering never bleeds a neighbour in
  const width = names.reduce((s, n) => s + (SHAPES[n].w + pad * 2) * RES, 0);
  const height = Math.max(...names.map((n) => (SHAPES[n].h + pad * 2) * RES));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  const frames = {} as Record<ShapeName, Frame>;
  let x = 0;
  for (const n of names) {
    const { w, h, paint } = SHAPES[n];
    const fw = (w + pad * 2) * RES, fh = (h + pad * 2) * RES;
    if (g) {
      g.save();
      g.translate(x + fw / 2, fh / 2);
      g.scale(RES, RES);
      paint(g);
      g.restore();
    }
    frames[n] = { image: canvas, x, y: 0, w: fw, h: fh };
    x += fw;
  }
  return frames;
}
