import type { GasReading } from '../gas';

/**
 * Демо-события газа:
 * leak_inside — утечка в цехе: расход растёт, метан копится в воздухе (видит сигнализатор);
 * leak_outside — утечка на трубе до цеха: метана в цехе нет, видно только по расходу.
 */
export type GasEvent = 'leak_inside' | 'leak_outside';

export const GAS_EVENTS: Record<GasEvent, { label: string; m3h: number; inside: boolean; demoDurationMs: number }> = {
  leak_inside: { label: 'Утечка в цехе', m3h: 1.2, inside: true, demoDurationMs: 8 * 60_000 },
  leak_outside: { label: 'Утечка на вводе', m3h: 0.8, inside: false, demoDurationMs: 40 * 60_000 },
};

/** % НКПР в установившемся режиме на 1 м³/ч утечки внутри цеха (с учётом вентиляции). */
const LEL_PER_M3H = 25;
/** Постоянная времени накопления и проветривания, мс. */
const TAU_MS = 90_000;

/**
 * Модель ввода газа: счётчик с импульсным выходом (мгновенный расход и накопленный объём)
 * и сигнализатор загазованности. Расход — то, что берут горелки, плюс утечка.
 */
export class GasSim {
  private totalM3: number;
  private ch4 = 0;
  private event: { type: GasEvent; until: number } | null = null;

  constructor(
    readonly meterId: string,
    private readonly opts: { rng?: () => number; startTotalM3?: number } = {},
  ) {
    this.totalM3 = opts.startTotalM3 ?? 48_250;
  }

  forceEvent(type: GasEvent, now: number, durationMs = GAS_EVENTS[type].demoDurationMs): void {
    this.event = { type, until: now + durationMs };
  }

  /** Показание за шаг dtMs, когда горелки по ожиданию берут burnersM3h. */
  tick(now: number, dtMs: number, burnersM3h: number): GasReading {
    const rng = this.opts.rng ?? Math.random;
    if (this.event && now >= this.event.until) this.event = null;
    const ev = this.event ? GAS_EVENTS[this.event.type] : null;
    // горелки модулируют пламя: ±4 % вокруг ожидаемого
    const burners = burnersM3h > 0 ? burnersM3h * (1 + (rng() - 0.5) * 0.08) : 0;
    const flowM3h = Math.round((burners + (ev?.m3h ?? 0)) * 1000) / 1000;
    this.totalM3 += (flowM3h * dtMs) / 3_600_000;
    const target = ev?.inside ? ev.m3h * LEL_PER_M3H : 0;
    this.ch4 += (target - this.ch4) * (1 - Math.exp(-dtMs / TAU_MS));
    const ch4Lel = Math.max(0, Math.round((this.ch4 + (rng() - 0.5) * 0.4) * 10) / 10);
    return { meterId: this.meterId, ts: now, flowM3h, totalM3: Math.round(this.totalM3 * 1000) / 1000, ch4Lel };
  }
}
