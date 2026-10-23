import type { DataSource } from './DataSource';
import type { TelegramOrder } from '@bakery/shared';

/**
 * Подключает слушатель заказов из Telegram к DataSource:
 * 1. Через встроенный в Vite HMR WebSocket (при разработке)
 * 2. Через периодический опрос /api/orders
 */
export function setupTelegramBridge(
  ds: DataSource,
  onNewOrder?: (order: TelegramOrder) => void,
): () => void {
  const processedOrders = new Set<string>();

  const handleOrder = (order: TelegramOrder) => {
    if (!order || !order.orderId || processedOrders.has(order.orderId)) return;
    processedOrders.add(order.orderId);
    ds.dispatchTelegramOrder?.(order);
    onNewOrder?.(order);
  };

  // 1. Vite HMR event listener
  if (import.meta.hot) {
    import.meta.hot.on('telegram-order', (data: unknown) => {
      handleOrder(data as TelegramOrder);
    });
  }

  // 2. Fetch recent orders and polling fallback (local dev & cloud production)
  let active = true;
  const endpoints = [
    '/api/orders',
    'https://trend-bakery-bot.vercel.app/api/order',
  ];

  const poll = async () => {
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const list = (await res.json()) as TelegramOrder[];
          if (Array.isArray(list)) {
            for (const ord of list) {
              handleOrder(ord);
            }
          }
        }
      } catch {
        // оффлайн или без эндпоинта
      }
    }
  };

  poll();
  const timer = setInterval(() => {
    if (active) poll();
  }, 4000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}
