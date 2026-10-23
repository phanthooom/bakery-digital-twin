/**
 * Генератор профессиональных 3D GLB-моделей хлебопекарного оборудования:
 * 1. mixer.glb        - Спиральный тестомес 60 кг (Diosna SP / Восход Прима)
 * 2. moulder.glb      - Тестоокруглитель/формовщик König Mini Rex Multi
 * 3. proofer.glb      - Климатический расстоечный шкаф на 2 тележки
 * 4. blastfreezer.glb - Шкаф шоковой заморозки (Irinox / Polair Grande)
 */
class FileReaderPolyfill {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = FileReaderPolyfill;

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '../web/public/models');
fs.mkdirSync(MODELS_DIR, { recursive: true });

// Общая PBR-система материалов
const M = {
  stainless: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.85, roughness: 0.28 }),
  stainlessDark: new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.75, roughness: 0.35 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xf0f3f6, metalness: 0.95, roughness: 0.12 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.85, metalness: 0.1 }),
  base: new THREE.MeshStandardMaterial({ color: 0x242628, metalness: 0.5, roughness: 0.5 }),
  beltBlue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.65 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.75 }),
  warmGlow: new THREE.MeshStandardMaterial({ color: 0xffbb66, emissive: 0xff7722, emissiveIntensity: 0.45, roughness: 0.4 }),
  coldGlow: new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x06b6d4, emissiveIntensity: 0.4, roughness: 0.3 }),
  tray: new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 0.7, roughness: 0.3 }),
  doughRaw: new THREE.MeshStandardMaterial({ color: 0xf1dfb8, roughness: 0.9 }),
  screenGlass: new THREE.MeshStandardMaterial({ color: 0x111315, metalness: 0.2, roughness: 0.15 }),
  screenDisplay: new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.9, roughness: 0.2 }),
  estopRed: new THREE.MeshStandardMaterial({ color: 0xd92626, metalness: 0.2, roughness: 0.3 }),
  estopYellow: new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.2, roughness: 0.3 }),
  brandAccent: new THREE.MeshStandardMaterial({ color: 0x0055a5, metalness: 0.4, roughness: 0.35 }),
};

async function exportGlb(root, filename) {
  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true });
  });
  const outPath = path.join(MODELS_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(glb));
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`✓ Создана модель: ${filename} (${sizeKb} КБ)`);
}

// ============================================================================
// 1. ТЕСТОМЕС 60 кг (mixer.glb)
// ============================================================================
function buildMixer() {
  const root = new THREE.Group();
  root.name = 'Mixer_Spiral_60kg';

  // Габариты: Ш=0.95, В=1.55, Г=1.25
  const W = 0.95;
  const H = 1.55;
  const D = 1.25;

  // 1.1. Цоколь и нижняя рама
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.08, D - 0.05), M.base);
  plinth.position.set(0, 0.04, 0);
  root.add(plinth);

  // 1.2. Основной корпус станины (моторный отсек сзади)
  const baseH = 0.65;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, baseH, D * 0.6), M.stainless);
  body.position.set(0, 0.08 + baseH / 2, -D * 0.2);
  root.add(body);

  // 1.3. Вертикальная колонна подъемной траверсы
  const columnW = 0.48;
  const columnH = 0.75;
  const columnD = 0.45;
  const col = new THREE.Mesh(new THREE.BoxGeometry(columnW, columnH, columnD), M.stainless);
  col.position.set(0, 0.08 + baseH + columnH / 2, -D * 0.28);
  root.add(col);

  // 1.4. Верхняя голова (траверса со шкивами и приводом спирали)
  const headW = 0.54;
  const headH = 0.28;
  const headD = 0.85;
  const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), M.stainless);
  head.position.set(0, H - headH / 2, 0.05);
  root.add(head);

  // Фирменная защитная накладка на голове
  const cap = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.02, 0.06, headD + 0.02), M.brandAccent);
  cap.position.set(0, H - 0.03, 0.05);
  root.add(cap);

  // 1.5. Круглая дежа (полированная нержавеющая сталь) с тестом внутри (вращается)
  const bowlR = 0.44;
  const bowlH = 0.52;
  const bowlY = 0.08 + bowlH / 2 + 0.25;
  const bowlZ = 0.18;

  const bowlGroup = new THREE.Group();
  bowlGroup.name = 'anim_bowl';
  bowlGroup.userData = { animated: true };
  bowlGroup.position.set(0, bowlY, bowlZ);

  // Чаша дежи
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(bowlR, bowlR * 0.82, bowlH, 36, 1, false), M.chrome);
  bowl.userData = { animated: true };
  bowlGroup.add(bowl);

  // Верхний массивный обод дежи
  const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(bowlR, 0.022, 12, 36), M.chrome);
  bowlRim.rotation.x = Math.PI / 2;
  bowlRim.position.set(0, bowlH / 2, 0);
  bowlRim.userData = { animated: true };
  bowlGroup.add(bowlRim);

  // Опорный поворотный фрикционный стол под дежой
  const table = new THREE.Mesh(new THREE.CylinderGeometry(bowlR * 0.9, bowlR * 0.92, 0.25, 32), M.stainlessDark);
  table.position.set(0, 0.08 + 0.125, bowlZ);
  root.add(table);

  // Тесто внутри дежи
  const dough = new THREE.Mesh(new THREE.CylinderGeometry(bowlR * 0.78, bowlR * 0.72, 0.22, 24), M.doughRaw);
  dough.position.set(0, -0.05, 0);
  dough.userData = { animated: true };
  bowlGroup.add(dough);

  root.add(bowlGroup);

  // 1.6. Спиральный месильный орган (вращается)
  const hookGroup = new THREE.Group();
  hookGroup.name = 'anim_hook';
  hookGroup.userData = { animated: true };
  hookGroup.position.set(0.12, bowlY + 0.12, bowlZ);

  const hookShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 16), M.chrome);
  hookShaft.userData = { animated: true };
  hookGroup.add(hookShaft);

  // Спиральный виток крюка
  for (let s = 0; s < 3; s++) {
    const hookLoop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 24, Math.PI * 1.6), M.chrome);
    hookLoop.rotation.x = Math.PI / 2;
    hookLoop.rotation.y = (s * Math.PI) / 3;
    hookLoop.position.set(0, -0.07 - s * 0.08, 0);
    hookLoop.userData = { animated: true };
    hookGroup.add(hookLoop);
  }

  root.add(hookGroup);

  // Центральный нож-отсекатель теста (guide bar)
  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.04), M.chrome);
  knife.position.set(-0.08, bowlY + 0.1, bowlZ);
  root.add(knife);

  // 1.7. Защитная решетка безопасности над дежой
  const cageR = bowlR + 0.01;
  const cageY = bowlY + bowlH / 2 + 0.04;
  for (let b = -4; b <= 4; b++) {
    const rodLen = Math.sqrt(Math.max(0, cageR * cageR - (b * 0.08) ** 2)) * 1.95;
    if (rodLen > 0.1) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, rodLen, 8), M.chrome);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, cageY, bowlZ + b * 0.08);
      root.add(rod);
    }
  }

  // 1.8. Пульт управления со скоростями и дисплеем
  const panelW = 0.28;
  const panelH = 0.42;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.08), M.stainlessDark);
  panel.position.set(-W / 2 + 0.06, 0.08 + baseH + 0.35, 0.05);
  panel.rotation.y = Math.PI / 6;
  root.add(panel);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), M.screenDisplay);
  screen.position.set(-W / 2 + 0.06, 0.08 + baseH + 0.42, 0.095);
  screen.rotation.y = Math.PI / 6;
  root.add(screen);

  // Кнопка E-Stop на пульте
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.035, 20), M.estopRed);
  estop.rotation.x = Math.PI / 2;
  estop.position.set(-W / 2 + 0.08, 0.08 + baseH + 0.22, 0.1);
  root.add(estop);

  return root;
}

// ============================================================================
// 2. ФОРМОВЩИК KÖNIG MINI REX MULTI (moulder.glb)
// ============================================================================
function buildMoulder() {
  const root = new THREE.Group();
  root.name = 'Moulder_Koenig_MiniRex';

  // Габариты: Ш=0.85, В=1.50, Г=1.45
  const W = 0.85;
  const H = 1.50;
  const D = 1.45;

  // 2.1. Цоколь и опорные ножки
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.08, D * 0.6), M.base);
  plinth.position.set(0, 0.04, -0.15);
  root.add(plinth);

  // 2.2. Центральный шкаф-станина (делитель-округлитель)
  const cabH = 0.88;
  const cabD = 0.75;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(W, cabH, cabD), M.stainless);
  cab.position.set(0, 0.08 + cabH / 2, -0.15);
  root.add(cab);

  // Боковые защитные панели
  for (const s of [-1, 1]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.015, cabH - 0.1, cabD - 0.1), M.stainlessDark);
    pan.position.set(s * (W / 2 + 0.008), 0.08 + cabH / 2, -0.15);
    root.add(pan);
  }

  // 2.3. Верхняя коническая воронка для загрузки теста (бункер)
  const hopperTopW = 0.65;
  const hopperTopD = 0.55;
  const hopperH = 0.42;
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(hopperTopW / 2, hopperTopW * 0.35, hopperH, 24, 1, false), M.stainless);
  hopper.position.set(0, 0.08 + cabH + hopperH / 2, -0.15);
  root.add(hopper);

  // Верхняя защитная откидная решетка над воронкой
  const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(hopperTopW / 2, 0.018, 10, 24), M.chrome);
  hopperRim.rotation.x = Math.PI / 2;
  hopperRim.position.set(0, 0.08 + cabH + hopperH, -0.15);
  root.add(hopperRim);

  // Тесто внутри воронки
  const hopperDough = new THREE.Mesh(new THREE.CylinderGeometry(hopperTopW * 0.38, hopperTopW * 0.28, 0.15, 18), M.doughRaw);
  hopperDough.position.set(0, 0.08 + cabH + 0.12, -0.15);
  root.add(hopperDough);

  // 2.4. Выходной отводящий ленточный мини-транспортер с синей лентой
  const convW = 0.52;
  const convL = 0.72;
  const convH = 0.1;
  const conv = new THREE.Group();
  conv.position.set(0, 0.65, 0.42);
  conv.rotation.x = 0.12; // легкий наклон подачи вперед

  // Боковины транспортера
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, convH + 0.04, convL), M.stainless);
    rail.position.set(s * (convW / 2 + 0.01), 0, 0);
    conv.add(rail);
  }

  // Синяя пищевая лента
  const belt = new THREE.Mesh(new THREE.BoxGeometry(convW, convH, convL - 0.04), M.beltBlue);
  conv.add(belt);

  // Округлившиеся тестовые шарики/заготовки на ленте (по 2 в ряд)
  for (let r = 0; r < 3; r++) {
    for (const bx of [-0.14, 0.14]) {
      const doughBall = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), M.doughRaw);
      doughBall.position.set(bx, convH / 2 + 0.035, -0.22 + r * 0.22);
      conv.add(doughBall);
    }
  }

  // Опорные стойки транспортера
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 12), M.stainless);
  legL.position.set(-convW / 2, 0.3, 0.68);
  root.add(legL);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 12), M.stainless);
  legR.position.set(convW / 2, 0.3, 0.68);
  root.add(legR);

  root.add(conv);

  // 2.5. Пульт управления König и маховики регулировки веса
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.08), M.stainlessDark);
  ctrl.position.set(W / 2 + 0.04, 0.92, -0.1);
  root.add(ctrl);

  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), M.screenDisplay);
  scr.rotation.y = Math.PI / 2;
  scr.position.set(W / 2 + 0.082, 0.98, -0.1);
  root.add(scr);

  // Маховик регулировки порции
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 20), M.chrome);
  dial.rotation.z = Math.PI / 2;
  dial.position.set(W / 2 + 0.08, 0.78, -0.1);
  root.add(dial);

  // Кнопка E-Stop
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.03, 16), M.estopRed);
  estop.rotation.z = Math.PI / 2;
  estop.position.set(W / 2 + 0.08, 0.68, -0.1);
  root.add(estop);

  return root;
}

// ============================================================================
// 3. РАССТОЕЧНЫЙ ШКАФ НА 2 ТЕЛЕЖКИ (proofer.glb)
// ============================================================================
function buildProofer() {
  const root = new THREE.Group();
  root.name = 'Proofer_Chamber_2Racks';

  // Габариты: Ш=1.35, В=2.20, Г=1.40
  const W = 1.35;
  const H = 2.20;
  const D = 1.40;

  // 3.1. Цоколь
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.06, D - 0.04), M.base);
  plinth.position.set(0, 0.03, 0);
  root.add(plinth);

  // 3.2. Основной изотермический шкаф
  const bodyH = H - 0.06;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), M.stainless);
  body.position.set(0, 0.06 + bodyH / 2, 0);
  root.add(body);

  // 3.3. Верхний климатический блок (парогенератор и вентиляторы)
  const climH = 0.26;
  const clim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, climH, D + 0.02), M.stainlessDark);
  clim.position.set(0, H - climH / 2, 0);
  root.add(clim);

  // Вентиляционные жалюзи климатического блока
  for (let j = 0; j < 4; j++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.015, 0.01), M.base);
    louver.position.set(0, H - 0.07 - j * 0.04, D / 2 + 0.015);
    root.add(louver);
  }

  // 3.4. Двустворчатые распашные стеклянные двери
  const doorW = (W - 0.12) / 2;
  const doorH = H - climH - 0.12;
  const doorY = 0.06 + doorH / 2 + 0.03;
  const doorZ = D / 2 + 0.02;

  for (const s of [-1, 1]) {
    const dx = s * (doorW / 2 + 0.015);

    // Рамка двери из нержавейки
    const frame = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.04), M.stainless);
    frame.position.set(dx, doorY, doorZ);
    root.add(frame);

    // Большой стеклопакет двери
    const glass = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.12, doorH - 0.16, 0.015), M.glass);
    glass.position.set(dx, doorY, doorZ + 0.005);
    root.add(glass);

    // Длинная вертикальная ручка
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.85, 16), M.chrome);
    handle.position.set(dx - s * (doorW / 2 - 0.06), doorY, doorZ + 0.05);
    root.add(handle);

    // Внутренняя теплая подсветка (+38 °C) и стеллажные тележки
    const interior = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.16, doorH - 0.2), M.warmGlow);
    interior.position.set(dx, doorY, doorZ - 0.03);
    root.add(interior);

    // Полки тележки внутри за стеклом (8 ярусов противней)
    for (let p = 0; p < 8; p++) {
      const py = doorY - 0.6 + p * 0.16;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.2, 0.01, 0.35), M.tray);
      tray.position.set(dx, py, doorZ - 0.06);
      root.add(tray);
    }
  }

  // 3.5. Сенсорная панель климат-контроля (справа)
  const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.03), M.screenGlass);
  pnl.position.set(W / 2 + 0.01, 1.4, 0.2);
  pnl.rotation.y = Math.PI / 2;
  root.add(pnl);

  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.24), M.screenDisplay);
  disp.position.set(W / 2 + 0.026, 1.4, 0.2);
  disp.rotation.y = Math.PI / 2;
  root.add(disp);

  return root;
}

// ============================================================================
// 4. ШКАФ ШОКОВОЙ ЗАМОРОЗКИ (blastfreezer.glb)
// ============================================================================
function buildBlastFreezer() {
  const root = new THREE.Group();
  root.name = 'BlastFreezer_Irinox_MultiFresh';

  // Габариты: Ш=1.10, В=2.25, Г=1.20
  const W = 1.10;
  const H = 2.25;
  const D = 1.20;

  // 4.1. Усиленный цоколь
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.08, D - 0.04), M.base);
  plinth.position.set(0, 0.04, 0);
  root.add(plinth);

  // 4.2. Массивный термоизолированный шкаф 80 мм
  const bodyH = H - 0.08;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), M.stainless);
  body.position.set(0, 0.08 + bodyH / 2, 0);
  root.add(body);

  // 4.3. Верхний конденсаторный моноблок компрессора (охлаждение до -40 °C)
  const monoH = 0.42;
  const mono = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, monoH, D + 0.02), M.stainlessDark);
  mono.position.set(0, H - monoH / 2, 0);
  root.add(mono);

  // Вентиляционная решетка компрессора с жалюзи
  for (let j = 0; j < 6; j++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.02, 0.015), M.base);
    bar.position.set(0, H - 0.1 - j * 0.045, D / 2 + 0.015);
    root.add(bar);
  }

  // 4.4. Толстая дверь шоковой заморозки
  const doorW = W - 0.12;
  const doorH = H - monoH - 0.16;
  const doorD = 0.09;
  const doorY = 0.08 + doorH / 2 + 0.04;
  const doorZ = D / 2 + doorD / 2;

  // Полотно двери
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorD), M.stainless);
  door.position.set(0, doorY, doorZ);
  root.add(door);

  // Фирменная горизонтальная полоса
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.06, 0.005), M.brandAccent);
  stripe.position.set(0, doorY + 0.45, doorZ + doorD / 2 + 0.002);
  root.add(stripe);

  // Массивные промышленные шарнирные петли справа
  for (const dir of [-1, 1]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 16), M.chrome);
    hinge.position.set(doorW / 2 - 0.03, doorY + dir * 0.65, doorZ + 0.02);
    root.add(hinge);
  }

  // Рычажный герметичный термозамок слева
  const latchHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.06), M.chrome);
  latchHandle.position.set(-doorW / 2 + 0.06, doorY, doorZ + doorD / 2 + 0.04);
  root.add(latchHandle);

  const latchBase = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), M.base);
  latchBase.position.set(-doorW / 2 + 0.06, doorY, doorZ + doorD / 2 + 0.01);
  root.add(latchBase);

  // 4.5. Панель контроллера шоковой заморозки (-40 °C)
  const ctrlW = 0.22;
  const ctrlH = 0.45;
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(ctrlW, ctrlH, 0.02), M.screenGlass);
  ctrl.position.set(0, doorY + 0.15, doorZ + doorD / 2 + 0.005);
  root.add(ctrl);

  // Дисплей с холодным циановым свечением
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(ctrlW - 0.04, 0.26), M.coldGlow);
  disp.position.set(0, doorY + 0.18, doorZ + doorD / 2 + 0.016);
  root.add(disp);

  // Боковой термощуп (core probe) на гибком спиральном проводе
  const probeSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 16), M.chrome);
  probeSocket.rotation.z = Math.PI / 2;
  probeSocket.position.set(-W / 2 - 0.015, doorY + 0.15, 0.2);
  root.add(probeSocket);

  const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 12), M.chrome);
  probe.position.set(-W / 2 - 0.02, doorY + 0.05, 0.2);
  root.add(probe);

  return root;
}

// ============================================================================
// Запуск сборки всех моделей
// ============================================================================
async function main() {
  console.log('--- Генерация 3D GLB-моделей хлебопекарни ---');
  await exportGlb(buildMixer(), 'mixer.glb');
  await exportGlb(buildMoulder(), 'moulder.glb');
  await exportGlb(buildProofer(), 'proofer.glb');
  await exportGlb(buildBlastFreezer(), 'blastfreezer.glb');
  console.log('Все модели успешно созданы в web/public/models/');
}

main().catch((err) => {
  console.error('Ошибка генерации моделей:', err);
  process.exit(1);
});
