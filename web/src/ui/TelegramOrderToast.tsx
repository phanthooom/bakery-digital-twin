import { useEffect } from 'react';
import type { TelegramOrder } from '@bakery/shared';

function playOrderChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Нота 1: E5 (659.25 Гц)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Нота 2: G#5 (830.61 Гц)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.setValueAtTime(830.61, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // аудио заблокировано политикой браузера до первого клика
  }
}

export function TelegramOrderToast({
  order,
  onClose,
  onShowOven,
  onShowTruck,
}: {
  order: TelegramOrder | null;
  onClose: () => void;
  onShowOven: () => void;
  onShowTruck: () => void;
}) {
  useEffect(() => {
    if (order) {
      playOrderChime();
    }
  }, [order?.orderId]);

  if (!order) return null;

  const itemsSummary = order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(var(--topbar-h, 56px) + 16px)',
        right: '20px',
        zIndex: 9999,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))',
        border: '2px solid #38bdf8',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.45)',
        borderRadius: '14px',
        padding: '16px 20px',
        maxWidth: '420px',
        width: 'calc(100% - 40px)',
        color: '#f8fafc',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', fontSize: '15px' }}>
          <span style={{ fontSize: '18px' }}>🛒</span>
          <span>ЖИВОЙ ЗАКАЗ ИЗ TELEGRAM</span>
          <span
            style={{
              fontSize: '12px',
              background: '#0284c7',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: 800,
              letterSpacing: '0.5px',
            }}
          >
            {order.orderId}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            borderRadius: '50%',
            width: '26px',
            height: '26px',
            display: 'grid',
            placeContent: 'center',
          }}
          title="Скрыть"
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '14px', color: '#f1f5f9', marginBottom: '4px', fontWeight: 600 }}>
        👤 {order.clientName || 'Покупатель'}
        {order.phone ? ` · 📞 ${order.phone}` : ''}
      </div>

      <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
        📍 {order.address || 'Ташкент'}
      </div>

      <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', borderLeft: '3px solid #38bdf8' }}>
        <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>
          {itemsSummary}
        </div>
        <div style={{ fontSize: '14px', color: '#facc15', fontWeight: 700, marginTop: '4px' }}>
          Итого: {order.total.toLocaleString('ru-RU')} сум
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onShowOven}
          style={{
            flex: '1 1 auto',
            background: 'linear-gradient(135deg, #ea580c, #c2410c)',
            border: 'none',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.4)',
          }}
        >
          <span>🔥</span>
          <span>Печь (oven-1)</span>
        </button>
        <button
          type="button"
          onClick={onShowTruck}
          style={{
            flex: '1 1 auto',
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            border: 'none',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
          }}
        >
          <span>🚚</span>
          <span>Фургон (van-1)</span>
        </button>
      </div>
    </div>
  );
}
