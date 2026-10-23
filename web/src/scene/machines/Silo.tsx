import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '../materials';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

/**
 * Промышленный силос бестарного хранения муки с пневмовыгрузкой:
 * - Силос №1: Мука пшеничная в/с (25 т)
 * - Силос №2: Мука пшеничная 1/с (25 т)
 * - Силос №3: Мука ржаная обдирная (15 т)
 *
 * Точно отцентрирован в нулевой точке (0, 0, 0), с пропорциональными габаритами,
 * надежной 4-опорной рамой, коническим днищем, шлюзовым роторным питателем,
 * герметичной проходкой через перекрытие, центральным фильтром аспирации на куполе,
 * трубой пневмозагрузки муковоза и светодиодным индикатором уровня муки.
 */
export function Silo({ live, eq }: BodyProps) {
  const pulse = useRef<THREE.MeshStandardMaterial>(null);

  const isSmall = eq?.id === 'silo-3';
  const isSilo2 = eq?.id === 'silo-2';

  // Размеры: 25 т (№1 и №2) vs 15 т (№3)
  const R = isSmall ? 0.95 : 1.15;
  const CYL_H = isSmall ? 2.3 : 2.75;
  const CONE_H = isSmall ? 0.85 : 1.0;
  const LEG_H = 1.05;
  const ROOF_H = 0.45;

  // Процент заполнения по умолчанию (из ТТХ)
  const fillPct = isSmall ? 0.61 : isSilo2 ? 0.59 : 0.78;

  // Цветовая гамма индикатора сорта муки
  const gradeColor = isSmall ? '#b07038' : isSilo2 ? '#d99c2b' : '#3f88c5';

  useFrame((state, dt) => {
    if (pulse.current) {
      const active = live.status === 'running' || live.status === 'alarm';
      const targetIntensity = active ? 0.65 + Math.sin(state.clock.elapsedTime * 4.5) * 0.35 : 0.15;
      pulse.current.emissiveIntensity = THREE.MathUtils.damp(pulse.current.emissiveIntensity, targetIntensity, 3.5, dt);
    }
  });

  const levelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: gradeColor,
        emissive: gradeColor,
        emissiveIntensity: 0.2,
        roughness: 0.2,
      }),
    [gradeColor],
  );

  const legSpan = R * 0.88;
  const totalLegH = LEG_H + CONE_H;
  const cylCenterY = LEG_H + CONE_H + CYL_H / 2;
  const roofApexY = LEG_H + CONE_H + CYL_H + ROOF_H;

  return (
    <group>
      {/* 4 опорные колонны с опорными пятами и анкерами */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}:${sz}`} position={[sx * legSpan, totalLegH / 2, sz * legSpan]}>
            {/* колонна */}
            <mesh material={M.steelDark} castShadow receiveShadow>
              <boxGeometry args={[0.11, totalLegH, 0.11]} />
            </mesh>
            {/* опорная подошва на полу мезонина */}
            <mesh position={[0, -totalLegH / 2 + 0.02, 0]} material={M.steelDark} receiveShadow>
              <boxGeometry args={[0.26, 0.04, 0.26]} />
            </mesh>
            {/* ребра жесткости пяты */}
            <mesh position={[0, -totalLegH / 2 + 0.08, 0]} material={M.steelDark}>
              <boxGeometry args={[0.2, 0.08, 0.04]} />
            </mesh>
          </group>
        )),
      )}

      {/* горизонтальная силовая обвязка опор (швеллерная рама) */}
      <mesh position={[0, LEG_H + 0.08, 0]} material={M.steelDark} castShadow>
        <boxGeometry args={[legSpan * 2 + 0.11, 0.08, legSpan * 2 + 0.11]} />
      </mesh>
      {/* промежуточная поперечная распорка */}
      <mesh position={[0, LEG_H * 0.5, 0]} material={M.steelDark}>
        <boxGeometry args={[legSpan * 2 + 0.08, 0.05, legSpan * 2 + 0.08]} />
      </mesh>

      {/* нижний разгрузочный конус (бункер) */}
      <mesh position={[0, LEG_H + CONE_H / 2, 0]} rotation={[Math.PI, 0, 0]} material={M.steelLight} castShadow>
        <coneGeometry args={[R, CONE_H, 40, 1, true]} />
      </mesh>

      {/* разгрузочный узел: виброднище и шлюзовый роторный питатель */}
      <group position={[0, LEG_H - 0.05, 0]}>
        {/* фланец конуса */}
        <mesh position={[0, 0.06, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.06, 24]} />
        </mesh>
        {/* корпус роторного затвора */}
        <mesh position={[0, -0.06, 0]} material={M.steel} castShadow>
          <boxGeometry args={[0.28, 0.18, 0.24]} />
        </mesh>
        {/* электропривод/мотор-редуктор питателя */}
        <mesh position={[0.18, -0.06, 0]} rotation={[0, 0, Math.PI / 2]} material={M.steelDark} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.14, 16]} />
        </mesh>
        {/* смотровой фонарь (прозрачный) */}
        <mesh position={[0, -0.06, 0.125]} material={M.glass}>
          <cylinderGeometry args={[0.045, 0.045, 0.08, 16]} />
        </mesh>
      </group>

      {/* вертикальный спускной патрубок в пол (герметичная проходка в перекрытие) */}
      <mesh position={[0, (LEG_H - 0.2) / 2, 0]} material={M.chrome} castShadow>
        <cylinderGeometry args={[0.08, 0.08, LEG_H - 0.2, 20]} />
      </mesh>
      {/* фланец проходки через настил пола мезонина */}
      <mesh position={[0, 0.02, 0]} material={M.steelDark} receiveShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 24]} />
      </mesh>

      {/* основной цилиндрический корпус силоса */}
      <mesh position={[0, cylCenterY, 0]} material={M.steelLight} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, CYL_H, 48]} />
      </mesh>

      {/* кольца жесткости (пояса безопасности) на обечайке силоса */}
      {[-CYL_H * 0.32, 0, CYL_H * 0.32].map((dy) => (
        <mesh key={dy} position={[0, cylCenterY + dy, 0]} material={M.steel}>
          <cylinderGeometry args={[R + 0.02, R + 0.02, 0.04, 48]} />
        </mesh>
      ))}

      {/* декоративный брендовый пояс с цветом сорта муки */}
      <mesh position={[0, cylCenterY + CYL_H * 0.42, 0]} material={levelMat}>
        <cylinderGeometry args={[R + 0.015, R + 0.015, 0.06, 48]} />
      </mesh>

      {/* вертикальная светодиодная шкала уровня заполнения муки (строго по центру спереди) */}
      <group position={[0, cylCenterY, R + 0.015]}>
        {/* подложка шкалы */}
        <mesh position={[0, 0, 0]} material={M.black}>
          <boxGeometry args={[0.1, CYL_H * 0.72, 0.02]} />
        </mesh>
        {/* световая полоса фактического уровня */}
        <mesh position={[0, (-CYL_H * 0.72 * (1 - fillPct)) / 2, 0.008]}>
          <boxGeometry args={[0.06, CYL_H * 0.72 * fillPct, 0.015]} />
          <primitive object={levelMat} ref={pulse} attach="material" />
        </mesh>
      </group>

      {/* верхняя коническая крышка (купол силоса) */}
      <mesh position={[0, cylCenterY + CYL_H / 2 + ROOF_H / 2, 0]} material={M.steel} castShadow>
        <coneGeometry args={[R + 0.04, ROOF_H, 44]} />
      </mesh>

      {/* центральный аспирационный фильтр сброса воздуха (строго по центру на вершине купола!) */}
      <group position={[0, roofApexY + 0.35, 0]}>
        {/* корпус фильтра */}
        <mesh material={M.steelDark} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.7, 24]} />
        </mesh>
        {/* защитный грибок/дефлектор фильтра */}
        <mesh position={[0, 0.38, 0]} material={M.orange} castShadow>
          <coneGeometry args={[0.34, 0.16, 24]} />
        </mesh>
        {/* сервисный фланец */}
        <mesh position={[0, -0.32, 0]} material={M.steel}>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 24]} />
        </mesh>
      </group>

      {/* труба пневмозагрузки муки от муковоза (идет сзади-сбоку наверх купола) */}
      <group position={[-R - 0.04, 0, -R * 0.3]}>
        {/* вертикальный стояк */}
        <mesh position={[0, (totalLegH + CYL_H + 0.2) / 2, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.05, 0.05, totalLegH + CYL_H + 0.2, 16]} />
        </mesh>
        {/* соединительная муфта внизу (приемный замок camlock) */}
        <mesh position={[0, 0.5, 0]} material={M.orange}>
          <cylinderGeometry args={[0.07, 0.07, 0.2, 16]} />
        </mesh>
        {/* колено ввода в верхнюю часть силоса */}
        <mesh position={[0.18, totalLegH + CYL_H + 0.18, 0]} rotation={[0, 0, -Math.PI / 4]} material={M.chrome}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 16]} />
        </mesh>
      </group>

      {/* инспекционная лестница с защитной корзиной (на боковой стороне) */}
      <group position={[R + 0.09, (totalLegH + CYL_H) / 2, 0]}>
        {/* тетивы лестницы */}
        {[-0.18, 0.18].map((dz) => (
          <mesh key={dz} position={[0, 0, dz]} material={M.steelDark}>
            <cylinderGeometry args={[0.02, 0.02, totalLegH + CYL_H, 8]} />
          </mesh>
        ))}
        {/* ступени */}
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[0, -(totalLegH + CYL_H) / 2 + 0.3 + i * 0.36, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.steelDark}>
            <cylinderGeometry args={[0.012, 0.012, 0.36, 8]} />
          </mesh>
        ))}
        {/* дуги защитного ограждения корзины */}
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[0.14, (totalLegH + CYL_H) * 0.1 + i * 0.7, 0]} rotation={[0, 0, Math.PI / 2]} material={M.steelDark}>
            <torusGeometry args={[0.22, 0.012, 6, 16, Math.PI]} />
          </mesh>
        ))}
      </group>

      {/* пульт тензометрического взвешивания и индикации (строго по центру спереди) */}
      <group position={[0, 1.15, R + 0.07]}>
        <RoundedBox args={[0.36, 0.3, 0.1]} radius={0.02} material={M.steel}>
          <Screen live={live} width={0.24} height={0.14} position={[0, 0.04, 0.055]} />
          <Knob color="#3fbf4a" glow={live.status === 'running'} position={[-0.09, -0.08, 0.055]} />
          <Knob color="#d63a32" position={[0.09, -0.08, 0.055]} />
        </RoundedBox>
      </group>
    </group>
  );
}
