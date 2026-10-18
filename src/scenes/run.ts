import type { Audio } from "@debuffjp/audio";
import type { Draw, Frame, Game, Scene, Storage } from "@debuffjp/core";
import type { Input } from "@debuffjp/input";
import { type Particles, squash, type Tweens } from "@debuffjp/juice";
import { ELITES, ENEMIES, type EnemyName, WAVES } from "../content/enemies";
import { MAX_LEVEL, UPGRADES, type Upgrade, type UpgradeId } from "../content/upgrades";
import { C } from "../palette";
import { boil } from "../systems/boil";
import { Grid } from "../systems/grid";
import type { BoilText } from "../systems/text";

export type Actions = "left" | "right" | "up" | "down" | "confirm";

export interface RunDeps {
  game: Game;
  input: Input<Actions>;
  audio: Audio;
  tweens: Tweens;
  particles: Particles;
  frames: (name: string) => readonly Frame[];
  text: BoilText;
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

export function createRun({ game, input, audio, tweens, particles, frames, text, save }: RunDeps) {
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

  const sheets = Object.fromEntries(
    ["buff", "gem", "shot", "petal", "dew", ...Object.keys(ENEMIES)].map((n) => [n, frames(n)]),
  ) as Record<string, readonly Frame[]>;
  const sprite = (name: string, phase = 0) => sheets[name]![boil(game, phase)]!;
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
    const colors = { blob: C.rose, spiker: C.amber, brute: C.violet }[e.kind];
    particles.emit({ x: e.x, y: e.y, count: e.kind === "brute" ? 24 : 6, colors: [colors], speed: [20, e.kind === "brute" ? 120 : 60], gravity: 0 });
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
    particles.emit({ x: player.x, y: player.y, count: 20, colors: [C.buff, C.shot], speed: [40, 120], gravity: 0 });
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
          const d = Math.sqrt(d2), push = Math.min(min - d, (min - d) * 16 * dt) * ENEMIES[e.kind].weight;
          e.x += (ox / d) * push;
          e.y += (oy / d) * push;
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
        particles.emit({ x: player.x, y: player.y, count: 14, colors: [C.buff], speed: [60, 140], gravity: 0 });
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

  function drawWorld(draw: Draw, alpha: number) {
    // The same interpolated, rounded point the camera centres on, so buff never wobbles against the world.
    const px = player.prevX + (player.x - player.prevX) * alpha, py = player.prevY + (player.y - player.prevY) * alpha;
    // Ground: a sparse field of deep-colour pebbles, so movement reads against the dark.
    const cx = Math.floor(game.camera.x / 32), cy = Math.floor(game.camera.y / 32);
    for (let gy = cy - 4; gy <= cy + 4; gy++)
      for (let gx = cx - 7; gx <= cx + 7; gx++) {
        const h = Math.imul(gx * 374761393 + gy * 668265263, 1274126177) >>> 0;
        if (h % 5 === 0) draw.circle(gx * 32 + (h % 23), gy * 32 + ((h >> 8) % 23), 2 + ((h >> 16) % 3), C.deep);
      }

    if (pulseFx > 0) {
      const t = 1 - pulseFx / 0.3, r = pulseRadius() * (0.4 + 0.6 * t);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + boil(game) * 0.1;
        draw.rect(Math.round(player.x + Math.cos(a) * r) - 1, Math.round(player.y + Math.sin(a) * r) - 1, 3, 3, C.cyan);
      }
    }
    for (const g of gems) {
      const f = sprite(g.dew ? "dew" : "gem", g.x * 0.13);
      draw.sprite(f, Math.round(g.x - f.w / 2), Math.round(g.y - f.h / 2));
    }
    for (const e of enemies) {
      const f = sprite(e.kind, e.id * 0.37);
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
      draw.sprite(f, Math.round(x - f.w / 2), Math.round(y - f.h / 2), e.flash > 0.5 ? { tint: C.text } : undefined);
    }
    for (const s of shots) {
      const x = s.px + (s.x - s.px) * alpha, y = s.py + (s.y - s.py) * alpha;
      draw.sprite(sprite("shot", s.x * 0.1), Math.round(x - 3), Math.round(y - 3));
    }
    const petals = lv("petals");
    for (let i = 0; i < petals; i++) {
      const a = petalAngle + (i / petals) * Math.PI * 2, r = 24 + petals * 3;
      draw.sprite(sprite("petal", i), Math.round(px + Math.cos(a) * r - 5), Math.round(py + Math.sin(a) * r - 5));
    }

    if (phase !== "over" && (player.hurt === 0 || Math.floor(player.hurt * 12) % 2 === 0)) {
      draw.push();
      draw.translate(Math.round(px), Math.round(py) + 11);
      draw.scale(player.scaleX * player.faceX, player.scaleY);
      draw.sprite(sprite("buff"), -11, -22);
      draw.pop();
    }
    particles.draw(draw);
  }

  function drawHud(draw: Draw) {
    if (maxHp() <= 12) for (let i = 0; i < maxHp(); i++) draw.rect(4 + i * 7, 4, 5, 5, i < player.hp ? C.buff : C.slate);
    else {
      draw.rect(4, 4, 5, 5, C.buff);
      text.draw(draw, `${player.hp}/${maxHp()}`, 12, 2, { color: C.text }, 4);
    }
    draw.rect(4, 12, 80, 3, C.deep);
    draw.rect(4, 12, Math.round(80 * (xp / xpToLevel(level))), 3, C.buff);
    text.draw(draw, `LV ${level}`, 88, 10, { color: C.text, baseline: "middle" }, 1);
    const left = Math.max(0, Math.ceil(run.values.length - time));
    text.draw(draw, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, game.width - 4, 4, { color: C.text, align: "right" }, 2);
    text.draw(draw, `${kills}`, game.width - 4, 16, { color: C.dim, align: "right" }, 3);
  }

  function panel(draw: Draw, x: number, y: number, w: number, h: number, border: string = C.slate) {
    draw.rect(x - 2, y - 2, w + 4, h + 4, border);
    draw.rect(x, y, w, h, C.ink);
  }

  function wrap(s: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of s.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && text.font.measure(next).w > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawChoices(draw: Draw) {
    panel(draw, game.width / 2 - 34, 30, 68, 14);
    text.draw(draw, "LEVEL UP!", game.width / 2, 32, { color: C.buff, align: "center" });
    choices.forEach((u, i) => {
      // Cards rise into place while they're locked, so the pause before they take input is visible.
      const rise = Math.round(((lock / 0.4) ** 2) * (40 + i * 12));
      const x = cardX(i), y = CARD.y + rise, next = lv(u.id) + 1;
      panel(draw, x, y, CARD.w, CARD.h, i === cursor && lock === 0 ? C.buff : C.slate);
      text.draw(draw, u.name, x + 6, y + 5, { color: u.kind === "weapon" ? C.buff : C.cyan }, i);
      text.draw(draw, lv(u.id) ? `lv ${next}` : "new!", x + CARD.w - 6, y + 5, { color: C.dim, align: "right" }, i + 1);
      wrap(u.text(next), CARD.w - 12).forEach((line, j) => {
        text.draw(draw, line, x + 6, y + 22 + j * 12, { color: C.text }, i + j);
      });
    });
    if (lock === 0) {
      panel(draw, game.width / 2 - 92, CARD.y + CARD.h + 8, 184, 14);
      text.draw(draw, "click a card, or arrows + space", game.width / 2, CARD.y + CARD.h + 10, { color: C.dim, align: "center" }, 2);
    }
  }

  function drawEnd(draw: Draw) {
    const won = phase === "won";
    panel(draw, game.width / 2 - 70, 58, 140, 64);
    text.draw(draw, won ? "OVERBUFFED!" : "OVERWHELMED", game.width / 2, 66, { color: won ? C.buff : C.rose, align: "center" });
    const s = Math.floor(time);
    text.draw(draw, `${kills} critters - ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, game.width / 2, 84, { color: C.text, align: "center" }, 1);
    text.draw(draw, `level ${level}`, game.width / 2, 96, { color: C.dim, align: "center" }, 3);
    text.draw(draw, "press space", game.width / 2, 108, { color: C.cyan, align: "center" }, 2);
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
