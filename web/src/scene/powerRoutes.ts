import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';

/** Высота кабельного лотка над полом и его отступ от задней стены (как в Hall). */
export const TRAY_Y = 2.9;
export const TRAY_FROM_WALL = 1.25;

export interface Route {
  equipmentId: string;
  path: THREE.CurvePath<THREE.Vector3>;
  /** Точка подписи: середина опуска к станку. */
  labelAt: THREE.Vector3;
  length: number;
}

/**
 * Трасса кабеля: от верха щита вверх к лотку, по лотку до станка,
 * опуск за станком и ввод в его заднюю стенку (или на крышу, если станок стоит под лотком).
 */
export function buildRoutes(config: SiteConfig): Route[] {
  const panel = config.power?.panel;
  if (!panel) return [];
  const { depth: D } = config.site.hall;
  const trayZ = -D / 2 + TRAY_FROM_WALL;
  const n = config.equipment.length;
  return config.equipment.map((eq, i) => {
    const spec = SPECS[eq.kind] ?? SPECS.generic;
    const lane = (i - (n - 1) / 2) * 0.03; // кабели лежат в лотке рядом, не друг в друге
    const px = panel.position.x + lane;
    const pz = panel.position.z + 0.1;
    const y = TRAY_Y + 0.03 + (i % 2) * 0.03;
    const z = trayZ + lane;
    const mx = eq.position.x - 0.18;
    const back = eq.position.z - spec.depth / 2;
    const pts: THREE.Vector3[] = [new THREE.Vector3(px, 1.92, pz), new THREE.Vector3(px, y, pz), new THREE.Vector3(px, y, z), new THREE.Vector3(mx, y, z)];
    let labelAt: THREE.Vector3;
    if (back < z + 0.1) {
      // станок глубже лотка — ввод сверху
      pts.push(new THREE.Vector3(mx, spec.height + 0.02, z));
      labelAt = new THREE.Vector3(mx, (y + spec.height) / 2, z);
    } else {
      pts.push(new THREE.Vector3(mx, 1.0, z), new THREE.Vector3(mx, 1.0, back + 0.02));
      labelAt = new THREE.Vector3(mx, (y + 1.0) / 2, z);
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let k = 1; k < pts.length; k++) path.add(new THREE.LineCurve3(pts[k - 1]!, pts[k]!));
    return { equipmentId: eq.id, path, labelAt, length: path.getLength() };
  });
}
