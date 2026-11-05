import type { POI } from './world'
import { C } from './world'

const EYE = 1.65
const v = (x: number, y: number, z: number, yaw: number, pitch = 0) => ({ x, y: y + EYE, z, yaw, pitch })

export const POIS: POI[] = [
  {
    id: 'museumplein', kicker: 'Start here', title: 'Museumplein',
    text: 'The open square in front of the Rijksmuseum. Pierre Cuypers’ red-brick palace opened here in 1885; the long pond mirrors its twin towers. Walk toward the passage – or take the bike lane like a local.',
    pos: [0, 0, 140], radius: 40, view: v(0, 0, 165, 0, 0.06),
  },
  {
    id: 'facade', kicker: 'Architecture · 1885', title: 'Cuypers’ façade',
    text: 'Red brick with sandstone dressings, a stepped gable, glazed tile tableaux and steep slate roofs: Gothic and Dutch Renaissance fused into one national monument. Look up – every window is set into a deep reveal with its own stone surround.',
    pos: [0, 0, 74], radius: 22, view: v(0, 0, 92, 0, 0.2),
  },
  {
    id: 'towers', kicker: 'Architecture', title: 'The twin towers',
    text: 'Two slate-roofed towers flank the central pavilion and its portal. Their pinnacles and gilded finials make the Rijksmuseum recognisable from far across Museumplein.',
    pos: [0, 0, 62], radius: 14, view: v(-30, 0, 76, -0.52, 0.42),
  },
  {
    id: 'passage', kicker: 'The Passage', title: 'The cycle tunnel',
    text: 'Cuypers designed a public street straight through the building. When the museum reopened after its decade-long renovation in 2013, cyclists – after fierce protests – kept their right of way. Look up at the painted vault.',
    pos: [0, 0, 0], radius: 11, view: v(0, 0, 58, 0, 0.02),
  },
  {
    id: 'atrium', kicker: 'Atrium · 2013', title: 'The glass atrium',
    text: 'The two courtyards were roofed with steel and glass by architects Cruz y Ortiz during the renovation, creating the bright entrance halls you see today. A grand stair on the east side leads up to the first floor.',
    pos: [C.AX0 + 16, 0, 0], radius: 18, view: v(9.5, 0, 0, -Math.PI / 2, 0.12),
  },
  {
    id: 'stairs', kicker: 'Route', title: 'To the Gallery of Honour',
    text: 'Climb the stair, follow the mezzanine to the passage side, and cross the bridge into the Gallery of Honour – the museum’s grand axis, lined with Dutch Golden Age masterpieces.',
    pos: [38, 0, 2], radius: 7, view: v(37.8, 0, -8, Math.PI, 0.1),
  },
  {
    id: 'gallery', kicker: 'First floor', title: 'The Gallery of Honour',
    text: 'A barrel-vaulted hall painted with Cuypers’ polychrome ornament and lit by a long skylight. Rembrandt, Vermeer and Hals hang along its walls, leading the eye to the Night Watch at the far end.',
    pos: [0, C.L1, 4], radius: 12, view: v(0, C.L1, 12, 0, 0.0),
  },
  {
    id: 'nightwatch', kicker: 'Rembrandt · 1642', title: 'The Night Watch',
    text: 'Rembrandt’s monumental militia portrait – about 3.6 × 4.4 m – is the heart of the museum. The painting is lit by a dedicated spotlight; the barrier keeps a respectful distance.',
    pos: [0, C.L1, C.GZ0 + 6], radius: 9, view: v(0, C.L1, -23, 0, 0.1),
  },
]
