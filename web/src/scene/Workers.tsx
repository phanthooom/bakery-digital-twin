import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorPoint, SiteConfig } from '@bakery/shared';

/**
 * Рабочие с рохлями ходят по маршрутам цеха: приёмка → склад сырья, склад → замес,
 * упаковка → склад готовой продукции, склад → рампа отгрузки. Туда и обратно, с остановкой на концах.
 * Модель (worker.glb, «Finley» by Innerscene, CC0) статична — шаг изображаем покачиванием.
 * В файле рабочий стоит в начале координат лицом к +z и держит ручку рохли, вилы — перед ним (до ~2,1 м):
 * он толкает рохлю вилами вперёд. Концы маршрутов — там, где вилы заходят под поддон или в кузов.
 */
const URL = '/models/worker.glb';
useGLTF.preload(URL);

interface Route {
  points: FloorPoint[];
  /** Сдвиг по времени, с — чтобы рабочие не шли синхронно. */
  offset: number;
}

const SPEED = 0.9; // м/с
const PAUSE = 4; // с на погрузку на концах маршрута
const STEP = 0.72; // м, длина шага — для покачивания

/** Маршруты — из конфига (supply.layout.routes): в каждой точке рабочий у ручки, вилы на ~2,1 м впереди по ходу. */
function routesFor(config: SiteConfig): Route[] {
  return config.supply?.layout.routes ?? [];
}

/** Точка на маршруте в момент t: туда — пауза — обратно — пауза. */
function walk(route: Route, lengths: number[], total: number, t: number, out: { x: number; z: number; dx: number; dz: number; moving: boolean; dist: number }) {
  const go = total / SPEED;
  const cycle = 2 * (go + PAUSE);
  let u = (((t + route.offset) % cycle) + cycle) % cycle;
  let back = false;
  if (u >= go + PAUSE) {
    u -= go + PAUSE;
    back = true;
  }
  out.moving = u < go;
  let d = Math.min(u, go) * SPEED;
  out.dist = back ? total + d : d;
  if (back) d = total - d;
  let i = 0;
  while (i < lengths.length - 1 && d > lengths[i]!) d -= lengths[i++]!;
  const [x0, z0] = route.points[i]!;
  const [x1, z1] = route.points[i + 1]!;
  const f = lengths[i]! > 0 ? d / lengths[i]! : 0;
  out.x = x0 + (x1 - x0) * f;
  out.z = z0 + (z1 - z0) * f;
  const dir = back ? -1 : 1;
  out.dx = (x1 - x0) * dir;
  out.dz = (z1 - z0) * dir;
}

function Worker({ route }: { route: Route }) {
  const { scene } = useGLTF(URL);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const object = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.raycast = () => {}; // клики проходят сквозь рабочих к станкам и машинам
      }
    });
    return c;
  }, [scene]);
  const seg = useMemo(() => {
    const lengths = route.points.slice(1).map((p, i) => Math.hypot(p[0] - route.points[i]![0], p[1] - route.points[i]![1]));
    return { lengths, total: lengths.reduce((a, b) => a + b, 0) };
  }, [route]);
  const st = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: -1, moving: false, dist: 0, heading: NaN }), []);

  useFrame(({ clock }, delta) => {
    const g = ref.current;
    if (!g || !body.current) return;
    walk(route, seg.lengths, seg.total, clock.elapsedTime, st);
    // лицом и вилами по ходу движения (модель смотрит к +z); на остановке разворачивается в обратный путь
    const target = st.moving ? Math.atan2(st.dx, st.dz) : Math.atan2(-st.dx, -st.dz);
    if (Number.isNaN(st.heading)) st.heading = target;
    const diff = Math.atan2(Math.sin(target - st.heading), Math.cos(target - st.heading));
    st.heading += diff * Math.min(1, delta * (st.moving ? 6 : 1.5));
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.heading;
    const phase = (st.dist / STEP) * Math.PI;
    body.current.position.y = st.moving ? 0.025 * Math.abs(Math.sin(phase)) : 0;
    body.current.rotation.z = st.moving ? 0.02 * Math.sin(phase) : 0;
  });

  return (
    <group ref={ref}>
      <group ref={body}>
        <primitive object={object} />
      </group>
    </group>
  );
}

export const Workers = memo(function Workers({ config }: { config: SiteConfig }) {
  const routes = useMemo(() => routesFor(config), [config]);
  return (
    <>
      {routes.map((r, i) => (
        <Worker key={i} route={r} />
      ))}
    </>
  );
});
