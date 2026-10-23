import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { mergeStatic } from './merge';

/**
 * Группа, неподвижные меши которой склеиваются по материалу (см. mergeStatic).
 * Пересклеивается после каждого рендера этой группы — годится для содержимого, которое меняется
 * вместе с родителем (поддоны и коробки по остаткам). Внутрь не класть то, что двигается само (useFrame).
 */
export function MergeStatic({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    return mergeStatic(g).restore;
  });
  return <group ref={ref}>{children}</group>;
}
