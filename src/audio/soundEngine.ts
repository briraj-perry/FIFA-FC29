// Procedural Web Audio Synthesizer & Live Stadium Crowd Soundscape for FC 26 HyperMotion V
// 100% zero-external-dependency audio synthesis

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  // Continuous Stadium Ambience Nodes
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceGain: GainNode | null = null;
  private drumIntervalId: number | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(
        mute ? 0.0001 : 0.055,
        this.ctx.currentTime,
        0.1
      );
    }
  }

  public startStadiumAmbience(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || this.ambienceSource) return;

    // Generate 4-second looping pink/brown stadium crowd murmur buffer
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;

      // Crossfade loop ends smoothly
      const env =
        i < 4000
          ? i / 4000
          : i > length - 4000
          ? (length - i) / 4000
          : 1.0;
      data[i] = pink * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.055;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    this.ambienceSource = source;
    this.ambienceFilter = filter;
    this.ambienceGain = gain;

    // Subtle stadium supporter bass drum beat every ~1.6s
    if (!this.drumIntervalId && typeof window !== 'undefined') {
      this.drumIntervalId = window.setInterval(() => {
        if (this.muted || !this.ctx || !this.ambienceSource) return;
        this.playSupporterDrumPulse();
      }, 1600);
    }
  }

  public updateStadiumExcitement(excitement01: number): void {
    if (this.muted || !this.ctx || !this.ambienceFilter || !this.ambienceGain) return;
    const clamped = Math.max(0, Math.min(1, excitement01));
    const now = this.ctx.currentTime;
    // Swell filter cutoff and volume as ball nears penalty box
    this.ambienceFilter.frequency.setTargetAtTime(340 + clamped * 480, now, 0.25);
    this.ambienceGain.gain.setTargetAtTime(0.045 + clamped * 0.09, now, 0.25);
  }

  public stopStadiumAmbience(): void {
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
        this.ambienceSource.disconnect();
      } catch {
        // ignore
      }
      this.ambienceSource = null;
      this.ambienceFilter = null;
      this.ambienceGain = null;
    }
    if (this.drumIntervalId) {
      clearInterval(this.drumIntervalId);
      this.drumIntervalId = null;
    }
  }

  private playSupporterDrumPulse(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    const playBeat = (offset: number, amp: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(78, now + offset);
      osc.frequency.exponentialRampToValueAtTime(36, now + offset + 0.14);

      g.gain.setValueAtTime(amp, now + offset);
      g.gain.exponentialRampToValueAtTime(0.0005, now + offset + 0.16);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.17);
    };

    playBeat(0, 0.045);
    playBeat(0.28, 0.032);
  }

  public playKick(power: number = 0.7): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const clampedPower = Math.max(0.2, Math.min(1.2, power));

    // Low punchy leather thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135 * (0.85 + clampedPower * 0.3), now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);

    gain.gain.setValueAtTime(0.42 * clampedPower, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);

    // Boot transient snap
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + clampedPower * 600;
    filter.Q.value = 1.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.26 * clampedPower, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  public playTackle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.09);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.09);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playPostHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [480, 760, 1180];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.35);

      gain.gain.setValueAtTime(0.22 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    });
    this.playCrowdGasp();
  }

  public playCrowdGasp(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.85;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playWhistle(mode: 'kickoff' | 'goal' | 'fulltime' = 'kickoff'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playBlast = (startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2840, now + startOffset);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(46, now + startOffset);
      lfoGain.gain.setValueAtTime(140, now + startOffset);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      mainGain.gain.setValueAtTime(0.001, now + startOffset);
      mainGain.gain.linearRampToValueAtTime(0.16, now + startOffset + 0.02);
      mainGain.gain.setValueAtTime(0.14, now + startOffset + duration - 0.04);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);

      osc.connect(mainGain);
      mainGain.connect(ctx.destination);

      osc.start(now + startOffset);
      lfo.start(now + startOffset);
      osc.stop(now + startOffset + duration);
      lfo.stop(now + startOffset + duration);
    };

    if (mode === 'kickoff') {
      playBlast(0, 0.42);
    } else if (mode === 'goal') {
      playBlast(0, 0.25);
      playBlast(0.32, 0.55);
    } else {
      playBlast(0, 0.22);
      playBlast(0.28, 0.22);
      playBlast(0.56, 0.65);
    }
  }

  public playGoalRoar(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 2.6;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.linearRampToValueAtTime(920, now + 0.45);
    filter.frequency.exponentialRampToValueAtTime(380, now + duration);
    filter.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.25);
    gain.gain.setValueAtTime(0.26, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playSkillMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Double boot-touch + agile air whoosh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playUIClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.035);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }
}

export const soundEngine = new SoundEngine();
