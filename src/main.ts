import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { Game } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, Tweens } from "@debuffjp/juice";
import { C } from "./palette";
import { createRun } from "./scenes/run";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

const game = new Game({ canvas, width: 320, height: 180, pixelArt: true, scale: "integer", background: C.ink });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
    confirm: ["Space", "Enter", "PadA"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();

game.add(createRun({ game, input, audio, tweens, particles, frames: (name) => assets.frames(name) })).go("run");
game.start();

// Dev-only: window.__DEBUFF_DEV__ for scenarios and agents, and the overlay (toggle with `).
if (import.meta.env.DEV) game.use(devTools({ input })).use(devOverlay());
