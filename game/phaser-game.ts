import Phaser from 'phaser';
import { createWorld, step } from './simulation.ts';
import { createInput } from './input.ts';
import type { GameDesign, GameView } from './types.ts';
import type { World } from './simulation.ts';

export function start2D(design: GameDesign, host: HTMLElement, onUpdate: (world: World) => void, paused: () => boolean): GameView {
  const world = createWorld(design, host.clientWidth < host.clientHeight); const input = createInput();
  const WIDTH = world.width, HEIGHT = world.height;
  const numeric = (color: string) => parseInt(color.slice(1), 16);
  class Arena extends Phaser.Scene {
    private player!: Phaser.GameObjects.Image;
    private coins: Phaser.GameObjects.Image[] = [];
    private enemies: Phaser.GameObjects.Image[] = [];
    preload() { for (const asset of design.assets) this.load.image(asset.id, asset.url); }
    create() {
      this.cameras.main.setBackgroundColor(design.palette.background);
      const background = design.assets.find(a => a.role === 'background');
      if (background && this.textures.exists(background.id)) this.add.image(WIDTH / 2, HEIGHT / 2, background.id).setDisplaySize(WIDTH, HEIGHT).setAlpha(0.55);
      const floor = this.add.graphics();
      floor.lineStyle(1, 0x9ce7bc, 0.07);
      for (let x = 0; x < WIDTH; x += 60) floor.lineBetween(x, 0, x, HEIGHT);
      for (let y = 0; y < HEIGHT; y += 60) floor.lineBetween(0, y, WIDTH, y);
      floor.lineStyle(3, 0x9ce7bc, 0.3).strokeRoundedRect(12, 12, WIDTH - 24, HEIGHT - 24, 22);
      const graphics = this.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(numeric(design.palette.player)).fillRoundedRect(5, 5, 34, 34, 12);
      graphics.fillStyle(0x17342c).fillCircle(16, 20, 3).fillCircle(29, 20, 3); graphics.generateTexture('player', 44, 44); graphics.clear();
      graphics.fillStyle(numeric(design.palette.coin)).fillCircle(16, 16, 12); graphics.lineStyle(2, 0xfff3d1).strokeCircle(16, 16, 8); graphics.generateTexture('coin', 32, 32); graphics.clear();
      graphics.fillStyle(numeric(design.palette.enemy)).fillRoundedRect(3, 3, 34, 34, 9); graphics.fillStyle(0x3b1b35).fillTriangle(9, 13, 17, 16, 10, 20).fillTriangle(30, 13, 23, 16, 29, 20); graphics.generateTexture('enemy', 40, 40); graphics.destroy();
      const texture = (role: string) => { const a = design.assets.find(x => x.role === role); return a && this.textures.exists(a.id) ? a.id : role; };
      this.coins = world.coins.map(p => this.add.image(p.x, p.y, texture('coin')).setDisplaySize(28, 28));
      this.enemies = world.enemies.map(p => this.add.image(p.x, p.y, texture('enemy')).setDisplaySize(38, 38));
      this.add.ellipse(480, 552, 38, 13, 0x000000, 0.2).setName('shadow');
      this.player = this.add.image(world.player.x, world.player.y, texture('player')).setDisplaySize(44, 44);
      host.dataset.ready = 'true'; onUpdate(world);
    }
    update(_time: number, delta: number) {
      if (!this.player || paused()) { input.clear(); return; }
      step(world, input.read(), delta / 1000, design);
      this.player.setPosition(world.player.x, world.player.y).setAlpha(world.invulnerable > 0 ? 0.45 + Math.sin(world.invulnerable * 30) * 0.25 : 1);
      const shadow = this.children.getByName('shadow') as Phaser.GameObjects.Ellipse; shadow.setPosition(world.player.x, world.player.y + 16);
      this.coins.forEach((view, i) => { view.setVisible(!world.coins[i].collected); view.setAngle(Math.sin(world.elapsed * 3 + i) * 10); });
      this.enemies.forEach((view, i) => view.setPosition(world.enemies[i].x, world.enemies[i].y)); onUpdate(world);
    }
  }
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: WIDTH, height: HEIGHT, backgroundColor: design.palette.background, scene: Arena,
    render: { antialias: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true } });
  return { destroy() { input.destroy(); game.destroy(true); } };
}
