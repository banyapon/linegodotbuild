export type Genre = '2d' | '3d' | 'vn';
export interface Asset { id: string; url: string; role: 'background' | 'player' | 'character' | 'coin' | 'enemy' }
export interface StoryScene { id: string; speaker: string; text: string; background: string; character: string; choices: { label: string; next: string }[] }
export interface GameDesign {
  id: string; version: number; genre: Genre; title: string; description: string;
  palette: { background: string; player: string; coin: string; enemy: string };
  game: { coinCount: number; enemyCount: number; speed: number; duration: number };
  scenes: StoryScene[]; assets: Asset[];
}
export interface Input { x: number; y: number }
export interface GameView { destroy(): void }
