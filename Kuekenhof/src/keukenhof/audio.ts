/** Procedural spring-garden soundscape (WebAudio, no assets). */
export class GardenAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windG!: GainNode
  private waterG!: GainNode
  private crowdG!: GainNode
  private noise!: AudioBuffer
  private birdT = 0
  muted = false
  volume = 0.7

  start() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume
    this.master.connect(ctx.destination)
    // pink-ish noise buffer
    const len = ctx.sampleRate * 3
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099
      b1 = 0.963 * b1 + w * 0.2965
      b2 = 0.57 * b2 + w * 1.0526
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12
    }
    this.windG = this.loop(380, 0.5, 'bandpass', 0.0)
    this.waterG = this.loop(1400, 0.4, 'lowpass', 0.0)
    this.crowdG = this.loop(640, 0.5, 'bandpass', 0.05)
  }

  private loop(freq: number, q: number, type: BiquadFilterType, gain: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
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
    return g
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1)
  }

  private chirp(daylight: number) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + 0.01
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 2 - 1
    const g = ctx.createGain()
    g.gain.value = 0
    pan.connect(g).connect(this.master)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.connect(pan)
    const species = Math.floor(Math.random() * 3)
    const base = [2800, 3800, 2100][species] * (0.9 + Math.random() * 0.25)
    const notes = [3 + Math.floor(Math.random() * 4), 2 + Math.floor(Math.random() * 3), 5 + Math.floor(Math.random() * 5)][species]
    const vol = (0.05 + Math.random() * 0.06) * daylight
    let t = t0
    for (let i = 0; i < notes; i++) {
      const dur = [0.07, 0.11, 0.05][species]
      const f0 = base * (1 + (Math.random() - 0.3) * 0.35)
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f0 * (species === 1 ? 0.7 : 1.35), t + dur)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.25)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      t += dur + 0.03 + Math.random() * 0.05
    }
    o.start(t0)
    o.stop(t + 0.1)
    o.onended = () => {
      o.disconnect()
      pan.disconnect()
      g.disconnect()
    }
  }

  step(surface: 'gravel' | 'grass' | 'paver' | 'wood', sprint: boolean) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 1.3 + Math.random() * 0.5
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    const t = ctx.currentTime
    let dur = 0.09
    let vol = 0.1
    if (surface === 'gravel') {
      f.type = 'highpass'
      f.frequency.value = 1800
      dur = 0.12
      vol = 0.16
    } else if (surface === 'grass') {
      f.type = 'lowpass'
      f.frequency.value = 900
      dur = 0.1
      vol = 0.08
    } else if (surface === 'wood') {
      f.type = 'bandpass'
      f.frequency.value = 420
      dur = 0.08
      vol = 0.22
    } else {
      f.type = 'bandpass'
      f.frequency.value = 2400
      dur = 0.06
      vol = 0.1
    }
    if (sprint) vol *= 1.3
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 2, dur + 0.05)
  }

  update(dt: number, o: { wind: number; water: number; daylight: number; crowd: number; indoors: boolean }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const mute = o.indoors ? 0.35 : 1
    this.windG.gain.setTargetAtTime((0.025 + o.wind * 0.1) * mute, t, 0.4)
    this.waterG.gain.setTargetAtTime(o.water * 0.05, t, 0.3)
    this.crowdG.gain.setTargetAtTime(0.012 + o.crowd * 0.02, t, 0.5)
    this.birdT -= dt
    if (this.birdT <= 0 && !this.muted) {
      this.chirp(o.daylight * (o.indoors ? 0.3 : 1))
      this.birdT = 0.5 + Math.random() * 2.4
    }
  }

  dispose() {
    void this.ctx?.close()
    this.ctx = null
  }
}
