export function joystickVector(dx, dy, radius, deadZone = 0.12) {
  const length = Math.hypot(dx, dy);
  if (!length || radius <= 0 || length <= radius * deadZone) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (length / radius - deadZone) / (1 - deadZone));
  return { x: dx / length * magnitude, y: dy / length * magnitude };
}
export function attachJoystick(element, change, vector = joystickVector) {
  let pointer = null;
  const knob = element.querySelector('[data-stick-knob]');
  const reset = () => { pointer = null; element.dataset.x = '0'; element.dataset.y = '0'; if (knob) knob.style.transform = 'translate(0px,0px)'; change({ x: 0, y: 0 }); };
  const update = event => {
    const box = element.getBoundingClientRect(), radius = box.width * .34;
    const dx = event.clientX - box.left - box.width / 2, dy = event.clientY - box.top - box.height / 2;
    const point = vector(dx, dy, radius), length = Math.max(1, Math.hypot(dx, dy) / radius);
    element.dataset.x = String(point.x); element.dataset.y = String(point.y);
    if (knob) knob.style.transform = `translate(${dx / length}px,${dy / length}px)`;
    change(point);
  };
  const down = event => { if (pointer !== null) return; event.preventDefault(); pointer = event.pointerId; element.setPointerCapture(pointer); update(event); };
  const move = event => { if (event.pointerId === pointer) { event.preventDefault(); update(event); } };
  const up = event => { if (event.pointerId === pointer) reset(); };
  element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); element.addEventListener('lostpointercapture', reset);
  window.addEventListener('blur', reset);
  return { reset, destroy() { reset(); element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); element.removeEventListener('lostpointercapture', reset); window.removeEventListener('blur', reset); } };
}
