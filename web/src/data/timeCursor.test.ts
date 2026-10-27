import { describe, expect, it } from 'vitest';
import { parseTimeParam } from './timeCursor';

const TZ = 'Asia/Tashkent'; // UTC+5
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0); // 17:00 по Ташкенту

describe('?t= в ссылке «Машины времени»', () => {
  it('ISO из уведомления об аварии — как есть', () => {
    expect(parseTimeParam('2026-10-27T03:40:05Z', NOW, TZ)).toBe(Date.UTC(2026, 9, 27, 3, 40, 5));
  });

  it('ЧЧ:ММ и ЧЧ:ММ:СС — время цеха сегодня, а ещё не наступившее — вчера', () => {
    expect(parseTimeParam('03:40', NOW, TZ)).toBe(Date.UTC(2026, 9, 26, 22, 40, 0));
    expect(parseTimeParam('16:59:30', NOW, TZ)).toBe(Date.UTC(2026, 9, 27, 11, 59, 30));
    expect(parseTimeParam('18:00', NOW, TZ)).toBe(Date.UTC(2026, 9, 26, 13, 0, 0));
  });

  it('мусор и пустое — null', () => {
    expect(parseTimeParam(null, NOW, TZ)).toBeNull();
    expect(parseTimeParam('', NOW, TZ)).toBeNull();
    expect(parseTimeParam('25:00', NOW, TZ)).toBeNull();
    expect(parseTimeParam('вчера', NOW, TZ)).toBeNull();
  });
});
