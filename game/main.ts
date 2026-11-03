import type { GameDesign, GameView } from './types.ts';
import type { World } from './simulation.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const title = element('game-title'), description = element('game-description'), start = element<HTMLButtonElement>('start'), cover = element('cover'), host = element('world');
const result = element('result'), resultTitle = element('result-title'), resultText = element('result-text');
const pauseButton = element<HTMLButtonElement>('pause'), controls = element('controls'), hud = element('hud');
let view: GameView | undefined, paused = false, game: GameDesign, starting = false;
const matches = location.pathname.match(/^\/play\/([a-z0-9]+)\/([a-z0-9_-]+)\/?$/);
async function load() {
  if (!matches) throw new Error('ลิงก์เกมไม่ถูกต้อง');
  const response = await fetch(`/api/games/${matches[1]}/${matches[2]}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'ไม่พบเกมนี้ เกมอาจยังไม่เผยแพร่หรือถูกลบแล้ว' : 'โหลดเกมไม่ได้ กรุณาลองใหม่ภายหลัง');
  game = await response.json();
  document.title = `${game.title} · LINE Game Studio`; title.textContent = game.title; description.textContent = game.description;
  element('genre').textContent = game.genre === 'vn' ? 'VISUAL NOVEL' : game.genre === '3d' ? 'THREE.JS · 3D' : 'PHASER · 2D';
  element('hint').textContent = game.genre === 'vn' ? 'อ่านเรื่องราวและเลือกเส้นทางของคุณ' : 'WASD / ปุ่มลูกศร / ปุ่มบนหน้าจอ · เก็บดาวให้ครบ · หลบศัตรู';
  const bg = game.assets.find(a => a.role === 'background');
  if (bg) { const img = document.createElement('img'); img.src = bg.url; img.alt = ''; img.className = 'cover-art'; cover.prepend(img); }
  start.disabled = false; start.textContent = 'เริ่มเล่น';
}
function update(world: World) {
  host.dataset.playerX = String(Math.round(world.player.x));
  host.dataset.playerY = String(Math.round(world.player.y));
  element('score').textContent = `${world.score} / ${world.coins.length}`;
  element('health').textContent = `♥ ${Math.max(world.health, 0)}`;
  element('timer').textContent = `${Math.max(0, Math.ceil(game.game.duration - world.elapsed))}s`;
  if (world.outcome !== 'playing' && result.hidden) {
    result.hidden = false; resultTitle.textContent = world.outcome === 'won' ? 'เก็บดาวครบแล้ว!' : 'ลองเดินทางอีกครั้ง';
    resultText.textContent = `เก็บได้ ${world.score} จาก ${world.coins.length} ดวง · ใช้เวลา ${Math.floor(world.elapsed)} วินาที`;
  }
}
async function begin() {
  if (starting) return; starting = true; start.disabled = true; start.textContent = 'กำลังเปิดเกม…';
  try {
    view?.destroy(); host.replaceChildren(); delete host.dataset.ready; delete host.dataset.playerX; delete host.dataset.playerY; result.hidden = true; paused = false; pauseButton.textContent = 'พัก';
    controls.hidden = game.genre === 'vn'; hud.hidden = game.genre === 'vn'; pauseButton.hidden = game.genre === 'vn';
    cover.hidden = true;
    if (game.genre === 'vn') view = (await import('./novel.ts')).startNovel(game, host);
    else if (game.genre === '3d') view = (await import('./three-game.ts')).start3D(game, host, update, () => paused);
    else view = (await import('./phaser-game.ts')).start2D(game, host, update, () => paused);
  } catch (e) { cover.hidden = false; description.textContent = e instanceof Error ? e.message : 'เปิดเกมไม่ได้'; }
  finally { start.disabled = false; start.textContent = 'เริ่มเล่น'; starting = false; }
}
start.addEventListener('click', begin); element('restart').addEventListener('click', begin);
function togglePause() { paused = !paused; pauseButton.textContent = paused ? 'เล่นต่อ' : 'พัก'; host.classList.toggle('paused', paused); }
pauseButton.addEventListener('click', togglePause);
window.addEventListener('keydown', event => { if (event.code === 'KeyP' && game?.genre !== 'vn' && cover.hidden && !event.repeat) togglePause(); });
window.addEventListener('blur', () => { if (!paused && game?.genre !== 'vn' && cover.hidden) togglePause(); });
host.addEventListener('game-error', event => { description.textContent = (event as CustomEvent).detail; cover.hidden = false; });
window.addEventListener('pagehide', () => view?.destroy());
load().catch(error => { title.textContent = 'ยังเปิดเกมนี้ไม่ได้'; description.textContent = error.message; start.hidden = true; });
