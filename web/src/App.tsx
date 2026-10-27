import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { DataSourceContext, createDataSource } from './data/store';
import type { CameraFocus } from './scene/CameraRig';
import { SPECS } from './scene/machines';
import { backOf, projectOnPolyline, trayOf } from './scene/powerRoutes';
import { Scene } from './scene/Scene';
import { vehicleFocus } from './scene/SupplyScene';
import { LineCard } from './ui/LineCard';
import { PanelCard } from './ui/PanelCard';
import { EquipmentCard } from './ui/EquipmentCard';
import { EquipmentList } from './ui/EquipmentList';
import { Header } from './ui/Header';
import { EnergyPanel } from './ui/EnergyPanel';
import { SupplyPanel } from './ui/SupplyPanel';
import { VehicleCard } from './ui/VehicleCard';
import { TimeMachine } from './ui/TimeMachine';
import { GasCard } from './ui/GasCard';
import type { SupplyTab } from './ui/supplyView';
import { STATUS_LABEL, STATUS_ORDER, applyStatusCssVars } from './ui/statusMeta';
import { StatusIcon } from './ui/StatusIcon';
import { GestureHint } from './ui/GestureHint';
import { LoadingScreen } from './ui/LoadingScreen';
import { setupTelegramBridge } from './data/telegramBridge';
import { TelegramOrderToast } from './ui/TelegramOrderToast';
import { ProductionControl } from './ui/ProductionControl';
import { LayoutToolbar } from './ui/LayoutToolbar';
import { rotateStep, snapAndClamp, type EquipmentPlacement } from './scene/layoutMath';
import { ProductionCycleManager, type ProductionCycleState, type SiteConfig, type TelegramOrder } from '@bakery/shared';
import type { MockDataSource } from './data/MockDataSource';

const NO_OFFSET: [number, number] = [0, 0];
const SIDE_CARD_OFFSET: [number, number] = [1.1, 0];
const BOTTOM_SHEET_OFFSET: [number, number] = [0, 2.0];

type Selection = { kind: 'machine' | 'line' | 'vehicle'; id: string } | { kind: 'panel'; id: 'panel' } | { kind: 'gas'; id: 'gas' } | null;

export function App() {
  const ds = useMemo(() => createDataSource(), []);
  const [selection, setSelection] = useState<Selection>(() => {
    const eq = new URLSearchParams(location.search).get('eq');
    return eq ? { kind: 'machine', id: eq } : null;
  });
  const [showLines, setShowLines] = useState(true);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [supplyTab, setSupplyTab] = useState<SupplyTab | null>(null);
  const selectedId = selection?.kind === 'machine' ? selection.id : null;
  const selectedLineId = selection?.kind === 'line' ? selection.id : null;
  const setSelectedId = useCallback((id: string | null) => setSelection(id ? { kind: 'machine', id } : null), []);
  const [showLabels, setShowLabels] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [viewToken, setViewToken] = useState(0);
  const [wide, setWide] = useState(() => window.innerWidth > 760);
  const [sceneReady, setSceneReady] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);
  const [floorFilter, setFloorFilter] = useState<'all' | 1 | 2>('all');
  const [isNight, setIsNight] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, EquipmentPlacement>>({});
  const [customFocus, setCustomFocus] = useState<CameraFocus | null>(null);
  const [latestOrder, setLatestOrder] = useState<TelegramOrder | null>(null);
  const [showOrderToast, setShowOrderToast] = useState(false);

  // Конфигурация цеха с учётом интерактивной перестановки оборудования в режиме «📐 Планировка»
  const effectiveConfig = useMemo<SiteConfig>(() => {
    if (Object.keys(layoutOverrides).length === 0) return ds.config;
    return {
      ...ds.config,
      equipment: ds.config.equipment.map((eq) => {
        const ov = layoutOverrides[eq.id];
        if (!ov) return eq;
        return {
          ...eq,
          position: { ...eq.position, x: ov.x, z: ov.z },
          rotationY: ov.rotationY,
        };
      }),
    };
  }, [ds.config, layoutOverrides]);

  const moveEquipment = useCallback(
    (id: string, x: number, z: number) => {
      const baseEq = ds.config.equipment.find((e) => e.id === id);
      if (!baseEq) return;
      const snapped = snapAndClamp(x, z, ds.config.site.hall, 0.1);
      setLayoutOverrides((prev) => ({
        ...prev,
        [id]: {
          x: snapped.x,
          z: snapped.z,
          rotationY: prev[id]?.rotationY ?? baseEq.rotationY ?? 0,
        },
      }));
    },
    [ds.config],
  );

  const rotateEquipment = useCallback(
    (id: string, deltaRad: number) => {
      const eq = effectiveConfig.equipment.find((e) => e.id === id);
      if (!eq) return;
      setLayoutOverrides((prev) => ({
        ...prev,
        [id]: {
          x: eq.position.x,
          z: eq.position.z,
          rotationY: rotateStep(eq.rotationY ?? 0, deltaRad),
        },
      }));
    },
    [effectiveConfig.equipment],
  );

  const nudgeEquipment = useCallback(
    (id: string, dx: number, dz: number) => {
      const eq = effectiveConfig.equipment.find((e) => e.id === id);
      if (!eq) return;
      const snapped = snapAndClamp(eq.position.x + dx, eq.position.z + dz, ds.config.site.hall, 0.5);
      setLayoutOverrides((prev) => ({
        ...prev,
        [id]: {
          x: snapped.x,
          z: snapped.z,
          rotationY: eq.rotationY ?? 0,
        },
      }));
    },
    [effectiveConfig.equipment, ds.config.site.hall],
  );

  const resetEquipment = useCallback((id: string) => {
    setLayoutOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Сквозной непрерывный цикл производства «от А до Я»
  const prodManager = useMemo(() => new ProductionCycleManager(), []);
  const [prodState, setProdState] = useState<ProductionCycleState>(() => prodManager.getState());
  const [cameraFollowProd, setCameraFollowProd] = useState(true);

  useEffect(() => {
    return prodManager.subscribe((st) => {
      setProdState(st);
      if (ds.kind === 'mock') {
        (ds as unknown as MockDataSource).syncProductionStep?.(st.currentStepId);
      }
    });
  }, [prodManager, ds]);

  // Анимационный таймер для стейт-машины производства (запускается только при активном цикле, 10 Гц вместо 60 Гц)
  useEffect(() => {
    if (prodState.status !== 'running') return;
    let lastTime = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastTime) / 1000);
      lastTime = now;
      prodManager.tick(dt);
    }, 100);
    return () => clearInterval(timer);
  }, [prodManager, prodState.status]);

  // Плавное следование камеры за активным этапом
  useEffect(() => {
    if (!cameraFollowProd || prodState.status !== 'running' || !prodState.activeStep) return;
    const f = prodState.activeStep.cameraFocus;
    // Сбрасываем ручной выбор станка, чтобы карточка станка не блокировала фокус сквозного цикла
    setSelection(null);
    setCustomFocus({
      key: `prod-${prodState.activeStep.id}-${Date.now()}`,
      x: f.x,
      z: f.z,
      lookY: f.lookY,
      dist: f.dist,
      dir: f.dir,
    });
  }, [cameraFollowProd, prodState.currentStepId, prodState.status, prodState.activeStep]);

  useEffect(() => {
    return setupTelegramBridge(ds, (ord) => {
      setLatestOrder(ord);
      const isFresh = Math.abs(Date.now() - (ord.createdAt || 0)) < 4 * 60_000;
      if (isFresh) {
        setShowOrderToast(true);
        // Автоматически направляем камеру к печи oven-1 и открываем её карточку
        setSelection({ kind: 'machine', id: 'oven-1' });
      }
    });
  }, [ds]);

  useEffect(() => {
    applyStatusCssVars();

    // Интеграция с Telegram Mini App SDK:
    // 1. Полноэкранный режим (requestFullscreen + expand)
    // 2. Запрет случайного смахивания/выхода (disableVerticalSwipes + enableClosingConfirmation)
    // 3. Безопасные отступы сверху и снизу под системные капсулы Telegram
    const wa = (window as unknown as { Telegram?: { WebApp?: Record<string, any> } })?.Telegram?.WebApp;
    if (!wa) return;
    const isInsideTg = Boolean(wa.initData || (wa.platform && wa.platform !== 'unknown'));
    if (!isInsideTg) return;

    try { wa.ready?.(); } catch {}
    try { wa.expand?.(); } catch {}
    try { wa.disableVerticalSwipes?.(); } catch {}
    try { wa.enableClosingConfirmation?.(); } catch {}
    try { wa.setHeaderColor?.('#fcfcfb'); } catch {}
    try { wa.setBackgroundColor?.('#ecebe7'); } catch {}

    const tryEnterFullscreen = () => {
      try {
        wa.expand?.();
        wa.disableVerticalSwipes?.();
        if (typeof wa.requestFullscreen === 'function' && !wa.isFullscreen) {
          wa.requestFullscreen();
        }
      } catch {}
    };

    const syncInsets = () => {
      const cTop = Number(wa.contentSafeAreaInset?.top) || 0;
      const sTop = Number(wa.safeAreaInset?.top) || 0;
      const cBot = Number(wa.contentSafeAreaInset?.bottom) || 0;
      const sBot = Number(wa.safeAreaInset?.bottom) || 0;
      const isIOS = wa.platform === 'ios' || /iPhone|iPad|iPod/i.test(navigator.userAgent);

      let top = 0;
      if (cTop > 0) {
        top = Math.max(cTop + 6, 86);
      } else if (sTop > 0) {
        top = Math.max(sTop + 30, 86);
      } else {
        top = isIOS ? 86 : 56;
      }

      const bot = Math.max(cBot, sBot, 0);
      document.documentElement.style.setProperty('--twa-safe-top', `${top}px`);
      document.documentElement.style.setProperty('--twa-safe-bottom', `${bot}px`);

      const bar = document.querySelector<HTMLElement>('.topbar');
      if (bar) {
        document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
      }
    };

    tryEnterFullscreen();
    syncInsets();

    const t1 = setTimeout(() => { tryEnterFullscreen(); syncInsets(); }, 150);
    const t2 = setTimeout(() => { tryEnterFullscreen(); syncInsets(); }, 500);
    const t3 = setTimeout(() => { tryEnterFullscreen(); syncInsets(); }, 1000);

    let hasRequestedOnTap = false;
    const onFirstGesture = () => {
      if (!hasRequestedOnTap) {
        hasRequestedOnTap = true;
        tryEnterFullscreen();
        syncInsets();
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('touchstart', onFirstGesture, { passive: true });

    wa.onEvent?.('safeAreaChanged', syncInsets);
    wa.onEvent?.('contentSafeAreaChanged', syncInsets);
    wa.onEvent?.('fullscreenChanged', syncInsets);
    wa.onEvent?.('viewportChanged', syncInsets);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
      try {
        wa.offEvent?.('safeAreaChanged', syncInsets);
        wa.offEvent?.('contentSafeAreaChanged', syncInsets);
        wa.offEvent?.('fullscreenChanged', syncInsets);
        wa.offEvent?.('viewportChanged', syncInsets);
      } catch {}
    };
  }, []);

  // высота шапки меняется при переносе строк — карточки и списки отступают от неё
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!sceneReady) return;
    const t = setTimeout(() => setLoaderGone(true), 400); // время на плавное исчезновение
    return () => clearTimeout(t);
  }, [sceneReady]);

  useEffect(() => {
    ds.start();
    return () => ds.stop();
  }, [ds]);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth > 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // выбранный станок — в адресе (?eq=oven-1), чтобы ссылкой можно было поделиться
  useEffect(() => {
    const url = new URL(location.href);
    if (selectedId) url.searchParams.set('eq', selectedId);
    else url.searchParams.delete('eq');
    history.replaceState(null, '', url);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // повторный клик по выбранному станку закрывает карточку — камера плавно возвращается назад
  const toggle = (next: NonNullable<Selection>) => {
    setCustomFocus(null);
    setSelection((cur) => (cur && cur.kind === next.kind && cur.id === next.id ? null : next));
  };
  const select = useCallback((id: string) => toggle({ kind: 'machine', id }), []);
  const selectLine = useCallback((id: string) => toggle({ kind: 'line', id }), []);
  const selectPanel = useCallback(() => toggle({ kind: 'panel', id: 'panel' }), []);
  const selectVehicle = useCallback((id: string) => toggle({ kind: 'vehicle', id }), []);
  const selectGas = useCallback(() => toggle({ kind: 'gas', id: 'gas' }), []);
  const deselect = useCallback(() => {
    setCustomFocus(null);
    setSelection(null);
  }, []);
  const selected = effectiveConfig.equipment.find((e) => e.id === selectedId) ?? null;
  const selectedLineEq = effectiveConfig.equipment.find((e) => e.id === selectedLineId) ?? null;

  const handleFloorChange = useCallback((f: 'all' | 1 | 2) => {
    setFloorFilter(f);
    setSelection(null);
    if (f === 2) {
      setCustomFocus({ key: `mezzanine-${Date.now()}`, x: -10, z: -2, lookY: 3.5, dist: 30, dir: [-0.15, 0.65, 0.75] });
    } else if (f === 1) {
      setCustomFocus({ key: `floor1-${Date.now()}`, x: 0, z: 0, lookY: 1.0, dist: 38, dir: [-0.14, 0.7, 0.7] });
    } else {
      setCustomFocus(null);
      setViewToken((v) => v + 1);
    }
  }, []);

  const focus = useMemo<CameraFocus | null>(() => {
    // В режиме «📐 Планировка» при выборе станка камера не подлетает вплотную, чтобы не мешать перетаскиванию по сетке
    if (!selection || (layoutMode && selection.kind === 'machine')) return customFocus;
    const config = effectiveConfig;
    if (selection.kind === 'vehicle') return vehicleFocus(config, selection.id);
    if (selection.kind === 'gas' && config.gas) {
      const m = config.gas.meter.position;
      // слева спереди: справа счётчик закрывает соседний станок
      return { key: 'gas', x: m.x + 0.3, z: m.z + 0.6, lookY: 1.9, dist: 6, dir: [-0.75, 0.5, 1] };
    }
    if (selection.kind === 'panel' && config.power) {
      const p = config.power.panel.position;
      return { key: 'panel', x: p.x, z: p.z + 0.6, lookY: 1.5, dist: 6 };
    }
    const eq = config.equipment.find((e) => e.id === selection.id);
    if (!eq) return null;
    const h = (SPECS[eq.kind] ?? SPECS.generic).height;
    if (selection.kind === 'line') {
      // между станком и точкой лотка, к которой идёт его кабель
      const b = backOf(eq);
      const t = projectOnPolyline(trayOf(config), b.x, b.z);
      return { key: `line:${eq.id}`, x: (t.x + eq.position.x) / 2, z: (t.z + eq.position.z) / 2, lookY: 2.1, dist: 7.5 };
    }
    const baseY = eq.position.y ?? 0;
    if (eq.kind === 'silo') {
      return {
        key: `machine:${eq.id}`,
        x: eq.position.x,
        z: eq.position.z,
        lookY: baseY + h * 0.48,
        dist: 8.8,
        dir: [0.06, 0.22, 0.97],
      };
    }
    if (eq.id === 'mixer-1' || eq.id === 'mixer-2') {
      // Тестомесы стоят под антресолью 2-го этажа — смотрим с более пологого угла снизу, чтобы пол антресоли не закрывал обзор
      return {
        key: `machine:${eq.id}`,
        x: eq.position.x,
        z: eq.position.z,
        lookY: baseY + h * 0.45,
        dist: 4.8,
        dir: [0.35, 0.18, 0.92],
      };
    }
    return { key: `machine:${eq.id}`, x: eq.position.x, z: eq.position.z, lookY: baseY + h * 0.45, dist: 4.6 + h * 1.6 };
  }, [effectiveConfig, selection, customFocus, layoutMode]);

  return (
    <DataSourceContext.Provider value={ds}>
      <div className="app">
        <Header
          showLabels={showLabels}
          listOpen={listOpen}
          onToggleLabels={() => setShowLabels((v) => !v)}
          onToggleList={() => setListOpen((v) => !v)}
          energyOpen={energyOpen}
          onOpenEnergy={() => setEnergyOpen(true)}
          supplyOpen={supplyTab !== null}
          onOpenSupply={ds.config.supply ? () => setSupplyTab('overview') : undefined}
          linesVisible={showLines}
          onToggleLines={() => setShowLines((v) => !v)}
          gasOpen={selection?.kind === 'gas'}
          onOpenGas={ds.config.gas ? selectGas : undefined}
          floorFilter={floorFilter}
          onFloorChange={handleFloorChange}
          isNight={isNight}
          onToggleNight={() => setIsNight((v) => !v)}
          layoutMode={layoutMode}
          onToggleLayout={() => {
            setLayoutMode((v) => {
              const next = !v;
              if (next) {
                setShowLines(true);
                if (!selectedId && effectiveConfig.equipment[0]) {
                  setSelection({ kind: 'machine', id: effectiveConfig.equipment[0].id });
                }
              }
              return next;
            });
          }}
          latestOrder={latestOrder}
          onOpenOrder={() => setShowOrderToast(true)}
          productionActive={prodState.status === 'running' || prodState.status === 'paused'}
          onToggleProduction={() => {
            if (prodState.status === 'idle' || prodState.status === 'completed') {
              setSelection(null);
              setCameraFollowProd(true);
              prodManager.start();
            } else if (prodState.status === 'running') {
              prodManager.pause();
            } else {
              prodManager.resume();
            }
          }}
          onResetView={() => {
            setSelection(null);
            setCustomFocus(null);
            setViewToken((v) => v + 1);
          }}
        />
        <Scene
          config={effectiveConfig}
          selectedId={selected?.id ?? null}
          selectedLineId={selectedLineEq?.id ?? null}
          panelSelected={selection?.kind === 'panel'}
          showLines={showLines}
          focus={focus}
          onSelectLine={selectLine}
          onSelectPanel={selectPanel}
          showLabels={showLabels}
          viewToken={viewToken}
          cardOffset={!selection || layoutMode ? NO_OFFSET : wide ? SIDE_CARD_OFFSET : BOTTOM_SHEET_OFFSET}
          onSelect={select}
          onDeselect={deselect}
          onReady={() => setSceneReady(true)}
          onOpenSupply={ds.config.supply ? setSupplyTab : undefined}
          selectedVehicle={selection?.kind === 'vehicle' ? selection.id : null}
          onSelectVehicle={selectVehicle}
          gasSelected={selection?.kind === 'gas'}
          onSelectGas={selectGas}
          floorFilter={floorFilter}
          isMobile={!wide}
          activeFlourTransfer={prodState.status === 'running' && prodState.currentStepId === 'flour_transfer'}
          onUserInteract={() => setCameraFollowProd(false)}
          isNight={isNight}
          layoutMode={layoutMode}
          onMoveEquipment={moveEquipment}
        />
        {layoutMode && (
          <LayoutToolbar
            baseConfig={ds.config}
            effectiveConfig={effectiveConfig}
            overrides={layoutOverrides}
            selectedId={selectedId}
            onSelectMachine={(id) => setSelection({ kind: 'machine', id })}
            onRotateMachine={rotateEquipment}
            onNudgeMachine={nudgeEquipment}
            onResetMachine={resetEquipment}
            onResetAll={() => setLayoutOverrides({})}
            onClose={() => setLayoutMode(false)}
          />
        )}
        <ProductionControl
          state={prodState}
          onPause={() => prodManager.pause()}
          onResume={() => prodManager.resume()}
          onSkip={() => prodManager.skip()}
          onStop={() => {
            prodManager.stop();
            setCustomFocus(null);
            setViewToken((v) => v + 1);
          }}
          cameraFollow={cameraFollowProd}
          onToggleCameraFollow={() => setCameraFollowProd((v) => !v)}
          onSetSpeed={(spd) => prodManager.setSpeed(spd)}
        />
        {energyOpen && <EnergyPanel onClose={() => setEnergyOpen(false)} />}
        {supplyTab && <SupplyPanel initialTab={supplyTab} onClose={() => setSupplyTab(null)} />}
        {!loaderGone && <LoadingScreen leaving={sceneReady} />}
        {selected && <EquipmentCard key={selected.id} eq={selected} onClose={deselect} />}
        {selectedLineEq && <LineCard key={`line-${selectedLineEq.id}`} eq={selectedLineEq} onClose={deselect} onOpenMachine={() => select(selectedLineEq.id)} />}
        {selection?.kind === 'panel' && <PanelCard onClose={deselect} onOpenLine={selectLine} />}
        {selection?.kind === 'gas' && <GasCard onClose={deselect} />}
        {selection?.kind === 'vehicle' && <VehicleCard key={selection.id} id={selection.id} onClose={deselect} onOpenSupply={setSupplyTab} />}
        {listOpen && (
          <EquipmentList
            config={ds.config}
            selectedId={selectedId}
            onSelect={(id) => {
              select(id);
              if (!wide) setListOpen(false);
            }}
          />
        )}
        {!listOpen && <GestureHint />}
        <TimeMachine onSelectMachine={(id) => setSelection({ kind: 'machine', id })} />
        <div className="legend" aria-label="Обозначения сигнальных колонн">
          {STATUS_ORDER.map((s) => (
            <span key={s}>
              <StatusIcon status={s} size={12} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
        <TelegramOrderToast
          order={showOrderToast ? latestOrder : null}
          onClose={() => setShowOrderToast(false)}
          onShowOven={() => setSelection({ kind: 'machine', id: 'oven-1' })}
          onShowTruck={() => setSelection({ kind: 'vehicle', id: 'van-1' })}
          onShowSupply={ds.config.supply ? () => setSupplyTab('goods') : undefined}
          onResetView={() => {
            setSelection(null);
            setCustomFocus(null);
            setViewToken((v) => v + 1);
          }}
        />
      </div>
    </DataSourceContext.Provider>
  );
}
