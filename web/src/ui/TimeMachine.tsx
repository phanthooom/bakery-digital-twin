import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StatusChange } from '@bakery/shared';
import { useDataSource } from '../data/store';
import { goLive, parseTimeParam, sceneNow, seekTo, setSpeed, useSceneTime, useTimeCursor } from '../data/timeCursor';
import { REASON_LABEL } from './statusMeta';
import './timeMachine.css';

const MIN = 60_000;
const HOUR = 60 * MIN;
const SPEEDS = [1, 10, 60, 300] as const;

/** «03:40:15» по времени цеха. */
function clock(ts: number, timezone: string, seconds = true): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, hour12: false }).format(ts);
}

/** «сегодня», «вчера» или «25 окт.» по времени цеха. */
function day(ts: number, now: number, timezone: string): string {
  const d = (t: number) => new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'short' }).format(t);
  if (d(ts) === d(now)) return 'сегодня';
  if (d(ts) === d(now - 24 * HOUR)) return 'вчера';
  return d(ts);
}

/**
 * «Машина времени»: шкала за последние часы внизу экрана. Тянете ползунок — весь цех и двор показывают выбранный
 * момент; ▶ проигрывает с ускорением; красные риски — аварии (щелчок — к началу аварии и карточка станка).
 * Сам курсор — в data/timeCursor.ts, прошлое отдаёт источник данных (setTimeCursor).
 */
export function TimeMachine({ onSelectMachine }: { onSelectMachine: (id: string) => void }) {
  const ds = useDataSource();
  const tz = ds.config.site.timezone;
  const cursor = useTimeCursor();
  const past = cursor.mode === 'past';
  const [open, setOpen] = useState(false);
  const now = useSceneTime(1000);
  const wallNow = useWallClock(past ? 5000 : 30_000);
  const window_ = useMemo(() => ds.getHistoryWindow?.() ?? { fromMs: wallNow - 6 * HOUR, toMs: wallNow }, [ds, wallNow]);
  const from = window_.fromMs;
  const to = Math.max(window_.toMs, wallNow);
  const alarms = useMemo<StatusChange[]>(() => (open ? (ds.getStatusChanges?.(from, to) ?? []).filter((c) => c.status === 'alarm') : []), [ds, open, from, to]);
  const names = useMemo(() => new Map(ds.config.equipment.map((e) => [e.id, e.name])), [ds]);

  // ссылка ?t=… — сразу в нужный момент (из уведомления об аварии)
  useEffect(() => {
    const t = parseTimeParam(new URLSearchParams(location.search).get('t'), Date.now(), tz);
    if (t === null) return;
    setOpen(true);
    seekTo(t, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // курсор → источник данных: в прошлом раз в 250 мс отдаём снимок на время сцены, у «сейчас» — живые данные
  useEffect(() => {
    if (!past) {
      ds.setTimeCursor?.(null);
      return;
    }
    const push = () => {
      const t = sceneNow();
      if (cursor.speed > 0 && t >= Date.now() - 1000) return goLive(); // догнали «сейчас»
      ds.setTimeCursor?.(t);
    };
    push();
    if (cursor.speed === 0) return;
    const id = setInterval(push, 250);
    return () => clearInterval(id);
  }, [ds, cursor, past]);

  // момент в адресе — ссылкой можно поделиться
  useEffect(() => {
    const url = new URL(location.href);
    if (past && cursor.speed === 0) url.searchParams.set('t', `${new Date(cursor.anchorT).toISOString().slice(0, 19)}Z`);
    else url.searchParams.delete('t');
    history.replaceState(null, '', url);
  }, [cursor, past]);

  // кнопка «История» встаёт над подсказкой жестов (она в том же углу на компьютере)
  const pill = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (open) return;
    const place = () => {
      const hint = document.querySelector<HTMLElement>('.hint');
      pill.current?.style.setProperty('--tm-lift', `${hint && hint.offsetParent ? hint.offsetHeight + 10 : 0}px`);
    };
    place();
    const id = setInterval(place, 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) {
    return (
      <button ref={pill} type="button" className={`tm-pill${past ? ' is-past' : ''}`} onClick={() => setOpen(true)} aria-label="Открыть «Машину времени»">
        <span aria-hidden>⏱</span> {past ? `История · ${clock(now, tz, false)}` : 'История'}
      </button>
    );
  }

  const span = to - from;
  const pos = (t: number) => `${((Math.min(Math.max(t, from), to) - from) / span) * 100}%`;
  const shown = past ? now : to;
  const hours: number[] = [];
  for (let h = Math.ceil(from / HOUR) * HOUR; h <= to; h += HOUR) hours.push(h);
  const playing = past && cursor.speed > 0;

  return (
    <section className={`tm-bar${past ? ' is-past' : ''}`} aria-label="Машина времени">
      <div className="tm-head">
        <div className="tm-when">
          <span className={`tm-badge${past ? ' is-past' : ''}`}>{past ? 'Прошлое' : 'Сейчас'}</span>
          <strong className="tm-time">{clock(shown, tz)}</strong>
          <span className="tm-day">{day(shown, wallNow, tz)}</span>
          {past && <span className="tm-ago">−{fmtSpan(wallNow - now)}</span>}
        </div>
        <div className="tm-actions">
          {past && (
            <button type="button" className="btn tm-live" onClick={goLive}>
              Сейчас →
            </button>
          )}
          <button type="button" className="card-close" onClick={() => (goLive(), setOpen(false))} aria-label="Закрыть «Машину времени» и вернуться к сейчас">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="tm-track">
        <div className="tm-rail" />
        <div className="tm-fill" style={{ width: pos(shown) }} />
        {hours.map((h) => (
          <span key={h} className="tm-hour" style={{ left: pos(h) }}>
            {clock(h, tz, false)}
          </span>
        ))}
        {alarms.map((a) => (
          <button
            key={`${a.id}${a.t}`}
            type="button"
            className="tm-alarm"
            style={{ left: pos(a.t) }}
            title={`${clock(a.t, tz)} · ${names.get(a.id) ?? a.id} — авария: ${a.reasons.map((r) => REASON_LABEL[r] ?? r).join(', ')}`}
            aria-label={`Авария ${names.get(a.id) ?? a.id} в ${clock(a.t, tz, false)}`}
            onClick={() => {
              seekTo(a.t - 20_000, 0);
              onSelectMachine(a.id);
            }}
          />
        ))}
        <input
          className="tm-range"
          type="range"
          min={from}
          max={to}
          step={1000}
          value={shown}
          aria-label="Момент времени"
          aria-valuetext={`${day(shown, wallNow, tz)} ${clock(shown, tz)}`}
          onChange={(e) => seekTo(Number(e.currentTarget.value), 0)}
        />
      </div>

      <div className="tm-controls">
        <button type="button" className="btn" onClick={() => seekTo(Math.max(from, (past ? now : to) - 15 * MIN))} aria-label="На 15 минут назад">
          −15 мин
        </button>
        <button
          type="button"
          className="btn tm-play"
          onClick={() => {
            if (!past) seekTo(to - HOUR, 60); // со «сейчас» — проигрываем последний час за минуту
            else setSpeed(playing ? 0 : cursor.speed || 60);
          }}
          aria-label={playing ? 'Пауза' : 'Проиграть'}
        >
          {playing ? '❚❚ Пауза' : '▶ Проиграть'}
        </button>
        <div className="tm-speeds" role="group" aria-label="Скорость проигрывания">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn${past && cursor.speed === s ? ' is-active' : ''}`}
              onClick={() => (past ? setSpeed(s) : seekTo(to - HOUR, s))}
              aria-pressed={past && cursor.speed === s}
            >
              ×{s}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => seekTo(Math.min(to, (past ? now : to) + 15 * MIN))} disabled={!past} aria-label="На 15 минут вперёд">
          +15 мин
        </button>
        {alarms.length > 0 && <span className="tm-legend">▲ аварии: {alarms.length}</span>}
      </div>
    </section>
  );
}

function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин`;
}

/** Настенные часы (не время сцены): конец шкалы — всегда «сейчас». */
function useWallClock(stepMs: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return t;
}
