import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { Game, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, Tweens } from "@debuffjp/juice";
import { C } from "./palette";
import { createRun } from "./scenes/run";
import { createTitle } from "./scenes/title";
import { BoilText } from "./systems/text";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

const game = new Game({ canvas, width: 320, height: 180, pixelArt: true, scale: "integer", background: C.ink });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
    confirm: ["Space", "Enter", "KeyZ", "PadA"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("overbuffed", { best: 0, wins: 0 });

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();
const frames = (name: string) => assets.frames(name);
const text = new BoilText(game, frames("font"));

const run = createRun({ game, input, audio, tweens, particles, frames, text, save });
game.add(createTitle({ game, input, text, frames, save })).add(run.scene).go("title");
game.start();

// Dev-only: window.__DEBUFF_DEV__ for scenarios and agents (commands: skip, levels, give), and the overlay (`).
if (import.meta.env.DEV) game.use(devTools({ input, commands: run.commands })).use(devOverlay());
