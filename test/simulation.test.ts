import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../game/simulation.ts';
import type { GameDesign } from '../game/types.ts';
const design = { game: { coinCount: 8, enemyCount: 3, speed: 200, duration: 75 } } as GameDesign;
test('diagonal and cardinal movements have equal speed', () => { const a = createWorld(design), b = createWorld(design); step(a, { x: 1, y: 0 }, .05, design); step(b, { x: 1, y: -1 }, .05, design); assert(Math.abs(Math.hypot(b.player.x - 480, b.player.y - 540) - (a.player.x - 480)) < .0001); });
test('last coin wins and freezes simulation', () => { const w = createWorld(design); w.coins.forEach(c => c.collected = true); w.coins[0].collected = false; w.score = 7; w.player = { ...w.coins[0] }; step(w, { x: 0, y: 0 }, .02, design); assert.equal(w.outcome, 'won'); const elapsed = w.elapsed; step(w, { x: 1, y: 0 }, .05, design); assert.equal(w.elapsed, elapsed); });
test('hazards grant invulnerability and deadline loses game', () => { const w = createWorld(design), e = w.enemies[0]; w.player = { x: e.home.x + Math.sin(.02 * 1.2) * 65, y: e.home.y + Math.cos(.02 * .8) * 45 }; step(w, { x: 0, y: 0 }, .02, design); assert.equal(w.health, 2); step(w, { x: 0, y: 0 }, .02, design); assert.equal(w.health, 2); w.elapsed = 74.99; step(w, { x: 0, y: 0 }, .02, design); assert.equal(w.outcome, 'lost'); });
