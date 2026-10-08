import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Outline, Selection } from '@react-three/postprocessing';
import type { SiteConfig } from '@bakery/shared';
import { CameraRig } from './CameraRig';
import { Hall } from './Hall';
import { Machine } from './Machine';

export interface SceneProps {
  config: SiteConfig;
  selectedId: string | null;
  showLabels: boolean;
  viewToken: number;
  cardOffset: number;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9b4a8', 1.15]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[9, 18, 12]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.04}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[-12, 9, 6]} intensity={0.45} />
    </>
  );
}

export function Scene({ config, selectedId, showLabels, viewToken, cardOffset, onSelect, onDeselect }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredId]);

  return (
    <div
      className="scene"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 32, near: 0.1, far: 300, position: [-5, 20, 25] }}
        gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onPointerMissed={(e) => {
          // клик по пустому месту (не перетаскивание камеры) — закрыть карточку
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) onDeselect();
        }}
        aria-label="3D-схема цеха"
      >
        <color attach="background" args={['#ecebe7']} />
        <Lights />
        <CameraRig config={config} selectedId={selectedId} viewToken={viewToken} cardOffset={cardOffset} />
        <Selection>
          <EffectComposer multisampling={4} autoClear={false}>
            <Outline blur visibleEdgeColor={0x2f7bff} hiddenEdgeColor={0x2f7bff} edgeStrength={10} width={1800} xRay={false} />
            <Bloom luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.7} mipmapBlur />
          </EffectComposer>
          <Hall config={config} />
          {config.equipment.map((eq) => (
            <Machine
              key={eq.id}
              eq={eq}
              selected={selectedId === eq.id}
              hovered={hoveredId === eq.id}
              showLabel={showLabels}
              onHover={setHoveredId}
              onSelect={onSelect}
            />
          ))}
        </Selection>
      </Canvas>
    </div>
  );
}
