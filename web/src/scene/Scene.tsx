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
import { SceneLights } from './NightLighting';
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
  /** Мобильный/компактный экран — облегчённый рендер для 60 FPS без перегрева */
  isMobile?: boolean;
  /** Активна ли перекачка муки в производственном цикле */
  activeFlourTransfer?: boolean;
  /** Вмешательство пользователя в камеру */
  onUserInteract?: () => void;
  /** Ночной режим промышленного освещения */
  isNight?: boolean;
}

const NOOP = () => {};

export function Scene({ config, selectedId, selectedLineId, panelSelected, showLines, focus, showLabels, viewToken, cardOffset, onSelect, onSelectLine, onSelectPanel, onDeselect, onReady, onOpenSupply, selectedVehicle, onSelectVehicle, gasSelected, onSelectGas, floorFilter = 'all', isMobile = false, activeFlourTransfer = false, onUserInteract, isNight = false }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isMobile) return;
    document.body.style.cursor = hoveredId || hoveredLineId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredId, hoveredLineId, isMobile]);

  return (
    <div
      className="scene"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        onUserInteract?.();
      }}
      onWheel={() => {
        onUserInteract?.();
      }}
    >
      <Canvas
        shadows
        dpr={isMobile ? [1, 1.15] : [1, 1.5]}
        camera={{ fov: isMobile ? 36 : 32, near: 0.1, far: 300, position: [-5, 20, 25] }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onPointerMissed={(e) => {
          // клик по пустому месту (не перетаскивание камеры) — закрыть карточку
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) onDeselect();
        }}
        aria-label="3D-схема цеха"
        onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()))}
      >
        <color attach="background" args={['#ecebe7']} />
        <SceneLights config={config} isNight={isNight} isMobile={isMobile} floorFilter={floorFilter} />
        <CameraRig config={config} focus={focus} viewToken={viewToken} cardOffset={cardOffset} />
        <Selection>
          {!isMobile && (
            <EffectComposer multisampling={0} autoClear={false}>
              <Outline blur visibleEdgeColor={0x2f7bff} hiddenEdgeColor={0x2f7bff} edgeStrength={10} xRay={false} />
              <Bloom luminanceThreshold={isNight ? 0.82 : 1} luminanceSmoothing={0.22} intensity={isNight ? 1.15 : 0.7} mipmapBlur />
            </EffectComposer>
          )}
          <Hall config={config} />
          <BrandSign config={config} />
          {onOpenSupply && <SupplyScene config={config} onOpen={onOpenSupply} showLabels={showLabels} selectedVehicle={selectedVehicle} onSelectVehicle={onSelectVehicle} isNight={isNight} />}
          {config.areas && <Areas config={config} />}
          <Mezzanine config={config} floorFilter={floorFilter} activeFlourTransfer={activeFlourTransfer} />
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
              onHoverLine={isMobile ? NOOP : setHoveredLineId}
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
                onHover={isMobile ? NOOP : setHoveredId}
                onSelect={onSelect}
                isNight={isNight}
              />
            );
          })}
        </Selection>
      </Canvas>
    </div>
  );
}
