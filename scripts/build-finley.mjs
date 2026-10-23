// «Finley — 3D Person, Warehouse worker with pallet jack» (Innerscene по ассетам MakeHuman, CC0) → два GLB для сцены:
//   worker.glb — складской рабочий с рохлей (каска, сигнальный жилет);
//   baker.glb  — тот же человек без рохли и каски, в белой куртке и тёмных брюках (пекарь; колпак добавляет сцена).
// Исходник 22,7 МБ: 47 тыс. треугольников, 22 меша, 15 текстур до 4096² (~210 МБ в видеопамяти). Для сцены:
//   — убираем невидимое в масштабе цеха: зубы, ресницы, брови, карту нормалей;
//   — все текстуры запекаем в цвета вершин (билинейная выборка по UV) — текстур в файле не остаётся;
//   — один меш, один материал, упрощение meshoptimizer до ~2,8 тыс. треугольников, квантование и meshopt-сжатие.
// Начало координат — между ступнями, на полу; человек смотрит к +z (у рабочего вилы рохли — перед ним к +z).
// Зависимости не входят в проект, ставятся разово:
//   npm i --no-save @gltf-transform/cli@4
//   node scripts/build-finley.mjs <finley-3d-person-warehouse-worker-with-pallet-jack.glb> web/public/models
// Упрощение подобрано по замеру: 4 рабочих при ~6,4 тыс. треугольников давали 25 мс на кадр на Intel UHD,
// при ~2,8 тыс. — 16,5 мс, как без них.
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, join, weld, dedup, prune, quantize, reorder, simplify, transformMesh, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, outDir] = process.argv.slice(2);
const SIMPLIFY = { ratio: 0.05, error: 0.012 };
const INVISIBLE = /^(teeth_base|eyebrow001|eyelashes01)$/;

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const hex = (h) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16)));
const images = new Map();
async function decode(tex) {
  if (!images.has(tex)) {
    const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    images.set(tex, { data, w: info.width, h: info.height, c: info.channels });
  }
  return images.get(tex);
}
/** Билинейная выборка sRGB-текстуры по UV (с повтором) → линейный RGB. */
function sample(img, u, v) {
  const x = (((u % 1) + 1) % 1) * img.w - 0.5, y = (((v % 1) + 1) % 1) * img.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const px = (xi, yi) => {
    const o = ((((yi % img.h) + img.h) % img.h) * img.w + (((xi % img.w) + img.w) % img.w)) * img.c;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
  };
  const [a, b, c, d] = [px(x0, y0), px(x0 + 1, y0), px(x0, y0 + 1), px(x0 + 1, y0 + 1)];
  return [0, 1, 2].map((k) => toLin((a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy));
}

/**
 * Сборка одного варианта.
 * drop — какие меши выбросить; recolor(материал, цвет из текстуры, вершина) → цвет или null (оставить как в текстуре).
 */
async function build(name, { drop, recolor = () => null }) {
  images.clear();
  const doc = await io.read(src);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];

  // 1. мировые трансформы → в вершины, текстуры → в цвета вершин, всё в один меш
  await doc.transform(flatten());
  const merged = doc.createMesh(name);
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (drop.test(mesh.getName())) {
      node.setMesh(null);
      continue;
    }
    clearNodeTransform(node);
    for (const p of mesh.listPrimitives()) {
      const mat = p.getMaterial();
      const factor = mat?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const tex = mat?.getBaseColorTexture();
      const img = tex ? await decode(tex) : null;
      const uv = p.getAttribute('TEXCOORD_0');
      const pos = p.getAttribute('POSITION');
      const n = pos.getCount();
      const col = new Float32Array(n * 3);
      const t = [0, 0];
      const v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const rgb = (img && uv ? sample(img, ...uv.getElement(i, t)) : [1, 1, 1]).map((x, k) => x * factor[k]);
        col.set(recolor(mat?.getName() ?? '', rgb, pos.getElement(i, v)) ?? rgb, i * 3);
      }
      p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(pos.getBuffer()));
      for (const s of p.listSemantics()) if (s.startsWith('TEXCOORD') || s === 'TANGENT') p.setAttribute(s, null);
      merged.addPrimitive(p);
    }
    node.setMesh(null);
  }
  const mat = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0);
  for (const p of merged.listPrimitives()) p.setMaterial(mat);
  for (const n of scene.listChildren()) scene.removeChild(n);
  scene.addChild(doc.createNode(name).setMesh(merged));
  for (const m of root.listMaterials()) if (m !== mat) m.dispose();
  await doc.transform(prune(), join({ keepNamed: false }), weld());

  // 2. начало координат — между ступнями (часть человека — у z ≈ 0), на полу
  const b = getBounds(scene);
  let feetX = 0, feetZ = 0, k = 0;
  const pos = merged.listPrimitives()[0].getAttribute('POSITION');
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    if (v[1] < 0.12 && v[2] < 0.5) ((feetX += v[0]), (feetZ += v[2]), k++);
  }
  feetX /= k;
  feetZ /= k;
  transformMesh(merged, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -feetX, -b.min[1], -feetZ, 1]);

  // 3. упрощение, квантование, meshopt
  const before = merged.listPrimitives()[0].getIndices().getCount() / 3;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ...SIMPLIFY }), dedup(), prune(), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  for (const ext of root.listExtensionsUsed()) if (!(ext instanceof EXTMeshoptCompression) && ext.extensionName !== 'KHR_mesh_quantization') ext.dispose();
  root.getAsset().extras = { credit: 'Finley — 3D Person, Warehouse worker with pallet jack. Innerscene, adapted from MakeHuman CC0 assets. CC0.' };
  await io.write(path.join(outDir, `${name}.glb`), doc);
  const bb = getBounds(scene);
  console.log(name, 'tris', before, '→', merged.listPrimitives()[0].getIndices().getCount() / 3, 'size', bb.max.map((x, i) => +(x - bb.min[i]).toFixed(2)), 'feet', [+feetX.toFixed(3), +feetZ.toFixed(3)]);
}

await build('worker', { drop: INVISIBLE });

// пекарь: без рохли и каски; жилет и рубашка — белая куртка (с объёмом из текстуры), джинсы — тёмные брюки
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const WHITE = hex('#f2f2ef');
const PIPING = hex('#d6d6d2');
const TROUSERS = hex('#3a3f46');
await build('baker', {
  drop: /^(teeth_base|eyebrow001|eyelashes01|Cylinder(\.\d+)?|Pallet jack \|.*|Worker \| original hardhat shell)$/,
  recolor: (mat, rgb, [, y]) => {
    if (mat === 'Original high visibility citrus') return WHITE;
    if (mat === 'Original reflective textile.001') return PIPING;
    if (mat.endsWith('male_casualsuit05')) {
      const shade = Math.min(1, 0.62 + 1.6 * lum(rgb));
      return (y < 0.93 ? TROUSERS : WHITE).map((c) => c * shade);
    }
    return null;
  },
});
