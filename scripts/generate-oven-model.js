/**
 * Скрипт генерации 3D-модели ротационной хлебопекарной печи MIWE roll-in.
 * Экспортирует оптимизированную GLB-модель в web/public/models/oven.glb.
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
const OUT_PATH = path.resolve(__dirname, '../web/public/models/oven.glb');

// Материалы
const mats = {
  // Шлифованная нержавеющая сталь корпуса (AISI 304)
  stainless: new THREE.MeshStandardMaterial({
    color: 0xc8ccd0,
    metalness: 0.85,
    roughness: 0.28,
  }),
  stainlessDark: new THREE.MeshStandardMaterial({
    color: 0x8a9096,
    metalness: 0.75,
    roughness: 0.35,
  }),
  // Хромированные детали (ручки, навесы, защелки)
  chrome: new THREE.MeshStandardMaterial({
    color: 0xf0f3f6,
    metalness: 0.95,
    roughness: 0.12,
  }),
  // Черный технический пластик и резина уплотнителей
  rubber: new THREE.MeshStandardMaterial({
    color: 0x181a1c,
    roughness: 0.85,
    metalness: 0.1,
  }),
  // Цоколь и силовая рама
  base: new THREE.MeshStandardMaterial({
    color: 0x222426,
    metalness: 0.5,
    roughness: 0.5,
  }),
  // Термостойкое тонированное стекло смотрового окна
  glass: new THREE.MeshStandardMaterial({
    color: 0x24282c,
    metalness: 0.3,
    roughness: 0.1,
    transparent: true,
    opacity: 0.75,
  }),
  // Внутренняя подсветка камеры выпечки
  interiorGlow: new THREE.MeshStandardMaterial({
    color: 0xffaa44,
    emissive: 0xff6611,
    emissiveIntensity: 0.65,
    roughness: 0.4,
  }),
  // Противни и тележка внутри
  tray: new THREE.MeshStandardMaterial({
    color: 0xa4a8ad,
    metalness: 0.7,
    roughness: 0.3,
  }),
  // Выпекаемый хлеб на противнях
  bread: new THREE.MeshStandardMaterial({
    color: 0xba7c38,
    roughness: 0.88,
  }),
  // Панель управления (черное стекло)
  screenGlass: new THREE.MeshStandardMaterial({
    color: 0x111315,
    metalness: 0.2,
    roughness: 0.15,
  }),
  // Цифровой дисплей (активная индикация 230 °C, таймер)
  screenDisplay: new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  }),
  // Аварийная кнопка E-Stop (красный грибок)
  estopRed: new THREE.MeshStandardMaterial({
    color: 0xd92626,
    metalness: 0.2,
    roughness: 0.3,
  }),
  // Желтое кольцо аварийной кнопки
  estopYellow: new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.2,
    roughness: 0.3,
  }),
  // Фирменный синий акцент MIWE
  brandBlue: new THREE.MeshStandardMaterial({
    color: 0x0055a5,
    metalness: 0.4,
    roughness: 0.35,
  }),
};

const root = new THREE.Group();
root.name = 'Oven_MIWE_RollIn';

// Габариты реальной печи: Ш=1.55, В=2.45, Г=1.60
const W = 1.55;
const H = 2.25;
const D = 1.6;

// 1. Цоколь (основание)
const plinthH = 0.08;
const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, plinthH, D - 0.04), mats.base);
plinth.position.set(0, plinthH / 2, 0);
root.add(plinth);

// 2. Основной корпус (нержавеющая сталь)
const bodyH = H - plinthH;
const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), mats.stainless);
body.position.set(0, plinthH + bodyH / 2, 0);
root.add(body);

// Боковые ребра жесткости и вентиляционные решетки
for (const side of [-1, 1]) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.015, bodyH - 0.2, D - 0.2), mats.stainlessDark);
  panel.position.set(side * (W / 2 + 0.005), plinthH + bodyH / 2, 0);
  root.add(panel);

  // Вентиляционные прорези на нижней панели
  for (let l = 0; l < 5; l++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.45), mats.base);
    louver.position.set(side * (W / 2 + 0.008), 0.3 + l * 0.05, 0.3);
    root.add(louver);
  }
}

// 3. Вытяжной зонт (козырек) на крыше с выступом вперед над дверью
const hoodH = 0.18;
const hoodDepth = D + 0.22;
const hood = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, hoodH, hoodDepth), mats.stainlessDark);
hood.position.set(0, H + hoodH / 2, 0.11);
root.add(hood);

// Козырек со скосом спереди
const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.06, 0.12), mats.brandBlue);
lip.position.set(0, H + 0.03, D / 2 + 0.18);
root.add(lip);

// Вытяжная труба дымохода
const pipeH = 0.35;
const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, pipeH, 24), mats.stainless);
pipe.position.set(-0.35, H + hoodH + pipeH / 2, -0.3);
root.add(pipe);

const pipeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 24), mats.stainlessDark);
pipeCap.position.set(-0.35, H + hoodH + pipeH + 0.03, -0.3);
root.add(pipeCap);

// 4. Дверной портал и массивная дверь
const doorW = 1.05;
const doorH = 1.95;
const doorD = 0.09;
const doorX = -0.18;
const doorY = plinthH + 0.05 + doorH / 2;
const doorZ = D / 2 + doorD / 2;

// Уплотнительная черная рамка по периметру
const seal = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.03, doorH + 0.03, 0.02), mats.rubber);
seal.position.set(doorX, doorY, D / 2 + 0.01);
root.add(seal);

// Полотно двери
const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorD), mats.stainless);
door.position.set(doorX, doorY, doorZ);
root.add(door);

// Петли двери слева (3 массивные промышленные петли)
for (let h = 0; h < 3; h++) {
  const hingeY = doorY - 0.7 + h * 0.7;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 16), mats.chrome);
  hinge.position.set(doorX - doorW / 2 + 0.02, hingeY, doorZ + 0.03);
  root.add(hinge);

  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), mats.stainlessDark);
  mount.position.set(doorX - doorW / 2 - 0.01, hingeY, doorZ + 0.01);
  root.add(mount);
}

// 5. Смотровое окно и камера выпечки
const winW = 0.32;
const winH = 1.45;
const winZ = doorZ + doorD / 2 + 0.002;

// Внешнее стекло двери
const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.015), mats.glass);
windowMesh.position.set(doorX, doorY + 0.05, winZ);
root.add(windowMesh);

// Резиновая рамка окна
const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, winH + 0.04, 0.01), mats.rubber);
winFrame.position.set(doorX, doorY + 0.05, winZ - 0.005);
root.add(winFrame);

// Внутреннее светящееся теплое свечение за окном (имитация освещения камеры 230 °C)
const chamberGlow = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.04, winH - 0.04), mats.interiorGlow);
chamberGlow.name = 'anim_glow';
chamberGlow.userData = { animated: true };
chamberGlow.position.set(doorX, doorY + 0.05, doorZ - doorD / 2 + 0.01);
root.add(chamberGlow);

// Ротационная тележка с противнями за стеклом (вращается вокруг вертикальной оси)
const rackGroup = new THREE.Group();
rackGroup.name = 'anim_rack';
rackGroup.userData = { animated: true };
rackGroup.position.set(doorX, doorY - 0.05, doorZ - 0.05);

const rackTiers = 9;
for (let t = 0; t < rackTiers; t++) {
  const trayY = -0.55 + t * 0.14;
  // Противень
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.35), mats.tray);
  tray.position.set(0, trayY, 0);
  tray.userData = { animated: true };
  rackGroup.add(tray);

  // Хлебные багеты на противнях (по 2 заготовки на противне)
  for (const bx of [-0.06, 0.06]) {
    const loaf = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.28, 12), mats.bread);
    loaf.rotation.x = Math.PI / 2;
    loaf.position.set(bx, trayY + 0.02, 0);
    loaf.userData = { animated: true };
    rackGroup.add(loaf);
  }
}

// Вертикальные направляющие стойки тележки
for (const sx of [-0.12, 0.12]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 10), mats.tray);
  post.position.set(sx, 0.07, 0);
  post.userData = { animated: true };
  rackGroup.add(post);
}

root.add(rackGroup);

// 6. Массивная хромированная дверная ручка
const handleL = 0.95;
const handleX = doorX + doorW / 2 - 0.09;
const handleY = doorY - 0.05;
const handleZ = doorZ + doorD / 2 + 0.06;

// Вертикальная рукоять
const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, handleL, 20), mats.chrome);
handleBar.position.set(handleX, handleY, handleZ);
root.add(handleBar);

// Кронштейны ручки (верх и низ)
for (const dir of [-1, 1]) {
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.05, 16), mats.chrome);
  mount.rotation.x = Math.PI / 2;
  mount.position.set(handleX, handleY + (dir * handleL) / 2.3, handleZ - 0.025);
  root.add(mount);
}

// 7. Цифровая панель управления (справа от двери)
const panelW = W - doorW - 0.15;
const panelH = doorH;
const panelX = W / 2 - panelW / 2 - 0.03;
const panelY = doorY;
const panelZ = D / 2 + 0.03;

// Корпус колонны управления
const controlPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.06), mats.stainlessDark);
controlPanel.position.set(panelX, panelY, panelZ);
root.add(controlPanel);

// Фирменная рамка дисплея MIWE
const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.04, 0.45, 0.015), mats.screenGlass);
screenBezel.position.set(panelX, panelY + 0.42, panelZ + 0.032);
root.add(screenBezel);

// Активный сенсорный экран
const screenDisplay = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.07, 0.38), mats.screenDisplay);
screenDisplay.position.set(panelX, panelY + 0.42, panelZ + 0.041);
root.add(screenDisplay);

// Логотип / плашка MIWE
const logoBadge = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.06, 0.06, 0.01), mats.brandBlue);
logoBadge.position.set(panelX, panelY + 0.72, panelZ + 0.032);
root.add(logoBadge);

// Сенсорные кнопки под экраном
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 3; col++) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), mats.chrome);
    btn.position.set(panelX - 0.06 + col * 0.06, panelY + 0.14 - row * 0.055, panelZ + 0.032);
    root.add(btn);
  }
}

// Аварийная кнопка E-Stop (грибок) внизу панели
const estopRing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 24), mats.estopYellow);
estopRing.rotation.x = Math.PI / 2;
estopRing.position.set(panelX, panelY - 0.45, panelZ + 0.035);
root.add(estopRing);

const estopMush = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.035, 24), mats.estopRed);
estopMush.rotation.x = Math.PI / 2;
estopMush.position.set(panelX, panelY - 0.45, panelZ + 0.055);
root.add(estopMush);

// Замок-ключ доступа
const keySwitch = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 16), mats.chrome);
keySwitch.rotation.x = Math.PI / 2;
keySwitch.position.set(panelX, panelY - 0.6, panelZ + 0.035);
root.add(keySwitch);

console.log('Экспортирую модель в GLB...');
const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true });
});

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, Buffer.from(glb));
console.log(`Успешно! Файл создан: ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} КБ)`);
