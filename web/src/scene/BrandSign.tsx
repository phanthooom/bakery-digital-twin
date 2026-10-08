import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import { Center, RoundedBox, Text3D } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SiteConfig } from '@bakery/shared';
import font from 'three/examples/fonts/gentilis_bold.typeface.json';
import { drawEmblem } from '../ui/brandEmblem';
import { M } from './materials';
import { makeLabelTexture } from './textures';

const CREAM = '#fff3df';
const BOARD_H = 1.5;
const LETTER_H = 0.62;

const letters = new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: CREAM, emissiveIntensity: 2.1, roughness: 0.4, toneMapped: false });

function useHaloTexture(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 32, 4, 128, 32, 128);
    g.addColorStop(0, 'rgba(255,190,190,0.85)');
    g.addColorStop(0.45, 'rgba(255,170,170,0.3)');
    g.addColorStop(1, 'rgba(255,170,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function useEmblemTexture(color: string): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    drawEmblem(c.getContext('2d')!, 512, { bg: color, ring: '#ffd9a0', grain: '#fff3df' });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [color]);
}

/** Логотип-файл (SVG) → объёмные световые буквы: контуры выдавливаются на 4 см. */
function SvgLogo3D({ url, height, onWidth }: { url: string; height: number; onWidth: (w: number) => void }) {
  const data = useLoader(SVGLoader, url);
  const { geometry, width } = useMemo(() => {
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    if (!shapes.length) throw new Error('в SVG нет контуров');
    const g = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const k = height / (b.max.y - b.min.y);
    g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0);
    g.scale(k, -k, 0.04 / 1); // SVG: ось Y вниз
    g.computeVertexNormals();
    return { geometry: g, width: (b.max.x - b.min.x) * k };
  }, [data, height]);
  useEffect(() => onWidth(width), [width, onWidth]);
  return <mesh geometry={geometry} material={letters} />;
}

class LogoBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('Логотип не загрузился, на вывеске будет название текстом:', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Навесная вывеска с подсветкой на кромке задней стены — в фирменном цвете компании:
 * объёмные световые буквы (из SVG-логотипа, если он задан, иначе название шрифтом),
 * подпись, ореол на стене и тёплый свет вниз на цех.
 */
export function BrandSign({ config }: { config: SiteConfig }) {
  const brand = config.site.brand;
  const color = brand?.color ?? '#B71F3E';
  const { depth: D, height: H } = config.site.hall;
  const halo = useHaloTexture();
  const emblem = useEmblemTexture(color);
  const tagline = useMemo(
    () =>
      brand?.tagline
        ? makeLabelTexture(brand.tagline, { fontSize: 96, weight: 500, color: '#fff3df', font: 'italic 500 96px "Segoe Script", "Brush Script MT", "Apple Chancery", cursive' })
        : null,
    [brand?.tagline],
  );
  const name = brand?.name ?? '';
  const [logoW, setLogoW] = useState<number | null>(null);
  const [textBlockW, setTextBlockW] = useState<number | null>(null);
  // пока шрифт не измерен — оценка: ~0,36 м на символ при высоте букв 0,62 м
  const textW = Math.max(3, name.length * 0.36);
  const contentW = brand?.logo ? (logoW ?? textW) : (textBlockW ?? textW + 1.2);
  const boardW = contentW + 1.6;
  if (!brand) return null;

  const fallbackText = (
    <Center disableZ onCentered={({ width }) => setTextBlockW((w) => (w !== null && Math.abs(w - width) < 0.01 ? w : width))}>
      <group position={[-0.65, 0.22, 0]}>
        <mesh>
          <circleGeometry args={[0.5, 48]} />
          <meshBasicMaterial map={emblem} color={new THREE.Color(1.3, 1.3, 1.3)} toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 0, 0]}>
          <Text3D font={font as unknown as string} size={LETTER_H} height={0.06} curveSegments={8} bevelEnabled bevelThickness={0.01} bevelSize={0.008} bevelSegments={2} material={letters}>
            {name}
          </Text3D>
      </group>
    </Center>
  );

  const y = H + BOARD_H / 2 + 0.12;
  const z = -D / 2 + 0.02;
  return (
    <group position={[0, y, z]}>
      <mesh position={[0, 0, -0.09]} scale={[boardW * 1.45, BOARD_H * 2.6, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} toneMapped={false} />
      </mesh>
      {[-boardW / 2 + 0.6, boardW / 2 - 0.6].map((x) => (
        <group key={x} position={[x, -BOARD_H / 2, -0.04]}>
          <mesh material={M.steelDark} position={[0, -0.06, 0]}>
            <boxGeometry args={[0.1, 0.14, 0.1]} />
          </mesh>
          <mesh material={M.steelDark} position={[0, -0.13, -0.08]}>
            <boxGeometry args={[0.3, 0.03, 0.34]} />
          </mesh>
        </group>
      ))}
      {/* короб в фирменном цвете */}
      <RoundedBox args={[boardW, BOARD_H, 0.18]} radius={0.07} smoothness={4} castShadow>
        <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.8)} metalness={0.25} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0, 0.091]}>
        <planeGeometry args={[boardW - 0.14, BOARD_H - 0.14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} roughness={0.7} />
      </mesh>
      <group position={[0, tagline ? 0.2 : 0, 0.1]}>
        {brand.logo ? (
          <LogoBoundary fallback={fallbackText}>
            <Suspense fallback={null}>
              <SvgLogo3D url={brand.logo} height={LETTER_H * 1.1} onWidth={setLogoW} />
            </Suspense>
          </LogoBoundary>
        ) : (
          fallbackText
        )}
      </group>
      {tagline && (
        <mesh position={[contentW / 2 - (0.36 * tagline.aspect) / 2, -0.47, 0.102]}>
          <planeGeometry args={[0.36 * tagline.aspect, 0.36]} />
          <meshBasicMaterial map={tagline.texture} transparent color={new THREE.Color(1.4, 1.4, 1.4)} toneMapped={false} />
        </mesh>
      )}
      <pointLight position={[0, -1.5, 1.2]} color="#ffe2d6" intensity={2.5} distance={7} decay={2} />
    </group>
  );
}
