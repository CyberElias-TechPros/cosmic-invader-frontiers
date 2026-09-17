/**
 * Procedural audio engine.
 *
 * The original project shipped 1-byte (silent) MP3 placeholders. Everything
 * here is synthesised with the Web Audio API instead: zero bytes over the wire,
 * instantaneous playback, and it can react to the simulation (pitch rises with
 * combo level, music intensity follows boss phases).
 */

export type SoundName =
  | 'shoot'
  | 'enemyShoot'
  | 'enemyHit'
  | 'explosion'
  | 'bossExplosion'
  | 'playerHit'
  | 'playerDeath'
  | 'powerup'
  | 'extraLife'
  | 'overdrive'
  | 'comboUp'
  | 'waveClear'
  | 'waveStart'
  | 'bossSpawn'
  | 'ufo'
  | 'gameOver'
  | 'uiHover'
  | 'uiClick';

interface Voice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  stop: () => void;
}

const SCALES: Record<string, number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
};

function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private reverb: DelayNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicPlaying = false;
  private droneNodes: OscillatorNode[] = [];
  private activeVoices = new Set<Voice>();
  private listenerController: AbortController | null = null;
  private lastPlayed = new Map<SoundName, number>();
  private intensity = 0;

  soundEnabled = true;
  musicEnabled = true;
  sfxVolume = 0.6;
  musicVolume = 0.35;

  get status(): 'idle' | 'ready' | 'suspended' {
    if (!this.context) return 'idle';
    return this.context.state === 'running' ? 'ready' : 'suspended';
  }

  /** Must be called from a user gesture at least once. */
  async unlock(): Promise<void> {
    if (!this.context) return;
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        /* user gesture still pending */
      }
    }
  }

  init(): void {
    if (this.context) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    this.context = new Ctor({ latencyHint: 'interactive' });
    const ctx = this.context;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // A touch of feedback delay gives the arcade cabinet its sense of space.
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.24;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);
    limiter.connect(this.master);
    this.reverb = delay;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(limiter);
    this.sfxBus.connect(delay);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    this.musicBus.connect(delay);

    // Pause the whole graph when the tab is hidden (also saves battery).
    this.listenerController = new AbortController();
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!this.context) return;
        if (document.visibilityState === 'hidden') void this.context.suspend();
        else void this.context.resume();
      },
      { signal: this.listenerController.signal },
    );
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfxBus) this.sfxBus.gain.value = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
  }

  /** 0 = calm, 1 = maximum danger (drives music density + filter). */
  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  play(name: SoundName, options: { pitch?: number; gain?: number; pan?: number } = {}): void {
    if (!this.soundEnabled || !this.context || !this.sfxBus) return;
    if (this.context.state !== 'running') return;

    // Per-sound throttle: identical rapid events must not stack into clipping.
    const now = this.context.currentTime;
    const throttle = name === 'shoot' ? 0.045 : name === 'enemyShoot' ? 0.05 : 0.02;
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < throttle) return;
    this.lastPlayed.set(name, now);

    const gain = options.gain ?? 1;
    const pitch = options.pitch ?? 1;

    switch (name) {
      case 'shoot':
        this.blip({ type: 'square', from: 900 * pitch, to: 260 * pitch, duration: 0.09, gain: 0.16 * gain, pan: options.pan });
        this.noise({ duration: 0.05, gain: 0.05 * gain, filterFrom: 3800, filterTo: 900 });
        break;
      case 'enemyShoot':
        this.blip({ type: 'sawtooth', from: 380 * pitch, to: 180 * pitch, duration: 0.16, gain: 0.1 * gain, pan: options.pan });
        break;
      case 'enemyHit':
        this.blip({ type: 'triangle', from: 620 * pitch, to: 900 * pitch, duration: 0.06, gain: 0.12 * gain });
        break;
      case 'explosion':
        this.noise({ duration: 0.34, gain: 0.3 * gain, filterFrom: 2400, filterTo: 120, pan: options.pan });
        this.blip({ type: 'triangle', from: 180 * pitch, to: 48, duration: 0.26, gain: 0.16 * gain });
        break;
      case 'bossExplosion':
        this.noise({ duration: 0.9, gain: 0.42 * gain, filterFrom: 3200, filterTo: 60 });
        this.blip({ type: 'sawtooth', from: 120, to: 30, duration: 0.8, gain: 0.24 * gain });
        this.blip({ type: 'square', from: 90, to: 24, duration: 0.9, gain: 0.16 * gain });
        break;
      case 'playerHit':
        this.blip({ type: 'sawtooth', from: 300, to: 60, duration: 0.4, gain: 0.24 * gain });
        this.noise({ duration: 0.4, gain: 0.26 * gain, filterFrom: 1600, filterTo: 90 });
        break;
      case 'playerDeath':
        this.blip({ type: 'sawtooth', from: 420, to: 40, duration: 0.9, gain: 0.26 * gain });
        this.noise({ duration: 0.9, gain: 0.3 * gain, filterFrom: 2000, filterTo: 60 });
        break;
      case 'powerup':
        this.arp([0, 4, 7, 12], 0.055, 0.12 * gain, 'triangle', pitch);
        break;
      case 'extraLife':
        this.arp([0, 7, 12, 16], 0.09, 0.16 * gain, 'square', pitch);
        break;
      case 'overdrive':
        this.blip({ type: 'sawtooth', from: 180, to: 1400, duration: 0.5, gain: 0.2 * gain });
        this.arp([0, 5, 7, 12, 17], 0.07, 0.12 * gain, 'triangle', pitch);
        break;
      case 'comboUp':
        this.arp([0, 2, 5], 0.045, 0.09 * gain, 'square', pitch);
        break;
      case 'waveClear':
        this.arp([0, 7, 12], 0.12, 0.15 * gain, 'triangle', 1);
        break;
      case 'waveStart':
        this.blip({ type: 'square', from: 220, to: 520, duration: 0.24, gain: 0.13 * gain });
        break;
      case 'bossSpawn':
        this.blip({ type: 'sawtooth', from: 70, to: 46, duration: 1.4, gain: 0.28 * gain });
        this.noise({ duration: 1.2, gain: 0.22 * gain, filterFrom: 500, filterTo: 70 });
        break;
      case 'ufo':
        this.blip({ type: 'sine', from: 780, to: 1180, duration: 0.36, gain: 0.1 * gain, pan: options.pan });
        break;
      case 'gameOver':
        this.arp([0, -3, -7, -12], 0.22, 0.2 * gain, 'triangle', 1, 110);
        break;
      case 'uiHover':
        this.blip({ type: 'sine', from: 1400, to: 1200, duration: 0.05, gain: 0.05 * gain });
        break;
      case 'uiClick':
        this.blip({ type: 'square', from: 700, to: 420, duration: 0.08, gain: 0.1 * gain });
        break;
    }
  }

  /* ------------------------------ primitives ----------------------------- */

  private blip(options: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    gain: number;
    pan?: number;
  }): void {
    if (!this.context || !this.sfxBus) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type;
    osc.frequency.setValueAtTime(Math.max(20, options.from), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + options.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    osc.connect(gain);
    this.route(gain, options.pan, true);
    osc.start(now);
    osc.stop(now + options.duration + 0.02);
    const voice: Voice = { oscillators: [osc], gain, stop: () => osc.stop() };
    this.track(voice);
  }

  private noise(options: { duration: number; gain: number; filterFrom: number; filterTo: number; pan?: number }): void {
    if (!this.context || !this.sfxBus) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * options.duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Shaped noise: louder at the attack, decaying with a little crunch.
      const t = i / frames;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.filterFrom, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, options.filterTo), now + options.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    source.connect(filter);
    filter.connect(gain);
    this.route(gain, options.pan, true);
    source.start(now);
    source.stop(now + options.duration);
  }

  private arp(intervals: number[], spacing: number, gain: number, type: OscillatorType, pitch: number, baseNote = 69): void {
    if (!this.context || !this.sfxBus) return;
    const ctx = this.context;
    const start = ctx.currentTime;
    intervals.forEach((interval, index) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      const frequency = midiToFrequency(baseNote + interval) * pitch;
      osc.frequency.setValueAtTime(frequency, start + index * spacing);
      env.gain.setValueAtTime(0.0001, start + index * spacing);
      env.gain.exponentialRampToValueAtTime(gain, start + index * spacing + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, start + index * spacing + spacing * 1.7);
      osc.connect(env);
      this.route(env, undefined, true);
      osc.start(start + index * spacing);
      osc.stop(start + index * spacing + spacing * 1.8);
      this.track({ oscillators: [osc], gain: env, stop: () => osc.stop() });
    });
  }

  private route(node: AudioNode, pan: number | undefined, wet: boolean): void {
    if (!this.context || !this.sfxBus) return;
    const target = this.sfxBus;
    if (pan !== undefined && this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      panner.connect(target);
      if (wet && this.reverb) panner.connect(this.reverb);
    } else {
      node.connect(target);
      if (wet && this.reverb) node.connect(this.reverb);
    }
  }

  private track(voice: Voice): void {
    this.activeVoices.add(voice);
    voice.oscillators[0].addEventListener('ended', () => this.activeVoices.delete(voice));
  }

  /* --------------------------------- music -------------------------------- */

  startMusic(): void {
    if (!this.context || !this.musicBus || this.musicPlaying) return;
    this.musicPlaying = true;
    const ctx = this.context;
    const now = ctx.currentTime;

    // Two detuned drones + a breathing low-pass give the "deep space" base.
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.22, now + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2.4;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    for (const note of [33, 40, 45]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFrequency(note) * 0.5;
      osc.connect(filter);
      osc.start();
      this.droneNodes.push(osc);
    }
    filter.connect(droneGain);
    droneGain.connect(this.musicBus);

    // Sparse sequencer: a new note every eighth, chosen from the mode.
    const bpm = 84;
    const stepMs = (60_000 / bpm) / 2;
    const advance = () => {
      if (!this.musicPlaying || !this.context || !this.musicBus) return;
      this.musicStep = (this.musicStep + 1) % 32;
      const scale = this.intensity > 0.66 ? SCALES.dorian : this.intensity > 0.3 ? SCALES.aeolian : SCALES.pentatonic;
      const octave = this.musicStep % 16 < 8 ? 60 : 62;
      const note = octave + scale[(this.musicStep * 3) % scale.length];
      if (this.musicStep % 2 === 0 || this.intensity > 0.5) {
        const osc = this.context.createOscillator();
        const env = this.context.createGain();
        osc.type = this.intensity > 0.6 ? 'square' : 'triangle';
        osc.frequency.value = midiToFrequency(note) * (this.intensity > 0.8 ? 2 : 1);
        const peak = 0.05 + this.intensity * 0.05;
        env.gain.setValueAtTime(0.0001, this.context.currentTime);
        env.gain.exponentialRampToValueAtTime(peak, this.context.currentTime + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + stepMs / 1000 * 1.6);
        osc.connect(env);
        env.connect(this.musicBus);
        osc.start();
        osc.stop(this.context.currentTime + stepMs / 1000 * 1.8);
      }
      this.musicTimer = window.setTimeout(advance, stepMs);
    };
    this.musicTimer = window.setTimeout(advance, stepMs);
  }

  stopMusic(fadeSeconds = 0.6): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const node of this.droneNodes) {
      try {
        node.stop(now + fadeSeconds);
      } catch {
        /* already stopped */
      }
    }
    this.droneNodes = [];
  }

  /** Duck everything (used by the pause overlay). */
  duck(amount = 0.25): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(amount, this.context.currentTime, 0.08);
  }

  unduck(): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(0.9, this.context.currentTime, 0.08);
  }

  dispose(): void {
    this.stopMusic(0.1);
    this.listenerController?.abort();
    this.activeVoices.forEach((voice) => {
      try {
        voice.stop();
      } catch {
        /* ignore */
      }
    });
    this.activeVoices.clear();
    void this.context?.close();
    this.context = null;
  }
}

/** Single shared engine — the site has one audio graph for the whole session. */
export const audio = new AudioEngine();
