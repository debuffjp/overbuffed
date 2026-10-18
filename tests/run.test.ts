import { describe, expect, play, test } from "keiko";

/** What the run scene's inspect() returns (src/scenes/run.ts). */
interface State {
  time: number;
  player: { x: number; y: number; hp: number };
  enemies: number;
  shots: number;
  gems: number;
  kills: number;
  xp: number;
  level: number;
  over: boolean;
}

describe("buff", () => {
  test("starts at the origin with full health", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("run");
    expect(game.state.player).toEqual({ x: 0, y: 0, hp: 5 });
  });

  test("moves in eight directions", async () => {
    const game = await play<State>();
    game.press("ArrowRight").press("ArrowDown").wait("1s");
    expect(game.state.player.x).toBeAbove(40);
    expect(game.state.player.y).toBeAbove(40);
  });
});

describe("swarm", () => {
  test("enemies arrive and the gun kills them on its own", async () => {
    const game = await play<State>();
    game.until((s) => s.kills >= 3, { within: "20s" });
    expect(game.state.gems + game.state.xp).toBeAbove(0);
  });

  test("standing still eventually gets buff overwhelmed", async () => {
    const game = await play<State>();
    game.until((s) => s.over, { within: "180s" });
    expect(game.state.player.hp).toBeAtMost(0);
  });

  test("space after a death starts a fresh run", async () => {
    const game = await play<State>();
    game.until((s) => s.over, { within: "180s" });
    game.tap("Space").wait(2);
    expect(game.state.over).toBe(false);
    expect(game.state.time).toBeAtMost(0.1);
  });
});

test.deterministic("a minute of circling is reproducible", (game) => {
  game.hold("ArrowRight", "5s").hold("ArrowDown", "5s").hold("ArrowLeft", "5s").hold("ArrowUp", "5s").wait("40s");
});
