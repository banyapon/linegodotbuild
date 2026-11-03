import type { GameDesign, GameView } from './types.ts';
export function startNovel(design: GameDesign, host: HTMLElement): GameView {
  const stage = document.createElement('section'); stage.className = 'novel-stage'; stage.setAttribute('aria-label', 'ฉาก Visual Novel');
  const background = document.createElement('img'); background.className = 'novel-background'; background.alt = '';
  const character = document.createElement('img'); character.className = 'novel-character'; character.alt = 'ตัวละคร';
  const panel = document.createElement('div'); panel.className = 'novel-dialogue';
  const speaker = document.createElement('strong'), text = document.createElement('p'), choices = document.createElement('div'); choices.className = 'novel-choices'; text.setAttribute('aria-live', 'polite');
  panel.append(speaker, text, choices); stage.append(background, character, panel); host.append(stage);
  const storage = `line-studio:novel:${location.pathname}`;
  function image(node: HTMLImageElement, id: string, role: string) {
    const asset = design.assets.find(a => a.id === id) || design.assets.find(a => a.role === role);
    node.hidden = !asset; if (asset) node.src = asset.url; else node.removeAttribute('src');
  }
  function show(id: string) {
    const scene = design.scenes.find(s => s.id === id) || design.scenes[0];
    if (!scene) return;
    try { localStorage.setItem(storage, scene.id); } catch { /* Storage may be disabled. */ }
    speaker.textContent = scene.speaker; text.textContent = scene.text; choices.replaceChildren();
    image(background, scene.background, 'background'); image(character, scene.character, 'character');
    if (character.hidden) image(character, scene.character, 'player');
    for (const choice of scene.choices) {
      const button = document.createElement('button'); button.textContent = choice.label; button.addEventListener('click', () => show(choice.next)); choices.append(button);
    }
    if (!scene.choices.length) { const button = document.createElement('button'); button.textContent = 'จบเรื่อง · เริ่มใหม่'; button.addEventListener('click', () => show(design.scenes[0].id)); choices.append(button); }
  }
  let saved = ''; try { saved = localStorage.getItem(storage) || ''; } catch { /* Private mode. */ }
  show(saved); host.dataset.ready = 'true'; return { destroy() { stage.remove(); } };
}
