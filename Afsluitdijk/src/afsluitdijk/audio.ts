// Fully procedural ambience: wind, waves on the Levvel blocks, A7 traffic hum, gull calls.

export interface AudioInfo {
  roadDist: number
  indoor: boolean
  height: number
  waterDist: number
}

export class AmbientAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private wind!: GainNode
  private windF!: BiquadFilterNode
  private waves!: GainNode
  private road!: GainNode
  private timer = 0
  enabled = false

  private noiseBuffer(ctx: AudioContext) {
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = (Math.random() * 2 - 1) * 0.5 + last * 6
    }
    return buf
  }

  start() {
    if (this.ctx) {
      void this.ctx.resume()
      this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.3)
      this.enabled = true
      return
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    const buf = this.noiseBuffer(ctx)
    const mk = (type: BiquadFilterType, f: number, q: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.loopStart = Math.random() * 2
      const flt = ctx.createBiquadFilter()
      flt.type = type
      flt.frequency.value = f
      flt.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(flt).connect(g).connect(this.master)
      src.start()
      return { g, flt }
    }
    const w = mk('bandpass', 420, 0.5)
    this.wind = w.g
    this.windF = w.flt
    this.waves = mk('lowpass', 520, 0.4).g
    this.road = mk('lowpass', 170, 0.7).g
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.5)
    this.enabled = true
    const chirp = () => {
      if (!this.ctx || !this.enabled) return
      const t0 = ctx.currentTime
      const n = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 2100
        bp.Q.value = 3
        const g = ctx.createGain()
        const s = t0 + i * 0.3
        o.frequency.setValueAtTime(1500 + Math.random() * 400, s)
        o.frequency.exponentialRampToValueAtTime(950, s + 0.24)
        g.gain.setValueAtTime(0, s)
        g.gain.linearRampToValueAtTime(0.05, s + 0.04)
        g.gain.exponentialRampToValueAtTime(0.0008, s + 0.26)
        o.connect(bp).connect(g).connect(this.master)
        o.start(s)
        o.stop(s + 0.3)
      }
    }
    this.timer = window.setInterval(() => {
      if (Math.random() < 0.55) chirp()
    }, 6500)
  }

  stop() {
    this.enabled = false
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
  }

  update(t: number, i: AudioInfo) {
    if (!this.ctx || !this.enabled) return
    const now = this.ctx.currentTime
    const gust = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1)
    const open = i.indoor ? 0.18 : 1
    const alt = 1 + Math.min(i.height, 25) * 0.025
    this.wind.gain.setTargetAtTime(0.09 * gust * open * alt, now, 0.2)
    this.windF.frequency.setTargetAtTime(320 + gust * 380, now, 0.3)
    const wv = Math.exp(-Math.max(0, i.waterDist) / 70)
    this.waves.gain.setTargetAtTime((0.04 + 0.12 * wv) * (0.7 + 0.3 * Math.sin(t * 0.7)) * open, now, 0.3)
    this.road.gain.setTargetAtTime((0.015 + 0.1 * Math.exp(-i.roadDist / 28)) * (i.indoor ? 0.35 : 1), now, 0.3)
  }

  dispose() {
    window.clearInterval(this.timer)
    if (this.ctx) void this.ctx.close()
    this.ctx = null
  }
}
