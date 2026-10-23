import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Склейка неподвижных мешей внутри root: меши с одним материалом (и одинаковыми тенями и атрибутами)
 * сливаются в один — вместо сотен вызовов отрисовки на кадр остаются единицы.
 * Исходные меши скрываются (visible = false), склеенные добавляются в root; restore() возвращает как было.
 * Не трогаем то, что живёт своей жизнью: инстансы, скиннинг, морфы, линии drei (LineMaterial), текст troika.
 */
export interface MergeResult {
  merged: THREE.Mesh[];
  restore: () => void;
}

const isAnimated = (o: THREE.Object3D): boolean => {
  let curr: THREE.Object3D | null = o;
  while (curr) {
    if (curr.userData?.animated || (curr.name && curr.name.startsWith('anim_'))) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
};

const mergeable = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(m.material) || m.material.type === 'LineMaterial' || m.material.type === 'ShaderMaterial') return false;
  if (isAnimated(m)) return false;
  const g = m.geometry as THREE.BufferGeometry & { isInstancedBufferGeometry?: boolean };
  return !g.isInstancedBufferGeometry && !Object.keys(g.morphAttributes).length && !!g.attributes.position;
};


/** Копия геометрии с float-атрибутами (квантованные GLB-атрибуты нельзя трансформировать без переполнения). */
function toFloat(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  g.morphAttributes = {};
  return g;
}

export function mergeStatic(root: THREE.Object3D): MergeResult {
  root.updateWorldMatrix(true, true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!o.visible || !mergeable(o)) return;
    const g = o.geometry;
    const attrs = Object.keys(g.attributes).sort().map((n) => `${n}:${g.getAttribute(n).itemSize}`).join(',');
    const key = `${(o.material as THREE.Material).uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${attrs}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  });

  const merged: THREE.Mesh[] = [];
  const hidden: THREE.Mesh[] = [];
  const rel = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const indexed = list.every((m) => m.geometry.index);
    const parts = list.map((m) => {
      let g = toFloat(m.geometry);
      if (!indexed && g.index) g = g.toNonIndexed();
      g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
      // отражённые (отрицательный масштаб) — разворачиваем треугольники, чтобы не вывернуть грани
      if (rel.determinant() < 0) flipWinding(g);
      return g;
    });
    const geo = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!geo) continue;
    const first = list[0]!;
    const mesh = new THREE.Mesh(geo, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.name = 'merged';
    root.add(mesh);
    merged.push(mesh);
    for (const m of list) {
      m.visible = false;
      hidden.push(m);
    }
  }

  return {
    merged,
    restore: () => {
      for (const m of merged) {
        root.remove(m);
        m.geometry.dispose();
      }
      for (const m of hidden) m.visible = true;
    },
  };
}

function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2]!, a[i + 1]!];
    g.index.needsUpdate = true;
    return;
  }
  for (const name of Object.keys(g.attributes)) {
    const at = g.getAttribute(name) as THREE.BufferAttribute;
    const s = at.itemSize;
    const arr = at.array;
    for (let i = 0; i < at.count; i += 3)
      for (let k = 0; k < s; k++) [arr[(i + 1) * s + k], arr[(i + 2) * s + k]] = [arr[(i + 2) * s + k]!, arr[(i + 1) * s + k]!];
    at.needsUpdate = true;
  }
}
