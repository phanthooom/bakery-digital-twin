import { Component, Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeStatic } from './merge';
import type { MachineLive } from './machines';

/**
 * GLB-модель станка (поле `model` в config/equipment.json) или машины.
 * Модель ставится «на пол» (низ bbox → y=0) и центрируется по X/Z;
 * keepOrigin — начало координат уже задано в самом файле, не сдвигать.
 * onHeight сообщает высоту, чтобы сигнальная колонна встала на крышу.
 * Механизмы с префиксом anim_ вращаются/светятся в реальном времени.
 */
interface ModelProps {
  url: string;
  scale?: number;
  keepOrigin?: boolean;
  onHeight?: (h: number) => void;
  live?: MachineLive;
}

function Model({ url, scale = 1, keepOrigin, onHeight, live }: ModelProps) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    // Выполняем склейку статических мешей (mergeStatic) и расчёт базового bbox один раз на загруженную GLB-сцену,
    // чтобы при инстансировании (силосы, печи, тестомесы, погрузчики, тележки) не дублировать геометрии в памяти GPU.
    if (!scene.userData.mergedReady) {
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      mergeStatic(scene);
      const dropped: THREE.Object3D[] = [];
      scene.traverse((o) => (o as THREE.Mesh).isMesh && !o.visible && dropped.push(o));
      for (const o of dropped) o.removeFromParent();
      scene.userData.baseBox = new THREE.Box3().setFromObject(scene);
      scene.userData.mergedReady = true;
    }

    const clone = scene.clone(true);
    clone.scale.setScalar(scale);
    const baseBox = (scene.userData.baseBox as THREE.Box3).clone();
    baseBox.min.multiplyScalar(scale);
    baseBox.max.multiplyScalar(scale);
    const center = baseBox.getCenter(new THREE.Vector3());
    if (!keepOrigin) {
      const ox = Math.abs(center.x) > 0.45 ? -center.x : 0;
      const oz = Math.abs(center.z) > 0.45 ? -center.z : 0;
      clone.position.set(ox, -baseBox.min.y, oz);
    }

    const rack = clone.getObjectByName('anim_rack');
    const glow = clone.getObjectByName('anim_glow') as THREE.Mesh | undefined;
    if (glow && (glow as THREE.Mesh).material) {
      (glow as THREE.Mesh).material = ((glow as THREE.Mesh).material as THREE.Material).clone();
    }
    const bowl = clone.getObjectByName('anim_bowl');
    const hook = clone.getObjectByName('anim_hook');
    const fan = clone.getObjectByName('anim_fan');
    const roll = clone.getObjectByName('anim_roll');
    const beltItems = clone.getObjectByName('anim_belt_items');
    const pulse = clone.getObjectByName('anim_pulse') as THREE.Mesh | undefined;
    if (pulse && (pulse as THREE.Mesh).material) {
      (pulse as THREE.Mesh).material = ((pulse as THREE.Mesh).material as THREE.Material).clone();
    }

    return { clone, height: baseBox.max.y - baseBox.min.y, rack, glow, bowl, hook, fan, roll, beltItems, pulse };
  }, [scene, scale, keepOrigin]);

  useLayoutEffect(() => onHeight?.(object.height), [object.height, onHeight]);

  useFrame((state, dt) => {
    if (!live) return;
    const isRunning = live.status === 'running' || live.status === 'alarm';
    const speed = isRunning ? 2 + live.load * 8 : 0;

    // Вращение ротационной тележки с багетами в печи
    if (object.rack && isRunning) {
      object.rack.rotation.y += dt * 0.75 * Math.max(0.4, live.load);
    }

    // Тепловое свечение ТЭНов и камеры выпечки
    if (object.glow && (object.glow.material as THREE.MeshStandardMaterial)) {
      const mat = object.glow.material as THREE.MeshStandardMaterial;
      const targetGlow = isRunning ? 0.6 + live.load * 1.8 : 0.05;
      mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, targetGlow, 2.5, dt);
    }

    // Вращение дежи тестомеса
    if (object.bowl && isRunning) {
      object.bowl.rotation.y -= dt * speed * 0.15;
    }

    // Вращение спирального месильного органа
    if (object.hook && isRunning) {
      object.hook.rotation.y += dt * speed;
    }

    // Вращение крыльчатки вентилятора (HVAC / льдогенератор / моноблок холода)
    if (object.fan && isRunning) {
      object.fan.rotateZ(dt * (5 + live.load * 9));
    }

    // Вращение рулона упаковочной плёнки (Flow-Pack) вокруг оси шпинделя Z
    if (object.roll && isRunning) {
      object.roll.rotateZ(-dt * 2.4 * Math.max(0.4, live.load));
    }

    // Движение продукции по ленте конвейера и упаковщика
    if (object.beltItems && isRunning) {
      if (object.beltItems.children.length > 0) {
        const span = 2.5;
        const count = object.beltItems.children.length;
        const t = (state.clock.elapsedTime * 0.35 * Math.max(0.4, live.load)) % (span / count);
        object.beltItems.children.forEach((child, idx) => {
          child.position.x = -span / 2 + (((idx * span) / count + t) % span);
        });
      } else {
        const step = 0.42;
        object.beltItems.position.x = ((state.clock.elapsedTime * 0.32 * Math.max(0.4, live.load)) % step) - step / 2;
      }
    }

    // Пульсация индикатора уровня и пневморазгрузки силоса
    if (object.pulse && (object.pulse.material as THREE.MeshStandardMaterial)) {
      const mat = object.pulse.material as THREE.MeshStandardMaterial;
      const target = isRunning ? 0.65 + Math.sin(state.clock.elapsedTime * 4.5) * 0.35 : 0.18;
      mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, target, 3.5, dt);
    }
  });

  return <primitive object={object.clone} />;
}

/** Если модель не загрузилась — показать fallback (или ничего) вместо падения всей сцены. */
export class Fallback extends Component<{ fallback: ReactNode; url: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`GLB-модель ${this.props.url} не загрузилась, показываю процедурную форму:`, err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** children — дополнения к модели (наклейки и т. п.): показываются только вместе с загруженной моделью. */
export function GltfModel({ fallback, children, ...props }: ModelProps & { fallback: ReactNode; children?: ReactNode }) {
  return (
    <Fallback fallback={fallback} url={props.url}>
      <Suspense fallback={fallback}>
        <Model {...props} />
        {children}
      </Suspense>
    </Fallback>
  );
}
