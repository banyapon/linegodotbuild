export type Mark = 'X' | 'O' | null;
export type Result = 'X' | 'O' | 'draw' | null;
const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
export function result(board: readonly Mark[]): Result {
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}
export function move(board: readonly Mark[], index: number, mark: Exclude<Mark, null>): Mark[] {
  if (!Number.isInteger(index) || index < 0 || index > 8 || board[index] || result(board)) return [...board];
  return board.map((cell, i) => i === index ? mark : cell);
}
export function monsterMove(board: readonly Mark[], random = Math.random): number {
  if (result(board)) return -1;
  const empty = board.map((v,i) => v ? -1 : i).filter(i => i >= 0);
  for (const mark of ['O', 'X'] as const) {
    const winning = empty.find(i => result(move(board, i, mark)) === mark);
    if (winning !== undefined) return winning;
  }
  if (!board[4]) return 4;
  return empty[Math.min(empty.length - 1, Math.floor(Math.max(0, random()) * empty.length))] ?? -1;
}
