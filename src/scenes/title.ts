import type { Draw, Frame, Game, Scene, Storage } from "@debuffjp/core";
import type { Input } from "@debuffjp/input";
import { ease } from "@debuffjp/juice";
import { C } from "../palette";
import { S, type ShapeName } from "../systems/shapes";
import type { Actions } from "./run";

export interface TitleDeps {
  game: Game;
  input: Input<Actions>;
  shapes: Record<ShapeName, Frame>;
  save: Storage<{ best: number; wins: number }>;
}

/** Text in debuff sans, scaled up, centred on x with its top at y. */
export function bigText(draw: Draw, text: string, x: number, y: number, size: number, color: string) {
  draw.push();
  draw.translate(x, y);
  draw.scale(size);
  draw.text(text, 0, 0, { color, align: "center" });
  draw.pop();
}

/** The title: the name, big and lime, buff in the middle and a few critters bobbing along the bottom. */
export function createTitle({ game, input, shapes, save }: TitleDeps): Scene {
  const critters: ShapeName[] = ["blob", "spiker", "blob", "brute", "spiker", "blob"];
  let t = 0;

  return {
    id: "title",
    enter() {
      t = 0;
      game.camera.follow({ x: game.width / 2, y: game.height / 2 }, true);
    },
    update(dt) {
      t += dt;
      if (input.pressed("confirm") || input.pointer.pressed) game.go("run");
    },
    render(draw) {
      const still = game.reducedMotion;
      // Critters pop in one by one with a springy overshoot, then bob and squish out of step.
      critters.forEach((name, i) => {
        const pop = still ? 1 : ease.outBack(Math.min(1, Math.max(0, (t - i * 0.02) / 0.2)));
        const bob = still ? 0 : Math.sin(t * 3 + i * 1.3);
        const sq = bob * 0.07;
        // Anchored at the feet, so they squash against the ground as they hop.
        draw.sprite(shapes[name], 40 + i * 48, 170 - Math.max(0, bob) * 4, {
          origin: [0.5, 1],
          scaleX: S * pop * (1 + sq),
          scaleY: S * pop * (1 - sq),
          smooth: true,
        });
      });

      bigText(draw, "overbuffed", game.width / 2, 28, 4, C.buff);

      const wob = still ? 0 : Math.sin(t * 4) * 0.06;
      draw.sprite(shapes.buff, game.width / 2, 98, { origin: [0.5, 1], scaleX: S * 1.5 * (1 + wob), scaleY: S * 1.5 * (1 - wob), smooth: true });
      draw.text("survive the swarm", game.width / 2, 106, { color: C.text, align: "center" });
      if (still || Math.floor(t * 2) % 2 === 0) draw.text("press space", game.width / 2, 120, { color: C.buff, align: "center" });
      const best = save.get("best");
      if (best) {
        const s = `best ${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}${save.get("wins") ? ` - ${save.get("wins")} wins` : ""}`;
        draw.text(s, game.width / 2, 134, { color: C.text, align: "center" });
      }
    },
    inspect() {
      return { phase: "title", best: save.get("best") };
    },
  };
}
