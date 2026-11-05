/**
 * Erasmusbrug – shared dimensions (metres, true scale).
 *
 * Axis convention
 *   +x  : along the bridge, from the south (Kop van Zuid) towards the north (city centre)
 *   +z  : "east" – upstream along the Nieuwe Maas (right-hand side when walking north)
 *   +y  : up. Water level = 0.
 *
 * Sources: UNStudio / Wikipedia – total length 802 m, pylon 139 m, main span 284 m,
 * bascule 89 m, deck 33.8 m wide, two box-girder spines (2.25 x 1.25 m) every 4.9 m
 * joined by cross-beams, 6.7 m cantilevers for cyclists & pedestrians, 4 traffic lanes +
 * 2 tram tracks between the spines, 32 forestays + 8 backstays.
 */
export const X_START = -360 // south end of the approach ramp
export const X_END = 446 // north end of the approach ramp  (446 + 360 = 806 ≈ 802 m)
export const X_PYLON = 0
export const X_MAIN_END = 284 // north river pier / end of the cable-stayed span
export const X_BASCULE0 = -130 // south quay / bascule abutment
export const X_BASCULE1 = -41 // bascule pier
export const WATER_X0 = -130
export const WATER_X1 = 290
export const LAND_Y = 3.0
export const PYLON_TOP = 139

// deck cross-section (half widths, metres from the centre line)
export const TRAM_HALF = 2.7
export const SPINE_IN = 8.95
export const SPINE_OUT = 10.2
export const CYCLE_OUT = 13.4
export const DECK_HALF = 16.9
export const RAIL_Z = 16.62
export const STAY_SPACING = 4.9

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Top-of-roadway elevation along the bridge. */
export function deckY(x: number): number {
  if (x <= X_START) return LAND_Y
  if (x < X_BASCULE0) {
    const t = (x - X_START) / (X_BASCULE0 - X_START)
    return LAND_Y + 12 * (0.5 * t + 0.5 * smooth(t))
  }
  if (x < X_PYLON) {
    const t = (x - X_BASCULE0) / (X_PYLON - X_BASCULE0)
    return 15 + 2 * smooth(t)
  }
  if (x < X_MAIN_END) {
    const u = x / X_MAIN_END
    return 17 - 3.6 * smooth(u)
  }
  if (x < X_END) {
    const t = (x - X_MAIN_END) / (X_END - X_MAIN_END)
    return 13.4 - 10.4 * (0.5 * t + 0.5 * smooth(t))
  }
  return LAND_Y
}

/** Structural depth of the deck girder (grows near the pylon where it is a heavy white box). */
export function deckDepth(x: number): number {
  const base = 2.25
  const nearPylon = Math.exp(-Math.pow((x + 12) / 34, 2)) * 1.5
  const approach = x < X_BASCULE0 || x > X_MAIN_END ? 0.5 : 0
  return base + nearPylon + approach
}

export const isSteelDeck = (x: number) => x >= X_BASCULE0 && x <= X_MAIN_END

/** Pylon key points (x, y). Base on the pier, kink where the two legs merge, top. */
export const PYLON = {
  legFoot: [3.5, 7.5] as [number, number],
  legFootZ: 19.2,
  kink: [-26, 72] as [number, number],
  top: [-12, 139] as [number, number],
}

export interface Viewpoint {
  id: string
  title: string
  caption: string
  mode: 'walk' | 'orbit' | 'fly'
  pos: [number, number, number]
  look: [number, number, number]
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'river',
    title: 'From the river',
    caption: 'The classic postcard: the Swan seen from the Nieuwe Maas.',
    mode: 'orbit',
    pos: [30, 14, -245],
    look: [95, 52, 0],
  },
  {
    id: 'deck',
    title: 'Walk the deck',
    caption: 'Cycle path, cables and skyline – step onto the main span.',
    mode: 'walk',
    pos: [34, 17.2 + 0, 12.2],
    look: [150, 17, 12.2],
  },
  {
    id: 'pylon',
    title: 'Beneath the pylon',
    caption: 'Stand between the pylon’s two legs and look up 139 m.',
    mode: 'walk',
    pos: [-18, 17.2, 0],
    look: [-26, 90, 0],
  },
  {
    id: 'bascule',
    title: 'The bascule span',
    caption: 'Western Europe’s largest bascule bridge – 89 m that lifts for tall ships.',
    mode: 'orbit',
    pos: [-60, 13, -150],
    look: [-85, 17, 0],
  },
  {
    id: 'under',
    title: 'Under the deck',
    caption: 'The slender steel box girder and cross-beams every 4.9 m.',
    mode: 'fly',
    pos: [130, 6, 30],
    look: [150, 12.5, 0],
  },
  {
    id: 'north',
    title: 'North quay (Boompjes)',
    caption: 'Look back across the water at the Kop van Zuid skyline.',
    mode: 'orbit',
    pos: [330, 12, -40],
    look: [-60, 55, 0],
  },
  {
    id: 'aerial',
    title: 'Aerial',
    caption: 'The whole 802 m crossing from above.',
    mode: 'orbit',
    pos: [-420, 260, 520],
    look: [20, 20, 0],
  },
  {
    id: 'top',
    title: 'Pylon summit',
    caption: 'The view from the top of the Swan’s neck.',
    mode: 'fly',
    pos: [-8, 146, 4],
    look: [220, 20, 0],
  },
]

export interface Hotspot {
  id: string
  title: string
  pos: [number, number, number]
  body: string
  stats: [string, string][]
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: 'pylon',
    title: 'The Swan’s neck – the pylon',
    pos: [-12, 126, 0],
    body: 'A single asymmetric steel pylon, bent like a swan’s neck. Its two splayed legs rise from a concrete pier, merge into one mast and finish in a dark-tinted crown. Painted a pale sky-blue that reads as white from a distance.',
    stats: [['Height', '139 m'], ['Weight', '≈ 1,800 t of steel'], ['Architect', 'Ben van Berkel (UNStudio)']],
  },
  {
    id: 'stays',
    title: 'Stay cables',
    pos: [95, 92, 4],
    body: 'Thirty-two forestays – 16 pairs fanned out from the top of the mast – carry the main span, while eight heavy backstays anchor the pylon behind. Because the pylon leans back, the backstays keep the whole structure in balance.',
    stats: [['Forestays', '32 (16 pairs)'], ['Backstays', '8'], ['Longest cable', '≈ 280 m']],
  },
  {
    id: 'deck',
    title: 'A deck made of two spines',
    pos: [150, 16.5, 9.6],
    body: 'Two steel box-girder “spines” (2.25 × 1.25 m) carry the cables. They are tied together every 4.9 m by cross-beams that cantilever 6.7 m outwards to carry the cycle paths and footways. Four traffic lanes and two tram tracks run between the spines.',
    stats: [['Width', '33.8 m'], ['Main span', '284 m'], ['Navigation clearance', '12.5 m']],
  },
  {
    id: 'bascule',
    title: 'The bascule bridge',
    pos: [-85, 18, 0],
    body: 'At the southern end an 89 m bascule span lifts to let tall vessels through – the largest and heaviest bascule bridge in Western Europe. The deck here is the same slender steel box as the cable-stayed span.',
    stats: [['Length', '89 m'], ['Opened', '6 Sept 1996 (Queen Beatrix)'], ['Total length', '802 m']],
  },
  {
    id: 'maastoren',
    title: 'Maastoren',
    pos: [-238, 168, -64],
    body: 'At 165 m, the Maastoren is the tallest building in Rotterdam’s Kop van Zuid – the former harbour district that the Erasmus Bridge was built to reconnect with the city centre.',
    stats: [['Height', '165 m'], ['Area', 'Kop van Zuid']],
  },
  {
    id: 'derotterdam',
    title: 'De Rotterdam',
    pos: [-212, 155, 140],
    body: 'Rem Koolhaas’s “vertical city”: three stacked, shifted towers joined by a shared plinth, standing on the Wilhelminapier beside the bridge.',
    stats: [['Height', '149 m'], ['Architect', 'OMA']],
  },
  {
    id: 'willems',
    title: 'Willemsbrug',
    pos: [70, 70, 1150],
    body: 'Rotterdam’s signal-red steel bridge with its tall arch was opened in 1981. It crosses the Nieuwe Maas about a kilometre upstream of the Erasmus Bridge. (Shown here simplified, in the distance.)',
    stats: [['Opened', '1981'], ['Colour', 'Signal red']],
  },
]
