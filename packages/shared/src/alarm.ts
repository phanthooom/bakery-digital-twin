import type { EquipmentState, SiteConfig, StatusReason } from './types';
import type { TwinEngine } from './engine';

/** Словарь перевода кодов причин аварии на русский язык по GLOSSARY.md */
export const ALARM_REASON_LABELS: Record<string, string> = {
  overload: 'перегрузка',
  phase_loss: 'обрыв фазы',
  imbalance: 'несимметрия фаз',
  ai_anomaly: 'аномалия потребления',
  gas_leak: 'утечка газа',
  detector: 'загазованность',
  flow_without_consumers: 'расход газа при погашенных горелках',
  over_expected: 'перерасход газа сверх ожидаемого',
  no_data: 'нет связи',
};

/**
 * Преобразует массив кодов причин аварии в читаемую строку по правилам GLOSSARY.md.
 */
export function formatAlarmReasons(reasons: (StatusReason | string)[]): string {
  if (!reasons || reasons.length === 0) {
    return 'неизвестная причина';
  }
  return reasons.map((r) => ALARM_REASON_LABELS[r] ?? r).join(', ');
}

/**
 * Формирует ссылку на карточку станка в интерфейсе цифрового двойника.
 */
export function buildEquipmentUrl(equipmentId: string, baseUrl?: string): string {
  const query = `?eq=${encodeURIComponent(equipmentId)}`;
  if (!baseUrl || !baseUrl.trim()) {
    return query;
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  return `${cleanBase}/${query}`;
}

/** Структура уведомления об аварии станка. */
export interface AlarmNotification {
  /** Идентификатор станка */
  equipmentId: string;
  /** Понятное имя станка из конфигурации цеха (или equipmentId, если станок неизвестен) */
  equipmentName: string;
  /** Переведенные причины аварии на русский язык по GLOSSARY.md */
  reasons: string[];
  /** Исходные идентификаторы причин аварии */
  rawReasons: string[];
  /** Ссылка на карточку станка в веб-интерфейсе */
  url: string;
  /** Временная метка фиксации аварии (мс UTC) */
  timestamp: number;
  /** Человекочитаемый текст уведомления на русском языке */
  message: string;
}

/** Обработчик/приемник аварийных уведомлений (синк). */
export type AlarmSink = (notification: AlarmNotification) => void | Promise<void>;

/** Параметры инициализации AlarmNotifier. */
export interface AlarmNotifierOptions {
  /** Конфигурация цеха для сопоставления ID и имен станков */
  config?: SiteConfig;
  /** Базовый URL для формирования ссылки на веб-двойник (например: 'https://twin.bakery.uz') */
  baseUrl?: string;
  /** Начальный список подписчиков */
  sinks?: AlarmSink[];
}

/**
 * Диспетчер аварийных уведомлений:
 * - Подключается к TwinEngine (или вызывается напрямую через notify/processState).
 * - Отслеживает переходы оборудования в статус 'alarm'.
 * - Дедуплицирует события: «одна авария — одно сообщение» до завершения инцидента.
 * - Рассылает уведомления зарегистрированным получателям (AlarmSink).
 */
export class AlarmNotifier {
  private config?: SiteConfig;
  private baseUrl?: string;
  private readonly sinks = new Set<AlarmSink>();
  private readonly activeAlarms = new Set<string>();
  private unsubscribeEngine: (() => void) | null = null;

  constructor(
    configOrOptions?: SiteConfig | AlarmNotifierOptions,
    options?: { baseUrl?: string; sinks?: AlarmSink[] },
  ) {
    if (configOrOptions) {
      if ('thresholds' in configOrOptions && 'equipment' in configOrOptions) {
        this.config = configOrOptions as SiteConfig;
        this.baseUrl = options?.baseUrl;
        if (options?.sinks) {
          for (const s of options.sinks) this.sinks.add(s);
        }
      } else {
        const opts = configOrOptions as AlarmNotifierOptions;
        this.config = opts.config;
        this.baseUrl = opts.baseUrl;
        if (opts.sinks) {
          for (const s of opts.sinks) this.sinks.add(s);
        }
      }
    }
  }

  /**
   * Добавить получателя уведомлений (синк). Возвращает функцию отписки.
   */
  addSink(sink: AlarmSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  /**
   * Удалить получателя уведомлений.
   */
  removeSink(sink: AlarmSink): void {
    this.sinks.delete(sink);
  }

  /**
   * Проверить, находится ли станок в активной аварии прямо сейчас.
   */
  isAlarmActive(equipmentId: string): boolean {
    return this.activeAlarms.has(equipmentId);
  }

  /**
   * Сбросить активные аварии (для тестов или ручного квитирования).
   */
  reset(equipmentId?: string): void {
    if (equipmentId) {
      this.activeAlarms.delete(equipmentId);
    } else {
      this.activeAlarms.clear();
    }
  }

  /**
   * Подключить трекер аварий к движку TwinEngine.
   * Автоматически слушает обновления состояний станков при ingest() и tick().
   */
  attach(engine: TwinEngine): () => void {
    this.detach();
    if (!this.config) {
      this.config = engine.config;
    }
    this.unsubscribeEngine = engine.subscribe((state) => {
      this.notify(state);
    });
    return () => this.detach();
  }

  /**
   * Отключить трекер аварий от TwinEngine.
   */
  detach(): void {
    if (this.unsubscribeEngine) {
      this.unsubscribeEngine();
      this.unsubscribeEngine = null;
    }
  }

  /**
   * Обработать состояние станка.
   * Если статус 'alarm' и станок еще не был в аварии, создает уведомление и рассылает в синки.
   * Если статус сменился на 'running', 'idle' или 'offline', авария сбрасывается.
   * Повторные вызовы во время непрерывной аварии дедуплицируются (возвращают null).
   */
  notify(state: EquipmentState, nowMs?: number): AlarmNotification | null {
    return this.processState(state, nowMs);
  }

  processState(state: EquipmentState, nowMs?: number): AlarmNotification | null {
    if (state.status !== 'alarm') {
      // Станок вышел из аварии (работает, в простое или отключился)
      this.activeAlarms.delete(state.id);
      return null;
    }

    // Дедупликация: одна авария — одно сообщение до завершения инцидента
    if (this.activeAlarms.has(state.id)) {
      return null;
    }

    this.activeAlarms.add(state.id);
    const notification = this.createNotification(state, nowMs);

    for (const sink of this.sinks) {
      try {
        const res = sink(notification);
        if (res instanceof Promise) {
          res.catch(() => {
            // Изолируем ошибки асинхронных синков
          });
        }
      } catch {
        // Изолируем ошибки синхронных синков
      }
    }

    return notification;
  }

  /**
   * Сформировать объект уведомления без учета дедупликации и отправки в синки.
   */
  createNotification(state: EquipmentState, nowMs?: number): AlarmNotification {
    const eq = this.config?.equipment?.find((e) => e.id === state.id);
    const equipmentName = eq?.name ?? state.id;
    const rawReasons = [...state.reasons];
    const translatedReasons = rawReasons.map((r) => ALARM_REASON_LABELS[r] ?? r);
    const url = buildEquipmentUrl(state.id, this.baseUrl);
    const timestamp = nowMs ?? (state.updatedAt > 0 ? state.updatedAt : Date.now());
    const reasonsFormatted = formatAlarmReasons(rawReasons);
    const message = `Авария станка: ${equipmentName}. Причина: ${reasonsFormatted}. Ссылка: ${url}`;

    return {
      equipmentId: state.id,
      equipmentName,
      reasons: translatedReasons,
      rawReasons,
      url,
      timestamp,
      message,
    };
  }
}
