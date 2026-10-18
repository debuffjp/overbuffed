import { describe, expect, type Playtest, play, test } from "keiko";

/** What the run scene's inspect() returns (src/scenes/run.ts). */
interface State {
  phase: "title" | "play" | "choose" | "over" | "won";
  time: number;
  player: { x: number; y: number; hp: number; maxHp: number };
  enemies: number;
  brutes: number;
  shots: number;
  gems: number;
  kills: number;
  xp: number;
  level: number;
  levels: Record<string, number>;
  choices: string[];
  cursor: number;
}

/** From the title into a fresh run. */
async function start() {
  const game = await play<State>();
  game.tap("Space").wait(2);
  return game;
}

/** Play on, taking the highlighted card whenever a level-up asks, until `done` or `limit` seconds pass. */
function playUntil(game: Playtest<State>, done: (s: State) => boolean, limit: number) {
  for (let s = 0; s < limit && !done(game.state); s++) {
    if (game.state.phase === "choose") game.wait("0.5s").tap("Space").wait(2);
    else game.wait("1s");
  }
}

describe("title", () => {
  test("space starts a run", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("title");
    game.tap("Space").wait(2);
    expect(game.scene).toBe("run");
    expect(game.state.phase).toBe("play");
    expect(game.state.player).toEqual({ x: 0, y: 0, hp: 5, maxHp: 5 });
    expect(game.state.levels).toEqual({ seeds: 1 });
  });
});

describe("buff", () => {
  test("moves in eight directions", async () => {
    const game = await start();
    game.press("ArrowRight").press("ArrowDown").wait("1s");
    expect(game.state.player.x).toBeAbove(40);
    expect(game.state.player.y).toBeAbove(40);
  });
});

describe("swarm", () => {
  test("the seed shot kills critters on its own", async () => {
    const game = await start();
    game.until((s) => s.kills >= 3, { within: "20s" });
    expect(game.state.gems + game.state.xp).toBeAbove(0);
  });

  test("a brute arrives as an elite", async () => {
    const game = await start();
    game.command("skip", 89);
    game.until((s) => s.brutes >= 1, { within: "3s" });
  });

  test("standing still eventually gets buff overwhelmed", async () => {
    const game = await start();
    playUntil(game, (s) => s.phase === "over", 300);
    expect(game.state.phase).toBe("over");
    expect(game.state.player.hp).toBeAtMost(0);
  });

  test("space after a death goes back to the title", async () => {
    const game = await start();
    game.set("player.hp", 1);
    playUntil(game, (s) => s.phase === "over", 300);
    game.tap("Space").wait(2);
    expect(game.scene).toBe("title");
  });
});

describe("levelling", () => {
  test("a level-up pauses the run and offers three different upgrades", async () => {
    const game = await start();
    game.command("levels", 1);
    game.wait(1);
    expect(game.state.phase).toBe("choose");
    expect(new Set(game.state.choices).size).toBe(3);
    const time = game.state.time;
    game.wait("1s");
    expect(game.state.time).toBe(time);
  });

  test("taking a card applies it and resumes", async () => {
    const game = await start();
    game.command("levels", 1);
    game.wait(1);
    const picked = game.state.choices[1]!;
    game.wait("0.5s").tap("ArrowRight").wait(1).tap("Space").wait(1);
    expect(game.state.phase).toBe("play");
    expect(game.state.levels[picked]).toBe(picked === "seeds" ? 2 : 1);
  });

  test("cards ignore input for a moment, then Z takes one too", async () => {
    const game = await start();
    game.command("levels", 1);
    game.wait(1).tap("KeyZ").wait(1);
    expect(game.state.phase).toBe("choose");
    game.wait("0.5s").tap("ArrowRight").wait(1);
    expect(game.state.cursor).toBe(1);
    game.tap("KeyZ").wait(1);
    expect(game.state.phase).toBe("play");
  });

  test("several levels at once queue one choice each", async () => {
    const game = await start();
    game.command("levels", 3);
    game.wait(1);
    for (let i = 0; i < 3; i++) {
      expect(game.state.phase).toBe("choose");
      game.wait("0.5s").tap("Space").wait(2);
    }
    expect(game.state.phase).toBe("play");
  });

  test("petals and pulse kill critters too", async () => {
    const game = await start();
    for (const id of ["petals", "petals", "pulse"]) game.command("give", id);
    game.until((s) => s.kills >= 5, { within: "40s" });
  });
});

describe("winning", () => {
  test.sweep("surviving the timer wins", { "run.length": [20] }, (game) => {
    game.set("player.hp", 50);
    game.tap("Space").wait(2);
    playUntil(game, (s) => s.phase === "won", 60);
    expect(game.state.phase).toBe("won");
    expect(game.state.enemies).toBe(0);
  });
});

test.deterministic("a minute of circling is reproducible", (game) => {
  game.tap("Space").wait(2);
  game.hold("ArrowRight", "5s").hold("ArrowDown", "5s").hold("ArrowLeft", "5s").hold("ArrowUp", "5s").wait("40s");
});
