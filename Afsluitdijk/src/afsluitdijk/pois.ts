import { segmentsAt, terrainY, ROAD_Y } from './profile'
import { BD, BX, P0, SX, SZ, TOWER_H, TX, TZ } from './monument'

export interface Poi {
  id: string
  title: string
  kicker: string
  body: string
  fact?: string
  /** x, z (and optional absolute feet height) */
  at: [number, number, number?]
  look: [number, number, number]
  /** how close the walker must be before the caption shows up */
  radius: number
}

const seg = (x: number, id: string) => {
  const s = segmentsAt(x).find((q) => q.id === id)!
  return { z: (s.za + s.zb) / 2, za: s.za, zb: s.zb }
}

const berm = seg(-110, 'berm')
const slope = seg(70, 'slopeS')

export const POIS: Poi[] = [
  {
    id: 'arrival',
    title: 'The Afsluitdijk',
    kicker: 'Arrival · km 20, the Vlieter',
    body: 'A 32 km closing dike between North Holland and Friesland. On your left the salty Wadden Sea, on your right the freshwater IJsselmeer. The A7 motorway runs along its crest, around 7.8 m above NAP.',
    fact: 'Built 1927–1932 by thousands of workers. The final gap was closed on 28 May 1932.',
    at: [-96, 15.9],
    look: [TX, P0 + 14, TZ],
    radius: 22,
  },
  {
    id: 'tower',
    title: 'Dudok’s Monument Tower',
    kicker: 'Vlietermonument · 1933',
    body: 'Willem Dudok’s stepped brick watchtower marks the spot where the last gap in the dike was closed. At the entrance a bronze relief by Hildo Krop shows three stone-setters laying basalt blocks. Enter and climb the spiral stair.',
    fact: '“Een volk dat leeft bouwt aan zijn toekomst” — a nation that lives, builds for its future.',
    at: [TX + 11.5, TZ + 2.5],
    look: [TX + 5.5, P0 + 2.2, TZ - 2.2],
    radius: 16,
  },
  {
    id: 'balcony',
    title: 'The balcony, ~25 m up',
    kicker: 'Top of the tower',
    body: 'From the open balcony you look north over the Wadden Sea, and south over the IJsselmeer. Both sides of the dike are visible at once, the straight crest vanishing in both directions.',
    fact: 'The tower’s height was a deliberate vertical accent in a landscape that is otherwise flat.',
    at: [TX, TZ - 4.6, P0 + TOWER_H],
    look: [TX - 120, P0 + TOWER_H - 6, TZ - 340],
    radius: 6,
  },
  {
    id: 'a7',
    title: 'The A7 from the footbridge',
    kicker: 'Footbridge over the motorway',
    body: 'Two carriageways, each with two lanes and a hard shoulder, are separated by a steel crash barrier in the median. Tens of thousands of vehicles cross the dike every day.',
    fact: 'The crest was raised several times since 1958; the current reinforcement added another ~2 m.',
    at: [BX, 0, BD],
    look: [BX + 500, ROAD_Y + 4, 0],
    radius: 12,
  },
  {
    id: 'lely',
    title: 'Statue of Cornelis Lely',
    kicker: 'Mari Andriessen · 1954',
    body: 'The bronze statue honours Cornelis Lely (1854–1929), the engineer who campaigned for decades for the Zuiderzee Works. It was unveiled on the 100th anniversary of his birth, on the border between salt and fresh water.',
    fact: 'The Zuiderzee Act that made the dike possible passed in 1918, after the storm floods of 1916.',
    at: [SX - 1, SZ + 10.5],
    look: [SX, P0 + 6.2, SZ],
    radius: 14,
  },
  {
    id: 'wadden',
    title: 'Wadden Sea side',
    kicker: 'Levvel-bloc revetment',
    body: 'The lower slope on the sea side is armoured with about 70,000 Levvel-blocs — 6.5-tonne interlocking concrete blocks that break waves and let storm surges drain over the crest. Above them, the older basalt revetment remains.',
    fact: 'Each Levvel-bloc is 2.8 m × 2.3 m × 1.13 m. The tide rises and falls over them every day.',
    at: [-110, berm.z, 4.05],
    look: [-70, 0, berm.z - 140],
    radius: 14,
  },
  {
    id: 'ijsselmeer',
    title: 'IJsselmeer shore',
    kicker: 'Fresh water, grass slope',
    body: 'On the lake side the dike is a smooth grassed slope with a rip-rap toe and reed fringes. Behind the dike, the Zuiderzee became a freshwater lake — the largest in Western Europe.',
    fact: 'The IJsselmeer level is kept near NAP −0.4 m and drains to the Wadden Sea through the Stevin and Lorentz locks.',
    at: [70, slope.zb - 3.5],
    look: [120, 2, 420],
    radius: 16,
  },
  {
    id: 'turbines',
    title: 'Wind farm',
    kicker: 'Renewable energy',
    body: 'Wind turbines line the lake side of the dike — a fitting modern footnote to a landscape shaped by Dutch engineering and wind.',
    at: [150, slope.zb - 3.5],
    look: [190, 70, 140],
    radius: 20,
  },
]

export const TOUR = ['arrival', 'tower', 'balcony', 'a7', 'lely', 'wadden', 'ijsselmeer', 'turbines']

export function poiFeetY(p: Poi): number {
  return p.at[2] !== undefined ? p.at[2] : terrainY(p.at[0], p.at[1])
}
