import * as THREE from 'three';
import type { EquipmentConfig, FloorPoint, SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';

/** Высота кабельного лотка над полом. */
export const TRAY_Y = 2.9;
/** Лоток по умолчанию (если в конфиге нет power.tray): вдоль задней стены, в 1,25 м от неё. */
const TRAY_FROM_WALL = 1.25;

export interface Route {
  equipmentId: string;
  path: THREE.CurvePath<THREE.Vector3>;
  /** Точка подписи: середина опуска к станку. */
  labelAt: THREE.Vector3;
  length: number;
}

/** Лоток как ломаная по полу. */
export function trayOf(config: SiteConfig): FloorPoint[] {
  const { width: W, depth: D } = config.site.hall;
  const t = config.power?.tray;
  return t && t.length >= 2 ? t : [[-W / 2 + 0.5, -D / 2 + TRAY_FROM_WALL], [W / 2 - 0.5, -D / 2 + TRAY_FROM_WALL]];
}

/** Ближайшая к точке позиция на ломаной: сама точка и расстояние вдоль ломаной от её начала. */
export function projectOnPolyline(line: FloorPoint[], x: number, z: number): { x: number; z: number; along: number } {
  let best = { x: line[0]![0], z: line[0]![1], along: 0, d: Infinity };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    const f = len ? Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len))) : 0;
    const px = ax + (bx - ax) * f;
    const pz = az + (bz - az) * f;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, along: acc + f * len, d };
    acc += len;
  }
  return { x: best.x, z: best.z, along: best.along };
}

/** Участок ломаной между двумя позициями вдоль неё (в любую сторону), включая промежуточные вершины. */
function between(line: FloorPoint[], a: number, b: number): FloorPoint[] {
  const pts: FloorPoint[] = [];
  let acc = 0;
  const at = (s: number): FloorPoint => {
    let run = 0;
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!;
      const [bx, bz] = line[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (s <= run + len || i === line.length - 1) {
        const f = len ? Math.min(1, Math.max(0, (s - run) / len)) : 0;
        return [ax + (bx - ax) * f, az + (bz - az) * f];
      }
      run += len;
    }
    return line[0]!;
  };
  const verts: number[] = [];
  for (let i = 1; i < line.length - 1; i++) {
    acc += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    verts.push(acc);
  }
  pts.push(at(a));
  const inner = verts.filter((v) => v > Math.min(a, b) && v < Math.max(a, b));
  for (const v of a < b ? inner : inner.reverse()) pts.push(at(v));
  pts.push(at(b));
  return pts;
}

/** Середина задней стенки станка (с учётом поворота), отступив margin наружу, — сюда входит кабель. */
export function backOf(eq: EquipmentConfig, margin = 0): { x: number; z: number } {
  const d = (SPECS[eq.kind] ?? SPECS.generic).depth / 2 + margin;
  const r = eq.rotationY ?? 0;
  return { x: eq.position.x - Math.sin(r) * d, z: eq.position.z - Math.cos(r) * d };
}

/**
 * Трасса кабеля: от верха щита вверх к лотку, по лотку до ближайшей к станку точки,
 * дальше под потолком к задней стенке станка и опуск к вводу (или на крышу, если станок стоит под лотком).
 */
export function buildRoutes(config: SiteConfig): Route[] {
  const panel = config.power?.panel;
  if (!panel) return [];
  const tray = trayOf(config);
  const n = config.equipment.length;
  const start = projectOnPolyline(tray, panel.position.x, panel.position.z);
  return config.equipment.map((eq, i) => {
    const spec = SPECS[eq.kind] ?? SPECS.generic;
    const lane = (i - (n - 1) / 2) * 0.03; // кабели лежат в лотке рядом, не друг в друге
    const y = TRAY_Y + 0.03 + (i % 2) * 0.03;
    const back = backOf(eq, 0.06);
    const end = projectOnPolyline(tray, back.x, back.z);
    const pts: THREE.Vector3[] = [new THREE.Vector3(panel.position.x + lane, 1.92, panel.position.z + 0.1), new THREE.Vector3(panel.position.x + lane, y, panel.position.z + 0.1)];
    for (const [x, z] of between(tray, start.along, end.along)) pts.push(new THREE.Vector3(x + lane, y, z + lane));
    let labelAt: THREE.Vector3;
    const underTray = Math.hypot(back.x - end.x, back.z - end.z) < 0.15;
    if (underTray) {
      // станок прямо под лотком — ввод сверху
      const c = new THREE.Vector3(end.x + lane, spec.height + 0.02, end.z + lane);
      pts.push(c);
      labelAt = new THREE.Vector3(c.x, (y + spec.height) / 2, c.z);
    } else {
      pts.push(new THREE.Vector3(back.x + lane, y, back.z), new THREE.Vector3(back.x + lane, 1.0, back.z));
      labelAt = new THREE.Vector3(back.x + lane, (y + 1.0) / 2, back.z);
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let k = 1; k < pts.length; k++) if (pts[k - 1]!.distanceTo(pts[k]!) > 1e-4) path.add(new THREE.LineCurve3(pts[k - 1]!, pts[k]!));
    return { equipmentId: eq.id, path, labelAt, length: path.getLength() };
  });
}
