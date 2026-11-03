import type { GameDesign, Input } from './types.ts';
export const WIDTH = 960, HEIGHT = 600;
export interface Point { x: number; y: number }
export interface World {
  width: number; height: number;
  player: Point; coins: (Point & { collected: boolean })[];
  enemies: (Point & { home: Point; phase: number })[];
  health: number; score: number; elapsed: number; invulnerable: number;
  outcome: 'playing' | 'won' | 'lost';
}
export function createWorld(design: GameDesign, portrait = false): World {
  const width = portrait ? 540 : WIDTH, height = portrait ? 960 : HEIGHT;
  const columns = portrait ? 4 : 8, rows = Math.ceil(design.game.coinCount / columns);
  const coins = Array.from({ length: design.game.coinCount }, (_, i) => ({ x: 65 + (i % columns) * ((width - 130) / (columns - 1)), y: 85 + Math.floor(i / columns) * Math.min(130, (height - 190) / Math.max(1, rows - 1)), collected: false }));
  const enemies = Array.from({ length: design.game.enemyCount }, (_, i) => {
    const cols = portrait ? 3 : 6;
    const home = { x: 100 + (i % cols) * ((width - 200) / (cols - 1)), y: 180 + Math.floor(i / cols) * ((height - 320) / (portrait ? 3 : 1)) };
    return { ...home, home, phase: i * 1.7 };
  });
  return { width, height, player: { x: width / 2, y: height - 60 }, coins, enemies, health: 3, score: 0, elapsed: 0, invulnerable: 0, outcome: 'playing' };
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function step(world: World, input: Input, seconds: number, design: GameDesign): void {
  if (world.outcome !== 'playing') return;
  const dt = Math.max(0, Math.min(seconds, 0.05));
  world.elapsed += dt; world.invulnerable = Math.max(0, world.invulnerable - dt);
  const length = Math.max(1, Math.hypot(input.x, input.y));
  world.player.x = Math.max(25, Math.min(world.width - 25, world.player.x + input.x / length * design.game.speed * dt));
  world.player.y = Math.max(25, Math.min(world.height - 25, world.player.y + input.y / length * design.game.speed * dt));
  for (const coin of world.coins) if (!coin.collected && distance(world.player, coin) < 30) { coin.collected = true; world.score++; }
  for (const enemy of world.enemies) {
    enemy.x = enemy.home.x + Math.sin(world.elapsed * 1.2 + enemy.phase) * 65;
    enemy.y = enemy.home.y + Math.cos(world.elapsed * 0.8 + enemy.phase) * 45;
    if (world.invulnerable <= 0 && distance(world.player, enemy) < 33) { world.health--; world.invulnerable = 1.4; }
  }
  if (world.health <= 0 || world.elapsed >= design.game.duration) world.outcome = 'lost';
  else if (world.score === world.coins.length) world.outcome = 'won';
}
