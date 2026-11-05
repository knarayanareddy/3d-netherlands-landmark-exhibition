/** Procedural ambience (no audio files): wind, water, distant traffic and footsteps. */
export class Ambience {
  private ctx: AudioContext | null = null
  private wind!: GainNode
  private windF!: BiquadFilterNode
  private water!: GainNode
  private traffic!: GainNode
  private master!: GainNode
  private noise!: AudioBuffer
  enabled = false

  private ensure() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx
    const len = ctx.sampleRate * 3
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12
    }
    this.noise = buf
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    const loop = (type: BiquadFilterType, freq: number, q: number, gain: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.playbackRate.value = 0.9 + Math.random() * 0.2
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = gain
      src.connect(f).connect(g).connect(this.master)
      src.start()
      return { g, f }
    }
    const w = loop('bandpass', 420, 0.6, 0.3)
    this.wind = w.g
    this.windF = w.f
    this.water = loop('lowpass', 700, 0.5, 0.06).g
    this.traffic = loop('lowpass', 170, 0.8, 0.2).g
    // slow LFO on the water
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.17
    const lg = ctx.createGain()
    lg.gain.value = 0.03
    lfo.connect(lg).connect(this.water.gain)
    lfo.start()
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (on) {
      this.ensure()
      this.ctx!.resume()
    }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.3)
  }

  /** height above water (m), moving speed, closeness to roadway (0..1) */
  update(height: number, speed: number, road: number) {
    if (!this.ctx || !this.enabled) return
    const t = this.ctx.currentTime
    const h = Math.min(1, height / 120)
    this.wind.gain.setTargetAtTime(0.1 + h * 0.5 + speed * 0.01, t, 0.4)
    this.windF.frequency.setTargetAtTime(320 + h * 500, t, 0.4)
    this.traffic.gain.setTargetAtTime(0.05 + road * 0.4, t, 0.4)
    this.water.gain.setTargetAtTime(Math.max(0.01, 0.1 - h * 0.08), t, 0.6)
  }

  step(run: boolean) {
    if (!this.ctx || !this.enabled) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 1.6 + Math.random() * 0.6
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 900 + Math.random() * 500
    const g = ctx.createGain()
    const now = ctx.currentTime
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(run ? 0.9 : 0.6, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13)
    src.connect(f).connect(g).connect(this.master)
    src.start(now, Math.random() * 2, 0.16)
  }
}
