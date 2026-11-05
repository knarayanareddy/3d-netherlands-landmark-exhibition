/** Procedural ambience: wind, traffic, birdsong, pond, aquarium hum, footsteps. No assets. */
export class Ambience {
  private ac: AudioContext | null = null
  private master!: GainNode
  private wind!: GainNode
  private traffic!: GainNode
  private water!: GainNode
  private hum!: GainNode
  private bubble!: GainNode
  private birdsT = 0
  private noise!: AudioBuffer
  muted = false
  on = false

  start() {
    if (this.on) return
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ac = new AC()
    } catch {
      return
    }
    const ac = this.ac
    this.master = ac.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ac.destination)
    // noise buffer
    const len = ac.sampleRate * 3
    this.noise = ac.createBuffer(1, len, ac.sampleRate)
    const d = this.noise.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12
    }
    const loop = (type: BiquadFilterType, f: number, q: number, g: number) => {
      const src = ac.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      src.playbackRate.value = 0.9 + Math.random() * 0.2
      const flt = ac.createBiquadFilter()
      flt.type = type
      flt.frequency.value = f
      flt.Q.value = q
      const gn = ac.createGain()
      gn.gain.value = g
      src.connect(flt).connect(gn).connect(this.master)
      src.start()
      return gn
    }
    this.wind = loop('bandpass', 420, 0.4, 0.05)
    this.traffic = loop('lowpass', 140, 0.7, 0.0)
    this.water = loop('bandpass', 1500, 0.8, 0.0)
    this.bubble = loop('bandpass', 700, 2.0, 0.0)
    const hum = ac.createGain()
    hum.gain.value = 0
    for (const f of [55, 82.4, 110.3]) {
      const o = ac.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ac.createGain()
      g.gain.value = f < 60 ? 0.5 : 0.2
      o.connect(g).connect(hum)
      o.start()
    }
    hum.connect(this.master)
    this.hum = hum
    // gentle LFO on bubble gain via periodic scheduling in update()
    this.on = true
    if (ac.state === 'suspended') void ac.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ac) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ac.currentTime, 0.1)
  }

  private chirp(pan: number, vol: number) {
    const ac = this.ac!
    const t0 = ac.currentTime
    const n = 2 + ((Math.random() * 4) | 0)
    const base = 2200 + Math.random() * 2600
    const p = ac.createStereoPanner()
    p.pan.value = pan
    p.connect(this.master)
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator()
      o.type = 'sine'
      const g = ac.createGain()
      const s = t0 + i * (0.09 + Math.random() * 0.05)
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), s)
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.4), s + 0.07)
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(vol, s + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09)
      o.connect(g).connect(p)
      o.start(s)
      o.stop(s + 0.12)
    }
  }

  update(dt: number, s: { inside: number; street: number; pond: number; night: number }) {
    if (!this.ac || !this.on) return
    const t = this.ac.currentTime
    const out = 1 - s.inside
    this.wind.gain.setTargetAtTime(0.045 * out, t, 0.4)
    this.traffic.gain.setTargetAtTime((0.05 + 0.5 * s.street) * (0.25 + 0.75 * out) * 0.5, t, 0.5)
    this.water.gain.setTargetAtTime(0.03 * s.pond * out, t, 0.4)
    this.hum.gain.setTargetAtTime(0.028 * s.inside, t, 0.5)
    this.bubble.gain.setTargetAtTime((0.05 + 0.04 * Math.sin(t * 3.1) * Math.sin(t * 1.3)) * s.inside, t, 0.15)
    this.birdsT -= dt
    if (this.birdsT <= 0) {
      this.birdsT = 0.8 + Math.random() * 3.2
      const v = 0.035 * out * (1 - s.night * 0.95) * (1 - s.street * 0.5)
      if (v > 0.002) this.chirp(Math.random() * 2 - 1, v)
    }
  }

  step(surface: 'gravel' | 'paving' | 'grass' | 'indoor' | 'wood', run: boolean) {
    if (!this.ac || !this.on) return
    const ac = this.ac
    const src = ac.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 1 + Math.random() * 0.4
    const f = ac.createBiquadFilter()
    const cfg = { gravel: ['highpass', 1800, 0.1], paving: ['bandpass', 1400, 0.09], grass: ['lowpass', 700, 0.06], indoor: ['bandpass', 2200, 0.09], wood: ['bandpass', 600, 0.12] }[surface] as [BiquadFilterType, number, number]
    f.type = cfg[0]
    f.frequency.value = cfg[1] * (0.9 + Math.random() * 0.2)
    const g = ac.createGain()
    const t = ac.currentTime
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(cfg[2] * (run ? 1.4 : 1), t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'gravel' ? 0.14 : 0.08))
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 2, 0.2)
  }

  dispose() {
    this.on = false
    void this.ac?.close()
    this.ac = null
  }
}
