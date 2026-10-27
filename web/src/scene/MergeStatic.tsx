import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { mergeStatic } from './merge';

const EMPTY_DEPS: readonly unknown[] = [];

/**
 * Группа, неподвижные меши которой склеиваются по материалу (см. mergeStatic).
 * По умолчанию склеивается один раз при монтировании (deps = []); если содержимое меняется
 * (например, число коробок/мешков на складе), передайте массив зависимостей deps.
 * Внутрь не класть то, что двигается само (useFrame).
 */
export function MergeStatic({ children, deps = EMPTY_DEPS }: { children: ReactNode; deps?: readonly unknown[] }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    return mergeStatic(g).restore;
  }, deps);
  return <group ref={ref}>{children}</group>;
}
