type Listener = () => void;

const STORAGE_KEY_VOLUME = 'bakery-sound-volume';
const STORAGE_KEY_MUTED = 'bakery-sound-muted';

/**
 * Синглтон SoundscapeManager для управления контекстом Web Audio, мастер-громкостью,
 * Mute-состоянием и синхронизацией с localStorage.
 */
class SoundscapeManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.7;
  private muted: boolean = false;
  private readonly listeners = new Set<Listener>();

  constructor() {
    if (typeof window !== 'undefined') {
      const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (savedVol !== null) {
        const parsed = Number.parseFloat(savedVol);
        if (!Number.isNaN(parsed)) this.volume = Math.max(0, Math.min(1, parsed));
      }
      const savedMute = localStorage.getItem(STORAGE_KEY_MUTED);
      if (savedMute !== null) {
        this.muted = savedMute === 'true';
      }

      // Автоматическая разблокировка заблокированного браузером AudioContext по первому клику/тапу
      const unlock = () => {
        this.unlockContext();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
  }

  /**
   * Возвращает или лениво инициализирует единый AudioContext.
   */
  getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.updateMasterGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  getMasterGainNode(): GainNode | null {
    this.getContext();
    return this.masterGain;
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.muted && this.volume > 0) {
      this.muted = false;
      localStorage.setItem(STORAGE_KEY_MUTED, 'false');
    }
    localStorage.setItem(STORAGE_KEY_VOLUME, this.volume.toFixed(2));
    this.updateMasterGain();
    this.notify();
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEY_MUTED, String(this.muted));
    this.updateMasterGain();
    this.unlockContext();
    this.notify();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY_MUTED, String(this.muted));
    this.updateMasterGain();
    this.unlockContext();
    this.notify();
  }

  unlockContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateMasterGain(): void {
    if (!this.masterGain || !this.ctx) return;
    const effectiveGain = this.muted ? 0 : this.volume;
    this.masterGain.gain.setTargetAtTime(effectiveGain, this.ctx.currentTime, 0.05);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const soundManager = new SoundscapeManager();
