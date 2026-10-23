import type { EquipmentConfig } from './types';

export interface TelegramOrderItem {
  name: string;
  quantity: number;
  price?: number;
}

export interface TelegramOrder {
  orderId: string;
  clientName: string;
  phone?: string;
  address?: string;
  payment?: string;
  total: number;
  items: TelegramOrderItem[];
  createdAt: number;
}

/** Сопоставление названий товаров из каталога Telegram Mini App с ID в config/equipment.json */
export const TELEGRAM_PRODUCT_MAP: Record<string, string> = {
  'Круассан классический': 'croissant',
  'Круассан': 'croissant',
  'Хлеб на закваске': 'ciabatta',
  'Чиабатта': 'ciabatta',
  'Багет': 'baguette',
  'Хлеб тостовый': 'toast',
  'Булочка для бургера': 'burger-bun',
};

/**
 * Преобразует позиции заказа из Telegram в ID продукции цеха.
 */
export function resolveOrderProductIds(items: TelegramOrderItem[]): { productId: string; name: string; quantity: number }[] {
  return items.map((it) => {
    const productId = TELEGRAM_PRODUCT_MAP[it.name] ?? 'croissant';
    return { productId, name: it.name, quantity: it.quantity };
  });
}

/**
 * Находит станки (печи и тестомесы), которые должны взять заказ в работу.
 */
export function findMachinesForOrder(
  equipment: EquipmentConfig[],
  productIds: string[],
): { mixer?: EquipmentConfig; oven?: EquipmentConfig } {
  const mixers = equipment.filter((e) => e.kind === 'mixer');
  const ovens = equipment.filter((e) => e.kind === 'oven');

  return {
    mixer: mixers[0],
    oven: ovens[0],
  };
}

/**
 * Формирует человекочитаемую строку заказа для отображения на станке.
 */
export function formatMachineOrderText(order: TelegramOrder): string {
  const itemsText = order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');
  const client = order.clientName ? ` (${order.clientName})` : '';
  return `${order.orderId}: ${itemsText}${client}`;
}
