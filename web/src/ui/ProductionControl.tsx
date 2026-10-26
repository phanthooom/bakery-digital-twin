import type { ProductionCycleState } from '@bakery/shared';

export interface ProductionControlProps {
  state: ProductionCycleState;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
  cameraFollow: boolean;
  onToggleCameraFollow: () => void;
  onSetSpeed: (speed: number) => void;
}

export function ProductionControl({
  state,
  onPause,
  onResume,
  onSkip,
  onStop,
  cameraFollow,
  onToggleCameraFollow,
  onSetSpeed,
}: ProductionControlProps) {
  if (state.status === 'idle') return null;

  const isPaused = state.status === 'paused';
  const isCompleted = state.status === 'completed';
  const step = state.activeStep;

  return (
    <aside className="production-control" aria-label="Панель управления сквозным производственным циклом">
      <div className="prod-header">
        <div className="prod-title-group">
          <span className="prod-badge-pulse" aria-hidden />
          <span className="prod-title">
            {isCompleted ? 'Партия готова к отгрузке' : step?.stageName ?? 'Производство'}
          </span>
          <span className="prod-batch">{state.batchNumber}</span>
        </div>

        <div className="prod-actions-top">
          <button
            type="button"
            className={`btn-cam${cameraFollow ? ' is-active' : ''}`}
            onClick={onToggleCameraFollow}
            title={cameraFollow ? 'Камера следует за этапом (клик — отключить)' : 'Включить следование камеры за этапом'}
          >
            <span>🎥</span>
            <span>{cameraFollow ? 'Следит' : 'Камера'}</span>
          </button>
          <button
            type="button"
            className="btn-prod-close"
            onClick={onStop}
            title="Остановить цикл"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="prod-description">
        {isCompleted
          ? 'Сквозной цикл производства успешно завершён: багеты выпечены, упакованы и переданы в рейс фургону van-1.'
          : step?.description ?? ''}
      </div>

      <div className="prod-progress-block">
        <div className="prod-progress-labels">
          <span>{isCompleted ? 'Все этапы завершены' : `Этап ${state.currentStepIndex + 1} из 6`}</span>
          <span>{Math.round(state.totalProgress * 100)}% всего цикла</span>
        </div>
        <div className="prod-progress-bar">
          <div className="prod-progress-fill" style={{ width: `${Math.round(state.stepProgress * 100)}%` }} />
        </div>
      </div>

      <div className="prod-controls-row">
        {!isCompleted ? (
          <>
            <button
              type="button"
              className="btn btn-prod-primary"
              onClick={isPaused ? onResume : onPause}
            >
              <span>{isPaused ? '▶ Продолжить' : '⏸ Пауза'}</span>
            </button>
            <button
              type="button"
              className="btn btn-prod-sec"
              onClick={onSkip}
              title="Перейти к следующему этапу"
            >
              <span>Пропустить ⏭</span>
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-prod-primary" onClick={onStop}>
            <span>Завершить ⏹</span>
          </button>
        )}

        <div className="prod-speed-group" role="group" aria-label="Скорость демонстрации">
          {[1, 2, 4].map((spd) => (
            <button
              key={spd}
              type="button"
              className={`btn-spd${state.speed === spd ? ' is-active' : ''}`}
              onClick={() => onSetSpeed(spd)}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
