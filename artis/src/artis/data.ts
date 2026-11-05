export interface POI {
  id: string
  name: string
  nl: string
  tag: string
  year: string
  architect: string
  /** where the visitor stands */
  from: [number, number]
  /** what they look at (x, y, z) */
  look: [number, number, number]
  /** label anchor in the world */
  anchor: [number, number, number]
  blurb: string
  facts: string[]
}

export const POIS: POI[] = [
  {
    id: 'gate', name: 'Main Entrance', nl: 'Hoofdingang', tag: 'Plantage Kerklaan 38–40', year: '1838', architect: 'Natura Artis Magistra',
    from: [0, 79.5], look: [0, 3.5, 70], anchor: [0, 8.2, 70],
    blurb: 'The Plantage entrance of ARTIS: stone piers crowned with gilded eagles flank a wide gateway beneath the society\u2019s Latin motto, Natura Artis Magistra \u2013 \u201cNature is the teacher of art\u201d. A tram line runs past the gate.',
    facts: ['ARTIS was founded in 1838 on the former \u201cMiddenhof\u201d estate', 'The oldest zoo in the Netherlands, and among the oldest still operating in the world', 'The grounds hold 27 listed (monumental) buildings, bridges and ponds'],
  },
  {
    id: 'leden', name: 'Ledenlokalen', nl: 'Ledenlokalen', tag: 'Rijksmonument 518278', year: '1868', architect: 'Gerlof Bartholomeus Salm',
    from: [21, 76], look: [31, 6, 66], anchor: [30, 17.5, 62],
    blurb: 'The \u201cmembers\u2019 rooms\u201d beside the entrance, designed by G.B. Salm in an eclectic style for the ARTIS society. Brick walls, stone bands, arched ground-floor windows and a projecting central bay beneath a hipped slate roof.',
    facts: ['Built for the members of the society, later used as a zoological museum', 'From 1941 to 1968 it housed the Amsterdam population register', 'Stands at the corner of Plantage Kerklaan and Plantage Middenlaan'],
  },
  {
    id: 'plaza', name: 'Artisplein', nl: 'Artisplein', tag: 'Central square & gardens', year: '19th c.', architect: 'Landscape garden',
    from: [0, 36], look: [0, 3, 0], anchor: [0, 6, 0],
    blurb: 'The heart of the park, laid out as a classical garden with a fountain, clipped beds of spring bulbs and old trees \u2013 some of them older than ARTIS itself. Paths radiate towards the Groote Museum, the Aquarium and the ponds.',
    facts: ['ARTIS doubles as an open-air museum of garden statues, vases and monuments', 'Roughly fifty statues stand in the grounds', 'The garden is laid out in the 19th-century landscape style'],
  },
  {
    id: 'groote', name: 'Groote Museum', nl: 'Groote Museum', tag: 'Neoclassical \u00b7 Rijksmonument', year: '1850\u20131855', architect: 'Johannes van Maurik',
    from: [-26, 14], look: [-57, 6, 6], anchor: [-56, 17, 6],
    blurb: 'ARTIS\u2019s first great building and the oldest museum building in Amsterdam, older than the Rijksmuseum. A cream neoclassical front with a six-column Ionic portico and pediment, rusticated ground floor and tall arched windows above.',
    facts: ['Built 1850\u20131855 as the society\u2019s main building and the Zoological Museum', 'Closed in 1947 and reopened in May 2022 after a 2017\u20132022 restoration', 'A national monument since 1974'],
  },
  {
    id: 'aquarium', name: 'Aquarium Building', nl: 'Aquariumgebouw', tag: 'Rijksmonument 4108', year: '1882', architect: 'G.B. & A. Salm',
    from: [0, -10], look: [0, 8, -40], anchor: [0, 19.5, -40],
    blurb: 'A classicist\u2013mannerist palace for fish, one of the first public aquaria in Europe. Side and centre pavilions flank a hexastyle temple front, and the east end swells into a rounded wing crowned by a domed roof.',
    facts: ['Opened in 1882 on land leased on condition that only a museum would ever stand there', 'Plantage Middenlaan 53 \u2013 a national monument since 1974', 'Inside are mega-tanks, each a complete underwater biotope, and the 1926 Heimans diorama'],
  },
  {
    id: 'hall', name: 'Aquarium Hall', nl: 'Aquariumhal', tag: 'Inside the monument', year: '1882', architect: 'G.B. & A. Salm',
    from: [0, -43.2], look: [0, 4.5, -58], anchor: [0, 11, -42],
    blurb: 'Step through the temple front into the great hall: cast-iron columns, a coffered ceiling and four glowing biotopes behind towering glass \u2013 a tropical coral reef, an Amazon flooded forest, the Amsterdam canals and the open ocean.',
    facts: ['The interior here is an artistic reconstruction \u2013 the real hall differs in detail', 'The real aquarium also has a gallery on life beneath Amsterdam\u2019s canals', 'Each tank is a self-contained biotope with its own species'],
  },
  {
    id: 'dome', name: 'The Domed Wing', nl: 'Koepel', tag: 'Aquarium, east end', year: '1882', architect: 'G.B. & A. Salm',
    from: [66, -26], look: [40, 11, -51], anchor: [36, 21, -51],
    blurb: 'The rounded eastern end of the Aquarium, capped by a copper dome and lantern. Arched windows ring the apse above a rusticated base.',
    facts: ['The monument listing describes a rounded east end covered by a dome', 'Rusticated stone below, smooth ashlar above', 'The dome is shown here in weathered green copper'],
  },
  {
    id: 'pond', name: 'Flamingo Pond', nl: 'Flamingovijver', tag: 'Ponds & wildfowl', year: 'Gardens', architect: 'Landscape garden',
    from: [38, 12], look: [62, 1.2, 8], anchor: [64, 5, 6],
    blurb: 'A willow-fringed pond with a small island where flamingos wade and preen. A timber pier reaches out over the water \u2013 walk out along it for the best view of the birds and the ducks.',
    facts: ['Many ARTIS ponds and bridges are listed monuments', 'Walk out onto the pier at the west bank', 'Willows, ducks and flamingos share the water'],
  },
]

export interface Area { id: string; name: string; test: (x: number, z: number) => boolean }
export const AREAS: Area[] = [
  { id: 'hall', name: 'Aquarium Hall', test: (x, z) => Math.abs(x) < 22 && z < -41.2 && z > -60.8 },
  { id: 'street', name: 'Plantage Kerklaan', test: (_x, z) => z > 70.5 },
  { id: 'gate', name: 'Main Entrance', test: (x, z) => z > 52 && Math.abs(x) < 16 },
  { id: 'leden', name: 'Ledenlokalen', test: (x, z) => x > 12 && x < 48 && z > 48 },
  { id: 'aquarium', name: 'Aquarium Building', test: (x, z) => x > -40 && x < 50 && z < -24 },
  { id: 'groote', name: 'Groote Museum', test: (x, z) => x < -44 && z > -26 && z < 38 },
  { id: 'pond', name: 'Flamingo Pond', test: (x, z) => x > 40 && z > -10 && z < 30 },
  { id: 'plaza', name: 'Artisplein', test: (x, z) => Math.hypot(x, z) < 24 },
]
export const areaAt = (x: number, z: number) => AREAS.find((a) => a.test(x, z))?.name ?? 'ARTIS Gardens'
