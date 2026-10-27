/**
 * Скрипт сборки и экспорта недостающих SimReady 3D GLB-моделей для цифрового двойника цеха:
 * 1. conveyor.glb   - Модульный ленточный конвейер формовки (3.0 м, мотор-редуктор SEW, ролики, пресс-голова)
 * 2. packer.glb     - Горизонтальная упаковочная линия Flow-Pack (Ulma / Ilapak, рулон пленки, губки запайки, датер)
 * 3. icemaker.glb   - Промышленный чешуйчатый льдогенератор Maja / Scotsman с бункером
 * 4. coldroom.glb   - Холодильная / морозильная камера из ППУ сэндвич-панелей с потолочным моноблоком
 * 5. hvac.glb       - Приточно-вытяжная установка 8500 м³/ч с пластинчатым рекуператором тепла
 * 6. silo-25t.glb   - Силос бестарного хранения муки 25 т с роторным шлюзовым питателем и рукавным фильтром
 * 7. silo-15t.glb   - Силос бестарного хранения ржаной муки 15 т
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

// Промышленная палитра PBR-материалов SimReady
const M = {
  stainless: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.85, roughness: 0.28 }),
  stainlessDark: new THREE.MeshStandardMaterial({ color: 0x82888e, metalness: 0.75, roughness: 0.35 }),
  stainlessLight: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.65, roughness: 0.3 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xf2f5f8, metalness: 0.95, roughness: 0.12 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.85, metalness: 0.1 }),
  base: new THREE.MeshStandardMaterial({ color: 0x242629, metalness: 0.55, roughness: 0.48 }),
  beltBlue: new THREE.MeshStandardMaterial({ color: 0x1e56c2, roughness: 0.62, metalness: 0.08 }),
  beltBlack: new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.72, metalness: 0.1 }),
  motorBlue: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.6, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x24303c, metalness: 0.25, roughness: 0.1, transparent: true, opacity: 0.68 }),
  filmRoll: new THREE.MeshStandardMaterial({ color: 0xd8ecfa, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.82 }),
  sandwichPanel: new THREE.MeshStandardMaterial({ color: 0xf1f2ee, roughness: 0.65, metalness: 0.15 }),
  sandwichSeam: new THREE.MeshStandardMaterial({ color: 0xc4c7c2, roughness: 0.75, metalness: 0.2 }),
  doughRaw: new THREE.MeshStandardMaterial({ color: 0xf1dfb8, roughness: 0.88 }),
  bakedBread: new THREE.MeshStandardMaterial({ color: 0xd49b54, roughness: 0.78 }),
  craftPack: new THREE.MeshStandardMaterial({ color: 0xc99c67, roughness: 0.75 }),
  screenGlass: new THREE.MeshStandardMaterial({ color: 0x111315, metalness: 0.2, roughness: 0.15 }),
  screenDisplay: new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.9, roughness: 0.2 }),
  estopRed: new THREE.MeshStandardMaterial({ color: 0xd92626, metalness: 0.2, roughness: 0.3 }),
  estopYellow: new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.2, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc87d4b, metalness: 0.88, roughness: 0.25 }),
  safetyYellow: new THREE.MeshStandardMaterial({ color: 0xf2c200, metalness: 0.35, roughness: 0.4 }),
  siloBlue: new THREE.MeshStandardMaterial({ color: 0x3f88c5, emissive: 0x3f88c5, emissiveIntensity: 0.4, roughness: 0.25 }),
  siloAmber: new THREE.MeshStandardMaterial({ color: 0xd99c2b, emissive: 0xd99c2b, emissiveIntensity: 0.4, roughness: 0.25 }),
};

async function exportGlb(root, filename) {
  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true });
  });
  const outPath = path.join(MODELS_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(glb));
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`✓ Собрана модель: ${filename} (${sizeKb} КБ)`);
}

// ============================================================================
// 1. КОНВЕЙЕР ФОРМОВКИ 3.0 м (conveyor.glb)
// ============================================================================
function buildConveyor() {
  const root = new THREE.Group();
  root.name = 'SimReady_Conveyor_3m';

  const LEN = 3.0;
  const W = 0.62;
  const H = 0.86;

  // 1.1. 3 П-образные опорные стойки с винтовыми виброопорами и поперечными траверсами
  for (const k of [-1, 0, 1]) {
    const x = k * (LEN / 2 - 0.28);
    for (const sz of [-1, 1]) {
      const z = sz * (W / 2 - 0.04);
      // Стойка
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, H - 0.06, 0.05), M.stainlessDark);
      leg.position.set(x, (H - 0.06) / 2 + 0.04, z);
      root.add(leg);
      // Резиновая виброопора
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.04, 16), M.rubber);
      foot.position.set(x, 0.02, z);
      root.add(foot);
    }
    // Нижняя стяжка стойки
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, W - 0.08), M.stainlessDark);
    tie.position.set(x, 0.22, 0);
    root.add(tie);
  }

  // Продольные лонжероны станины
  for (const sz of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.1, 0.09, 0.03), M.stainless);
    beam.position.set(0, H - 0.04, sz * (W / 2 - 0.015));
    root.add(beam);

    // Боковые направляющие бортики с полимерными отбойниками
    const guide = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.2, 0.045, 0.015), M.chrome);
    guide.position.set(0, H + 0.04, sz * (W / 2 - 0.035));
    root.add(guide);
  }

  // Натяжной и приводной барабаны (валы на торцах)
  for (const sx of [-1, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, W - 0.04, 24), M.chrome);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(sx * (LEN / 2 - 0.05), H - 0.035, 0);
    root.add(roller);

    // Корпуса подшипниковых узлов
    for (const sz of [-1, 1]) {
      const bearing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), M.base);
      bearing.position.set(sx * (LEN / 2 - 0.05), H - 0.035, sz * (W / 2 + 0.01));
      root.add(bearing);
    }
  }

  // Мотор-редуктор привода (сбоку на выходном валу)
  const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.14), M.motorBlue);
  gearbox.position.set(LEN / 2 - 0.12, H - 0.08, -W / 2 - 0.08);
  root.add(gearbox);
  const motorCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 20), M.motorBlue);
  motorCyl.rotation.z = Math.PI / 2;
  motorCyl.position.set(LEN / 2 - 0.28, H - 0.08, -W / 2 - 0.08);
  root.add(motorCyl);

  // Полотно синей пищевой полиуретановой ленты
  const belt = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.06, 0.025, W - 0.06), M.beltBlue);
  belt.position.set(0, H + 0.005, 0);
  root.add(belt);

  // Формующяя раскаточная пресс-голова над лентой (по центру)
  const archX = 0.25;
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.04), M.stainless);
    post.position.set(archX, H + 0.21, sz * (W / 2 - 0.02));
    root.add(post);
  }
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, W + 0.04), M.stainlessLight);
  headBox.position.set(archX, H + 0.38, 0);
  root.add(headBox);

  const pressRoller = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, W - 0.08, 20), M.chrome);
  pressRoller.rotation.x = Math.PI / 2;
  pressRoller.position.set(archX, H + 0.12, 0);
  root.add(pressRoller);

  // Анимируемые тестовые заготовки на ленте
  const itemsGroup = new THREE.Group();
  itemsGroup.name = 'anim_belt_items';
  itemsGroup.userData = { animated: true };
  itemsGroup.position.set(0, H + 0.045, 0);

  const count = 7;
  const span = 2.5;
  for (let i = 0; i < count; i++) {
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.22, 14), M.doughRaw);
    piece.rotation.x = Math.PI / 2;
    piece.position.set(-span / 2 + (i * span) / count, 0, 0);
    piece.userData = { animated: true };
    itemsGroup.add(piece);
  }
  root.add(itemsGroup);

  // Кнопочный пост управления и E-Stop на передней раме
  const ctrlBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), M.stainlessDark);
  ctrlBox.position.set(-0.95, H - 0.06, W / 2 + 0.04);
  root.add(ctrlBox);

  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.07), M.screenDisplay);
  scr.position.set(-0.98, H - 0.05, W / 2 + 0.082);
  root.add(scr);

  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.025, 16), M.estopRed);
  estop.rotation.x = Math.PI / 2;
  estop.position.set(-0.88, H - 0.06, W / 2 + 0.09);
  root.add(estop);

  return root;
}

// ============================================================================
// 2. УПАКОВОЧНАЯ МАШИНА FLOW-PACK (packer.glb)
// ============================================================================
function buildPacker() {
  const root = new THREE.Group();
  root.name = 'SimReady_FlowPack_Packer';

  const LEN = 2.85;
  const W = 0.72;
  const H = 0.86;

  // 2.1. Массивная станина на 6 регулируемых опорах
  for (const k of [-1, 0, 1]) {
    const x = k * (LEN / 2 - 0.3);
    for (const sz of [-1, 1]) {
      const z = sz * (W / 2 - 0.06);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, H - 0.08, 0.06), M.stainlessDark);
      leg.position.set(x, (H - 0.08) / 2 + 0.04, z);
      root.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 16), M.rubber);
      foot.position.set(x, 0.02, z);
      root.add(foot);
    }
  }

  // Корпус конвейерного стола
  const table = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.14, W), M.stainless);
  table.position.set(0, H - 0.05, 0);
  root.add(table);

  // Темная транспортерная лента с толкателями
  const belt = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.08, 0.02, W * 0.65), M.beltBlack);
  belt.position.set(0, H + 0.025, 0);
  root.add(belt);

  // 2.2. Центральный узел запайки, формовочный воротник и защитный кожух
  const sealUnit = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.58, W + 0.06), M.stainlessLight);
  sealUnit.position.set(0.22, H + 0.31, 0);
  root.add(sealUnit);

  // Прозрачное защитное окно узла термозапайки
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.34, 0.02), M.glass);
  shield.position.set(0.22, H + 0.32, W / 2 + 0.035);
  root.add(shield);

  // Нагревательные губки запайки за стеклом (медные)
  const jaws = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W * 0.7, 16), M.copper);
  jaws.rotation.x = Math.PI / 2;
  jaws.position.set(0.32, H + 0.18, 0);
  root.add(jaws);

  // 2.3. Держатель бобины и вращающийся рулон полипропиленовой пленки (anim_roll)
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, W * 0.85, 16), M.chrome);
  spindle.rotation.x = Math.PI / 2;
  spindle.position.set(-0.18, H + 0.76, 0);
  root.add(spindle);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), M.stainlessDark);
  arm.position.set(-0.18, H + 0.56, -W / 2 + 0.06);
  root.add(arm);

  const rollGroup = new THREE.Group();
  rollGroup.name = 'anim_roll';
  rollGroup.userData = { animated: true };
  rollGroup.position.set(-0.18, H + 0.76, 0);

  const film = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.48, 28), M.filmRoll);
  film.rotation.x = Math.PI / 2;
  film.userData = { animated: true };
  rollGroup.add(film);

  // Спицы катушки для заметного вращения
  for (const ang of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.5), M.chrome);
    spoke.rotation.z = ang;
    spoke.userData = { animated: true };
    rollGroup.add(spoke);
  }
  root.add(rollGroup);

  // 2.4. Поворотная консоль HMI-экрана на кронштейне
  const hmiArm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.35, 12), M.chrome);
  hmiArm.position.set(0.68, H + 0.45, W / 2 - 0.05);
  root.add(hmiArm);

  const hmiPanel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.05), M.screenGlass);
  hmiPanel.position.set(0.68, H + 0.58, W / 2 + 0.04);
  hmiPanel.rotation.x = -0.15;
  root.add(hmiPanel);

  const hmiScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.16), M.screenDisplay);
  hmiScreen.position.set(0.68, H + 0.58, W / 2 + 0.068);
  hmiScreen.rotation.x = -0.15;
  root.add(hmiScreen);

  // 2.5. Движущиеся буханки / упакованные багеты по линии (anim_belt_items)
  const itemsGroup = new THREE.Group();
  itemsGroup.name = 'anim_belt_items';
  itemsGroup.userData = { animated: true };
  itemsGroup.position.set(0, H + 0.075, 0);

  const count = 6;
  const span = 2.5;
  for (let i = 0; i < count; i++) {
    const loaf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.095, 0.14), i >= 3 ? M.craftPack : M.bakedBread);
    loaf.position.set(-span / 2 + (i * span) / count, 0, 0);
    loaf.userData = { animated: true };
    itemsGroup.add(loaf);
  }
  root.add(itemsGroup);

  return root;
}

// ============================================================================
// 3. ЧЕШУЙЧАТЫЙ ЛЬДОГЕНЕРАТОР (icemaker.glb)
// ============================================================================
function buildIceMaker() {
  const root = new THREE.Group();
  root.name = 'SimReady_Flake_IceMaker';

  const W = 0.84;
  const D = 0.72;
  const binH = 0.82;
  const headH = 0.38;

  // Ножки
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.1, 14), M.chrome);
      leg.position.set(sx * (W / 2 - 0.07), 0.05, sz * (D / 2 - 0.07));
      root.add(leg);
    }
  }

  // Нижний теплоизолированный бункер-накопитель льда
  const bin = new THREE.Mesh(new THREE.BoxGeometry(W, binH, D), M.stainless);
  bin.position.set(0, 0.1 + binH / 2, 0);
  root.add(bin);

  // Наклонный люк выдачи чешуйчатого льда спереди
  const door = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.42, 0.06), M.stainlessLight);
  door.position.set(0, 0.62, D / 2 + 0.02);
  door.rotation.x = -0.18;
  root.add(door);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, W - 0.24, 16), M.chrome);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 0.78, D / 2 + 0.08);
  root.add(handle);

  // Верхний агрегатный блок льдогенератора
  const head = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, headH, D - 0.04), M.stainlessDark);
  head.position.set(0, 0.1 + binH + headH / 2, 0);
  root.add(head);

  // Боковая вентиляционная решетка конденсатора и вращающийся вентилятор (anim_fan)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.016, 12, 32), M.chrome);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(W / 2 + 0.008, 0.48, 0);
  root.add(ring);

  const fanGroup = new THREE.Group();
  fanGroup.name = 'anim_fan';
  fanGroup.userData = { animated: true };
  fanGroup.position.set(W / 2 + 0.005, 0.48, 0);
  fanGroup.rotation.y = Math.PI / 2;

  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.01), M.base);
    blade.rotation.z = (b * Math.PI) / 4;
    blade.userData = { animated: true };
    fanGroup.add(blade);
  }
  root.add(fanGroup);

  // Цифровая панель управления на верхнем блоке
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.02), M.screenGlass);
  panel.position.set(0, 0.1 + binH + headH / 2, (D - 0.04) / 2 + 0.012);
  root.add(panel);

  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), M.screenDisplay);
  disp.position.set(-0.06, 0.1 + binH + headH / 2, (D - 0.04) / 2 + 0.024);
  root.add(disp);

  return root;
}

// ============================================================================
// 4. ХОЛОДИЛЬНАЯ / МОРОЗИЛЬНАЯ КАМЕРА (coldroom.glb)
// ============================================================================
function buildColdRoom() {
  const root = new THREE.Group();
  root.name = 'SimReady_ColdRoom_Sandwich';

  const W = 2.7;
  const H = 2.52;
  const D = 2.0;

  // Основной изотермический корпус из сэндвич-панелей ППУ 100 мм
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.sandwichPanel);
  body.position.set(0, H / 2, 0);
  root.add(body);

  // Угловые алюминиевые профили и вертикальные замковые швы панелей
  for (const x of [-0.9, -0.3, 0.3, 0.9]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, H, 0.008), M.sandwichSeam);
    seam.position.set(x, H / 2, D / 2 + 0.004);
    root.add(seam);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.06, H + 0.01, 0.06), M.stainlessDark);
      corner.position.set(sx * (W / 2), H / 2, sz * (D / 2));
      root.add(corner);
    }
  }

  // Навесная герметичная холодильная дверь с рычажным замком Fermod и петлями
  const doorW = 1.02;
  const doorH = 2.02;
  const doorX = -0.35;
  const doorZ = D / 2 + 0.045;

  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), M.stainlessLight);
  door.position.set(doorX, doorH / 2 + 0.04, doorZ);
  root.add(door);

  // Резиновый магнитный уплотнитель по контуру двери
  const gasket = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.03, doorH + 0.03, 0.02), M.rubber);
  gasket.position.set(doorX, doorH / 2 + 0.04, D / 2 + 0.01);
  root.add(gasket);

  // Петли слева
  for (const y of [0.35, 1.75]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), M.chrome);
    hinge.position.set(doorX - doorW / 2 - 0.02, y, doorZ);
    root.add(hinge);
  }

  // Ручка-рычаг справа с аварийным толкателем
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.09), M.chrome);
  handle.position.set(doorX + doorW / 2 - 0.1, 1.05, doorZ + 0.06);
  root.add(handle);

  // Защитный отбойник из рифленой нержавейки внизу двери
  const kickPlate = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, 0.28, 0.008), M.stainlessDark);
  kickPlate.position.set(doorX, 0.22, doorZ + 0.042);
  root.add(kickPlate);

  // Въездной пандус у порога
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 0.35), M.rubber);
  ramp.position.set(doorX, 0.015, D / 2 + 0.22);
  root.add(ramp);

  // Щит управления и электронный контроллер Carel / Eliwell справа от двери
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.04), M.screenGlass);
  ctrl.position.set(0.75, 1.55, D / 2 + 0.02);
  root.add(ctrl);

  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), M.screenDisplay);
  scr.position.set(0.75, 1.58, D / 2 + 0.042);
  root.add(scr);

  // Крышный холодильный моноблок с конденсатором и вращающимся вентилятором (anim_fan)
  const monoW = 1.15;
  const monoH = 0.44;
  const monoD = 0.75;
  const mono = new THREE.Mesh(new THREE.BoxGeometry(monoW, monoH, monoD), M.stainless);
  mono.position.set(0.45, H + monoH / 2, -0.35);
  root.add(mono);

  // Диффузор и крыльчатка вентилятора моноблока
  const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 12, 28), M.base);
  shroud.position.set(0.45, H + monoH / 2, -0.35 + monoD / 2 + 0.01);
  root.add(shroud);

  const fanGroup = new THREE.Group();
  fanGroup.name = 'anim_fan';
  fanGroup.userData = { animated: true };
  fanGroup.position.set(0.45, H + monoH / 2, -0.35 + monoD / 2 + 0.012);

  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.01), M.base);
    blade.rotation.z = (b * Math.PI) / 4;
    blade.userData = { animated: true };
    fanGroup.add(blade);
  }
  root.add(fanGroup);

  return root;
}

// ============================================================================
// 5. ПВУ С РЕКУПЕРАЦИЕЙ ТЕПЛА 8500 м³/ч (hvac.glb)
// ============================================================================
function buildHvac() {
  const root = new THREE.Group();
  root.name = 'SimReady_HVAC_HeatRecovery_Unit';

  const W = 2.95;
  const H = 1.65;
  const D = 1.75;

  // Силовая опорная рама из швеллера
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.14, D + 0.06), M.base);
  frame.position.set(0, 0.07, 0);
  root.add(frame);

  // Основной трехсекционный корпус из акустических сэндвич-панелей
  const bodyH = H - 0.14;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), M.stainlessLight);
  body.position.set(0, 0.14 + bodyH / 2, 0);
  root.add(body);

  // Каркасные разделители 3 секций (фильтрация, роторный/пластинчатый рекуператор, вентиляторная группа)
  for (const x of [-W / 2 + 0.03, -0.48, 0.48, W / 2 - 0.03]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, bodyH + 0.02, D + 0.02), M.stainlessDark);
    post.position.set(x, 0.14 + bodyH / 2, 0);
    root.add(post);
  }

  // Центральный диагональный блок пластинчатого рекуператора тепла
  const hx = new THREE.Mesh(new THREE.BoxGeometry(0.82, bodyH - 0.22, 0.04), M.chrome);
  hx.position.set(0, 0.14 + bodyH / 2, D / 2 + 0.015);
  root.add(hx);

  // Смотровой иллюминатор вентиляторного отсека с крыльчаткой (anim_fan)
  const portX = 0.95;
  const portY = 0.98;
  const portRing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 28), M.base);
  portRing.rotation.x = Math.PI / 2;
  portRing.position.set(portX, portY, D / 2 + 0.015);
  root.add(portRing);

  const portGlass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), M.glass);
  portGlass.position.set(portX, portY, D / 2 + 0.038);
  root.add(portGlass);

  const fanGroup = new THREE.Group();
  fanGroup.name = 'anim_fan';
  fanGroup.userData = { animated: true };
  fanGroup.position.set(portX, portY, D / 2 + 0.02);

  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.015), M.safetyYellow);
    blade.rotation.z = (b * Math.PI) / 4;
    blade.userData = { animated: true };
    fanGroup.add(blade);
  }
  root.add(fanGroup);

  // Фланцевые патрубки магистральных воздуховодов (торцевые и верхний)
  for (const zOff of [-0.42, 0.42]) {
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.32, 24), M.stainless);
    duct.rotation.z = Math.PI / 2;
    duct.position.set(-W / 2 - 0.14, 0.98, zOff);
    root.add(duct);

    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 24), M.stainlessDark);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(-W / 2 - 0.29, 0.98, zOff);
    root.add(flange);
  }

  const topDuct = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.32, 24), M.stainless);
  topDuct.position.set(0.55, H + 0.14, 0);
  root.add(topDuct);

  // Навесной шкаф автоматики SCADA с дисплеем слева спереди
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.12), M.stainless);
  cab.position.set(-0.98, 0.95, D / 2 + 0.06);
  root.add(cab);

  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), M.screenDisplay);
  scr.position.set(-0.98, 1.12, D / 2 + 0.122);
  root.add(scr);

  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.022, 0.03, 16), M.estopRed);
  estop.rotation.x = Math.PI / 2;
  estop.position.set(-0.82, 0.72, D / 2 + 0.13);
  root.add(estop);

  return root;
}

// ============================================================================
// 6. СИЛОС БЕСТАРНОГО ХРАНЕНИЯ МУКИ 25 т / 15 т (silo-25t.glb, silo-15t.glb)
// ============================================================================
function buildSilo(isSmall = false) {
  const root = new THREE.Group();
  root.name = isSmall ? 'SimReady_Flour_Silo_15t' : 'SimReady_Flour_Silo_25t';

  const R = isSmall ? 0.95 : 1.15;
  const CYL_H = isSmall ? 2.3 : 2.75;
  const CONE_H = isSmall ? 0.85 : 1.0;
  const LEG_H = 1.05;
  const ROOF_H = 0.45;

  const legSpan = R * 0.86;
  const totalLegH = LEG_H + CONE_H;
  const cylCenterY = LEG_H + CONE_H + CYL_H / 2;
  const roofApexY = LEG_H + CONE_H + CYL_H + ROOF_H;

  // 4 опорные стойки с подпятниками и раскосами
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * legSpan;
      const z = sz * legSpan;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, totalLegH, 0.12), M.stainlessDark);
      col.position.set(x, totalLegH / 2, z);
      root.add(col);

      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), M.base);
      plate.position.set(x, 0.02, z);
      root.add(plate);
    }
  }

  // Силовая обвязка опор
  const ringBeam = new THREE.Mesh(new THREE.BoxGeometry(legSpan * 2 + 0.12, 0.09, legSpan * 2 + 0.12), M.stainlessDark);
  ringBeam.position.set(0, LEG_H + 0.08, 0);
  root.add(ringBeam);

  // Разгрузочный конус (бункер)
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R, CONE_H, 36, 1, false), M.stainlessLight);
  cone.rotation.x = Math.PI;
  cone.position.set(0, LEG_H + CONE_H / 2, 0);
  root.add(cone);

  // Виброднище, шлюзовый роторный питатель и мотор-редуктор внизу конуса
  const feeder = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.26, 24), M.stainless);
  feeder.position.set(0, LEG_H - 0.05, 0);
  root.add(feeder);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.22), M.motorBlue);
  motor.position.set(0.26, LEG_H - 0.15, 0);
  root.add(motor);

  const pipeDown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, LEG_H - 0.1, 18), M.chrome);
  pipeDown.position.set(0, (LEG_H - 0.1) / 2, 0);
  root.add(pipeDown);

  // Основная цилиндрическая обечайка силоса
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, CYL_H, 40), M.stainlessLight);
  cyl.position.set(0, cylCenterY, 0);
  root.add(cyl);

  // Внешние бандажные кольца жесткости
  for (let i = 0; i < 4; i++) {
    const ry = LEG_H + CONE_H + (i * CYL_H) / 3;
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.02, 10, 40), M.chrome);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, ry, 0);
    root.add(band);
  }

  // Конический купол крыши и рукавный фильтр аспирации на вершине
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.03, ROOF_H, 40), M.stainless);
  roof.position.set(0, LEG_H + CONE_H + CYL_H + ROOF_H / 2, 0);
  root.add(roof);

  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 24), M.stainlessLight);
  filter.position.set(0, roofApexY + 0.22, 0);
  root.add(filter);

  const filterCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), M.stainlessDark);
  filterCap.position.set(0, roofApexY + 0.52, 0);
  root.add(filterCap);

  // Вертикальная светодиодная шкала уровня муки спереди (anim_pulse)
  const barTrack = new THREE.Mesh(new THREE.BoxGeometry(0.09, CYL_H * 0.78, 0.03), M.base);
  barTrack.position.set(0, cylCenterY, R + 0.015);
  root.add(barTrack);

  const fillPct = isSmall ? 0.62 : 0.76;
  const fillH = CYL_H * 0.74 * fillPct;
  const pulseMat = isSmall ? M.siloAmber.clone() : M.siloBlue.clone();
  const fillBar = new THREE.Mesh(new THREE.BoxGeometry(0.055, fillH, 0.02), pulseMat);
  fillBar.name = 'anim_pulse';
  fillBar.userData = { animated: true };
  fillBar.position.set(0, cylCenterY - (CYL_H * 0.74) / 2 + fillH / 2, R + 0.028);
  root.add(fillBar);

  // Локальный тензометрический терминал веса на передней опоре
  const term = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.08), M.stainlessDark);
  term.position.set(0, 1.38, legSpan + 0.06);
  root.add(term);

  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.15), M.screenDisplay);
  scr.position.set(0, 1.41, legSpan + 0.102);
  root.add(scr);

  return root;
}

async function main() {
  console.log('--- Сборка дополнительных SimReady 3D GLB-моделей ---');
  await exportGlb(buildConveyor(), 'conveyor.glb');
  await exportGlb(buildPacker(), 'packer.glb');
  await exportGlb(buildIceMaker(), 'icemaker.glb');
  await exportGlb(buildColdRoom(), 'coldroom.glb');
  await exportGlb(buildHvac(), 'hvac.glb');
  await exportGlb(buildSilo(false), 'silo-25t.glb');
  await exportGlb(buildSilo(true), 'silo-15t.glb');
  console.log('Все 7 новых GLB-моделей успешно сохранены в web/public/models/');
}

main().catch((err) => {
  console.error('Ошибка сборки GLB:', err);
  process.exit(1);
});
