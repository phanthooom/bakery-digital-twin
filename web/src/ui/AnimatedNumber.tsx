import { useEffect, useRef, useState } from 'react';
import { velohubSpring } from './animationMath';

export interface AnimatedNumberProps {
  /** Числовое значение для отображения */
  value: number;
  /** Функция форматирования числа в строку (например, fmtKw или fmtNum) */
  format?: (val: number) => string;
  /** Длительность анимации перехода в мс (по умолчанию 320 мс) */
  durationMs?: number;
  /** Суффикс с единицей измерения (например, " кВт" или " °C") */
  suffix?: string;
  /** Дополнительный CSS-класс */
  className?: string;
}

/**
 * Плавный цифровой индикатор (в стиле react-bits / magicui CountUp / NumberTicker).
 * Интерполирует число по кривой easeOutCubic без лишних перерисовок родительского дерева
 * и удерживает табличную ширину цифр (tabular-nums).
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(1),
  durationMs = 320,
  suffix = '',
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = fromRef.current;
    const delta = value - startVal;
    if (Math.abs(delta) < 1e-4 || durationMs <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      // velohubSpring — органичная пружинная доводка cubic-bezier(0.16, 1, 0.3, 1)
      const eased = velohubSpring(t);
      const current = startVal + delta * eased;
      fromRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-block' }}
    >
      {format(display)}
      {suffix}
    </span>
  );
}
