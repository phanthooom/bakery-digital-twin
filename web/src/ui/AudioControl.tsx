import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { soundManager } from '../audio/audioManager';
import './AudioControl.css';

export function AudioControl() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const muted = useSyncExternalStore(
    (cb) => soundManager.subscribe(cb),
    () => soundManager.isMuted(),
  );

  const volume = useSyncExternalStore(
    (cb) => soundManager.subscribe(cb),
    () => soundManager.getVolume(),
  );

  const volumePct = Math.round(volume * 100);

  // Закрытие всплывающего ползунка по клику вне компонента
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  const handleToggleMute = () => {
    soundManager.toggleMute();
  };

  return (
    <div className="audio-control-wrapper" ref={popoverRef}>
      <button
        type="button"
        className={`btn btn-audio${muted ? ' is-muted' : ''}`}
        onClick={handleToggleMute}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        title={muted ? 'Звук цеха выключен (клик — включить, ПКМ — громкость)' : `Звук цеха: ${volumePct}% (клик — выключить, ПКМ — громкость)`}
        aria-label="Звуковое окружение цеха"
        aria-pressed={!muted}
      >
        <span className="audio-icon" aria-hidden>
          {muted ? '🔇' : volume < 0.35 ? '🔈' : volume < 0.7 ? '🔉' : '🔊'}
        </span>
        <span className="btn-text-full">{muted ? 'Звук: выкл' : `Звук: ${volumePct}%`}</span>
        <span className="btn-text-short">{muted ? 'Выкл' : `${volumePct}%`}</span>
      </button>

      <button
        type="button"
        className="btn-audio-pop-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Настройка громкости 3D-звука"
        aria-label="Настройка громкости"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && (
        <div className="audio-popover" role="dialog" aria-label="Регулировка громкости цеха">
          <div className="audio-popover-header">
            <span>Громкость цеха</span>
            <span className="audio-popover-value">{muted ? '0%' : `${volumePct}%`}</span>
          </div>
          <div className="audio-slider-row">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const val = Number.parseFloat(e.target.value);
                soundManager.setVolume(val);
              }}
              className="audio-volume-slider"
              aria-label="Ползунок громкости"
            />
          </div>
          <div className="audio-popover-footer">
            <button
              type="button"
              className="audio-popover-btn"
              onClick={() => soundManager.toggleMute()}
            >
              {muted ? 'Включить звук' : 'Заглушить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
