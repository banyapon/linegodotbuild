import type { Input } from './types.ts';
export function createInput() {
  const held = new Set<string>();
  const keys: Record<string, string> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const down = (e: KeyboardEvent) => { if (keys[e.key]) { e.preventDefault(); held.add(keys[e.key]); } };
  const up = (e: KeyboardEvent) => { if (keys[e.key]) held.delete(keys[e.key]); };
  const clear = () => held.clear();
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
  const cleanup: (() => void)[] = [];
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
    const direction = button.dataset.direction!;
    const press = (event: PointerEvent) => { event.preventDefault(); button.setPointerCapture(event.pointerId); held.add(direction); };
    const release = () => held.delete(direction);
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    cleanup.push(() => { button.removeEventListener('pointerdown', press); button.removeEventListener('pointerup', release); button.removeEventListener('pointercancel', release); button.removeEventListener('lostpointercapture', release); });
  }
  return { read: (): Input => ({ x: Number(held.has('right')) - Number(held.has('left')), y: Number(held.has('down')) - Number(held.has('up')) }), clear,
    destroy() { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); cleanup.forEach(fn => fn()); } };
}
