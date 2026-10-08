import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataSourceContext, createDataSource } from './data/store';
import { Scene } from './scene/Scene';
import { EquipmentCard } from './ui/EquipmentCard';
import { EquipmentList } from './ui/EquipmentList';
import { Header } from './ui/Header';
import { STATUS_LABEL, STATUS_ORDER } from './ui/statusMeta';
import { StatusIcon } from './ui/StatusIcon';
import { GestureHint } from './ui/GestureHint';

const NO_OFFSET: [number, number] = [0, 0];
const SIDE_CARD_OFFSET: [number, number] = [1.1, 0];
const BOTTOM_SHEET_OFFSET: [number, number] = [0, 2.0];

export function App() {
  const ds = useMemo(() => createDataSource(), []);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('eq'));
  const [showLabels, setShowLabels] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [viewToken, setViewToken] = useState(0);
  const [wide, setWide] = useState(() => window.innerWidth > 760);

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
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const deselect = useCallback(() => setSelectedId(null), []);
  const selected = ds.config.equipment.find((e) => e.id === selectedId) ?? null;

  return (
    <DataSourceContext.Provider value={ds}>
      <div className="app">
        <Header
          showLabels={showLabels}
          listOpen={listOpen}
          onToggleLabels={() => setShowLabels((v) => !v)}
          onToggleList={() => setListOpen((v) => !v)}
          onResetView={() => {
            setSelectedId(null);
            setViewToken((v) => v + 1);
          }}
        />
        <Scene
          config={ds.config}
          selectedId={selected?.id ?? null}
          showLabels={showLabels}
          viewToken={viewToken}
          cardOffset={!selected ? NO_OFFSET : wide ? SIDE_CARD_OFFSET : BOTTOM_SHEET_OFFSET}
          onSelect={select}
          onDeselect={deselect}
        />
        {selected && <EquipmentCard key={selected.id} eq={selected} onClose={deselect} />}
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
