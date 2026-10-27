import { useMemo, useState } from 'react';
import type { SiteConfig } from '@bakery/shared';
import { buildRoutes } from '../scene/powerRoutes';
import { calcCableDrop, type EquipmentPlacement } from '../scene/layoutMath';
import { AnimatedNumber } from './AnimatedNumber';

export interface LayoutToolbarProps {
  baseConfig: SiteConfig;
  effectiveConfig: SiteConfig;
  overrides: Record<string, EquipmentPlacement>;
  selectedId: string | null;
  onSelectMachine: (id: string) => void;
  onRotateMachine: (id: string, deltaRad: number) => void;
  onNudgeMachine: (id: string, dx: number, dz: number) => void;
  onResetMachine: (id: string) => void;
  onResetAll: () => void;
  onClose: () => void;
}

/**
 * Панель конструктора планировки цеха («📐 Планировка»):
 * - управление выбранным станком (поворот на 90°, точный сдвиг по сетке 0,5 м);
 * - живой пересчёт длины кабеля от ЩР-1 и потери напряжения ΔU;
 * - экспорт готового JSON-блока для config/equipment.json в буфер обмена.
 */
export function LayoutToolbar({
  baseConfig,
  effectiveConfig,
  overrides,
  selectedId,
  onSelectMachine,
  onRotateMachine,
  onNudgeMachine,
  onResetMachine,
  onResetAll,
  onClose,
}: LayoutToolbarProps) {
  const [copied, setCopied] = useState(false);

  const activeId = selectedId ?? effectiveConfig.equipment[0]?.id ?? null;
  const activeEq = useMemo(
    () => (activeId ? effectiveConfig.equipment.find((e) => e.id === activeId) ?? null : null),
    [effectiveConfig.equipment, activeId],
  );
  const baseEq = useMemo(
    () => (activeId ? baseConfig.equipment.find((e) => e.id === activeId) ?? null : null),
    [baseConfig.equipment, activeId],
  );

  const metrics = useMemo(() => {
    if (!activeEq || !baseEq) return null;
    const idx = Math.max(1, effectiveConfig.equipment.findIndex((e) => e.id === activeEq.id) + 1);
    const curRoutes = buildRoutes(effectiveConfig);
    const baseRoutes = buildRoutes(baseConfig);
    const curLen = curRoutes.find((r) => r.equipmentId === activeEq.id)?.length ?? 0;
    const baseLen = baseRoutes.find((r) => r.equipmentId === activeEq.id)?.length ?? 0;
    const drop = calcCableDrop(activeEq, curLen, idx);
    return {
      ...drop,
      deltaLenM: curLen - baseLen,
    };
  }, [activeEq, baseEq, effectiveConfig, baseConfig]);

  const changedCount = Object.keys(overrides).length;
  const isCurrentChanged = Boolean(activeId && overrides[activeId]);
  const deg = activeEq ? Math.round((((activeEq.rotationY ?? 0) * 180) / Math.PI) % 360) : 0;

  const handleCopyJson = async () => {
    const payload = effectiveConfig.equipment.map((eq) => ({
      id: eq.id,
      name: eq.name,
      position: eq.position,
      ...(eq.rotationY ? { rotationY: Number(eq.rotationY.toFixed(4)) } : {}),
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Резервный вариант, если clipboard API недоступен
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(payload, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <section
      aria-label="Конструктор 3D-планировки цеха"
      style={{
        position: 'absolute',
        zIndex: 25,
        left: 16,
        top: 'calc(var(--topbar-h, 68px) + 12px)',
        width: 'min(420px, calc(100vw - 32px))',
        background: 'rgba(252, 252, 251, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(37, 99, 235, 0.35)',
        borderRadius: 14,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.14)',
        padding: '12px 14px',
        color: 'var(--text-primary, #191918)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14 }}>
          <span>📐</span>
          <span>Конструктор планировки (шаг 0,5 м)</span>
        </div>
        <button type="button" className="card-close" onClick={onClose} aria-label="Выйти из режима планировки">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary, #5a5955)', marginBottom: 10 }}>
        Зажмите станок в 3D-сцене и перетащите по сетке <b>0,5 м</b> (с клавишей <b>Shift</b> — шаг <b>0,1 м</b>). Трасса кабеля от ЩР-1 перестраивается на лету.
      </div>

      {/* Выбор агрегата и кнопки поворота */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <select
          aria-label="Выбор станка для перестановки"
          value={activeId ?? ''}
          onChange={(e) => onSelectMachine(e.target.value)}
          style={{
            flex: 1,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--border, #d8d6d0)',
            background: '#fff',
            padding: '0 8px',
            font: 'inherit',
            fontWeight: 600,
          }}
        >
          {effectiveConfig.equipment.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name} {overrides[eq.id] ? '• изменён' : ''}
            </option>
          ))}
        </select>
        {activeId && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => onRotateMachine(activeId, -Math.PI / 2)}
              title="Повернуть станок на −90°"
            >
              ↺ −90°
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onRotateMachine(activeId, Math.PI / 2)}
              title="Повернуть станок на +90°"
            >
              ↻ +90°
            </button>
          </>
        )}
      </div>

      {/* Живые координаты, сдвиг по осям и расчёт кабельной линии */}
      {activeEq && metrics && (
        <div
          style={{
            background: 'var(--surface-2, #f3f2ee)',
            borderRadius: 10,
            padding: '9px 11px',
            marginBottom: 10,
            display: 'grid',
            gap: 6,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span>
              Координаты: <b>X {activeEq.position.x.toFixed(1).replace('.', ',')} м</b> · <b>Z {activeEq.position.z.toFixed(1).replace('.', ',')} м</b> · <b>{deg}°</b>
            </span>
            <div style={{ display: 'inline-flex', gap: 3 }}>
              <button type="button" className="btn" style={{ height: 24, padding: '0 7px' }} onClick={() => onNudgeMachine(activeEq.id, -0.5, 0)} title="Сдвинуть влево (X −0,5 м)">
                ←
              </button>
              <button type="button" className="btn" style={{ height: 24, padding: '0 7px' }} onClick={() => onNudgeMachine(activeEq.id, 0.5, 0)} title="Сдвинуть вправо (X +0,5 м)">
                →
              </button>
              <button type="button" className="btn" style={{ height: 24, padding: '0 7px' }} onClick={() => onNudgeMachine(activeEq.id, 0, -0.5)} title="Сдвинуть к задней стене (Z −0,5 м)">
                ↑
              </button>
              <button type="button" className="btn" style={{ height: 24, padding: '0 7px' }} onClick={() => onNudgeMachine(activeEq.id, 0, 0.5)} title="Сдвинуть к двору (Z +0,5 м)">
                ↓
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 6 }}>
            <span>Трасса кабеля ({metrics.cableLabel}):</span>
            <strong>
              <AnimatedNumber value={metrics.lengthM} format={(v) => v.toFixed(1).replace('.', ',')} suffix=" м" />
              {Math.abs(metrics.deltaLenM) >= 0.05 && (
                <span style={{ marginLeft: 5, color: metrics.deltaLenM > 0 ? '#d97706' : '#16a34a', fontSize: 12 }}>
                  ({metrics.deltaLenM > 0 ? '+' : ''}
                  {metrics.deltaLenM.toFixed(1).replace('.', ',')} м)
                </span>
              )}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Падение напряжения ΔU ({metrics.currentA.toFixed(0)} А):</span>
            <strong style={{ color: metrics.dropPct > 4 ? '#dc2626' : '#15803d' }}>
              <AnimatedNumber value={metrics.dropV} format={(v) => v.toFixed(2).replace('.', ',')} suffix=" В" /> (
              <AnimatedNumber value={metrics.dropPct} format={(v) => v.toFixed(2).replace('.', ',')} suffix=" %" />)
            </strong>
          </div>
        </div>
      )}

      {/* Действия: копирование JSON и сброс */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={handleCopyJson}
          style={{
            background: copied ? '#16a34a' : '#2563eb',
            color: '#fff',
            borderColor: 'transparent',
            fontWeight: 650,
          }}
        >
          {copied ? '✓ Скопировано в буфер!' : '📋 Скопировать JSON'}
        </button>
        {isCurrentChanged && activeId && (
          <button type="button" className="btn" onClick={() => onResetMachine(activeId)}>
            Вернуть станок
          </button>
        )}
        {changedCount > 0 && (
          <button type="button" className="btn" onClick={onResetAll}>
            Сбросить всё ({changedCount})
          </button>
        )}
      </div>
    </section>
  );
}
