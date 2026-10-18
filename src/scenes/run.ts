import type { Audio } from "@debuffjp/audio";
import type { Frame, Game, Scene } from "@debuffjp/core";
import type { Input } from "@debuffjp/input";
import { type Particles, squash, type Tweens } from "@debuffjp/juice";
import { ENEMIES, type EnemyName } from "../content/enemies";
import { C } from "../palette";
import { boil } from "../systems/boil";
import { Grid } from "../systems/grid";

export interface RunDeps {
  game: Game;
  input: Input<"left" | "right" | "up" | "down" | "confirm">;
  audio: Audio;
  tweens: Tweens;
  particles: Particles;
  frames: (name: string) => readonly Frame[];
}

interface Enemy { id: number; kind: EnemyName; x: number; y: number; hp: number; flash: number; dead: boolean }
interface Shot { x: number; y: number; vx: number; vy: number; life: number }
interface Gem { x: number; y: number; xp: number; taken: boolean }

const PLAYER_R = 6;

export function createRun({ game, input, audio, tweens, particles, frames }: RunDeps): Scene {
  const tune = game.params.define("player", {
    speed: { type: "number", default: 80, min: 0, max: 300, units: "px/s" },
    accel: { type: "number", default: 900, min: 0, max: 5000, units: "px/s²" },
    hp: { type: "number", default: 5, min: 1, max: 50 },
    iframes: { type: "number", default: 0.8, min: 0, max: 3, units: "s", description: "Invulnerable time after a hit" },
    magnet: { type: "number", default: 28, min: 0, max: 200, units: "px", description: "XP gems fly to buff inside this range" },
  });
  const gun = game.params.define("gun", {
    rate: { type: "number", default: 2.5, min: 0.2, max: 30, units: "shots/s" },
    speed: { type: "number", default: 220, min: 50, max: 600, units: "px/s" },
    range: { type: "number", default: 140, min: 20, max: 400, units: "px" },
    damage: { type: "number", default: 1, min: 1, max: 20 },
  });
  const swarm = game.params.define("swarm", {
    rate: { type: "number", default: 1.2, min: 0, max: 60, units: "enemies/s", description: "Spawn rate at the start" },
    ramp: { type: "number", default: 0.08, min: 0, max: 2, units: "enemies/s²", description: "Spawn rate gained per second survived" },
    max: { type: "number", default: 400, min: 1, max: 2000 },
  });

  const sheets = { buff: frames("buff"), gem: frames("gem"), shot: frames("shot"), blob: frames("blob") };
  const grid = new Grid<Enemy>(24);

  const player = { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, hp: 0, hurt: 0, scaleX: 1, scaleY: 1, faceX: 1 };
  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let gems: Gem[] = [];
  let nextId = 0, spawnDebt = 0, reload = 0, time = 0, kills = 0, xp = 0, level = 1, rateBonus = 1, over = false;

  const xpToLevel = (lv: number) => 4 + lv * 3;

  function reset() {
    Object.assign(player, { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, hp: tune.values.hp, hurt: 0 });
    enemies = []; shots = []; gems = [];
    nextId = 0; spawnDebt = 0; reload = 0; time = 0; kills = 0; xp = 0; level = 1; rateBonus = 1; over = false;
    game.camera.follow(player, true);
  }

  function spawn(kind: EnemyName) {
    // Just off screen, in a random direction from buff.
    const a = game.random.range(0, Math.PI * 2);
    const d = Math.hypot(game.width, game.height) / 2 + 12;
    enemies.push({ id: nextId++, kind, x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, hp: ENEMIES[kind].hp, flash: 0, dead: false });
  }

  function nearestEnemy(range: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = range * range;
    grid.near(player.x, player.y, range, (e) => {
      const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  function kill(e: Enemy) {
    e.dead = true;
    kills++;
    gems.push({ x: e.x, y: e.y, xp: ENEMIES[e.kind].xp, taken: false });
    particles.emit({ x: e.x, y: e.y, count: 6, colors: [C.rose], speed: [20, 60], gravity: 0 });
    game.emit("kill");
  }

  reset();

  return {
    id: "run",

    update(dt) {
      if (over) {
        if (input.pressed("confirm")) reset();
        particles.update(dt);
        return;
      }
      time += dt;

      // ---- buff
      player.prevX = player.x; player.prevY = player.y;
      let dx = input.axis("left", "right");
      let dy = input.axis("up", "down");
      if (input.pointer.down) {
        const t = game.camera.toWorld(input.pointer.x, input.pointer.y);
        const len = Math.hypot(t.x - player.x, t.y - player.y);
        if (len > 2) { dx = (t.x - player.x) / len; dy = (t.y - player.y) / len; }
      }
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      const step = tune.values.accel * dt;
      player.vx += Math.max(-step, Math.min(step, dx * tune.values.speed - player.vx));
      player.vy += Math.max(-step, Math.min(step, dy * tune.values.speed - player.vy));
      player.x += player.vx * dt; player.y += player.vy * dt;
      if (dx) player.faceX = Math.sign(dx);
      player.hurt = Math.max(0, player.hurt - dt);

      // ---- swarm
      spawnDebt += (swarm.values.rate + swarm.values.ramp * time) * dt;
      while (spawnDebt >= 1) {
        spawnDebt--;
        if (enemies.length < swarm.values.max) spawn("blob");
      }
      for (const e of enemies) {
        const k = ENEMIES[e.kind];
        const ex = player.x - e.x, ey = player.y - e.y, d = Math.hypot(ex, ey) || 1;
        e.x += (ex / d) * k.speed * dt; e.y += (ey / d) * k.speed * dt;
        e.flash = Math.max(0, e.flash - dt * 6);
      }
      grid.rebuild(enemies);
      // Enemies push each other apart a little, so the swarm reads as a crowd, not a single blob.
      for (const e of enemies)
        grid.near(e.x, e.y, 10, (o) => {
          if (o === e) return;
          const ox = e.x - o.x, oy = e.y - o.y, d2 = ox * ox + oy * oy;
          if (d2 > 0 && d2 < 100) {
            const d = Math.sqrt(d2), push = (10 - d) * 4 * dt;
            e.x += (ox / d) * push; e.y += (oy / d) * push;
          }
        });

      // ---- gun
      reload -= dt;
      if (reload <= 0) {
        const target = nearestEnemy(gun.values.range);
        if (target) {
          reload = 1 / (gun.values.rate * rateBonus);
          const ax = target.x - player.x, ay = target.y - player.y, d = Math.hypot(ax, ay) || 1;
          shots.push({ x: player.x, y: player.y, vx: (ax / d) * gun.values.speed, vy: (ay / d) * gun.values.speed, life: gun.values.range / gun.values.speed });
          audio.synth({ freq: 900, freqEnd: 500, decay: 0.05 });
        }
      }
      for (const s of shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        grid.near(s.x, s.y, 8, (e) => {
          if (e.dead || (e.x - s.x) ** 2 + (e.y - s.y) ** 2 > 36) return;
          e.hp -= gun.values.damage; e.flash = 1; s.life = 0;
          if (e.hp <= 0) kill(e);
          return true;
        });
      }
      shots = shots.filter((s) => s.life > 0);
      enemies = enemies.filter((e) => !e.dead);

      // ---- contact damage
      if (player.hurt === 0)
        grid.near(player.x, player.y, 12, (e) => {
          if (e.dead || (e.x - player.x) ** 2 + (e.y - player.y) ** 2 > (PLAYER_R + 5) ** 2) return;
          player.hp -= ENEMIES[e.kind].damage;
          player.hurt = tune.values.iframes;
          squash(tweens, player, 0.4);
          game.camera.shake(0.35);
          audio.synth({ freq: 200, freqEnd: 60, decay: 0.2 });
          game.emit("hurt");
          if (player.hp <= 0) { over = true; game.emit("death"); }
          return true;
        });

      // ---- XP
      for (const g of gems) {
        const gx = player.x - g.x, gy = player.y - g.y, d = Math.hypot(gx, gy);
        if (d < tune.values.magnet && d > 0) {
          const pull = Math.min(260 * dt, d);
          g.x += (gx / d) * pull; g.y += (gy / d) * pull;
        }
        if (Math.hypot(player.x - g.x, player.y - g.y) < PLAYER_R + 2) {
          g.taken = true; xp += g.xp;
          audio.synth({ freq: 1200, freqEnd: 1600, decay: 0.04 });
          if (xp >= xpToLevel(level)) {
            xp -= xpToLevel(level); level++;
            // Placeholder until the upgrade-choice screen: every level makes the gun 15% faster.
            rateBonus *= 1.15;
            squash(tweens, player, 0.5);
            game.emit("levelup");
          }
        }
      }
      gems = gems.filter((g) => !g.taken);

      game.camera.follow(player);
      tweens.update(dt);
      particles.update(dt);
    },

    render(draw, alpha) {
      draw.withCamera(game.camera, () => {
        // Ground: a sparse field of deep-colour pebbles, so movement reads against the dark.
        const cx = Math.floor(game.camera.x / 32), cy = Math.floor(game.camera.y / 32);
        for (let gy = cy - 4; gy <= cy + 4; gy++)
          for (let gx = cx - 7; gx <= cx + 7; gx++) {
            const h = Math.imul(gx * 374761393 + gy * 668265263, 1274126177) >>> 0;
            if (h % 5 === 0) draw.circle(gx * 32 + (h % 23), gy * 32 + ((h >> 8) % 23), 2 + ((h >> 16) % 3), C.deep);
          }

        for (const g of gems) draw.sprite(sheets.gem[boil(game, g.x)]!, g.x - 3, g.y - 3);
        for (const e of enemies) draw.sprite(sheets[e.kind][boil(game, e.id * 0.37)]!, e.x - 6, e.y - 6, e.flash > 0.5 ? { tint: C.text } : undefined);
        for (const s of shots) draw.sprite(sheets.shot[boil(game, s.x)]!, s.x - 2.5, s.y - 2.5);

        if (!over && (player.hurt === 0 || Math.floor(player.hurt * 12) % 2 === 0)) {
          draw.push();
          draw.translate(player.prevX + (player.x - player.prevX) * alpha, player.prevY + (player.y - player.prevY) * alpha + 8);
          draw.scale(player.scaleX * player.faceX, player.scaleY);
          draw.sprite(sheets.buff[boil(game)]!, -8, -16);
          draw.pop();
        }
        particles.draw(draw);
      });

      // HUD
      for (let i = 0; i < tune.values.hp; i++) draw.rect(4 + i * 7, 4, 5, 5, i < player.hp ? C.buff : C.slate);
      draw.rect(4, 12, 80, 3, C.deep);
      draw.rect(4, 12, Math.round(80 * (xp / xpToLevel(level))), 3, C.buff);
      draw.text(`LV ${level}`, 88, 10, { color: C.text });
      const s = Math.floor(time);
      draw.text(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, game.width - 28, 4, { color: C.text });
      if (over) {
        draw.text("OVERWHELMED", game.width / 2 - 40, 76, { color: C.rose });
        draw.text(`${kills} critters - press space`, game.width / 2 - 70, 92, { color: C.text });
      }
    },

    inspect() {
      return {
        time: Math.round(time * 100) / 100,
        player: { x: Math.round(player.x), y: Math.round(player.y), hp: player.hp },
        enemies: enemies.length,
        shots: shots.length,
        gems: gems.length,
        kills, xp, level, over,
      };
    },
  };
}
