import * as THREE from 'three';
import { createWorld, step } from './simulation.ts';
import { createInput } from './input.ts';
import type { GameDesign, GameView } from './types.ts';
import type { World } from './simulation.ts';

export function start3D(design: GameDesign, host: HTMLElement, onUpdate: (world: World) => void, paused: () => boolean): GameView {
  const world = createWorld(design), input = createInput();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setClearColor(design.palette.background); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100); camera.position.set(0, 13.8, 10.4); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xdfffee, 0x1a2235, 2.4));
  const light = new THREE.DirectionalLight(0xffefda, 3); light.position.set(-4, 10, 6); scene.add(light);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ color: design.palette.background, roughness: 0.95 })); plane.rotation.x = -Math.PI / 2; scene.add(plane);
  const grid = new THREE.GridHelper(16, 16, 0x476b5e, 0x29443c); grid.position.y = 0.01; scene.add(grid);
  const loader = new THREE.TextureLoader(); const textures: THREE.Texture[] = []; let alive = true;
  const background = design.assets.find(a => a.role === 'background');
  if (background) loader.load(background.url, texture => { if (!alive) { texture.dispose(); return; } textures.push(texture); texture.colorSpace = THREE.SRGBColorSpace; plane.material.map = texture; plane.material.color.set(0xffffff); plane.material.needsUpdate = true; }, undefined, () => {});
  function object(role: 'player' | 'coin' | 'enemy') {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: design.palette[role], roughness: 0.3, metalness: role === 'coin' ? 0.6 : 0.1 });
    const geometry = role === 'coin' ? new THREE.TorusGeometry(0.15, 0.055, 8, 16) : role === 'enemy' ? new THREE.OctahedronGeometry(0.3) : new THREE.CapsuleGeometry(0.22, 0.2, 4, 12);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = 0.35; group.add(mesh);
    const asset = design.assets.find(a => a.role === role);
    if (asset) loader.load(asset.url, texture => { if (!alive) { texture.dispose(); return; } textures.push(texture); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })); sprite.scale.set(0.9, 0.9, 1); sprite.position.y = 0.5; group.add(sprite); mesh.visible = false;
    }, undefined, () => {});
    scene.add(group); return group;
  }
  const player = object('player'), coins = world.coins.map(() => object('coin')), enemies = world.enemies.map(() => object('enemy'));
  const position = (view: THREE.Object3D, point: { x: number; y: number }) => view.position.set((point.x - 480) / 60, 0, (point.y - 300) / 60);
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(h, 1); const distance = Math.max(1, 1.6 / camera.aspect); camera.position.set(0, 13.8 * distance, 10.4 * distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let previous = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = (now - previous) / 1000; previous = now;
    if (!paused()) step(world, input.read(), dt, design); else input.clear();
    position(player, world.player); player.visible = world.invulnerable <= 0 || Math.sin(world.elapsed * 25) > 0;
    coins.forEach((view, i) => { position(view, world.coins[i]); view.visible = !world.coins[i].collected; view.rotation.y = world.elapsed * 1.5; });
    enemies.forEach((view, i) => { position(view, world.enemies[i]); view.rotation.y = world.elapsed * 0.8; });
    renderer.render(scene, camera); onUpdate(world);
  });
  host.dataset.ready = 'true';
  renderer.domElement.addEventListener('webglcontextlost', () => { renderer.setAnimationLoop(null); host.dataset.contextLost = 'true'; host.dispatchEvent(new CustomEvent('game-error', { detail: 'การแสดงผล 3D หยุดทำงาน กรุณาโหลดหน้าใหม่' })); });
  return { destroy() { alive = false; renderer.setAnimationLoop(null); observer.disconnect(); input.destroy(); scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) { if (o instanceof THREE.Mesh) o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose()); } }); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove(); } };
}
