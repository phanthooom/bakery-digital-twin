import * as THREE from 'three';

/** Общие материалы (создаются один раз). */
export const M = {
  steel: new THREE.MeshStandardMaterial({ color: '#c9cdd1', metalness: 0.55, roughness: 0.32 }),
  steelLight: new THREE.MeshStandardMaterial({ color: '#dfe2e5', metalness: 0.35, roughness: 0.4 }),
  steelDark: new THREE.MeshStandardMaterial({ color: '#7b8187', metalness: 0.6, roughness: 0.35 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 0.9, roughness: 0.18 }),
  /** Для открытых форм (дежа, воронка) — видны обе стороны. */
  chromeDouble: new THREE.MeshStandardMaterial({ color: '#dfe3e7', metalness: 0.85, roughness: 0.22, side: THREE.DoubleSide }),
  steelDouble: new THREE.MeshStandardMaterial({ color: '#c3c8cd', metalness: 0.55, roughness: 0.35, side: THREE.DoubleSide }),
  black: new THREE.MeshStandardMaterial({ color: '#25282b', metalness: 0.2, roughness: 0.6 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#2f3134', roughness: 0.9 }),
  belt: new THREE.MeshStandardMaterial({ color: '#2f5fd0', roughness: 0.7 }),
  orange: new THREE.MeshStandardMaterial({ color: '#efa21f', roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: '#d63a32', roughness: 0.45 }),
  dough: new THREE.MeshStandardMaterial({ color: '#e6c48a', roughness: 0.85 }),
  glass: new THREE.MeshStandardMaterial({ color: '#2a3138', metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.85 }),
  wall: new THREE.MeshStandardMaterial({ color: '#e9e7e2', roughness: 0.95 }),
  wallPanel: new THREE.MeshStandardMaterial({ color: '#dcd9d2', roughness: 0.9 }),
  column: new THREE.MeshStandardMaterial({ color: '#cfccc5', roughness: 0.85 }),
  floor: new THREE.MeshStandardMaterial({ color: '#d2d1cc', roughness: 0.82, metalness: 0.02 }),
  floorEdge: new THREE.MeshStandardMaterial({ color: '#b9b7b0', roughness: 0.9 }),
  window: new THREE.MeshStandardMaterial({ color: '#f4f8fb', emissive: '#e8f1fa', emissiveIntensity: 0.55, roughness: 0.2 }),
  frame: new THREE.MeshStandardMaterial({ color: '#8e9296', metalness: 0.5, roughness: 0.4 }),
  pipe: new THREE.MeshStandardMaterial({ color: '#b5b9bd', metalness: 0.7, roughness: 0.3 }),
  wood: new THREE.MeshStandardMaterial({ color: '#c49a63', roughness: 0.9 }),
  sack: new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 1 }),
};
