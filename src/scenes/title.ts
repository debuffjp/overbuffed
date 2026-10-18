import type { Frame, Game, Scene, Storage } from "@debuffjp/core";
import type { Input } from "@debuffjp/input";
import { C } from "../palette";
import { boil } from "../systems/boil";
import type { BoilText } from "../systems/text";
import type { Actions } from "./run";

export interface TitleDeps {
  game: Game;
  input: Input<Actions>;
  text: BoilText;
  frames: (name: string) => readonly Frame[];
  save: Storage<{ best: number; wins: number }>;
}

/** The title: the name, big and boiling, with buff bobbing and a few critters drifting past. */
export function createTitle({ game, input, text, frames, save }: TitleDeps): Scene {
  const buff = frames("buff");
  const critters = ["blob", "spiker", "blob", "spiker", "blob", "spiker"].map((n) => frames(n));
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
      // Critters parade along the bottom, boiling out of sync.
      critters.forEach((sheet, i) => {
        const f = sheet[boil(game, i * 0.7)]!;
        const x = ((t * 18 + i * 60) % (game.width + 60)) - 30;
        draw.sprite(f, Math.round(x), 174 - f.h);
      });

      // Each letter of the name boils on its own, at 3x.
      const name = "OVERBUFFED";
      const w = text.font.measure(name).w * 3;
      let x = Math.round(game.width / 2 - w / 2);
      for (const [i, ch] of [...name].entries()) {
        draw.push();
        draw.translate(x, 34);
        draw.scale(3);
        text.draw(draw, ch, 0, 0, { color: C.buff }, i * 0.9);
        draw.pop();
        x += (text.font.measure(ch).w + 1) * 3;
      }

      const bob = Math.round(Math.sin(t * 4) * 2);
      draw.sprite(buff[boil(game)]!, game.width / 2 - 11, 78 + bob);
      text.draw(draw, "survive the swarm", game.width / 2, 106, { color: C.text, align: "center" }, 1);
      if (Math.floor(t * 2) % 2 === 0) text.draw(draw, "press space", game.width / 2, 122, { color: C.cyan, align: "center" }, 2);
      const best = save.get("best");
      if (best) {
        const s = `best ${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}${save.get("wins") ? ` - ${save.get("wins")} wins` : ""}`;
        text.draw(draw, s, game.width / 2, 138, { color: C.dim, align: "center" }, 3);
      }
    },
    inspect() {
      return { phase: "title", best: save.get("best") };
    },
  };
}
