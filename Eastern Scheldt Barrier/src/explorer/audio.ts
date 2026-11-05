/* Procedural ambience: no audio files needed. Wind, sea swell, gulls, distant traffic and gate machinery. */
export class Ambience {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private seaGain!: GainNode
  private roadGain!: GainNode
  private rumbleGain!: GainNode
  private gullTimer: number | null = null
  enabled = false
  private storm = 0
  private wind = 0.5
  private road = 0

  private noise(ctx: AudioContext, kind: 'brown' | 'pink') {
    const len = ctx.sampleRate * 5
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let last = 0
      let b0 = 0, b1 = 0, b2 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02
          d[i] = last * 3.5
        } else {
          b0 = 0.99765 * b0 + w * 0.099046
          b1 = 0.963 * b1 + w * 0.2965164
          b2 = 0.57 * b2 + w * 1.0526913
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
        }
      }
      // cross-fade the loop point
      const f = 2000
      for (let i = 0; i < f; i++) d[len - f + i] = d[len - f + i] * (1 - i / f) + d[i] * (i / f)
    }
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.loop = true
    s.start()
    return s
  }

  private lfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam) {
    const o = ctx.createOscillator()
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = depth
    o.connect(g).connect(target)
    o.start()
  }

  private init() {
    if (this.ctx) return
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // wind
    const wind = this.noise(ctx, 'brown')
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 520
    this.windFilter.Q.value = 0.45
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0.2
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master)
    this.lfo(ctx, 0.11, 0.07, this.windGain.gain)
    this.lfo(ctx, 0.07, 160, this.windFilter.frequency)

    // sea swell
    const sea = this.noise(ctx, 'pink')
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    this.seaGain = ctx.createGain()
    this.seaGain.gain.value = 0.16
    sea.connect(lp).connect(this.seaGain).connect(this.master)
    this.lfo(ctx, 0.09, 0.09, this.seaGain.gain)
    this.lfo(ctx, 0.13, 260, lp.frequency)

    // traffic hum
    const road = this.noise(ctx, 'brown')
    const rl = ctx.createBiquadFilter()
    rl.type = 'lowpass'
    rl.frequency.value = 260
    this.roadGain = ctx.createGain()
    this.roadGain.gain.value = 0
    road.connect(rl).connect(this.roadGain).connect(this.master)
    this.lfo(ctx, 0.3, 0.02, this.roadGain.gain)

    // gate machinery
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 41
    const ol = ctx.createBiquadFilter()
    ol.type = 'lowpass'
    ol.frequency.value = 130
    this.rumbleGain = ctx.createGain()
    this.rumbleGain.gain.value = 0
    o.connect(ol).connect(this.rumbleGain).connect(this.master)
    o.start()
    this.apply()
  }

  private chirp() {
    const ctx = this.ctx
    if (!ctx || !this.enabled) return
    const t0 = ctx.currentTime
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 2 - 1
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1900
    f.Q.value = 3
    const g = ctx.createGain()
    g.gain.value = 0
    f.connect(g).connect(pan).connect(this.master)
    const n = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      const s = t0 + i * 0.27
      const base = 1500 + Math.random() * 500
      o.frequency.setValueAtTime(base * 1.25, s)
      o.frequency.exponentialRampToValueAtTime(base * 0.85, s + 0.2)
      o.connect(f)
      o.start(s)
      o.stop(s + 0.25)
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(0.045 * (1 - this.storm * 0.4), s + 0.04)
      g.gain.linearRampToValueAtTime(0, s + 0.22)
    }
  }

  private scheduleGull() {
    if (this.gullTimer) window.clearTimeout(this.gullTimer)
    this.gullTimer = window.setTimeout(() => {
      this.chirp()
      this.scheduleGull()
    }, 5000 + Math.random() * 11000)
  }

  private apply() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const s = this.storm
    this.windGain.gain.setTargetAtTime(this.enabled ? 0.12 + this.wind * 0.18 + s * 0.35 : 0, t, 0.8)
    this.windFilter.frequency.setTargetAtTime(420 + s * 400 + this.wind * 200, t, 1)
    this.seaGain.gain.setTargetAtTime(this.enabled ? 0.14 + s * 0.22 : 0, t, 0.8)
    this.roadGain.gain.setTargetAtTime(this.enabled ? this.road * 0.09 : 0, t, 0.6)
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, t, 0.5)
  }

  async setEnabled(on: boolean) {
    this.enabled = on
    if (on) {
      this.init()
      await this.ctx!.resume()
      this.scheduleGull()
    } else if (this.gullTimer) window.clearTimeout(this.gullTimer)
    this.apply()
  }

  setStorm(s: number) {
    this.storm = s
    this.apply()
  }
  setWind(w: number) {
    this.wind = w
    this.apply()
  }
  setRoad(r: number) {
    this.road = r
    this.apply()
  }
  setRumble(level: number) {
    if (!this.ctx) return
    this.rumbleGain.gain.setTargetAtTime(this.enabled ? level * 0.16 : 0, this.ctx.currentTime, 0.4)
  }

  dispose() {
    if (this.gullTimer) window.clearTimeout(this.gullTimer)
    this.ctx?.close()
  }
}
