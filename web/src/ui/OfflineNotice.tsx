import { Plug } from '@lucasmarkes/hairline/react';
import { fmtAgo } from './format';

/** Пустое состояние «Нет связи»: вилка не дотягивается до розетки. */
export function OfflineNotice({ meterId, silentForMs }: { meterId?: string; silentForMs: number | null }) {
  return (
    <div className="offline">
      <div className="offline-figure">
        <Plug theme="light" intensity={0.5} label="Вилка не дотягивается до розетки — нет связи со счётчиком" />
      </div>
      <div>
        <div className="offline-title">{silentForMs !== null ? `Последнее показание ${fmtAgo(silentForMs)}` : 'Показаний ещё не было'}</div>
        <div className="offline-sub">Проверьте питание и Wi-Fi платы {meterId ?? 'счётчика'}.</div>
      </div>
    </div>
  );
}
