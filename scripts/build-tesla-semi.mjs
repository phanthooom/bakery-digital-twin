// Tesla Semi (Sketchfab, iZnoGouD, CC BY 4.0) → два GLB для сцены:
//   tesla-semi.glb     — тягач с полуприцепом поставщика, реальный масштаб;
//   tesla-semi-van.glb — кабина Semi с колёсами для фургона (кузов-будку рисует Truck.tsx).
// Оба: один меш, вершинные цвета вместо текстуры-палитры, метры, кабина к +z, зад в z = 0, meshopt-сжатие.
// Исходник: https://sketchfab.com/3d-models/tesla-semi-truck-0a7e0ae8315f4fa1b4444b34a947f746 → Download → glTF.
// Зависимости не входят в проект, ставятся разово:
//   npm i --no-save @gltf-transform/cli@4
//   node scripts/build-tesla-semi.mjs <scene.gltf> <textures/01_-_Default_baseColor.png> web/public/models
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, compactPrimitive, join, weld, dedup, prune, quantize, reorder, transformMesh, transformPrimitive, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, png, outDir] = process.argv.slice(2);
const TRAILER_WIDTH = 2.55; // м, ширина полуприцепа (ЕС)
// Фургон — те же размеры, что в web/src/scene/Truck.tsx
const VAN = {
  bodyTop: 0.98 + 2.1, // BODY_Y0 + BODY_H: крыша кабины вровень с будкой (+ обтекатель)
  cabZ0: 3.5 + 0.06, // CAB_Z0: кабина сразу за будкой
  rearAxleZ: 1.1, // SEMI_REAR_AXLE_Z: задняя ось под будкой
};

const { data: px, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
// перекраска ячеек палитры под сцену (sRGB); остальные — как в текстуре
const RECOLOR = {
  '3,5': '#eef0f1', // кабина — белая краска
  '2,5': '#e4e6e6', // борта прицепа
  '1,5': '#34383c', // стёкла, рама, обвес
  '5,5': '#c9cdd1', // хром/серебро
  '7,0': '#1d1f21', // шины
};
const hex = (h) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16)));
const cellColor = (u, v) => {
  const x = Math.floor(((u % 1) + 1) % 1 * 8), y = Math.floor(((v % 1) + 1) % 1 * 8);
  if (RECOLOR[`${x},${y}`]) return hex(RECOLOR[`${x},${y}`]);
  const cx = Math.floor((x + 0.5) * info.width / 8), cy = Math.floor((y + 0.5) * info.height / 8);
  const o = (cy * info.width + cx) * info.channels;
  return [toLin(px[o]), toLin(px[o + 1]), toLin(px[o + 2])];
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** column-major: масштаб s, затем сдвиг s·tr (tr — в единицах исходника) */
const scaleShift = (s, tr) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, s * tr[0], s * tr[1], s * tr[2], 1];

const each = (prim, fn) => {
  const pos = prim.getAttribute('POSITION');
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) fn(pos.getElement(i, v));
};

/**
 * Читает исходник: мировые трансформы — в вершины, текстура — в цвета вершин.
 * Возвращает документ и примитивы по именам узлов (truck03, wheel011, …, container-close001).
 */
async function load() {
  const doc = await io.read(src);
  const root = doc.getRoot();
  await doc.transform(flatten());
  const parts = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    clearNodeTransform(node);
    const p = mesh.listPrimitives()[0];
    const uv = p.getAttribute('TEXCOORD_0');
    const col = new Float32Array(uv.getCount() * 3);
    const a = [0, 0];
    for (let i = 0; i < uv.getCount(); i++) col.set(cellColor(...uv.getElement(i, a)), i * 3);
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(uv.getBuffer()));
    p.setAttribute('TEXCOORD_0', null);
    p.setAttribute('TEXCOORD_1', null);
    parts[node.getName().split('_')[0]] = p;
    node.setMesh(null);
  }
  root.listMaterials()[0].setBaseColorTexture(null).setDoubleSided(false).setName('semi').setMetallicFactor(0).setRoughnessFactor(0.6);
  return { doc, parts };
}

/** Собирает выбранные примитивы в один меш единственного узла сцены, сжимает и пишет файл. */
async function write(doc, name, prims, transform) {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const merged = doc.createMesh(name);
  for (const p of prims) merged.addPrimitive(p);
  for (const n of scene.listChildren()) scene.removeChild(n);
  scene.addChild(doc.createNode(name).setMesh(merged));
  await doc.transform(prune(), join({ keepNamed: false }));
  transform?.(merged, scene);
  const b = getBounds(scene);
  console.log(name, 'size', b.max.map((x, i) => +(x - b.min[i]).toFixed(2)), 'min', b.min.map((x) => +x.toFixed(2)));
  await doc.transform(weld(), dedup(), prune(), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  root.getAsset().extras = { credit: 'Tesla semi truck by iZnoGouD (https://sketchfab.com/3d-models/tesla-semi-truck-0a7e0ae8315f4fa1b4444b34a947f746), CC BY 4.0' };
  await io.write(path.join(outDir, `${name}.glb`), doc);
  const p0 = merged.listPrimitives()[0];
  console.log(name, 'verts', p0.getAttribute('POSITION').getCount(), 'tris', p0.getIndices().getCount() / 3);
}

// ── тягач с полуприцепом: масштаб по ширине прицепа, начало — зад прицепа по центру, на полу ──
{
  const { doc, parts } = await load();
  await write(doc, 'tesla-semi', Object.values(parts), (mesh, scene) => {
    const b = getBounds(scene);
    // ширина у заднего торца (5% длины) — без зеркал
    let wMin = Infinity, wMax = -Infinity;
    each(mesh.listPrimitives()[0], (v) => {
      if (v[2] < b.min[2] + 0.05 * (b.max[2] - b.min[2])) { wMin = Math.min(wMin, v[0]); wMax = Math.max(wMax, v[0]); }
    });
    const s = TRAILER_WIDTH / (wMax - wMin);
    transformMesh(mesh, scaleShift(s, [-(b.min[0] + b.max[0]) / 2, -b.min[1], -b.min[2]]));
  });
}

// ── кабина для фургона: без рамы тягача за кабиной, передние колёса и одна задняя пара спарок ──
{
  const { doc, parts } = await load();
  const cab = parts.truck03;
  // задняя стенка кабины — самая задняя точка выше рамы
  let cabRear = Infinity, top = -Infinity;
  each(cab, (v) => { if (v[1] > 2) cabRear = Math.min(cabRear, v[2]); top = Math.max(top, v[1]); });
  // отрезаем всё, что за кабиной (раму, седло)
  const pos = cab.getAttribute('POSITION');
  const idx = cab.getIndices().getArray();
  const kept = [];
  const v = [0, 0, 0];
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    if (tri.every((k) => pos.getElement(k, v)[2] >= cabRear - 0.05)) kept.push(...tri);
  }
  cab.getIndices().setArray(new Uint32Array(kept));
  compactPrimitive(cab);

  const wheels = ['wheel011', 'wheel012', 'wheel025', 'wheel026'].map((n) => parts[n]);
  let floor = Infinity;
  for (const w of wheels) each(w, (p) => (floor = Math.min(floor, p[1])));
  const s = (VAN.bodyTop + 0.08) / (top - floor);
  console.log('van: cab rear', cabRear.toFixed(2), 'scale', s.toFixed(3));
  for (const p of [cab, parts.wheel011, parts.wheel012]) transformPrimitive(p, scaleShift(s, [0, -floor, VAN.cabZ0 / s - cabRear]));
  // задняя пара спарок — под будку
  let zc = 0, n = 0;
  each(parts.wheel025, (p) => ((zc += p[2]), n++));
  zc /= n;
  for (const p of [parts.wheel025, parts.wheel026]) transformPrimitive(p, scaleShift(s, [0, -floor, VAN.rearAxleZ / s - zc]));
  await write(doc, 'tesla-semi-van', [cab, ...wheels]);
}
