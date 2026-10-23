import { useEffect, useState } from 'react';
import type { TelegramOrder } from '@bakery/shared';

function playBakeryBell() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Мягкий гармоничный звук колокольчика пекарни (мажорная терция C6-E6)
    const playTone = (freq: number, start: number, dur: number, gainVal: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(gainVal, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };

    playTone(1046.5, now, 0.45, 0.12); // C6
    playTone(1318.5, now + 0.08, 0.55, 0.15); // E6
  } catch {
    // аудио блокируется браузером до первого клика пользователя
  }
}

export function TelegramOrderToast({
  order,
  onClose,
  onShowOven,
  onShowTruck,
  onShowSupply,
  onResetView,
}: {
  order: TelegramOrder | null;
  onClose: () => void;
  onShowOven: () => void;
  onShowTruck: () => void;
  onShowSupply?: () => void;
  onResetView?: () => void;
}) {
  const [activeStep, setActiveStep] = useState<2 | 4>(2);

  useEffect(() => {
    if (order) {
      playBakeryBell();
      setActiveStep(2);
    }
  }, [order?.orderId]);

  if (!order) return null;

  const itemsSummary = order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');

  return (
    <div className="order-hub-container" role="region" aria-label="Уведомление о заказе">
      <div className="order-hub">
        <div className="order-hub-header">
          <div className="order-hub-brand">
            <span className="order-hub-badge">
              <span>🥐</span>
              <span>Заказ {order.orderId}</span>
            </span>
            <span className="order-hub-title">{order.clientName || 'Покупатель из Telegram'}</span>
          </div>
          <div className="order-hub-total">
            {order.total.toLocaleString('ru-RU')} сум
          </div>
          <button
            type="button"
            className="order-hub-close"
            onClick={onClose}
            title="Закрыть уведомление"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="order-hub-body">
          <div className="order-hub-items">
            🛒 {itemsSummary}
          </div>
          <div className="order-hub-client">
            📍 {order.address || 'Ташкент'} {order.phone ? `· ${order.phone}` : ''}
          </div>
        </div>

        {/* Интерактивный 4-этапный трекер цеха */}
        <div className="order-pipeline">
          <div className="order-step is-done" title="Заказ успешно принят из Telegram Mini App">
            <span className="order-step-icon">📥</span>
            <span>1. Принят</span>
          </div>

          <div
            className={`order-step${activeStep === 2 ? ' is-active' : ''}`}
            onClick={() => {
              setActiveStep(2);
              onShowOven();
            }}
            title="Нажмите, чтобы увидеть печь oven-1 в 3D"
          >
            <span className="order-step-icon">🔥</span>
            <span>2. Печь oven-1</span>
          </div>

          <div
            className="order-step"
            onClick={onShowSupply}
            title="Нажмите, чтобы открыть цепочку поставок и упаковку"
          >
            <span className="order-step-icon">📦</span>
            <span>3. Упаковка</span>
          </div>

          <div
            className={`order-step${activeStep === 4 ? ' is-active' : ''}`}
            onClick={() => {
              setActiveStep(4);
              onShowTruck();
            }}
            title="Нажмите, чтобы увидеть фургон van-1 у рампы"
          >
            <span className="order-step-icon">🚚</span>
            <span>4. Фургон van-1</span>
          </div>
        </div>

        <div className="order-hub-actions">
          <button
            type="button"
            className={`order-btn${activeStep === 2 ? ' order-btn-primary' : ''}`}
            onClick={() => {
              setActiveStep(2);
              onShowOven();
            }}
          >
            <span>🔥</span>
            <span>К печи (oven-1)</span>
          </button>

          <button
            type="button"
            className={`order-btn${activeStep === 4 ? ' order-btn-primary' : ''}`}
            onClick={() => {
              setActiveStep(4);
              onShowTruck();
            }}
          >
            <span>🚚</span>
            <span>К рампе (van-1)</span>
          </button>

          {onResetView && (
            <button
              type="button"
              className="order-btn"
              onClick={onResetView}
              title="Вернуться к общему виду цеха"
            >
              <span>🗺</span>
              <span>Общий вид</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
