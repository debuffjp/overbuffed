import type { Audio } from "@debuffjp/audio";
import type { Draw, Frame, Game, Scene, SpriteDrawOptions, Storage } from "@debuffjp/core";
import type { Input } from "@debuffjp/input";
import { type Particles, squash, type Tweens } from "@debuffjp/juice";
import { ELITES, ENEMIES, type EnemyName, WAVES } from "../content/enemies";
import { MAX_LEVEL, UPGRADES, type Upgrade, type UpgradeId } from "../content/upgrades";
import { panel } from "@debuffjp/ui";
import { C } from "../palette";
import { Grid } from "../systems/grid";
import { S, type ShapeName } from "../systems/shapes";
import { bigText } from "./title";

export type Actions = "left" | "right" | "up" | "down" | "confirm";

export interface RunDeps {
  game: Game;
  input: Input<Actions>;
  audio: Audio;
  tweens: Tweens;
  particles: Particles;
  shapes: Record<ShapeName, Frame>;
  save: Storage<{ best: number; wins: number }>;
}

interface Enemy {
  id: number;
  kind: EnemyName;
  x: number;
  y: number;
  /** Position a step ago, for drawing between steps. */
  px: number;
  py: number;
  hp: number;
  kx: number;
  ky: number;
  flash: number;
  petalCd: number;
  dead: boolean;
}
interface Shot { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; damage: number }
interface Gem { x: number; y: number; xp: number; dew: boolean; taken: boolean }
type Phase = "play" | "choose" | "over" | "won";

const PLAYER_R = 8;
const ENEMY_COLOUR: Record<EnemyName, string> = { blob: C.pink, spiker: C.amber, brute: C.lilac };
const POP_TIME = 0.16;

export function createRun({ game, input, audio, tweens, particles, shapes, save }: RunDeps) {
  const tune = game.params.define("player", {
    speed: { type: "number", default: 80, min: 0, max: 300, units: "px/s" },
    accel: { type: "number", default: 900, min: 0, max: 5000, units: "px/s²" },
    hp: { type: "number", default: 10, min: 1, max: 50 },
    iframes: { type: "number", default: 0.9, min: 0, max: 3, units: "s", description: "Invulnerable time after a hit" },
    magnet: { type: "number", default: 40, min: 0, max: 200, units: "px", description: "XP gems fly to buff inside this range" },
    pop: { type: "number", default: 36, min: 0, max: 120, units: "px", description: "When hit, buff shoves critters within this range away" },
  });
  const swarm = game.params.define("swarm", {
    rate: { type: "number", default: 0.6, min: 0, max: 60, units: "enemies/s", description: "Spawn rate at the start" },
    ramp: { type: "number", default: 0.012, min: 0, max: 2, units: "enemies/s²", description: "Spawn rate gained per second survived" },
    max: { type: "number", default: 400, min: 1, max: 2000 },
    surge: { type: "number", default: 0.00007, min: 0, max: 0.001, units: "enemies/s³", description: "Spawn rate gained per second², so the back half of a run gets crowded" },
    toughen: { type: "number", default: 0.2, min: 0, max: 2, description: "Extra enemy health per minute, as a fraction" },
  });
  const run = game.params.define("run", {
    length: { type: "number", default: 600, min: 10, max: 1800, units: "s", description: "Survive this long to win" },
    xp: { type: "number", default: 1, min: 0, max: 5, description: "XP multiplier: lower means fewer level-ups" },
  });

  const grid = new Grid<Enemy>(24);

  const player = { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, hp: 0, hurt: 0, scaleX: 1, scaleY: 1, faceX: 1 };
  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let gems: Gem[] = [];
  let levels = {} as Record<UpgradeId, number>;
  let phase: Phase = "play";
  let choices: Upgrade[] = [];
  let cursor = 0;
  /** Seconds before the cards accept input, so mashing keys mid-dodge doesn't pick one by accident. */
  let lock = 0;
  let pending = 0;
  let nextId = 0;
  let spawnDebt = 0;
  let nextElite = 0;
  let reload = 0;
  let pulseCd = 0;
  let pulseFx = 0;
  let petalAngle = 0;
  let time = 0;
  let kills = 0;
  let xp = 0;
  let level = 1;
  /** Critters that just died, squashing flat and popping. Drawing only: gameplay never reads it. */
  let pops: { x: number; y: number; kind: EnemyName; t: number }[] = [];

  const lv = (id: UpgradeId) => levels[id] ?? 0;
  const might = () => 1 + 0.25 * lv("might");
  const haste = () => 0.88 ** lv("haste");
  const maxHp = () => tune.values.hp + lv("heart");
  const xpToLevel = (l: number) => 3 + l * 3 + Math.floor(l * l * 0.25);

  function reset() {
    Object.assign(player, { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, hurt: 0 });
    levels = { seeds: 1 } as Record<UpgradeId, number>;
    player.hp = maxHp();
    enemies = [];
    shots = [];
    gems = [];
    phase = "play";
    choices = [];
    cursor = 0;
    pending = 0;
    nextId = 0;
    spawnDebt = 0;
    nextElite = ELITES.first;
    reload = 0;
    pulseCd = 0;
    pulseFx = 0;
    petalAngle = 0;
    time = 0;
    kills = 0;
    xp = 0;
    level = 1;
    pops = [];
    // Locked to buff, so buff and the world round to the same pixel every frame (no 1px shimmy).
    game.camera.lerp = 0;
    game.camera.deadzone = { x: 0, y: 0 };
    game.camera.follow(player, true);
  }

  // ---- spawning ------------------------------------------------------------------------------

  function spawn(kind: EnemyName) {
    // Just off screen, in a random direction from buff.
    const a = game.random.range(0, Math.PI * 2);
    const d = Math.hypot(game.width, game.height) / 2 + 16;
    const hp = ENEMIES[kind].hp * (1 + (swarm.values.toughen * time) / 60);
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    enemies.push({ id: nextId++, kind, x, y, px: x, py: y, hp, kx: 0, ky: 0, flash: 0, petalCd: 0, dead: false });
  }

  function pickKind(): EnemyName {
    let mix = WAVES[0]!.mix;
    for (const w of WAVES) if (time >= w.from) mix = w.mix;
    const entries = Object.entries(mix) as [EnemyName, number][];
    let r = game.random.next() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [kind, w] of entries) if ((r -= w) < 0) return kind;
    return entries[0]![0];
  }

  // ---- combat --------------------------------------------------------------------------------

  function hit(e: Enemy, damage: number, push = 0, fromX = player.x, fromY = player.y) {
    if (e.dead) return;
    e.hp -= damage;
    if (damage) e.flash = 1;
    if (push) {
      const dx = e.x - fromX, dy = e.y - fromY, d = Math.hypot(dx, dy) || 1;
      const k = push * ENEMIES[e.kind].weight;
      e.kx += (dx / d) * k;
      e.ky += (dy / d) * k;
    }
    if (e.hp <= 0) kill(e);
  }

  function kill(e: Enemy) {
    e.dead = true;
    kills++;
    const kind = ENEMIES[e.kind];
    const colors = ENEMY_COLOUR[e.kind];
    particles.emit({ x: e.x, y: e.y, count: e.kind === "brute" ? 24 : 6, colors: [colors], speed: [20, e.kind === "brute" ? 120 : 60], gravity: 0, shape: "circle" });
    if (pops.length < 200) pops.push({ x: e.x, y: e.y, kind: e.kind, t: 0 });
    if (game.random.next() < kind.dew) gems.push({ x: e.x, y: e.y, xp: 0, dew: true, taken: false });
    // Too many gems on the floor: fold this one into an existing gem instead of adding another.
    if (gems.length > 300) gems[game.random.int(0, gems.length - 1)]!.xp += kind.xp;
    else gems.push({ x: e.x, y: e.y, xp: kind.xp, dew: false, taken: false });
    if (e.kind === "brute") game.camera.shake(0.3);
    game.emit("kill");
  }

  function nearestEnemy(range: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = range * range;
    grid.near(player.x, player.y, range, (e) => {
      const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (!e.dead && d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  function weapons(dt: number) {
    // Seed shot: volleys at the nearest critter. Odd levels add a seed, even levels fire faster.
    const seeds = lv("seeds");
    reload -= dt;
    if (seeds > 0 && reload <= 0) {
      const target = nearestEnemy(170);
      if (target) {
        reload = (haste() / 3.5) * 0.75 ** Math.floor(seeds / 2);
        const count = 1 + Math.floor((seeds - 1) / 2);
        const base = Math.atan2(target.y - player.y, target.x - player.x);
        for (let i = 0; i < count; i++) {
          const a = base + (i - (count - 1) / 2) * 0.2;
          shots.push({ x: player.x, y: player.y, px: player.x, py: player.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, life: 0.75, damage: might() });
        }
        audio.synth({ freq: 900, freqEnd: 500, decay: 0.05 });
      }
    }
    for (const s of shots) {
      s.px = s.x;
      s.py = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      grid.near(s.x, s.y, 12, (e) => {
        const r = ENEMIES[e.kind].size / 2 + 2;
        if (e.dead || (e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r * r) return;
        hit(e, s.damage, 20, s.x - s.vx, s.y - s.vy);
        s.life = 0;
        return true;
      });
    }
    shots = shots.filter((s) => s.life > 0);

    // Petals: orbit buff and chip anything they touch, at most every 0.35s per critter.
    const petals = lv("petals");
    if (petals > 0) {
      petalAngle += dt * 3;
      const radius = 24 + petals * 3;
      for (let i = 0; i < petals; i++) {
        const a = petalAngle + (i / petals) * Math.PI * 2;
        const px = player.x + Math.cos(a) * radius, py = player.y + Math.sin(a) * radius;
        grid.near(px, py, 14, (e) => {
          const r = ENEMIES[e.kind].size / 2 + 4;
          if (e.dead || e.petalCd > 0 || (e.x - px) ** 2 + (e.y - py) ** 2 > r * r) return;
          e.petalCd = 0.35;
          hit(e, 2 * might(), 40);
        });
      }
    }

    // Pulse: a ring that hurts and shoves everything near buff.
    const pulse = lv("pulse");
    pulseCd -= dt;
    pulseFx = Math.max(0, pulseFx - dt);
    if (pulse > 0 && pulseCd <= 0) {
      pulseCd = 3.5 * 0.85 ** (pulse - 1) * haste();
      pulseFx = 0.3;
      const radius = pulseRadius();
      grid.near(player.x, player.y, radius, (e) => {
        if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 <= radius * radius) hit(e, 3 * might(), 100);
      });
      audio.synth({ freq: 180, freqEnd: 90, decay: 0.25 });
      game.emit("pulse");
    }
  }
  const pulseRadius = () => 36 + lv("pulse") * 8;

  // ---- levelling -------------------------------------------------------------------------------

  function offer() {
    const open = UPGRADES.filter((u) => lv(u.id) < MAX_LEVEL);
    choices = [];
    while (choices.length < 3 && open.length) choices.push(open.splice(game.random.int(0, open.length - 1), 1)[0]!);
    cursor = 0;
    lock = 0.4;
    phase = choices.length ? "choose" : "play";
    if (!choices.length) player.hp = Math.min(maxHp(), player.hp + 1);
  }

  function take(u: Upgrade) {
    levels[u.id] = lv(u.id) + 1;
    if (u.id === "heart") player.hp = Math.min(maxHp(), player.hp + 1);
    squash(tweens, player, 0.5);
    particles.emit({ x: player.x, y: player.y, count: 20, colors: [C.buff, C.sky], speed: [40, 120], gravity: 0, shape: "circle" });
    audio.synth({ freq: 500, freqEnd: 1000, decay: 0.15 });
    game.emit("upgrade", { id: u.id, level: levels[u.id] });
    pending--;
    if (pending > 0) offer();
    else phase = "play";
  }

  function gainXp(amount: number) {
    xp += amount;
    if (!amount) return;
    while (xp >= xpToLevel(level)) {
      xp -= xpToLevel(level);
      level++;
      pending++;
      game.emit("levelup");
    }
    if (pending > 0 && phase === "play") offer();
  }

  // Card layout for the level-up screen, shared by input and render.
  const CARD = { w: 96, h: 70, gap: 8, y: 52 };
  const cardX = (i: number) => game.width / 2 - (CARD.w * 3 + CARD.gap * 2) / 2 + i * (CARD.w + CARD.gap);

  const cardAt = (x: number, y: number) =>
    choices.findIndex((_, i) => x >= cardX(i) && x < cardX(i) + CARD.w && y >= CARD.y && y < CARD.y + CARD.h);
  let hoverFrom = { x: Number.NaN, y: Number.NaN };

  function choose(dt: number) {
    lock = Math.max(0, lock - dt);
    if (lock > 0) return;
    if (input.pressed("left")) cursor = (cursor + choices.length - 1) % choices.length;
    if (input.pressed("right")) cursor = (cursor + 1) % choices.length;
    // The mouse highlights what it's over, but only once it moves, so it doesn't fight the keys.
    const { x, y } = input.pointer;
    if (x !== hoverFrom.x || y !== hoverFrom.y) {
      const over = cardAt(x, y);
      if (over >= 0 && !Number.isNaN(hoverFrom.x)) cursor = over;
      hoverFrom = { x, y };
    }
    if (input.pointer.pressed) {
      const i = cardAt(x, y);
      if (i >= 0) {
        cursor = i;
        take(choices[i]!);
        return;
      }
    }
    if (input.pressed("confirm")) take(choices[cursor]!);
  }

  // ---- the run --------------------------------------------------------------------------------

  function step(dt: number) {
    time += dt;

    // buff
    player.prevX = player.x;
    player.prevY = player.y;
    let dx = input.axis("left", "right");
    let dy = input.axis("up", "down");
    if (input.pointer.down) {
      const t = game.camera.toWorld(input.pointer.x, input.pointer.y);
      const len = Math.hypot(t.x - player.x, t.y - player.y);
      if (len > 2) {
        dx = (t.x - player.x) / len;
        dy = (t.y - player.y) / len;
      }
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const speed = tune.values.speed * (1 + 0.12 * lv("swift"));
    const accel = tune.values.accel * dt;
    player.vx += Math.max(-accel, Math.min(accel, dx * speed - player.vx));
    player.vy += Math.max(-accel, Math.min(accel, dy * speed - player.vy));
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (dx) player.faceX = Math.sign(dx);
    player.hurt = Math.max(0, player.hurt - dt);

    // swarm
    spawnDebt += (swarm.values.rate + swarm.values.ramp * time + swarm.values.surge * time * time) * dt;
    while (spawnDebt >= 1) {
      spawnDebt--;
      if (enemies.length < swarm.values.max) spawn(pickKind());
    }
    if (time >= nextElite) {
      // Elites come more often as the run goes on, so a maxed build that stands still still gets tested.
      nextElite += Math.max(20, ELITES.every - time / 12);
      spawn("brute");
    }
    const damp = Math.exp(-8 * dt);
    for (const e of enemies) {
      e.px = e.x;
      e.py = e.y;
      const k = ENEMIES[e.kind];
      const ex = player.x - e.x, ey = player.y - e.y, d = Math.hypot(ex, ey) || 1;
      // Pressed against buff, a critter stops pushing in: the swarm rings buff instead of burying it.
      // They stop just inside touching range, so contact still lands.
      const chase = d > PLAYER_R + k.size / 2 - 3 ? k.speed : 0;
      e.x += ((ex / d) * chase + e.kx) * dt;
      e.y += ((ey / d) * chase + e.ky) * dt;
      e.kx *= damp;
      e.ky *= damp;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.petalCd = Math.max(0, e.petalCd - dt);
    }
    grid.rebuild(enemies);
    // Critters push each other apart, so the swarm reads as a crowd rather than one blob.
    for (const e of enemies)
      grid.near(e.x, e.y, 16, (o) => {
        if (o === e) return;
        const min = (ENEMIES[e.kind].size + ENEMIES[o.kind].size) * 0.45;
        const ox = e.x - o.x, oy = e.y - o.y, d2 = ox * ox + oy * oy;
        if (d2 > 0 && d2 < min * min) {
          // Into the damped knockback velocity, not the position: a packed crowd settles instead of jittering
          // (position nudges made dense swarms shimmer fast enough to fail the photosensitivity check).
          const d = Math.sqrt(d2), push = (min - d) * 30 * dt * ENEMIES[e.kind].weight;
          e.kx += (ox / d) * push;
          e.ky += (oy / d) * push;
        }
      });

    weapons(dt);
    enemies = enemies.filter((e) => !e.dead);

    // contact damage
    if (player.hurt === 0)
      grid.near(player.x, player.y, 16, (e) => {
        const r = PLAYER_R + ENEMIES[e.kind].size / 2 - 1;
        if (e.dead || (e.x - player.x) ** 2 + (e.y - player.y) ** 2 > r * r) return;
        player.hp -= ENEMIES[e.kind].damage;
        player.hurt = tune.values.iframes;
        // buff pops when hit, shoving the crowd back so there's room to escape instead of a death spiral.
        grid.near(player.x, player.y, tune.values.pop, (o) => {
          if ((o.x - player.x) ** 2 + (o.y - player.y) ** 2 <= tune.values.pop ** 2) hit(o, 0, 260);
        });
        particles.emit({ x: player.x, y: player.y, count: 14, colors: [C.buff], speed: [60, 140], gravity: 0, shape: "circle" });
        squash(tweens, player, 0.4);
        game.camera.shake(0.35);
        audio.synth({ freq: 200, freqEnd: 60, decay: 0.2 });
        game.emit("hurt");
        if (player.hp <= 0) {
          phase = "over";
          save.set("best", Math.max(save.get("best"), Math.floor(time)));
          game.emit("death");
        }
        return true;
      });

    // pickups
    const magnet = tune.values.magnet * (1 + 0.5 * lv("magnet"));
    let gained = 0;
    for (const g of gems) {
      const gx = player.x - g.x, gy = player.y - g.y, d = Math.hypot(gx, gy);
      if (d < magnet && d > 0) {
        const pull = Math.min(260 * dt, d);
        g.x += (gx / d) * pull;
        g.y += (gy / d) * pull;
      }
      if (Math.hypot(player.x - g.x, player.y - g.y) < PLAYER_R + 3) {
        g.taken = true;
        if (g.dew) {
          player.hp = Math.min(maxHp(), player.hp + 1);
          audio.synth({ freq: 700, freqEnd: 1400, decay: 0.12 });
          game.emit("heal");
        } else gained += g.xp;
      }
    }
    gems = gems.filter((g) => !g.taken);
    if (gained) {
      audio.synth({ freq: 1200, freqEnd: 1600, decay: 0.04 });
      gainXp(gained * run.values.xp);
    }

    if (time >= run.values.length && phase === "play") {
      phase = "won";
      for (const e of enemies) kill(e);
      enemies = [];
      save.set("best", Math.max(save.get("best"), Math.floor(time)));
      save.set("wins", save.get("wins") + 1);
      game.camera.shake(0.5);
      game.emit("win");
    }
  }

  // ---- drawing ----------------------------------------------------------------------------------
  // Everything is a baked squish shape (src/systems/shapes.ts) drawn as a sprite. Crowds go through
  // `draw.sprites`, one call per shape, so a 400-critter swarm costs a handful of draw calls.

  const SHAPE = { scaleX: S, scaleY: S, smooth: true } as const;
  const batches = {
    blob: new Batch(),
    spiker: new Batch(),
    shot: new Batch(),
    petal: new Batch(),
    gem: new Batch(),
    dew: new Batch(),
  };

  function drawWorld(draw: Draw, alpha: number) {
    const t = game.clock.time, still = game.reducedMotion;
    // The same interpolated point the camera centres on, so buff holds still on screen.
    const px = player.prevX + (player.x - player.prevX) * alpha, py = player.prevY + (player.y - player.prevY) * alpha;
    // Ground: a sparse, calm field of soft pebbles, just enough for movement to read.
    const cx = Math.floor(game.camera.x / 32), cy = Math.floor(game.camera.y / 32);
    for (let gy = cy - 4; gy <= cy + 4; gy++)
      for (let gx = cx - 7; gx <= cx + 7; gx++) {
        const h = Math.imul(gx * 374761393 + gy * 668265263, 1274126177) >>> 0;
        if (h % 5 === 0) draw.circle(gx * 32 + (h % 23), gy * 32 + ((h >> 8) % 23), 2 + ((h >> 16) % 3), C.panel);
      }

    if (pulseFx > 0) {
      // A ring of soft sky dots that swells out and fades.
      const k = 1 - pulseFx / 0.3, r = pulseRadius() * (0.4 + 0.6 * k);
      draw.alpha = 1 - k * 0.7;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        draw.circle(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r, 1.8, C.sky);
      }
      draw.alpha = 1;
    }

    // XP gems and dew bob gently, out of step.
    for (const g of gems) (g.dew ? batches.dew : batches.gem).add(g.x, g.y + (still ? 0 : Math.sin(t * 4 + g.x * 0.13) * 1.2));
    batches.gem.flush(draw, shapes.gem, SHAPE);
    batches.dew.flush(draw, shapes.dew, SHAPE);

    // Critters jiggle (a little tilt and breath each, desynced by id) and swell when hit.
    for (const e of enemies) {
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
      const w = still ? 0 : Math.sin(t * 5 + e.id * 1.7);
      if (e.kind === "brute" || e.flash > 0.5) {
        // Brutes, and anything flashing from a hit, squash and stretch for real (non-uniform scale).
        const f = still ? 0 : e.flash, s = w * 0.05;
        draw.sprite(shapes[e.kind], x, y, {
          scaleX: S * (1 + s + f * 0.3),
          scaleY: S * (1 - s - f * 0.25),
          flash: e.flash > 0.5 ? 0.3 : 0,
          smooth: true,
        });
      } else batches[e.kind].add(x, y, 1 + w * 0.04 + (still ? 0 : e.flash * 0.25), w * 0.12);
    }
    batches.blob.flush(draw, shapes.blob, SHAPE);
    batches.spiker.flush(draw, shapes.spiker, SHAPE);

    // The fallen: squash flat, swell sideways and fade.
    if (!still)
      for (const p of pops) {
        const k = p.t / POP_TIME;
        draw.sprite(shapes[p.kind], p.x, p.y, { scaleX: S * (1 + k * 0.7), scaleY: S * (1 - k * 0.8), alpha: 1 - k, smooth: true });
      }

    for (const s of shots) batches.shot.add(s.px + (s.x - s.px) * alpha, s.py + (s.y - s.py) * alpha);
    batches.shot.flush(draw, shapes.shot, SHAPE);
    const petals = lv("petals");
    for (let i = 0; i < petals; i++) {
      const a = petalAngle + (i / petals) * Math.PI * 2, r = 24 + petals * 3;
      batches.petal.add(px + Math.cos(a) * r, py + Math.sin(a) * r, 1, a + Math.PI / 2);
    }
    batches.petal.flush(draw, shapes.petal, SHAPE);

    if (phase !== "over" && (player.hurt === 0 || Math.floor(player.hurt * 12) % 2 === 0)) {
      // buff squashes from its feet: the squash() tween when hit or levelling up, a gentle wobble when idle.
      const w = still || tweens.has(player, "scaleX") ? 0 : Math.sin(t * 4) * 0.05;
      const sx = still ? 1 : player.scaleX + w, sy = still ? 1 : player.scaleY - w;
      draw.sprite(shapes.buff, px, py + 9, { origin: [0.5, 1], scaleX: S * sx, scaleY: S * sy, flipX: player.faceX < 0, smooth: true });
    }
    particles.draw(draw);
  }

  function drawHud(draw: Draw) {
    if (maxHp() <= 12) for (let i = 0; i < maxHp(); i++) draw.circle(7 + i * 8, 7, 3, i < player.hp ? C.buff : C.highlight);
    else {
      draw.circle(7, 7, 3, C.buff);
      draw.text(`${player.hp}/${maxHp()}`, 13, 7, { color: C.text, baseline: "middle" });
    }
    box(draw, 4, 13, 80, 4, C.panel, 2);
    const fill = Math.round(80 * (xp / xpToLevel(level)));
    if (fill > 0) box(draw, 4, 13, Math.max(4, fill), 4, C.buff, 2);
    draw.text(`lv ${level}`, 88, 15, { color: C.text, baseline: "middle" });
    const left = Math.max(0, Math.ceil(run.values.length - time));
    draw.text(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, game.width - 4, 4, { color: C.text, align: "right" });
    draw.text(`${kills}`, game.width - 4, 15, { color: C.text, align: "right" });
  }

  /** A soft squish panel: @debuffjp/ui's rounded box, no outline. */
  function box(draw: Draw, x: number, y: number, w: number, h: number, fill: string = C.panel, radius = 6) {
    panel(draw, x, y, w, h, [], fill, 0, radius);
  }

  function wrap(draw: Draw, s: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of s.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && draw.measure(next).w > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawChoices(draw: Draw) {
    box(draw, game.width / 2 - 40, 28, 80, 16);
    draw.text("level up!", game.width / 2, 36, { color: C.buff, align: "center", baseline: "middle" });
    choices.forEach((u, i) => {
      // Cards rise into place while they're locked, so the pause before they take input is visible.
      const rise = Math.round(((lock / 0.4) ** 2) * (40 + i * 12));
      const on = i === cursor && lock === 0;
      const x = cardX(i), y = CARD.y + rise - (on ? 2 : 0), next = lv(u.id) + 1;
      box(draw, x, y, CARD.w, CARD.h);
      // The selected card lifts and gets a lime nub, instead of an outline.
      if (on) box(draw, x + CARD.w / 2 - 10, y + CARD.h - 7, 20, 3, C.buff, 1.5);
      draw.text(u.name, x + 7, y + 6, { color: u.kind === "weapon" ? C.buff : C.sky });
      draw.text(lv(u.id) ? `lv ${next}` : "new!", x + CARD.w - 7, y + 6, { color: lv(u.id) ? C.text : C.pink, align: "right" });
      wrap(draw, u.text(next), CARD.w - 14).forEach((line, j) => {
        draw.text(line, x + 7, y + 22 + j * 11, { color: C.text });
      });
    });
    if (lock === 0) {
      box(draw, game.width / 2 - 92, CARD.y + CARD.h + 7, 184, 16);
      draw.text("click a card, or arrows + space", game.width / 2, CARD.y + CARD.h + 15, { color: C.text, align: "center", baseline: "middle" });
    }
  }

  function drawEnd(draw: Draw) {
    const won = phase === "won";
    box(draw, game.width / 2 - 70, 58, 140, 64, C.panel, 10);
    bigText(draw, won ? "overbuffed!" : "overwhelmed", game.width / 2, 64, 2, won ? C.buff : C.pink);
    const s = Math.floor(time);
    draw.text(`${kills} critters - ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, game.width / 2, 84, { color: C.text, align: "center" });
    draw.text(`level ${level}`, game.width / 2, 96, { color: C.text, align: "center" });
    draw.text("press space", game.width / 2, 108, { color: C.buff, align: "center" });
  }

  const scene: Scene = {
    id: "run",
    enter: reset,

    update(dt) {
      if (phase === "play") step(dt);
      else if (phase === "choose") choose(dt);
      else if (input.pressed("confirm")) game.go("title");
      game.camera.follow(player);
      tweens.update(dt);
      particles.update(dt);
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < POP_TIME);
    },

    render(draw, alpha) {
      draw.withCamera(game.camera, () => drawWorld(draw, alpha));
      drawHud(draw);
      if (phase === "choose") drawChoices(draw);
      if (phase === "over" || phase === "won") drawEnd(draw);
    },

    inspect() {
      return {
        phase,
        time: Math.round(time * 100) / 100,
        player: { x: Math.round(player.x), y: Math.round(player.y), hp: player.hp, maxHp: maxHp() },
        enemies: enemies.length,
        brutes: enemies.filter((e) => e.kind === "brute").length,
        shots: shots.length,
        gems: gems.length,
        kills,
        xp,
        level,
        levels: { ...levels },
        choices: choices.map((c) => c.id),
        cursor,
      };
    },
  };

  /** Dev commands for scenarios and agents. */
  const commands = {
    /** Jump the run clock forward, e.g. to see later waves: { "command": "skip", "args": [300] }. */
    skip: (seconds: number) => {
      time += Number(seconds);
      nextElite = Math.max(nextElite, time);
    },
    /** Grant XP for `n` levels' worth of choices. */
    levels: (n: number) => gainXp(Array.from({ length: Number(n) }, (_, i) => xpToLevel(level + i)).reduce((a, b) => a + b, 0) - xp),
    /** Take an upgrade straight away, e.g. "petals". */
    give: (id: UpgradeId) => {
      levels[id] = Math.min(MAX_LEVEL, lv(id) + 1);
    },
  };

  return { scene, commands };
}

/** Positions, scales and tilts for one `draw.sprites` call, reused every frame (no per-frame allocation). */
class Batch {
  pos = new Float32Array(512);
  scale = new Float32Array(256);
  rot = new Float32Array(256);
  n = 0;

  add(x: number, y: number, scale = 1, rotation = 0) {
    if (this.n === this.scale.length) this.grow();
    const i = this.n++;
    this.pos[i * 2] = x;
    this.pos[i * 2 + 1] = y;
    this.scale[i] = scale;
    this.rot[i] = rotation;
  }

  private grow() {
    const pos = new Float32Array(this.pos.length * 2), scale = new Float32Array(this.scale.length * 2), rot = new Float32Array(this.rot.length * 2);
    pos.set(this.pos);
    scale.set(this.scale);
    rot.set(this.rot);
    this.pos = pos;
    this.scale = scale;
    this.rot = rot;
  }

  /** Draws everything added since the last flush, then empties the batch. */
  flush(draw: Draw, frame: Frame, options: SpriteDrawOptions) {
    if (this.n) draw.sprites(frame, this.pos, this.n, options, { scale: this.scale, rotation: this.rot });
    this.n = 0;
  }
}
