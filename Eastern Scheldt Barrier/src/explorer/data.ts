export type Mode = 'walk' | 'fly' | 'cinema'

export interface Viewpoint {
  id: string
  label: string
  blurb: string
  mode: Mode
  pos: [number, number, number] // eye position (y is ignored for walk mode: ground is sampled)
  yaw: number // 0 = facing -z (Eastern Scheldt), PI/2 = facing +x (east along the barrier)
  pitch: number
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: 'neeltje', label: 'Neeltje Jans approach', blurb: 'Stand on the artificial island and follow the N57 as it climbs onto the barrier', mode: 'walk', pos: [-470, 0, -4], yaw: Math.PI / 2, pitch: 0.03 },
  { id: 'deck', label: 'On the barrier road', blurb: 'Walk the 14 m high road deck above the sliding gates', mode: 'walk', pos: [118, 0, -3], yaw: Math.PI / 2, pitch: 0.02 },
  { id: 'seaward', label: 'From the North Sea', blurb: 'The classic view from the sea: piers, machine houses and gates', mode: 'fly', pos: [150, 7, 92], yaw: 0.62, pitch: 0.14 },
  { id: 'gate', label: 'Steel gate close-up', blurb: 'A 42 m truss gate hanging between two piers', mode: 'fly', pos: [292.5, 6.5, 31], yaw: 0, pitch: 0.12 },
  { id: 'machine', label: 'Machine house', blurb: 'The service tower that crowns every pier', mode: 'fly', pos: [388, 37, 36], yaw: 0.5, pitch: -0.02 },
  { id: 'water', label: 'Sea level', blurb: 'Skim the waves and look down the line of piers', mode: 'fly', pos: [60, 2.3, 62], yaw: 0.95, pitch: 0.05 },
  { id: 'aerial', label: 'Aerial', blurb: 'A bird’s-eye view of the whole stretch', mode: 'fly', pos: [470, 150, 285], yaw: 0.0, pitch: -0.38 },
]

export interface Hotspot {
  id: string
  title: string
  kicker: string
  pos: [number, number, number]
  view: string
  text: string
  stats: [string, string][]
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: 'gate',
    title: 'Sliding steel gate',
    kicker: 'Closure',
    pos: [292.5, 12.6, 6.5],
    view: 'gate',
    text: 'The 62 gates are normally held open so the tide, fish and shellfish can pass in and out. When a storm surge is forecast they are lowered one by one into the openings between the piers and seal the Eastern Scheldt from the North Sea. Closing a single gate takes roughly an hour.',
    stats: [['Gates', '62'], ['Width', '42 m'], ['Closing time', '≈ 1 hour']],
  },
  {
    id: 'machine',
    title: 'Machine house & stacks',
    kicker: 'Operation',
    pos: [405, 47.6, 7.5],
    view: 'machine',
    text: 'The tower on top of each pier carries the equipment that raises and lowers the gate below it. Operation is manual, with an electronic safety system as a backup. Every gate is closed once a month as a test and the emergency procedures are rehearsed on scheduled dates.',
    stats: [['Test closure', 'monthly'], ['Operating cost', '€17 M / yr'], ['Control', 'manual + backup']],
  },
  {
    id: 'pier',
    title: 'The concrete piers',
    kicker: 'Structure',
    pos: [495, 9, 13.4],
    view: 'seaward',
    text: 'The barrier stands on 65 concrete piers. Each was cast in a dry dock, floated out and lowered on to a prepared seabed mat by the purpose-built lifting vessel Ostrea. The design life is more than 200 years. The tan, weather-stained concrete you see here is darker at the waterline where the tide and marine growth reach it.',
    stats: [['Piers', '65'], ['Height', '35 – 38.75 m'], ['Weight', '≈ 18,000 t each']],
  },
  {
    id: 'deck',
    title: 'The road deck',
    kicker: 'Infrastructure',
    pos: [455, 18.4, -4],
    view: 'deck',
    text: 'The barrier carries the N57 road over its piers. It opened on 5 November 1987, exactly 457 years after the St. Felix flood of 1530. The deck is also the stage of the Dutch Headwind Cycling Championships.',
    stats: [['Road opened', '1987'], ['Barrier length', '9 km'], ['Gated section', '≈ 4 km']],
  },
  {
    id: 'plaque',
    title: '“Hier gaan over het tij…”',
    kicker: 'Neeltje Jans',
    pos: [-440, 6.8, -33.4],
    view: 'neeltje',
    text: 'A plaque on the artificial island of Neeltje Jans reads “Hier gaan over het tij, de maan, de wind en wij” — “Here, the tide, the moon, the wind and we decide.” On 4 October 1986 Queen Beatrix declared the work finished: “De stormvloedkering is gesloten. De Deltawerken zijn voltooid. Zeeland is veilig.”',
    stats: [['Opened', '4 Oct 1986'], ['Built', '1976 – 1986'], ['Part of', 'Delta Works']],
  },
  {
    id: 'visitor',
    title: 'Neeltje Jans island',
    kicker: 'Visitor centre',
    pos: [-520, 20, -85],
    view: 'neeltje',
    text: 'Neeltje Jans was created in the middle of the estuary as a construction island for the barrier. After completion it was rebuilt as an education centre and maintenance base — today it houses the Delta Park visitor attraction where you can go inside the barrier’s story.',
    stats: [['Role', 'Construction island'], ['Today', 'Visitor centre'], ['Built for', 'Barrier works']],
  },
  {
    id: 'surge',
    title: 'Storm-surge closure',
    kicker: 'Safety',
    pos: [120, 21, 6.5],
    view: 'seaward',
    text: 'Dutch law decides when the barrier closes: the water level must be at least 3 m above normal sea level before the gates are shut completely. Since 1986 the barrier has closed 28 times, most recently in January 2022 for Storm Corrie. Try it yourself — close the gates and watch the sea rise.',
    stats: [['Trigger', '+3 m water level'], ['Closures since 1986', '28'], ['Born from', '1953 flood']],
  },
]

export const FACTS = {
  title: 'Oosterscheldekering',
  subtitle: 'Eastern Scheldt Storm Surge Barrier',
  where: 'Zeeland · Delta Works',
  year: '1986',
  stats: [['Length', '9 km'], ['Piers', '65'], ['Gates', '62 × 42 m']],
}
