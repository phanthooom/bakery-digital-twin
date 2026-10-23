import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Outline, Selection } from '@react-three/postprocessing';
import type { SiteConfig } from '@bakery/shared';
import { CameraRig, type CameraFocus } from './CameraRig';
import { PowerLines } from './PowerLines';
import { BrandSign } from './BrandSign';
import { Hall } from './Hall';
import { Machine } from './Machine';
import { SupplyScene } from './SupplyScene';
import { Fallback } from './GltfModel';
import { Workers } from './Workers';
import { Staff } from './Staff';
import { Areas } from './Areas';
import { GasMeter } from './GasMeter';
import { Mezzanine } from './Mezzanine';
import type { SupplyTab } from '../ui/supplyView';

export interface SceneProps {
  config: SiteConfig;
  selectedId: string | null;
  selectedLineId: string | null;
  panelSelected: boolean;
  showLines: boolean;
  focus: CameraFocus | null;
  onSelectLine: (id: string) => void;
  onSelectPanel: () => void;
  showLabels: boolean;
  viewToken: number;
  /** Сдвиг кадра (м), чтобы выбранный станок не прятался под карточкой. */
  cardOffset: [number, number];
  onSelect: (id: string) => void;
  onDeselect: () => void;
  /** Клик по складу или рампе — открыть панель цепочки на нужной вкладке. */
  onOpenSupply?: (tab: SupplyTab) => void;
  /** Выбран ввод газа (счётчик и сигнализатор). */
  gasSelected: boolean;
  onSelectGas: () => void;
  /** Выбранная машина у рампы (фургон или машина поставщика). */
  selectedVehicle: string | null;
  onSelectVehicle: (id: string) => void;
  /** Первый кадр сцены отрисован. */
  onReady?: () => void;
  /** Текущий выбранный этаж */
  floorFilter?: 'all' | 1 | 2;
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
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.04}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <directionalLight position={[-12, 9, 6]} intensity={0.45} />
    </>
  );
}

export function Scene({ config, selectedId, selectedLineId, panelSelected, showLines, focus, showLabels, viewToken, cardOffset, onSelect, onSelectLine, onSelectPanel, onDeselect, onReady, onOpenSupply, selectedVehicle, onSelectVehicle, gasSelected, onSelectGas, floorFilter = 'all' }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.body.style.cursor = hoveredId || hoveredLineId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredId, hoveredLineId]);

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
        onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()))}
      >
        <color attach="background" args={['#ecebe7']} />
        <Lights />
        <CameraRig config={config} focus={focus} viewToken={viewToken} cardOffset={cardOffset} />
        <Selection>
          <EffectComposer multisampling={2} autoClear={false}>
            <Outline blur visibleEdgeColor={0x2f7bff} hiddenEdgeColor={0x2f7bff} edgeStrength={10} xRay={false} />
            <Bloom luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.7} mipmapBlur />
          </EffectComposer>
          <Hall config={config} />
          <BrandSign config={config} />
          {onOpenSupply && <SupplyScene config={config} onOpen={onOpenSupply} showLabels={showLabels} selectedVehicle={selectedVehicle} onSelectVehicle={onSelectVehicle} />}
          {config.areas && <Areas config={config} />}
          <Mezzanine config={config} floorFilter={floorFilter} />
          <GasMeter config={config} selected={gasSelected} onSelect={onSelectGas} showLabel={showLabels} />
          <Fallback fallback={null} url="/models/worker.glb">
            <Suspense fallback={null}>
              <Workers config={config} />
            </Suspense>
          </Fallback>
          <Fallback fallback={null} url="/models/baker.glb">
            <Suspense fallback={null}>
              <Staff config={config} />
            </Suspense>
          </Fallback>
          {showLines && (
            <PowerLines
              config={config}
              selectedLineId={selectedLineId}
              panelSelected={panelSelected}
              hoveredLineId={hoveredLineId}
              onHoverLine={setHoveredLineId}
              onSelectLine={onSelectLine}
              onSelectPanel={onSelectPanel}
            />
          )}
          {config.equipment.map((eq) => {
            const isVisible = floorFilter === 'all' || (floorFilter === 2 ? eq.floor === 2 : eq.floor !== 2);
            if (!isVisible) return null;
            return (
              <Machine
                key={eq.id}
                eq={eq}
                selected={selectedId === eq.id}
                hovered={hoveredId === eq.id}
                showLabel={showLabels}
                onHover={setHoveredId}
                onSelect={onSelect}
              />
            );
          })}
        </Selection>
      </Canvas>
    </div>
  );
}
