/** Procedural ambience: wind through reeds, lapping canal water and distant birdsong. No audio assets required. */
export class Ambience {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private waterGain!: GainNode
  private birdTimer = 0
  private on = false
  private wind = 0.5
  private lfoT = 0

  start() {
    if (this.ctx) {
      this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC() as AudioContext
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.2 * 0.5 + w * 0.25
    }
    const mkNoise = () => {
      const s = ctx.createBufferSource()
      s.buffer = noiseBuf
      s.loop = true
      s.start(0, Math.random() * 3)
      return s
    }
    // wind
    const wn = mkNoise()
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 420
    this.windFilter.Q.value = 0.6
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0.2
    wn.connect(this.windFilter).connect(this.windGain).connect(this.master)
    // water
    const wa = mkNoise()
    const wf = ctx.createBiquadFilter()
    wf.type = 'lowpass'
    wf.frequency.value = 700
    this.waterGain = ctx.createGain()
    this.waterGain.gain.value = 0.05
    wa.connect(wf).connect(this.waterGain).connect(this.master)
    this.setOn(true)
  }

  setOn(on: boolean) {
    this.on = on
    if (!this.ctx) return
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.linearRampToValueAtTime(on ? 0.55 : 0, this.ctx.currentTime + 0.8)
  }
  setWind(w: number) {
    this.wind = w
  }

  private chirp() {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + 0.02
    const base = 2200 + Math.random() * 2600
    const notes = 2 + Math.floor(Math.random() * 5)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pan) pan.pan.value = Math.random() * 2 - 1
    const g = ctx.createGain()
    g.gain.value = 0.0
    const vol = 0.012 + Math.random() * 0.02
    if (pan) g.connect(pan).connect(this.master)
    else g.connect(this.master)
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const st = t0 + i * (0.09 + Math.random() * 0.05)
      const f0 = base * (0.85 + Math.random() * 0.4)
      o.frequency.setValueAtTime(f0, st)
      o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.8), st + 0.08)
      const eg = ctx.createGain()
      eg.gain.setValueAtTime(0, st)
      eg.gain.linearRampToValueAtTime(vol, st + 0.01)
      eg.gain.exponentialRampToValueAtTime(0.0001, st + 0.1)
      o.connect(eg).connect(g)
      g.gain.value = 1
      o.start(st)
      o.stop(st + 0.12)
    }
  }

  update(dt: number) {
    if (!this.ctx || !this.on) return
    this.lfoT += dt
    const gust = 0.5 + 0.5 * Math.sin(this.lfoT * 0.23) * Math.sin(this.lfoT * 0.11 + 1)
    this.windGain.gain.setTargetAtTime(0.05 + this.wind * 0.22 * (0.5 + gust), this.ctx.currentTime, 0.5)
    this.windFilter.frequency.setTargetAtTime(260 + this.wind * 380 + gust * 160, this.ctx.currentTime, 0.4)
    this.birdTimer -= dt
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.2 + Math.random() * 5
      this.chirp()
    }
  }
}
