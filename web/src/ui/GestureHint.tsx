import { useState } from 'react';

const KEY = 'bakery.gestureHint.hidden';

function readHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Подсказка по управлению камерой (тачпад / мышь). Скрытие запоминается в браузере. */
export function GestureHint() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
  const alt = isMac ? '⌥' : 'Alt';
  return (
    <aside className="hint" aria-label="Управление камерой">
      <ul>
        <li><b>Щипок двумя пальцами</b> или колесо — приблизить / отдалить</li>
        <li><b>Два пальца</b> влево-вправо, вверх-вниз — сдвинуть камеру</li>
        <li><b>Зажать и тянуть</b> или <b>{alt} + два пальца</b> — повернуть</li>
      </ul>
      <button
        className="card-close"
        aria-label="Скрыть подсказку"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            /* хранилище недоступно — скрываем до перезагрузки */
          }
        }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}
