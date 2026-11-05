/** Procedural ambience: wind that strengthens with altitude, muffled indoors, plus an elevator hum. No audio files needed. */
export class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private cityGain: GainNode | null = null
  private liftGain: GainNode | null = null
  private muted = false
  private t = 0

  start() {
    if (this.ctx) return this.resume()
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AC()
    } catch {
      return
    }
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ctx.destination)
    // brown-ish noise buffer
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
    const mk = () => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.start()
      return s
    }
    // wind
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 500
    this.windFilter.Q.value = 0.6
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    mk().connect(this.windFilter).connect(this.windGain).connect(this.master)
    // city / traffic rumble
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    this.cityGain = ctx.createGain()
    this.cityGain.gain.value = 0.2
    mk().connect(lp).connect(this.cityGain).connect(this.master)
    // lift hum
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 52
    const olp = ctx.createBiquadFilter()
    olp.type = 'lowpass'
    olp.frequency.value = 160
    this.liftGain = ctx.createGain()
    this.liftGain.gain.value = 0
    osc.connect(olp).connect(this.liftGain).connect(this.master)
    osc.start()
  }
  resume() {
    this.ctx?.resume?.()
  }
  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1)
  }
  setLift(on: boolean) {
    if (this.liftGain && this.ctx) this.liftGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.4)
  }
  update(alt: number, indoor: number, lift: boolean) {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.cityGain) return
    this.t += 0.016
    const now = this.ctx.currentTime
    const gust = 0.75 + 0.25 * Math.sin(this.t * 0.7) * Math.sin(this.t * 0.23 + 1)
    const wind = Math.min(1, 0.08 + alt / 190) * gust * (1 - 0.88 * indoor) * (lift ? 0 : 1)
    this.windGain.gain.setTargetAtTime(wind * 0.5, now, 0.2)
    this.windFilter.frequency.setTargetAtTime(380 + alt * 4 + gust * 140, now, 0.3)
    this.cityGain.gain.setTargetAtTime((0.26 * Math.max(0.1, 1 - alt / 220)) * (1 - 0.6 * indoor) * (lift ? 0 : 1), now, 0.4)
  }
  dispose() {
    this.ctx?.close?.()
    this.ctx = null
  }
}
