export interface Poi {
  id: string
  title: string
  tag: string
  text: string
  pos: [number, number, number]
  look: [number, number, number]
  mode: 'walk' | 'orbit'
  tower?: boolean
}

export const POIS: Poi[] = [
  {
    id: 'gate', title: 'The monumental entrance', tag: 'Start here',
    text: 'The entrance gates, ticket booths, the Winkel van Sinkel and the director\u2019s building were restored in 2010 to look as they did when Blijdorp was built in 1940. Everything behind them is organised along one strictly symmetrical axis.',
    pos: [0, 1.7, 172], look: [0, 6, 120], mode: 'walk',
  },
  {
    id: 'tea', title: 'Theeschenkerij & the axis', tag: 'Garden layout',
    text: 'Van Ravesteyn drew not only the buildings but the paths, planting and enclosures. The axis runs tea house \u2192 pond \u2192 Rivi\u00e8rahal \u2192 predator house, and gentle convex and concave curves recur through the whole design. (The tea house here is a simplified interpretation.)',
    pos: [0, 1.7, 104], look: [0, 3, 124], mode: 'walk',
  },
  {
    id: 'pond', title: 'The pond (vijver)', tag: 'Landscape',
    text: 'Zoo animals were separated from visitors by ditches rather than bars \u2013 a radical idea in 1940, together with walk-through paddocks. The pond is the foreground to the Rivi\u00e8rahal, which rises at the end of the axis.',
    pos: [0, 1.7, 99], look: [0, 8, 24], mode: 'walk',
  },
  {
    id: 'facade', title: 'North fa\u00e7ade', tag: 'Rivi\u00e8rahal \u00b7 exterior',
    text: 'A ridgeless, wave-shaped roof sits on four full-height columns in front of a huge glass wall. The steel skeleton is wrapped in sculpted concrete, the roof edges are finished with glazed tiles, and an angel with two unicorns by W. van Kuilenburg crowns the crest.',
    pos: [0, 1.7, 49], look: [0, 9, 21], mode: 'walk',
  },
  {
    id: 'terrace', title: 'The terrace canopy', tag: 'Rivi\u00e8rahal \u00b7 exterior',
    text: 'A curved canopy with a semicircular bay shelters the terrace hall (built in the 1970s). Notice the rounded concrete forms and the convex, segmented roof \u2013 the same curved vocabulary appears on the south side too.',
    pos: [-11, 1.7, 40], look: [-1, 4.5, 24], mode: 'walk',
  },
  {
    id: 'tower', title: '1940 lookout tower', tag: 'Lost landmark',
    text: 'The original plan included a 47 m lookout tower in front of the north glass wall, flanked by two diagonal pavilions for the caf\u00e9 and restaurant. The tower was later demolished; this is an indicative reconstruction you can toggle on or off.',
    pos: [30, 1.7, 76], look: [0, 22, 36], mode: 'walk', tower: true,
  },
  {
    id: 'hall', title: 'The central hall', tag: 'Rivi\u00e8rahal \u00b7 interior',
    text: 'The hall was built almost without partitions so it could host concerts, exhibitions and boxing matches. Scalloped concrete walls carry harp-shaped skylights, and an orchestra podium with balconies sits against the glass wall.',
    pos: [0, 1.9, -17], look: [0, 6.5, 18], mode: 'walk',
  },
  {
    id: 'fountain', title: 'Fountain with creation mosaic', tag: 'Rivi\u00e8rahal \u00b7 interior',
    text: 'At the heart of the hall, a fountain with a mosaic designed by Van Ravesteyn tells the story of creation. (The mosaic here is a stylised interpretation.)',
    pos: [5.5, 1.9, -6], look: [0, 0.6, 0], mode: 'walk',
  },
  {
    id: 'victoria', title: 'Victoria-Regina house', tag: 'Rivi\u00e8rahal \u00b7 greenhouse',
    text: 'A round, glass-roofed pavilion at the end of the east wing holds the round pond with the giant water lily Victoria amazonica. This greenhouse is the first phase of the \u20ac18 million restoration of the Rivi\u00e8rahal.',
    pos: [20.5, 1.9, -18], look: [27, 1.3, -18], mode: 'walk',
  },
  {
    id: 'star', title: 'Star-sky pavilion', tag: 'Rivi\u00e8rahal \u00b7 interior',
    text: 'The Rivi\u00e8rahal once had a painted starry sky in one of its pavilions. This round room is an interpretation of that idea, with a low glazed drum and a dome overhead.',
    pos: [-20.5, 1.9, -18], look: [-27, 3.5, -18], mode: 'walk',
  },
  {
    id: 'south', title: 'South fa\u00e7ade & sculptures', tag: 'Rivi\u00e8rahal \u00b7 exterior',
    text: 'The symmetrical south front has two entrances under a canopy, a projecting semicircular bay with a rounded concrete parapet, and sculptures by Charles Eyck of figures with deer.',
    pos: [0, 1.7, -50], look: [0, 6.5, -21], mode: 'walk',
  },
  {
    id: 'aerial', title: 'Aerial view', tag: 'Overview',
    text: 'From above you can read Van Ravesteyn\u2019s plan: a long central hall with two narrower side aisles, each ending in a round pavilion, set on the main axis of the zoo.',
    pos: [74, 52, 98], look: [0, 4, 6], mode: 'orbit',
  },
]
