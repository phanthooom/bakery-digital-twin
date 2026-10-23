import { useEffect, useState } from 'react';
import type { TelegramOrder } from '@bakery/shared';

export function TelegramOrderToast({
  order,
  onClose,
  onClick,
}: {
  order: TelegramOrder | null;
  onClose: () => void;
  onClick?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!order) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 9000);
    return () => clearTimeout(timer);
  }, [order, onClose]);

  if (!order || !visible) return null;

  const itemsSummary = order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(var(--topbar-h, 56px) + 16px)',
        right: '16px',
        zIndex: 1000,
        background: 'rgba(20, 24, 33, 0.95)',
        border: '1px solid #3b82f6',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(59, 130, 246, 0.3)',
        borderRadius: '10px',
        padding: '12px 16px',
        maxWidth: '380px',
        color: '#f8fafc',
        backdropFilter: 'blur(8px)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#60a5fa' }}>
          <span>🛒</span>
          <span>Новый заказ из Telegram</span>
          <span style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
            {order.orderId}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            onClose();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '4px' }}>
        <strong>{order.clientName || 'Покупатель'}</strong>
        {order.address ? ` · ${order.address}` : ''}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
        {itemsSummary}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
        <span style={{ color: '#fbbf24', fontWeight: 600 }}>{order.total.toLocaleString('ru-RU')} сум</span>
        <span style={{ color: '#38bdf8', fontSize: '11px' }}>Печь готовит · Погрузка van-1 →</span>
      </div>
    </div>
  );
}
