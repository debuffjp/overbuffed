import { expect, play, test } from "keiko";

test("clicking a level-up card takes it", async () => {
  const game = await play<{ phase: string; choices: string[]; levels: Record<string, number> }>();
  game.tap("Space").wait(2);
  game.command("levels", 1);
  game.wait("0.6s");
  const third = game.state.choices[2]!;
  game.pointerMove(260, 80).wait(1).pointerDown(260, 80).wait(1).pointerUp().wait(1);
  expect(game.state.phase).toBe("play");
  expect(game.state.levels[third]).toBeAtLeast(1);
});
