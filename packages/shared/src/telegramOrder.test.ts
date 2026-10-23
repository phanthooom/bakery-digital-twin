import { describe, expect, it } from 'vitest';
import {
  formatMachineOrderText,
  findMachinesForOrder,
  resolveOrderProductIds,
  TELEGRAM_PRODUCT_MAP,
  type TelegramOrder,
} from './telegramOrder';
import type { EquipmentConfig } from './types';

describe('Telegram Order Bridge (Интеграция заказов Telegram)', () => {
  const sampleOrder: TelegramOrder = {
    orderId: 'TG-1048',
    clientName: 'Алишер (@alisher_trend)',
    phone: '+998 90 123 45 67',
    address: 'ул. Навои, 14',
    total: 180000,
    items: [
      { name: 'Круассан классический', quantity: 10, price: 15000 },
      { name: 'Хлеб на закваске', quantity: 2, price: 20000 },
    ],
    createdAt: 1729674000000,
  };

  it('1. Маппинг товаров: сопоставляет названия из Telegram Mini App с ID продуктов цеха', () => {
    const resolved = resolveOrderProductIds(sampleOrder.items);
    expect(resolved).toEqual([
      { productId: 'croissant', name: 'Круассан классический', quantity: 10 },
      { productId: 'ciabatta', name: 'Хлеб на закваске', quantity: 2 },
    ]);
  });

  it('2. Форматирование строки заказа для карточки станка', () => {
    const text = formatMachineOrderText(sampleOrder);
    expect(text).toContain('TG-1048');
    expect(text).toContain('Круассан классический × 10');
    expect(text).toContain('Хлеб на закваске × 2');
    expect(text).toContain('Алишер (@alisher_trend)');
  });

  it('3. Подбор оборудования: выбирает тестомес и печь для обработки заказа', () => {
    const eqList: EquipmentConfig[] = [
      { id: 'mixer-1', name: 'Тестомес 1', kind: 'mixer', stage: 'mixing', nominalKw: 15, phases: 3, position: { x: 0, y: 0, z: 0 } },
      { id: 'oven-1', name: 'Печь 1', kind: 'oven', stage: 'baking', nominalKw: 36, phases: 3, position: { x: 5, y: 0, z: 0 } },
    ];

    const target = findMachinesForOrder(eqList, ['croissant', 'ciabatta']);
    expect(target.mixer?.id).toBe('mixer-1');
    expect(target.oven?.id).toBe('oven-1');
  });
});
