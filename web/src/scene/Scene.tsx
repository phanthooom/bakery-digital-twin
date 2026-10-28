import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { MultistoryHvacLab } from './MultistoryHvacLab';
import { RooftopEnergyHub } from './RooftopEnergyHub';
import { getExplodedFloorOffset, isFloorVisible } from '@bakery/shared';
import { SceneLights } from './NightLighting';
import { DimensionalOverlay } from './DimensionalOverlay';
import { LayoutGrid } from './LayoutGrid';
import { SpatialSoundscape } from './SpatialSoundscape';
import type { SupplyTab } from '../ui/supplyView';

class WebGlBoundary extends Component<{ onReady?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('3D WebGL-контекст недоступен:', err);
    this.props.onReady?.();
  }
  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            padding: 24,
            textAlign: 'center',
            color: 'var(--text-secondary, #555)',
            fontSize: 14,
          }}
        >
          <div>
            <strong style={{ display: 'block', fontSize: 16, color: 'var(--text-primary, #191918)', marginBottom: 6 }}>
              3D-сцена временно недоступна
            </strong>
            Перезапустите браузер или проверьте аппаратное ускорение WebGL. Список станков, графики, энергия и история продолжают работать.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  floorFilter?: 'all' | 1 | 2 | 3 | 4;
  /** Режим архитектурного среза / раскрытия слоев этажей (Exploded View) */
  explodedView?: boolean;
  /** Мобильный/компактный экран — облегчённый рендер для 60 FPS без перегрева */
  isMobile?: boolean;
  /** Активна ли перекачка муки в производственном цикле */
  activeFlourTransfer?: boolean;
  /** Вмешательство пользователя в камеру */
  onUserInteract?: () => void;
  /** Ночной режим промышленного освещения */
  isNight?: boolean;
  /** Режим «📐 Планировка» (перестановка оборудования по сетке 0,5 м) */
  layoutMode?: boolean;
  onMoveEquipment?: (id: string, x: number, z: number) => void;
}

const NOOP = () => {};

export function Scene({ config, selectedId, selectedLineId, panelSelected, showLines, focus, showLabels, viewToken, cardOffset, onSelect, onSelectLine, onSelectPanel, onDeselect, onReady, onOpenSupply, selectedVehicle, onSelectVehicle, gasSelected, onSelectGas, floorFilter = 'all', explodedView = false, isMobile = false, activeFlourTransfer = false, onUserInteract, isNight = false, layoutMode = false, onMoveEquipment }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  const explodedFactor = explodedView ? 1.0 : 0.0;
  const yOffsetFloor2 = getExplodedFloorOffset(2, explodedFactor, 5.0);
  const yOffsetFloor3 = getExplodedFloorOffset(3, explodedFactor, 5.0);
  const yOffsetFloor4 = getExplodedFloorOffset(4, explodedFactor, 5.0);

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
      <WebGlBoundary onReady={onReady}>
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
        <SpatialSoundscape config={config} />
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
          <Mezzanine config={config} floorFilter={floorFilter} activeFlourTransfer={activeFlourTransfer} yOffset={yOffsetFloor2} explodedView={explodedView} />
          <MultistoryHvacLab config={config} floorFilter={floorFilter} yOffset={yOffsetFloor3} isNight={isNight} explodedView={explodedView} />
          <RooftopEnergyHub config={config} floorFilter={floorFilter} yOffset={yOffsetFloor4} isNight={isNight} explodedView={explodedView} />
          <DimensionalOverlay config={config} selectedId={selectedId} visible={showLabels || Boolean(selectedId) || layoutMode} isNight={isNight} />
          {layoutMode && onMoveEquipment && (
            <LayoutGrid
              config={config}
              selectedId={selectedId}
              draggingId={draggingId}
              onMoveEquipment={onMoveEquipment}
              onEndDrag={() => setDraggingId(null)}
              isNight={isNight}
            />
          )}
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
            const isVisible = isFloorVisible(eq.floor, floorFilter, explodedView);
            if (!isVisible) return null;
            const eqFloor = (eq.floor ?? 1) as 1 | 2 | 3 | 4;
            const eqYOffset = eqFloor === 1 ? 0 : eqFloor === 2 ? yOffsetFloor2 : eqFloor === 3 ? yOffsetFloor3 : yOffsetFloor4;
            const adjustedEq = eqYOffset !== 0 ? { ...eq, position: { ...eq.position, y: eq.position.y + eqYOffset } } : eq;
            return (
              <Machine
                key={eq.id}
                eq={adjustedEq}
                selected={selectedId === eq.id}
                hovered={hoveredId === eq.id}
                showLabel={showLabels}
                onHover={isMobile ? NOOP : setHoveredId}
                onSelect={onSelect}
                isNight={isNight}
                onStartDrag={layoutMode ? setDraggingId : undefined}
              />
            );
          })}
        </Selection>
      </Canvas>
      </WebGlBoundary>
    </div>
  );
}
