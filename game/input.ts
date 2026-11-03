import type { Input } from './types.ts';
import { attachJoystick } from '../shared/joystick.js';
export function createInput() {
  const held = new Set<string>();
  let analog: Input = { x: 0, y: 0 };
  const keys: Record<string, string> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const down = (e: KeyboardEvent) => { if (keys[e.key]) { e.preventDefault(); held.add(keys[e.key]); } };
  const up = (e: KeyboardEvent) => { if (keys[e.key]) held.delete(keys[e.key]); };
  const clear = () => { held.clear(); analog = { x: 0, y: 0 }; };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
  const cleanup: (() => void)[] = [];
  const pad = document.querySelector<HTMLElement>('[data-joystick]');
  if (pad) { const stick = attachJoystick(pad, (point: Input) => { analog = point; }); cleanup.push(() => stick.destroy()); }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
    const direction = button.dataset.direction!;
    const press = (event: PointerEvent) => { event.preventDefault(); button.setPointerCapture(event.pointerId); held.add(direction); };
    const release = () => held.delete(direction);
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    cleanup.push(() => { button.removeEventListener('pointerdown', press); button.removeEventListener('pointerup', release); button.removeEventListener('pointercancel', release); button.removeEventListener('lostpointercapture', release); });
  }
  return { read: (): Input => ({ x: Math.max(-1, Math.min(1, analog.x + Number(held.has('right')) - Number(held.has('left')))), y: Math.max(-1, Math.min(1, analog.y + Number(held.has('down')) - Number(held.has('up')))) }), clear,
    destroy() { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); cleanup.forEach(fn => fn()); } };
}
