import { createNoiseBuffer } from './audioMath';

export interface DisposableSynth {
  dispose(): void;
}

/**
 * Синтезатор печи: низкочастотный рокот вытяжки (55 Гц) + шипение газовых горелок (Bandpass 650 Гц).
 */
export class OvenSynth implements DisposableSynth {
  private readonly rumbleOsc: OscillatorNode;
  private readonly noiseSource: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, panner: PannerNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(panner);

    // Низкочастотный гул вытяжки и конвекции печи
    this.rumbleOsc = ctx.createOscillator();
    this.rumbleOsc.type = 'triangle';
    this.rumbleOsc.frequency.value = 55;

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.18;
    this.rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(this.gain);

    // Шипение газовых горелок
    const noiseBuffer = createNoiseBuffer(ctx, 2);
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 650;
    this.filter.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;
    this.noiseSource.connect(this.filter);
    this.filter.connect(noiseGain);
    noiseGain.connect(this.gain);

    try {
      this.rumbleOsc.start();
      this.noiseSource.start();
    } catch {
      // Игнорируем ошибку, если контекст ещё suspended
    }
  }

  setActive(active: boolean, pctOfNominal = 100): void {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const target = active ? Math.min(0.35, 0.22 * (Math.max(10, pctOfNominal) / 100)) : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.rumbleOsc.stop();
      this.noiseSource.stop();
      this.rumbleOsc.disconnect();
      this.noiseSource.disconnect();
      this.gain.disconnect();
    } catch {
      // noop
    }
  }
}

/**
 * Синтезатор тестомеса: рокот электродвигателя (82 Гц) + ритмичный такт замеса дежи (1.4 Гц).
 */
export class MixerSynth implements DisposableSynth {
  private readonly motorOsc: OscillatorNode;
  private readonly lfoOsc: OscillatorNode;
  private readonly lfoGain: GainNode;
  private readonly gain: GainNode;
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, panner: PannerNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(panner);

    this.motorOsc = ctx.createOscillator();
    this.motorOsc.type = 'triangle';
    this.motorOsc.frequency.value = 82;

    // LFO для амплитудной модуляции ритма вращения спирали и дежи (~84 об/мин = 1.4 Гц)
    this.lfoOsc = ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.value = 1.4;

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.08;

    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.2;

    this.lfoOsc.connect(this.lfoGain);
    this.lfoGain.connect(motorGain.gain);

    this.motorOsc.connect(motorGain);
    motorGain.connect(this.gain);

    try {
      this.motorOsc.start();
      this.lfoOsc.start();
    } catch {
      // noop
    }
  }

  setActive(active: boolean): void {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const target = active ? 0.24 : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.motorOsc.stop();
      this.lfoOsc.stop();
      this.motorOsc.disconnect();
      this.lfoOsc.disconnect();
      this.gain.disconnect();
    } catch {
      // noop
    }
  }
}

/**
 * Синтезатор силового контактора в ЩР-1: металлический щелчок при пуске станка.
 */
export class ContactorSynth implements DisposableSynth {
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, private readonly panner: PannerNode) {}

  trigger(): void {
    if (this.isDisposed || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;

    // 1. Механический импульс (щелчок сердечника)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainCore = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(380, t);
    osc1.frequency.exponentialRampToValueAtTime(120, t + 0.06);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(720, t);
    osc2.frequency.exponentialRampToValueAtTime(240, t + 0.06);

    gainCore.gain.setValueAtTime(0.35, t);
    gainCore.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    osc1.connect(gainCore);
    osc2.connect(gainCore);
    gainCore.connect(this.panner);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.07);
    osc2.stop(t + 0.07);

    // 2. Всплеск шума (сухой лязг дугогасительной камеры)
    const noiseBuffer = createNoiseBuffer(this.ctx, 0.04);
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1200, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.panner);

    noise.start(t);
    noise.stop(t + 0.04);
  }

  dispose(): void {
    this.isDisposed = true;
  }
}

/**
 * Синтезатор зуммера заднего хода погрузчиков и фургонов у рампы (980 Гц импульсы 250 мс ON / 250 мс OFF).
 */
export class ReverseBeeperSynth implements DisposableSynth {
  private readonly osc: OscillatorNode;
  private readonly lfo: OscillatorNode;
  private readonly gain: GainNode;
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, panner: PannerNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(panner);

    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.value = 980;

    // Прямоугольный LFO с частотой 2 Гц (250 мс ON / 250 мс OFF)
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfo.frequency.value = 2;

    const beeperGain = ctx.createGain();
    beeperGain.gain.value = 0.08;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;

    this.lfo.connect(lfoGain);
    lfoGain.connect(beeperGain.gain);

    this.osc.connect(beeperGain);
    beeperGain.connect(this.gain);

    try {
      this.osc.start();
      this.lfo.start();
    } catch {
      // noop
    }
  }

  setActive(active: boolean): void {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const target = active ? 0.18 : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.osc.stop();
      this.lfo.stop();
      this.osc.disconnect();
      this.lfo.disconnect();
      this.gain.disconnect();
    } catch {
      // noop
    }
  }
}

/**
 * Синтезатор аварийной двухтональной сирены (alarm станка или утечка газа).
 */
export class AlarmSirenSynth implements DisposableSynth {
  private readonly osc: OscillatorNode;
  private readonly lfo: OscillatorNode;
  private readonly lfoGain: GainNode;
  private readonly gain: GainNode;
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, panner: PannerNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(panner);

    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 780;

    // LFO девиации частоты (2.5 Гц, диапазон 650–920 Гц)
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 2.5;

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 140;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;

    this.osc.connect(filter);
    filter.connect(this.gain);

    try {
      this.osc.start();
      this.lfo.start();
    } catch {
      // noop
    }
  }

  setActive(active: boolean): void {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const target = active ? 0.22 : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.osc.stop();
      this.lfo.stop();
      this.osc.disconnect();
      this.lfo.disconnect();
      this.gain.disconnect();
    } catch {
      // noop
    }
  }
}

/**
 * Синтезатор вентиляторов драйкулеров и чиллера на кровле (Bandpass 280–380 Гц).
 */
export class RooftopFanSynth implements DisposableSynth {
  private readonly noiseSource: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private isDisposed = false;

  constructor(private readonly ctx: AudioContext, panner: PannerNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(panner);

    const noiseBuffer = createNoiseBuffer(ctx, 3);
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 320;
    this.filter.Q.value = 0.9;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.15;
    this.noiseSource.connect(this.filter);
    this.filter.connect(noiseGain);
    noiseGain.connect(this.gain);

    try {
      this.noiseSource.start();
    } catch {
      // noop
    }
  }

  setActive(active: boolean, pct = 100): void {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const target = active ? Math.min(0.25, 0.16 * (Math.max(10, pct) / 100)) : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.noiseSource.stop();
      this.noiseSource.disconnect();
      this.gain.disconnect();
    } catch {
      // noop
    }
  }
}
