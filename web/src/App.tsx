import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { DataSourceContext, createDataSource } from './data/store';
import type { CameraFocus } from './scene/CameraRig';
import { SPECS } from './scene/machines';
import { TRAY_FROM_WALL } from './scene/powerRoutes';
import { Scene } from './scene/Scene';
import { LineCard } from './ui/LineCard';
import { PanelCard } from './ui/PanelCard';
import { EquipmentCard } from './ui/EquipmentCard';
import { EquipmentList } from './ui/EquipmentList';
import { Header } from './ui/Header';
import { EnergyPanel } from './ui/EnergyPanel';
import { SupplyPanel } from './ui/SupplyPanel';
import type { SupplyTab } from './ui/supplyView';
import { STATUS_LABEL, STATUS_ORDER, applyStatusCssVars } from './ui/statusMeta';
import { StatusIcon } from './ui/StatusIcon';
import { GestureHint } from './ui/GestureHint';
import { LoadingScreen } from './ui/LoadingScreen';

const NO_OFFSET: [number, number] = [0, 0];
const SIDE_CARD_OFFSET: [number, number] = [1.1, 0];
const BOTTOM_SHEET_OFFSET: [number, number] = [0, 2.0];

type Selection = { kind: 'machine' | 'line'; id: string } | { kind: 'panel'; id: 'panel' } | null;

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

  useEffect(() => {
    applyStatusCssVars();
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
  const toggle = (next: NonNullable<Selection>) => setSelection((cur) => (cur && cur.kind === next.kind && cur.id === next.id ? null : next));
  const select = useCallback((id: string) => toggle({ kind: 'machine', id }), []);
  const selectLine = useCallback((id: string) => toggle({ kind: 'line', id }), []);
  const selectPanel = useCallback(() => toggle({ kind: 'panel', id: 'panel' }), []);
  const deselect = useCallback(() => setSelection(null), []);
  const selected = ds.config.equipment.find((e) => e.id === selectedId) ?? null;
  const selectedLineEq = ds.config.equipment.find((e) => e.id === selectedLineId) ?? null;

  const focus = useMemo<CameraFocus | null>(() => {
    const { config } = ds;
    if (!selection) return null;
    if (selection.kind === 'panel' && config.power) {
      const p = config.power.panel.position;
      return { key: 'panel', x: p.x, z: p.z + 0.6, lookY: 1.5, dist: 6 };
    }
    const eq = config.equipment.find((e) => e.id === selection.id);
    if (!eq) return null;
    const h = (SPECS[eq.kind] ?? SPECS.generic).height;
    if (selection.kind === 'line') {
      const trayZ = -config.site.hall.depth / 2 + TRAY_FROM_WALL;
      return { key: `line:${eq.id}`, x: eq.position.x, z: (trayZ + eq.position.z) / 2, lookY: 2.1, dist: 7.5 };
    }
    return { key: `machine:${eq.id}`, x: eq.position.x, z: eq.position.z, lookY: h * 0.45, dist: 4.6 + h * 1.6 };
  }, [ds, selection]);

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
          onResetView={() => {
            setSelection(null);
            setViewToken((v) => v + 1);
          }}
        />
        <Scene
          config={ds.config}
          selectedId={selected?.id ?? null}
          selectedLineId={selectedLineEq?.id ?? null}
          panelSelected={selection?.kind === 'panel'}
          showLines={showLines}
          focus={focus}
          onSelectLine={selectLine}
          onSelectPanel={selectPanel}
          showLabels={showLabels}
          viewToken={viewToken}
          cardOffset={!selection ? NO_OFFSET : wide ? SIDE_CARD_OFFSET : BOTTOM_SHEET_OFFSET}
          onSelect={select}
          onDeselect={deselect}
          onReady={() => setSceneReady(true)}
          onOpenSupply={ds.config.supply ? setSupplyTab : undefined}
        />
        {energyOpen && <EnergyPanel onClose={() => setEnergyOpen(false)} />}
        {supplyTab && <SupplyPanel initialTab={supplyTab} onClose={() => setSupplyTab(null)} />}
        {!loaderGone && <LoadingScreen leaving={sceneReady} />}
        {selected && <EquipmentCard key={selected.id} eq={selected} onClose={deselect} />}
        {selectedLineEq && <LineCard key={`line-${selectedLineEq.id}`} eq={selectedLineEq} onClose={deselect} onOpenMachine={() => select(selectedLineEq.id)} />}
        {selection?.kind === 'panel' && <PanelCard onClose={deselect} onOpenLine={selectLine} />}
        {listOpen && <EquipmentList config={ds.config} selectedId={selectedId} onSelect={select} />}
        {!listOpen && <GestureHint />}
        <div className="legend" aria-label="Обозначения сигнальных колонн">
          {STATUS_ORDER.map((s) => (
            <span key={s}>
              <StatusIcon status={s} size={12} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
    </DataSourceContext.Provider>
  );
}
