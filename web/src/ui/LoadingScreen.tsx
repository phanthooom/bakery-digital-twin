import { Slow } from '@lucasmarkes/hairline/react';

/**
 * Заставка, пока поднимается 3D-сцена и прогревается история за 6 ч:
 * ящики едут по ленте через ворота — тот же образ, что у линии цеха.
 */
export function LoadingScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`loading${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="loading-figure">
        <Slow theme="light" intensity={0.4} label="Ящики едут по ленте конвейера через ворота" />
      </div>
      <div className="loading-text">Загружаю 3D-цех и историю за 6 часов…</div>
    </div>
  );
}
