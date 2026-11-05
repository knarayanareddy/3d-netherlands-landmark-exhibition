import * as THREE from 'three'
import {
  Landmark, bake, beam, box, colorMat, concreteMat, curtainMat, extrudeUV, groundSlab, newGroup, paveMat, rectPoly, steelMat, tube, v3, waterMat, waterRect, asphaltMat, rng,
} from '../kit'
import { car, lampPost } from '../props'

const RAMP_X = 6.5
const END_X = 10.4
const DECK_Y = 1.3
function deckY(x: number) {
  const a = Math.abs(x)
  if (a <= RAMP_X) return DECK_Y
  return 0.07 + (DECK_Y - 0.07) * Math.max(0, (END_X - a) / (END_X - RAMP_X))
}

export function buildErasmus(): Landmark {
  const g = newGroup()
  const R = 11
  const conc = concreteMat('#bdbab2')
  const pale = steelMat('#cfd9e0', 0.35)
  const asphalt = asphaltMat('#303337')
  groundSlab(g, R, paveMat('#8f877b'), colorMat('#6d655a', 1), [rectPoly(-6.2, -8.4, 6.2, 8.4)])
  waterRect(g, -6.2, -8.4, 6.2, 8.4, -0.22, waterMat('#2b5361', 0.9))

  const s = newGroup()
  // deck
  box(s, 13.4, 0.32, 2.7, [pale, pale, asphalt, pale, pale, pale], 0, 0.98, 0)
  for (const sg of [-1, 1]) {
    beam(s, v3(sg * END_X, 0.0, 0), v3(sg * (RAMP_X + 0.1), 1.12, 0), 0.32, 2.7, asphalt)
  }
  // lane markings
  box(s, 13.2, 0.012, 0.05, colorMat('#e8e8e0', 0.7), 0, 1.31, 0.55)
  box(s, 13.2, 0.012, 0.05, colorMat('#e8e8e0', 0.7), 0, 1.31, -0.55)
  // railings & lamps
  for (const z of [-1.3, 1.3]) {
    box(s, 13.4, 0.05, 0.04, pale, 0, 1.62, z)
    box(s, 13.4, 0.04, 0.04, pale, 0, 1.42, z)
    for (let i = 0; i <= 26; i++) box(s, 0.03, 0.32, 0.03, pale, -6.5 + i * 0.5, 1.3, z)
  }
  for (let i = 0; i < 6; i++) for (const z of [-1.28, 1.28]) lampPost(s, -5.2 + i * 2.2, z, 1.3, DECK_Y)
  // piers
  box(s, 1.1, 1.8, 1.5, conc, -2.2, -0.5, 0)
  box(s, 0.7, 1.7, 1.2, conc, -5.4, -0.5, 0)
  box(s, 0.7, 1.7, 1.2, conc, 3.6, -0.5, 0)

  // pylon: straight lower leg + back-leaning upper leg
  const P0 = v3(-2.2, 1.2, 0)
  const P1 = v3(-2.2, 5.0, 0)
  const P2 = v3(-3.9, 10.3, 0)
  beam(s, P0, P1.clone().add(v3(0, 0.1, 0)), 0.62, 0.52, pale)
  beam(s, P1.clone().add(v3(0, -0.1, 0)), P2, 0.52, 0.44, pale)
  // cable stays
  const cable = steelMat('#e6ebef', 0.3)
  const upper = (t: number) => P1.clone().lerp(P2, t)
  for (let k = 0; k <= 12; k++) {
    const t = 0.18 + (k / 12) * 0.8
    const a = upper(t).add(v3(0.28, 0, 0))
    const bx = -0.2 + (k / 12) * 6.4
    tube(s, a, v3(bx, DECK_Y + 0.02, 0), 0.016, cable, 4)
  }
  for (let k = 0; k < 7; k++) {
    const t = 0.55 + (k / 6) * 0.43
    const a = upper(t).add(v3(-0.28, 0, 0))
    const bx = -3.4 - k * 0.5
    tube(s, a, v3(bx, DECK_Y + 0.02, 0), 0.03, cable, 5)
  }
  // anchor block
  box(s, 1.0, 0.5, 1.8, conc, -6.4, 1.3, 0)

  // skyline
  const cm = [curtainMat('#4c6f86'), curtainMat('#6b8aa0'), curtainMat('#3f5a6c')]
  const topM = concreteMat('#a9a7a0')
  const tower = (x: number, z: number, w: number, d: number, h: number, ci: number) => box(s, w, h, d, [cm[ci], cm[ci], topM, topM, cm[ci], cm[ci]], x, 0, z)
  // "De Rotterdam"-like stacked tower
  tower(8.3, -5.0, 1.6, 1.4, 4.0, 0)
  tower(8.6, -4.8, 1.3, 1.2, 6.2, 1)
  tower(8.3, -5.3, 1.3, 1.3, 8.0, 0)
  tower(8.4, 4.4, 1.2, 1.2, 7.4, 2)
  tower(7.4, 6.2, 1.4, 1.2, 4.2, 1)
  tower(-8.4, -4.6, 1.3, 1.3, 5.6, 1)
  tower(-8.6, 4.8, 1.6, 1.3, 3.8, 0)
  tower(-7.2, 6.8, 1.2, 1.2, 6.4, 2)
  tower(-7.3, -6.9, 1.2, 1.4, 3.6, 0)
  const tr = rng(3)
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1
    box(s, 0.9 + tr() * 0.5, 1.0 + tr() * 0.8, 0.9, colorMat(['#a35b45', '#b8a98c', '#8a8d93'][i % 3], 0.8), side * (9.1 + (i % 2) * 0.1), 0, -2.8 + (i % 4) * 1.9 + (i > 3 ? 0 : 0.3))
  }
  bake(s)
  g.add(s)

  // traffic
  const cars = ['#c33b2b', '#2e5aa8', '#e9e9e4', '#e0b02e', '#3c3f45', '#2f8a5a'].map((c, i) => {
    const m = car(c)
    const dir = i % 2 ? 1 : -1
    g.add(m)
    return { m, dir, off: i * 3.7, lane: dir * 0.55 }
  })
  // barge
  const barge = newGroup()
  const hull = colorMat('#23272c', 0.6, 0.3)
  box(barge, 0.7, 0.35, 3.6, hull, 0, -0.2, 0)
  box(barge, 0.5, 0.3, 0.6, colorMat('#e9e9e4', 0.6), 0, 0.15, -1.3)
  box(barge, 0.25, 0.3, 0.25, colorMat('#e9e9e4', 0.6), 0, 0.45, -1.3)
  for (let i = 0; i < 4; i++) box(barge, 0.52, 0.3, 0.55, colorMat(['#2f5aa8', '#c4572a', '#d9a63a', '#3b8a6a'][i], 0.6, 0.2), 0, 0.15, -0.5 + i * 0.7)
  bake(barge)
  g.add(barge)

  return {
    group: g,
    radius: R,
    colliders: [[-2.2, 0, 0.8, 0.9], [0, 5.1, 6.2, 3.3], [0, -5.1, 6.2, 3.3], [8.3, -5.0, 1.0, 1.0], [8.4, 4.4, 0.8, 0.8], [-8.4, -4.6, 0.8, 0.8], [-7.2, 6.8, 0.8, 0.8]],
    floor: (x, z) => (Math.abs(z) < 1.5 && Math.abs(x) < END_X ? deckY(x) : 0),
    update: (t) => {
      for (const c of cars) {
        const L = 20.8
        const x = ((((t * 1.6 * c.dir + c.off) % L) + L) % L) - L / 2
        c.m.position.set(x, deckY(x) + 0.02, c.lane)
        c.m.rotation.y = c.dir > 0 ? 0 : Math.PI
      }
      barge.position.set(2.4, -0.12, Math.sin(t * 0.13) * 6.2)
    },
  }
}

void THREE
void extrudeUV
