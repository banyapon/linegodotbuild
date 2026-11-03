import { move, result, monsterMove } from './tictactoe-rules.ts';
import type { Mark } from './tictactoe-rules.ts';
import type { GameDesign, GameView } from './types.ts';

export function startTicTacToe(design: GameDesign, host: HTMLElement): GameView {
  const root = document.createElement('section'); root.className = 'ttt-arena';
  root.style.setProperty('--ttt-player', design.palette.player);
  root.style.setProperty('--ttt-enemy', design.palette.enemy);
  root.style.setProperty('--ttt-background', design.palette.background);
  const background = design.assets.find(a => a.role === 'background');
  if (background) { const image = document.createElement('img'); image.className = 'ttt-background'; image.src = background.url; image.alt = ''; root.append(image); }
  const content = document.createElement('div'); content.className = 'ttt-content';
  const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'MONSTER DUEL · TIC TAC TOE';
  const title = document.createElement('h2'); title.textContent = design.title;
  const legend = document.createElement('div'); legend.className = 'ttt-legend';
  const player = document.createElement('span'); player.textContent = '✦ คุณ · X'; const opponent = document.createElement('span'); opponent.textContent = 'มอนสเตอร์ · O'; legend.append(player, opponent);
  const status = document.createElement('p'); status.className = 'ttt-status'; status.setAttribute('aria-live', 'polite');
  const grid = document.createElement('div'); grid.className = 'ttt-grid'; grid.setAttribute('aria-label', 'กระดาน XO 3 คูณ 3');
  const reset = document.createElement('button'); reset.className = 'ttt-reset'; reset.textContent = 'เริ่มรอบใหม่ ↻';
  const note = document.createElement('p'); note.className = 'ttt-note'; note.textContent = 'เรียง 3 ตัวให้ครบในแนวนอน แนวตั้ง หรือแนวทแยง';
  content.append(eyebrow, title, legend, status, grid, reset, note); root.append(content); host.append(root);
  let board: Mark[] = Array(9).fill(null), turn: 'X' | 'O' = 'X', timer: ReturnType<typeof setTimeout> | undefined, alive = true;
  const buttons: HTMLButtonElement[] = [];
  function face(mark: 'X' | 'O') {
    const asset = design.assets.find(a => a.role === (mark === 'X' ? 'player' : 'enemy'));
    if (asset) { const img = document.createElement('img'); img.className = 'ttt-face-image'; img.src = asset.url; img.alt = mark === 'X' ? 'คุณ' : 'มอนสเตอร์'; return img; }
    const monster = document.createElement('span'); monster.className = `ttt-monster ${mark === 'X' ? 'friend' : 'rival'}`;
    monster.setAttribute('aria-hidden', 'true'); monster.innerHTML = '<i class="ttt-horn left"></i><i class="ttt-horn right"></i><i class="ttt-eye left"></i><i class="ttt-eye right"></i><i class="ttt-mouth"></i>';
    return monster;
  }
  function draw() {
    const outcome = result(board);
    status.textContent = outcome === 'X' ? 'คุณชนะ! มอนสเตอร์ขอแก้มือ 👾' : outcome === 'O' ? 'มอนสเตอร์ชนะรอบนี้ ลองใหม่ไหม?' : outcome === 'draw' ? 'เสมอกัน! ดวลอีกสักรอบไหม?' : turn === 'X' ? 'ตาคุณ · เลือกช่องบนกระดาน' : 'มอนสเตอร์กำลังเลือกช่อง…';
    status.dataset.outcome = outcome || 'playing'; root.dataset.turn = turn;
    buttons.forEach((button, index) => {
      button.disabled = Boolean(board[index]) || Boolean(outcome) || turn === 'O'; button.replaceChildren();
      button.setAttribute('aria-label', `ช่อง ${index + 1}${board[index] ? `: ${board[index]}` : ': ว่าง'}`);
      if (board[index]) button.append(face(board[index]!));
      else { const number = document.createElement('span'); number.className = 'ttt-cell-number'; number.textContent = String(index + 1); button.append(number); }
    });
  }
  function select(index: number) {
    if (turn !== 'X' || board[index] || result(board)) return;
    board = move(board, index, 'X'); turn = 'O'; draw();
    if (result(board)) return;
    timer = setTimeout(() => {
      if (!alive) return;
      const index = monsterMove(board); if (index >= 0) board = move(board, index, 'O'); turn = 'X'; draw();
    }, 380);
  }
  for (let index = 0; index < 9; index++) { const button = document.createElement('button'); button.className = 'ttt-cell'; button.addEventListener('click', () => select(index)); buttons.push(button); grid.append(button); }
  reset.addEventListener('click', () => { clearTimeout(timer); board = Array(9).fill(null); turn = 'X'; draw(); });
  draw(); host.dataset.ready = 'true';
  return { destroy() { alive = false; clearTimeout(timer); root.remove(); } };
}
