import { Landmark } from './kit'
import { project } from './map'
import { buildAfsluitdijk } from './landmarks/afsluitdijk'
import { buildCanal } from './landmarks/canal'
import { buildCubes } from './landmarks/cubes'
import { buildDom } from './landmarks/dom'
import { buildErasmus } from './landmarks/erasmus'
import { buildEuromast } from './landmarks/euromast'
import { buildEvoluon } from './landmarks/evoluon'
import { buildKeukenhof } from './landmarks/keukenhof'
import { buildKinderdijk } from './landmarks/kinderdijk'
import { buildOosterschelde } from './landmarks/oosterschelde'
import { buildRijks } from './landmarks/rijks'

export interface LandmarkDef {
  id: string
  name: string
  nl: string
  city: string
  province: string
  lon: number
  lat: number
  x: number
  z: number
  radius: number
  year: string
  stat: [string, string][]
  blurb: string
  fact: string
  tag: string
  labelH: number
  view: { dist: number; ty: number; az: number; el: number }
  build: () => Landmark
  pin: [number, number]
}

type Raw = Omit<LandmarkDef, 'pin' | 'radius'>

const raw: Raw[] = [
  {
    id: 'afsluitdijk', name: 'Afsluitdijk', nl: 'Afsluitdijk', city: 'Den Oever – Zurich', province: 'Noord-Holland / Friesland', lon: 5.17, lat: 53.0, x: -6, z: -50,
    year: '1932', tag: 'Hydraulic engineering',
    stat: [['Length', '32 km'], ['Width', '90 m'], ['Architect', 'Dudok (monument)']],
    blurb: 'A 32-kilometre dam that closed off the Zuiderzee in 1932, turning a salty inlet into the freshwater IJsselmeer. The A7 motorway and a cycle path run across its crest, with Willem Dudok\u2019s stepped brick monument and a statue of engineer Cornelis Lely halfway along.',
    fact: 'The dam was closed in 1932 by sinking its last gap on 28 May. It is the backbone of the Dutch fight against the sea, and was recently reinforced with interlocking concrete blocks.',
    labelH: 8, view: { dist: 26, ty: 2.5, az: 0.75, el: 0.26 }, build: buildAfsluitdijk,
  } as any,
  {
    id: 'keukenhof', name: 'Keukenhof', nl: 'Keukenhof', city: 'Lisse', province: 'Zuid-Holland', lon: 4.547, lat: 52.27, x: -16, z: -26,
    year: '1950', tag: 'Garden & landscape',
    stat: [['Area', '32 hectares'], ['Bulbs', '~7 million / yr'], ['Season', 'Mar – May']],
    blurb: 'The \u201cGarden of Europe\u201d: a spring park where roughly seven million bulbs are planted by hand every autumn. Tulips, hyacinths and daffodils are arranged in vivid beds around ponds, pavilions and a windmill.',
    fact: 'The grounds were once the hunting estate of Countess Jacoba of Bavaria in the 15th century \u2013 the name means \u201ckitchen garden\u201d.',
    labelH: 9, view: { dist: 21, ty: 1.2, az: 0.12, el: 0.55 }, build: buildKeukenhof,
  } as any,
  {
    id: 'rijksmuseum', name: 'Rijksmuseum', nl: 'Rijksmuseum', city: 'Amsterdam', province: 'Noord-Holland', lon: 4.885, lat: 52.36, x: 14, z: -30,
    year: '1885', tag: 'Museum',
    stat: [['Architect', 'Pierre Cuypers'], ['Style', 'Neo-Gothic / Renaissance'], ['Reopened', '2013']],
    blurb: 'The national museum of the Netherlands, home to Rembrandt\u2019s Night Watch and Vermeer\u2019s Milkmaid. Cuypers\u2019 red-brick palace blends Gothic and Renaissance motifs, with towers flanking a public passage that cyclists still ride through.',
    fact: 'Cuypers designed the central archway as a public street. The cycle tunnel survived a 10-year renovation after fierce protests from cyclists.',
    labelH: 12.5, view: { dist: 29, ty: 3.5, az: 0.4, el: 0.28 }, build: buildRijks,
  } as any,
  {
    id: 'canal-houses', name: 'Amsterdam Canal Houses', nl: 'Grachtenpanden', city: 'Amsterdam', province: 'Noord-Holland', lon: 4.885, lat: 52.373, x: 0, z: -8,
    year: 'from 1613', tag: 'Urban heritage',
    stat: [['UNESCO', 'since 2010'], ['Gable types', 'step, bell, neck, spout'], ['Typical width', '5 – 6 m']],
    blurb: 'The 17th-century canal belt of Amsterdam: tall, narrow merchant houses with ornate gables, shuttered sash windows and hoisting beams. Each gable style \u2013 stepped, bell, neck, spout \u2013 was fashion and status carved in brick.',
    fact: 'Property was once taxed by frontage width, so houses became narrow and deep. Stairways are so steep that furniture goes up through the windows using the hoist beam.',
    labelH: 9, view: { dist: 22, ty: 3.8, az: 0.28, el: 0.2 }, build: buildCanal,
  } as any,
  {
    id: 'domtoren', name: 'Dom Tower', nl: 'Domtoren', city: 'Utrecht', province: 'Utrecht', lon: 5.121, lat: 52.091, x: 26, z: -2,
    year: '1382', tag: 'Gothic tower',
    stat: [['Height', '112.5 m'], ['Steps', '465'], ['Style', 'Brabantine Gothic']],
    blurb: 'The tallest church tower in the Netherlands rises in three stages from a massive square base through an open belfry to an octagonal lantern and spire. Its carillon of 50 bells still rings over the city.',
    fact: 'The nave of St Martin\u2019s Cathedral collapsed in a tornado in 1674 and was never rebuilt \u2013 which is why the tower stands free, with a square between it and the church.',
    labelH: 26.5, view: { dist: 36, ty: 11, az: 0.5, el: 0.2 }, build: buildDom,
  } as any,
  {
    id: 'euromast', name: 'Euromast', nl: 'Euromast', city: 'Rotterdam', province: 'Zuid-Holland', lon: 4.4685, lat: 51.9054, x: -26, z: 2,
    year: '1960', tag: 'Observation tower',
    stat: [['Height', '185 m'], ['Architect', 'H. A. Maaskant'], ['Space Tower', '1970']],
    blurb: 'A slender concrete shaft with a crow\u2019s-nest restaurant and viewing deck at roughly 100 m, built for the 1960 Floriade. The steel Space Tower added in 1970 carries the rotating glass Euroscope capsule to the top.',
    fact: 'The Euroscope slowly rotates as it climbs the mast, giving a 360-degree panorama of the Rotterdam port. It reaches 185 m, making it the highest viewpoint in the city.',
    labelH: 25.5, view: { dist: 38, ty: 12, az: 0.35, el: 0.16 }, build: buildEuromast,
  } as any,
  {
    id: 'cube-houses', name: 'Cube Houses', nl: 'Kubuswoningen', city: 'Rotterdam', province: 'Zuid-Holland', lon: 4.49, lat: 51.9203, x: -8, z: 12,
    year: '1977', tag: 'Experimental housing',
    stat: [['Architect', 'Piet Blom'], ['Tilt', '45\u00b0'], ['Homes', '38 + 2 super-cubes']],
    blurb: 'Piet Blom tilted cube-shaped homes 45\u00b0 and perched them on hexagonal pylons, so that the whole complex reads as an abstract forest above the Blaak. Inside, walls slope at odd angles and only part of the floor is truly usable.',
    fact: 'Each cube represents a tree and the cluster a forest. Only about a quarter of each 100 m\u00b2 floor has full headroom \u2013 one cube is open as a show-home.',
    labelH: 11, view: { dist: 21, ty: 4.2, az: 0.3, el: 0.2 }, build: buildCubes,
  } as any,
  {
    id: 'erasmusbrug', name: 'Erasmus Bridge', nl: 'Erasmusbrug', city: 'Rotterdam', province: 'Zuid-Holland', lon: 4.4818, lat: 51.9096, x: -34, z: 24,
    year: '1996', tag: 'Cable-stayed bridge',
    stat: [['Length', '802 m'], ['Pylon', '139 m'], ['Architect', 'Ben van Berkel']],
    blurb: 'The asymmetric, single-pylon cable-stayed bridge across the Nieuwe Maas ties the city centre to Kop van Zuid. Its sculptural pylon and fan of white stays earned it the nickname \u201cde Zwaan\u201d \u2013 the Swan.',
    fact: 'Its 89 m bascule section on the southern side is one of the largest and heaviest in Europe, lifting to let tall ships through. Locals call the whole bridge \u201cde Zwaan\u201d.',
    labelH: 11.5, view: { dist: 28, ty: 4.2, az: 0.55, el: 0.2 }, build: buildErasmus,
  } as any,
  {
    id: 'kinderdijk', name: 'Kinderdijk Windmills', nl: 'Molens van Kinderdijk', city: 'Kinderdijk', province: 'Zuid-Holland', lon: 4.641, lat: 51.883, x: -14, z: 34,
    year: 'c. 1740', tag: 'UNESCO World Heritage',
    stat: [['Mills', '19'], ['UNESCO', '1997'], ['Purpose', 'Polder drainage']],
    blurb: 'Nineteen 18th-century mills line the canals of the Alblasserwaard, built to pump the low polder dry. Their lattice sails, thatched bodies and long tail poles are the archetype of the Dutch landscape.',
    fact: 'The name means \u201cchild\u2019s dike\u201d. A legend tells of a cradle that floated here after the 1421 St Elizabeth\u2019s flood, kept balanced by a cat.',
    labelH: 8.8, view: { dist: 24, ty: 3.6, az: 0.18, el: 0.18 }, build: buildKinderdijk,
  } as any,
  {
    id: 'evoluon', name: 'Evoluon', nl: 'Evoluon', city: 'Eindhoven', province: 'Noord-Brabant', lon: 5.4547, lat: 51.4477, x: 8, z: 44,
    year: '1966', tag: 'Space-age architecture',
    stat: [['Diameter', '77 m'], ['Columns', '12'], ['Architect', 'Kalff & de Bever']],
    blurb: 'Built by Philips to mark its 75th anniversary, this concrete flying saucer was a science museum about technology and the future. Twelve leaning columns carry the lens-shaped hall, ringed by a band of windows lit at night.',
    fact: 'With its glowing ring of windows, locals nicknamed it \u201cthe UFO\u201d. Today the saucer is a conference and event venue and a national monument of post-war architecture.',
    labelH: 9.5, view: { dist: 24, ty: 3.6, az: 0.4, el: 0.2 }, build: buildEvoluon,
  } as any,
  {
    id: 'oosterschelde', name: 'Eastern Scheldt Barrier', nl: 'Oosterscheldekering', city: 'Neeltje Jans', province: 'Zeeland', lon: 3.7, lat: 51.64, x: -58, z: 34,
    year: '1986', tag: 'Delta Works',
    stat: [['Length', '~9 km'], ['Piers', '65'], ['Steel gates', '62']],
    blurb: 'The crown jewel of the Delta Works: 65 colossal concrete piers with 62 sliding steel gates that stay open to let the tide flow, and close only during storm surges. Built after the catastrophic North Sea Flood of 1953.',
    fact: 'The barrier was a compromise: the original plan was a closed dam, but environmentalists and oyster fishers won \u2013 so it is a barrier that normally lets the sea breathe.',
    labelH: 8, view: { dist: 26, ty: 2.5, az: 0.55, el: 0.28 }, build: buildOosterschelde,
  } as any,
]

export const LANDMARKS: LandmarkDef[] = raw.map((r) => {
  const b = r.build
  const probe = { radius: 0 }
  void probe
  const radii: Record<string, number> = {
    afsluitdijk: 11, keukenhof: 10.2, rijksmuseum: 12.2, 'canal-houses': 9.6, domtoren: 8.8, euromast: 9, 'cube-houses': 9.2, erasmusbrug: 11, kinderdijk: 10.2, evoluon: 9.6, oosterschelde: 11,
  }
  return { ...r, build: b, radius: radii[r.id], pin: project(r.lon, r.lat) as [number, number] }
})
