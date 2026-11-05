export interface POI {
  id: string
  title: string
  subtitle: string
  body: string
  facts?: [string, string][]
  /** where the floating marker sits: world coords, or local to the show cube when `local` */
  pos: [number, number, number]
  local?: boolean
  /** only visible when the player is on this level (undefined = outdoors only) */
  level?: number
  /** walking viewpoint: stand at (x,z) looking at (lx,ly,lz) */
  view?: { pos: [number, number]; look: [number, number, number] }
}

export const LEVEL_NAMES = ['Entrance hall', 'Level 1 · Kitchen & living', 'Level 2 · Sleeping floor', 'Level 3 · Loft'] as const

export const KEY_FACTS: [string, string][] = [
  ['Architect', 'Piet Blom'],
  ['Location', 'Overblaak, Rotterdam'],
  ['Completed', '1984'],
  ['Houses', '38 cubes + 2 super-cubes'],
  ['Tilt', '45° on one corner'],
  ['Support', 'Hexagonal concrete pylons'],
]

/** Positions are filled in against the built world (see engine). Local ones are relative to the show cube. */
export const POIS: POI[] = [
  {
    id: 'overview',
    title: 'Kubuswoningen',
    subtitle: 'The Cube Houses of Rotterdam',
    body: 'Designed by Dutch architect Piet Blom and completed in 1984 above the Blaak road, next to Blaak station. Blom imagined every cube as an abstract tree and the whole cluster as a forest in the middle of the city. The complex holds 38 small cubes and two larger "super-cubes".',
    facts: [
      ['Architect', 'Piet Blom'],
      ['Completed', '1984'],
      ['Houses', '38 + 2 super-cubes'],
    ],
    pos: [-6, 15.5, -9.5],
    view: { pos: [-34, 0], look: [-4, 9, -2] },
  },
  {
    id: 'tilt',
    title: 'Tipped on a corner',
    subtitle: 'A cube rotated by 45°',
    body: 'Each house is an ordinary cube tilted so it balances on a single corner. Three faces become yellow walls and three become slate-grey "roof" faces, but every wall and ceiling is slanted. Roughly a quarter of the floor area has too little headroom to use.',
    facts: [
      ['Faces', '3 walls · 3 roof faces'],
      ['Unusable area', '≈ 25 %'],
    ],
    pos: [-12.3, 12.6, -9.5],
    view: { pos: [-12.3, -3.4], look: [-12.3, 10, -9.5] },
  },
  {
    id: 'pylon',
    title: 'Hexagonal pylons',
    subtitle: 'Stairs, entrance and structure',
    body: 'Each cube sits on a hexagonal concrete tower. The pylon carries the loads to the ground and holds the entrance and the stairs that lead up into the cube. From street level you walk right underneath the overhanging cubes.',
    pos: [4.1, 4.2, -9.5],
    view: { pos: [4.1, -1.8], look: [4.1, 4.2, -9.5] },
  },
  {
    id: 'kijk',
    title: 'Kijk-Kubus',
    subtitle: 'The furnished show cube — open door',
    body: 'Kijk-Kubus is a furnished show-house that visitors can walk through. Here the door stands open: step into the hexagonal hall, then use the spiral stair to climb through every level of the cube.',
    pos: [0, 2.6, 0],
    local: true,
    view: { pos: [3.2, 3.7], look: [0, 1.6, 9.5] },
  },
  {
    id: 'potlood',
    title: 'Het Potlood',
    subtitle: 'Blaaktoren — "the Pencil"',
    body: 'A slender tower with a sharpened-pencil roof, also by Piet Blom and part of the same Overblaak development as the cube houses.',
    pos: [-72, 52, -16],
    view: { pos: [-40, 4], look: [-72, 40, -16] },
  },
  {
    id: 'markthal',
    title: 'Markthal',
    subtitle: 'Horseshoe market hall · 2014',
    body: 'Designed by MVRDV: a market hall wrapped in apartments, with a vast painted ceiling called "Horn of Plenty" by Arno Coenen and Iris Roskam. It stands just beside the cube houses.',
    pos: [66, 34, -8],
    view: { pos: [28, 2], look: [70, 14, -8] },
  },
  {
    id: 'hall',
    title: 'Concrete entrance hall',
    subtitle: 'Inside the pylon',
    body: 'Inside the hexagonal pylon: raw concrete, letterboxes, a bench and a plant. A staircase winds up through the core of the cube.',
    pos: [0, 2.0, 0],
    local: true,
    level: 0,
  },
  {
    id: 'stair',
    title: 'Spiral staircase',
    subtitle: 'Press E to climb · Q to go down',
    body: 'The stair rises through the middle of the cube, passing through an opening in every floor. It is the only link between the levels, so every room is organised around it.',
    pos: [0, 1.4, 0],
    local: true,
    level: 0,
  },
  {
    id: 'kitchen',
    title: 'Kitchen & living nook',
    subtitle: 'Level 1',
    body: 'On the first level the floor is a triangle. Fridge and counter fill one corner where two walls meet at 60°, and a small sofa and dining table share the other two. Because the lower walls lean outward, headroom grows as you look up.',
    pos: [0, 0, 0],
    local: true,
    level: 1,
  },
  {
    id: 'sleep',
    title: 'Sleeping floor',
    subtitle: 'Level 2',
    body: 'The widest level, where the cross-section becomes a hexagon. Beds sit low against the walls that lean inward, while wardrobe, bookcase and the bathroom use the walls that lean outward. The bathroom pod has a glass shower and mirror.',
    pos: [0, 0, 0],
    local: true,
    level: 2,
  },
  {
    id: 'loft',
    title: 'Loft viewpoint',
    subtitle: 'Level 3',
    body: 'At the top the cube closes into a pyramid. One sloping window faces each direction, giving a bird\'s-eye view over the roofs of Rotterdam. Floor cushions replace furniture because there is little standing space.',
    pos: [0, 0, 0],
    local: true,
    level: 3,
  },
]
