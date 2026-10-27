import * as THREE from 'three';

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * Синхронизирует позицию и ориентацию слушателя Web Audio API с камерой Three.js в каждом кадре.
 * Без аллокаций памяти в useFrame (переиспользуются статические векторы).
 */
export function updateListener(ctx: AudioContext, camera: THREE.Camera): void {
  if (!ctx || ctx.state === 'closed') return;
  const listener = ctx.listener;

  // 1. Позиция слушателя
  camera.getWorldPosition(_pos);
  const t = ctx.currentTime;

  if (listener.positionX) {
    listener.positionX.setValueAtTime(_pos.x, t);
    listener.positionY.setValueAtTime(_pos.y, t);
    listener.positionZ.setValueAtTime(_pos.z, t);
  } else {
    // Fallback для старых версий Web Audio
    (listener as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(_pos.x, _pos.y, _pos.z);
  }

  // 2. Ориентация слушателя (forward & up)
  camera.getWorldDirection(_forward);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);

  if (listener.forwardX) {
    listener.forwardX.setValueAtTime(_forward.x, t);
    listener.forwardY.setValueAtTime(_forward.y, t);
    listener.forwardZ.setValueAtTime(_forward.z, t);
    listener.upX.setValueAtTime(_up.x, t);
    listener.upY.setValueAtTime(_up.y, t);
    listener.upZ.setValueAtTime(_up.z, t);
  } else {
    // Fallback
    (listener as unknown as { setOrientation: (x: number, y: number, z: number, ux: number, uy: number, uz: number) => void })
      .setOrientation(_forward.x, _forward.y, _forward.z, _up.x, _up.y, _up.z);
  }
}
