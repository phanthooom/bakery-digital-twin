import { Component, Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * GLB-модель станка (поле `model` в config/equipment.json).
 * Модель ставится «на пол» (низ bbox → y=0) и центрируется по X/Z.
 * onHeight сообщает высоту, чтобы сигнальная колонна встала на крышу.
 */
function Model({ url, scale = 1, onHeight }: { url: string; scale?: number; onHeight?: (h: number) => void }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    clone.scale.setScalar(scale);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -box.min.y, -center.z);
    return { clone, height: box.max.y - box.min.y };
  }, [scene, scale]);
  useLayoutEffect(() => onHeight?.(object.height), [object.height, onHeight]);
  return <primitive object={object.clone} />;
}

class Fallback extends Component<{ fallback: ReactNode; url: string; children: ReactNode }, { failed: boolean }> {
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

export function GltfModel(props: { url: string; scale?: number; onHeight?: (h: number) => void; fallback: ReactNode }) {
  return (
    <Fallback fallback={props.fallback} url={props.url}>
      <Suspense fallback={props.fallback}>
        <Model url={props.url} scale={props.scale} onHeight={props.onHeight} />
      </Suspense>
    </Fallback>
  );
}
