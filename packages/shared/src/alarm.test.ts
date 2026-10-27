import { describe, expect, it, vi } from 'vitest';
import { TwinEngine } from './engine';
import {
  AlarmNotifier,
  ALARM_REASON_LABELS,
  buildEquipmentUrl,
  formatAlarmReasons,
  type AlarmNotification,
} from './alarm';
import type { EquipmentState, Reading, SiteConfig } from './types';

const T0 = Date.UTC(2026, 9, 23, 10, 0, 0);

const testConfig: SiteConfig = {
  site: { name: 'Тестовая пекарня', timezone: 'Asia/Tashkent', hall: { width: 10, depth: 10, height: 4 } },
  thresholds: {
    offlineAfterSec: 30,
    idlePctOfNominal: 10,
    overloadPctOfNominal: 115,
    imbalanceAlarmPct: 40,
    imbalanceMinLoadPct: 30,
    ai: { windowMin: 15, minBaselineSamples: 10, deviationWarnPct: 15, anomalyPct: 40, historyDays: 7 },
  },
  stages: [{ id: 'baking', order: 1, label: '01', name: 'Выпечка', zone: { x0: -5, z0: -5, x1: 5, z1: 5 } }],
  equipment: [
    {
      id: 'oven-1',
      name: 'Печь ротационная 1',
      kind: 'oven',
      stage: 'baking',
      nominalKw: 36,
      phases: 3,
      position: { x: 0, y: 0, z: 0 },
    },
    {
      id: 'mixer-1',
      name: 'Тестомес спиральный',
      kind: 'mixer',
      stage: 'baking',
      nominalKw: 15,
      phases: 3,
      position: { x: 2, y: 0, z: 0 },
    },
  ],
};

const makeAlarmState = (
  id = 'oven-1',
  reasons: EquipmentState['reasons'] = ['overload'],
  ts = T0,
): EquipmentState => ({
  id,
  status: 'alarm',
  reasons,
  statusSince: ts,
  lastReading: { equipmentId: id, ts, powerKw: 50, currentsA: [75, 75, 75] },
  pctOfNominal: 138,
  imbalancePct: 0,
  ratedCurrentA: 57.7,
  ai_check: { state: 'ok', deviationPct: 0, baselineKw: 36, currentKw: 50, samples: 20, checkedAt: ts },
  updatedAt: ts,
});

const makeNormalState = (id = 'oven-1', ts = T0 + 5000): EquipmentState => ({
  id,
  status: 'running',
  reasons: [],
  statusSince: ts,
  lastReading: { equipmentId: id, ts, powerKw: 30, currentsA: [45, 45, 45] },
  pctOfNominal: 83,
  imbalancePct: 0,
  ratedCurrentA: 57.7,
  ai_check: { state: 'ok', deviationPct: 0, baselineKw: 36, currentKw: 30, samples: 20, checkedAt: ts },
  updatedAt: ts,
});

describe('Alarm Notifications (Уведомления об авариях)', () => {
  it('1. Формирование уведомления: корректные поля, имя станка из конфига, причины по-русски, ссылка и время', () => {
    const notifier = new AlarmNotifier(testConfig);
    const state = makeAlarmState('oven-1', ['overload'], T0);

    const notification = notifier.notify(state, T0);
    expect(notification).not.toBeNull();
    expect(notification?.equipmentId).toBe('oven-1');
    expect(notification?.equipmentName).toBe('Печь ротационная 1');
    expect(notification?.reasons).toEqual(['перегрузка']);
    expect(notification?.rawReasons).toEqual(['overload']);
    // ссылка открывает цех в момент начала аварии («Машина времени»)
    expect(notification?.url).toBe(`?eq=oven-1&t=${new Date(T0).toISOString().slice(0, 19)}Z`);
    expect(notification?.timestamp).toBe(T0);
    expect(notification?.message).toContain('Авария');
    expect(notification?.message).toContain('Печь ротационная 1');
    expect(notification?.message).toContain('перегрузка');
    expect(notification?.message).toContain('?eq=oven-1');
  });

  it('2. Словарь причин по GLOSSARY: корректно переводятся overload, phase_loss, imbalance, ai_anomaly, gas_leak, detector', () => {
    expect(ALARM_REASON_LABELS['overload']).toBe('перегрузка');
    expect(ALARM_REASON_LABELS['phase_loss']).toBe('обрыв фазы');
    expect(ALARM_REASON_LABELS['imbalance']).toBe('несимметрия фаз');
    expect(ALARM_REASON_LABELS['ai_anomaly']).toBe('аномалия потребления');
    expect(ALARM_REASON_LABELS['gas_leak']).toBe('утечка газа');
    expect(ALARM_REASON_LABELS['detector']).toBe('загазованность');

    // formatAlarmReasons
    expect(formatAlarmReasons(['overload'])).toBe('перегрузка');
    expect(formatAlarmReasons(['phase_loss', 'imbalance'])).toBe('обрыв фазы, несимметрия фаз');
    expect(formatAlarmReasons(['ai_anomaly'])).toBe('аномалия потребления');
    expect(formatAlarmReasons([])).toBe('неизвестная причина');
    expect(formatAlarmReasons(['custom_unknown'])).toBe('custom_unknown');
  });

  it('3. Дедупликация («одна авария — одно сообщение»): повторные показания с тем же статусом alarm возвращают null', () => {
    const notifier = new AlarmNotifier(testConfig);
    const sink = vi.fn();
    notifier.addSink(sink);

    const state1 = makeAlarmState('oven-1', ['overload'], T0);
    const notif1 = notifier.notify(state1, T0);
    expect(notif1).not.toBeNull();
    expect(sink).toHaveBeenCalledTimes(1);

    // Второе показание через 3 секунды с той же аварией
    const state2 = makeAlarmState('oven-1', ['overload'], T0 + 3000);
    const notif2 = notifier.notify(state2, T0 + 3000);
    expect(notif2).toBeNull();
    expect(sink).toHaveBeenCalledTimes(1);

    // Третье показание через 6 секунд
    const state3 = makeAlarmState('oven-1', ['overload', 'phase_loss'], T0 + 6000);
    const notif3 = notifier.notify(state3, T0 + 6000);
    expect(notif3).toBeNull();
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('4. Восстановление и новый инцидент: при переходе в running/idle/offline авария снимается, а при новом входе генерируется новое уведомление', () => {
    const notifier = new AlarmNotifier(testConfig);
    const received: AlarmNotification[] = [];
    notifier.addSink((n) => { received.push(n); });

    // 1-й инцидент
    notifier.notify(makeAlarmState('oven-1', ['overload'], T0), T0);
    expect(received).toHaveLength(1);
    expect(notifier.isAlarmActive('oven-1')).toBe(true);

    // Восстановление: станок переходит в running
    const recoveryNotif = notifier.notify(makeNormalState('oven-1', T0 + 10_000), T0 + 10_000);
    expect(recoveryNotif).toBeNull();
    expect(notifier.isAlarmActive('oven-1')).toBe(false);
    expect(received).toHaveLength(1);

    // 2-й инцидент (новая авария: обрыв фазы)
    const newAlarm = notifier.notify(makeAlarmState('oven-1', ['phase_loss'], T0 + 20_000), T0 + 20_000);
    expect(newAlarm).not.toBeNull();
    expect(newAlarm?.reasons).toEqual(['обрыв фазы']);
    expect(received).toHaveLength(2);
    expect(notifier.isAlarmActive('oven-1')).toBe(true);

    // Проверка снятия аварии при переходе в idle
    notifier.notify({ ...makeNormalState('oven-1', T0 + 30_000), status: 'idle' });
    expect(notifier.isAlarmActive('oven-1')).toBe(false);

    // Проверка снятия аварии при переходе в offline
    notifier.notify(makeAlarmState('oven-1', ['overload'], T0 + 40_000));
    expect(notifier.isAlarmActive('oven-1')).toBe(true);
    notifier.notify({ ...makeNormalState('oven-1', T0 + 50_000), status: 'offline' });
    expect(notifier.isAlarmActive('oven-1')).toBe(false);
  });

  it('5. Интеграция с TwinEngine: attach(engine) перехватывает аварии из ingest(), detach() отписывает трекер', () => {
    const engine = new TwinEngine(testConfig);
    const notifier = new AlarmNotifier(testConfig);
    const received: AlarmNotification[] = [];
    notifier.addSink((n) => { received.push(n); });

    notifier.attach(engine);

    // Показание с перегрузкой (> 115% от 36 кВт = 41.4 кВт, подаем 50 кВт)
    const overloadReading: Reading = {
      equipmentId: 'oven-1',
      ts: T0,
      powerKw: 50,
      currentsA: [75, 75, 75],
    };

    engine.ingest(overloadReading, T0);
    expect(received).toHaveLength(1);
    expect(received[0]!.equipmentId).toBe('oven-1');
    expect(received[0]!.reasons).toContain('перегрузка');

    // Повторное показание в аварии не должно генерировать второе уведомление
    engine.ingest({ ...overloadReading, ts: T0 + 3000 }, T0 + 3000);
    expect(received).toHaveLength(1);

    // Отписываемся
    notifier.detach();

    // Восстанавливаем станок
    engine.ingest({ equipmentId: 'oven-1', ts: T0 + 6000, powerKw: 25, currentsA: [38, 38, 38] }, T0 + 6000);

    // Снова авария, но трекер отписан
    engine.ingest({ ...overloadReading, ts: T0 + 9000 }, T0 + 9000);
    expect(received).toHaveLength(1); // новых уведомлений нет
  });

  it('6. Поддержка нескольких синков: регистрация через addSink и вызов всех подписчиков', () => {
    const notifier = new AlarmNotifier(testConfig);
    const sink1 = vi.fn();
    const sink2 = vi.fn();
    const unsubscribe1 = notifier.addSink(sink1);
    notifier.addSink(sink2);

    notifier.notify(makeAlarmState('oven-1', ['overload'], T0), T0);
    expect(sink1).toHaveBeenCalledTimes(1);
    expect(sink2).toHaveBeenCalledTimes(1);

    // Отписываем первый синк
    unsubscribe1();
    notifier.reset('oven-1');

    notifier.notify(makeAlarmState('oven-1', ['overload'], T0 + 1000), T0 + 1000);
    expect(sink1).toHaveBeenCalledTimes(1);
    expect(sink2).toHaveBeenCalledTimes(2);
  });

  it('7. Кастомный baseUrl: поддержка внешнего URL вида https://twin.bakery.uz/?eq=oven-1', () => {
    const notifierWithBase = new AlarmNotifier(testConfig, { baseUrl: 'https://twin.bakery.uz' });
    const notif1 = notifierWithBase.notify(makeAlarmState('oven-1', ['overload'], T0), T0);
    expect(notif1?.url).toBe(`https://twin.bakery.uz/?eq=oven-1&t=${new Date(T0).toISOString().slice(0, 19)}Z`);
    expect(notif1?.message).toContain('https://twin.bakery.uz/?eq=oven-1&t=');

    // С завершающим слэшем
    const notifierWithSlash = new AlarmNotifier({ config: testConfig, baseUrl: 'https://twin.bakery.uz/' });
    const notif2 = notifierWithSlash.notify(makeAlarmState('mixer-1', ['imbalance'], T0), T0);
    expect(notif2?.url).toBe(`https://twin.bakery.uz/?eq=mixer-1&t=${new Date(T0).toISOString().slice(0, 19)}Z`);

    // Функция buildEquipmentUrl
    expect(buildEquipmentUrl('oven-1')).toBe('?eq=oven-1');
    expect(buildEquipmentUrl('oven-1', 'http://localhost:5173')).toBe('http://localhost:5173/?eq=oven-1');
    expect(buildEquipmentUrl('oven-1', undefined, Date.UTC(2026, 9, 27, 22, 40, 5))).toBe('?eq=oven-1&t=2026-10-27T22:40:05Z');
  });

  it('8. Фоллбэк для неизвестного станка: если станка нет в конфиге, используется его ID в качестве имени', () => {
    const notifier = new AlarmNotifier(testConfig);
    const unknownState = makeAlarmState('unknown-machine-99', ['overload'], T0);

    const notif = notifier.notify(unknownState, T0);
    expect(notif?.equipmentId).toBe('unknown-machine-99');
    expect(notif?.equipmentName).toBe('unknown-machine-99');
    expect(notif?.url).toBe(`?eq=unknown-machine-99&t=${new Date(T0).toISOString().slice(0, 19)}Z`);
    expect(notif?.message).toContain('unknown-machine-99');

    // Нотификатор вообще без конфига
    const bareNotifier = new AlarmNotifier();
    const notifBare = bareNotifier.notify(makeAlarmState('ghost-1', ['phase_loss'], T0), T0);
    expect(notifBare?.equipmentName).toBe('ghost-1');
  });
});
