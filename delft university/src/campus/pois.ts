export type PoiKind = 'faculty' | 'landmark' | 'facility'

export interface Poi {
  id: string
  name: string
  sub: string
  kind: PoiKind
  abbr?: string
  ref: string // official TU Delft building number
  bid: number // OSM building id used to resolve the footprint
  at?: [number, number] // optional explicit target (x,z)
  h?: number // optional explicit target height
  address?: string
  year?: string
  arch?: string
  blurb: string
  facts: [string, string][]
  color: string
}

export const POIS: Poi[] = [
  {
    id: 'library', name: 'TU Delft Library', sub: 'The grass-roofed library with the cone', kind: 'landmark', ref: '21', bid: 60302729,
    address: 'Prometheusplein 1', year: '1997', arch: 'Mecanoo (Francine Houben)', color: '#7cd36b',
    blurb: 'A lawn that rises from the ground and swallows the building beneath it, pierced by a 42 m concrete cone. You can walk up the sloping grass roof and look out over the whole campus. Underneath, a glass-walled reading hall spreads over several floors.',
    facts: [['Cone height', '≈ 42 m'], ['Roof', 'Walkable lawn'], ['Footprint', '≈ 6,500 m²']],
  },
  {
    id: 'aula', name: 'Aula Conference Centre', sub: 'Brutalist concrete congress hall', kind: 'landmark', ref: '20', bid: 44383989,
    address: 'Mekelweg 5', year: '1966', arch: 'Van den Broek & Bakema', color: '#e2b259',
    blurb: 'The ceremonial heart of the campus: a long, low board-marked concrete pavilion whose heavy slab roof cantilevers over a ribbon of glass, set beside the Mekelpark water garden. Doctoral defences, graduations and conferences happen here.',
    facts: [['Style', 'Brutalism'], ['Material', 'Board-formed concrete'], ['Footprint', '≈ 6,100 m²']],
  },
  {
    id: 'eemcs', name: 'EEMCS Tower', sub: 'Electrical Eng., Mathematics & Computer Science', kind: 'faculty', abbr: 'EEMCS', ref: '36', bid: 551121051,
    at: [-68, 28], h: 90, address: 'Mekelweg 4', year: '1969–72', arch: 'Van den Broek & Bakema', color: '#4aa8ff',
    blurb: 'The tallest building in Delft: a 90 m, 23-storey glass tower rising from a sprawling concrete low-rise full of lecture halls and laboratories. It is a protected municipal monument and the campus skyline anchor.',
    facts: [['Height', '90 m'], ['Floors', '23'], ['Low-rise', '≈ 9,000 m²']],
  },
  {
    id: 'ceg', name: 'Civil Engineering & Geosciences', sub: 'CEG · Stevin complex', kind: 'faculty', abbr: 'CEG', ref: '23', bid: 253721837,
    address: 'Stevinweg 1', year: '1964–75', arch: '', color: '#ff9a52',
    blurb: 'Home of civil engineering, geoscience and water management: a seven-storey concrete block surrounded by the Stevin I–III laboratories where dikes, bridges, soils and structures are tested at full scale.',
    facts: [['Main block', '7 floors'], ['Labs', 'Stevin II & III'], ['Founded', 'Delft water tradition']],
  },
  {
    id: 'ide', name: 'Industrial Design Engineering', sub: 'IDE · studios and workshops', kind: 'faculty', abbr: 'IDE', ref: '32', bid: 775124204,
    address: 'Landbergstraat 15', year: '', arch: '', color: '#ff6fa8',
    blurb: 'A low, sprawling campus of finger-like wings that houses design studios, model workshops and prototyping labs — the birthplace of Delft design thinking.',
    facts: [['Wings', '≈ 10'], ['Footprint', '≈ 10,300 m²'], ['Focus', 'Product & service design']],
  },
  {
    id: 'tpm', name: 'Technology, Policy & Management', sub: 'TPM', kind: 'faculty', abbr: 'TPM', ref: '31', bid: 720565368,
    address: 'Jaffalaan 5', year: '', arch: '', color: '#b88cff',
    blurb: 'The faculty where engineering meets society: systems, energy transition, governance and human-technology interaction, housed in the Jaffalaan complex at the northern edge of the campus.',
    facts: [['Building', '31'], ['Focus', 'Socio-technical systems'], ['Location', 'Jaffalaan']],
  },
  {
    id: 'as', name: 'Applied Sciences', sub: 'AS · physics, chemistry, life science', kind: 'faculty', abbr: 'AS', ref: '22', bid: 720565367,
    address: 'Lorentzweg 1', year: '1963', arch: '', color: '#5be0c3',
    blurb: 'The fundamental-science faculty — applied physics, chemical engineering, nanobiology and quantum research — in a large 1960s laboratory complex with long wings.',
    facts: [['Building', '22'], ['Footprint', '≈ 9,200 m²'], ['Research', 'Quantum, nano, chemistry']],
  },
  {
    id: 'bk', name: 'Architecture & the Built Environment', sub: 'BK City · the "Red Chemistry" building', kind: 'faculty', abbr: 'BK', ref: '8', bid: 44383236,
    address: 'Julianalaan 134', year: 'Heritage listed', arch: '', color: '#ff5b5b',
    blurb: 'After the 2008 fire destroyed the old Architecture building, the faculty moved into the former "Rode Scheikunde" laboratories — a protected brick complex that now runs as BK City.',
    facts: [['Building', '8'], ['Former use', 'Chemistry labs'], ['Status', 'Rijksmonument']],
  },
  {
    id: 'ae', name: 'Aerospace Engineering', sub: 'AE · south campus', kind: 'faculty', abbr: 'AE', ref: '62', bid: 531561222,
    address: 'Kluyverweg 1', year: '1965', arch: '', color: '#6fd0ff',
    blurb: 'Aircraft, spacecraft and wind energy. Next to the faculty are the SIMONA research flight simulator and the high-speed wind-tunnel laboratories.',
    facts: [['Building', '62'], ['Next door', 'SIMONA simulator (63)'], ['Labs', 'High Speed Lab (64)']],
  },
  {
    id: '3me', name: 'Mechanical, Maritime & Materials Eng.', sub: '3mE · with lecture-hall complex', kind: 'faculty', abbr: '3mE', ref: '34', bid: 720565371,
    address: 'Mekelweg 2', year: '', arch: '', color: '#ffd24a',
    blurb: 'Mechanical, maritime and materials engineering. The faculty shares the Mekelweg 2 complex with the central lecture-hall block (Education Building 35).',
    facts: [['Building', '34 / 35'], ['Discipline', 'ME · MT · MSE'], ['Lecture halls', 'Building 35']],
  },
  {
    id: 'cs', name: 'EEMCS · Computer Science', sub: 'Building 28', kind: 'faculty', abbr: 'CS', ref: '28', bid: 253722455,
    address: 'Van Mourik Broekmanweg 6', year: '2002', arch: '', color: '#4ee1a0',
    blurb: 'The seven-storey home of Computer Science, a separate building from the EEMCS tower, next to Echo and the Stevin labs.',
    facts: [['Building', '28'], ['Floors', '7'], ['Built', '2002']],
  },
  {
    id: 'echo', name: 'Echo', sub: 'Education & sustainability building', kind: 'landmark', ref: '29', bid: 886526035,
    year: '2022', color: '#9be15d',
    blurb: 'One of the most sustainable education buildings in Europe: solar roof, timber and a lively interior meeting hall that brings students together.',
    facts: [['Building', '29'], ['Opened', '2022'], ['Theme', 'Sustainability']],
  },
  {
    id: 'pulse', name: 'Pulse', sub: 'Student and education hub', kind: 'facility', ref: '33a', bid: 385279659,
    year: '2018', color: '#ff8bd0',
    blurb: 'The glassy student hub on Mekelweg with study landscapes, a cafeteria and flexible teaching spaces.',
    facts: [['Building', '33a'], ['Opened', '2018']],
  },
  {
    id: 'flux', name: 'Flux', sub: 'Education & energy building', kind: 'facility', ref: '39', bid: 1147063317,
    year: '2023', color: '#7be0ff',
    blurb: 'A recent addition to the campus with study spaces and teaching rooms, completing the western end of Mekelweg.',
    facts: [['Building', '39'], ['Opened', '2023']],
  },
  {
    id: 'x', name: 'X – Sports & Culture', sub: 'Sports centre and cultural centre', kind: 'facility', ref: '37', bid: 779656995,
    year: '', color: '#ff9f6b',
    blurb: 'TU Delft’s sports hall and fitness centre with the neighbouring cultural centre for theatre, music and student societies.',
    facts: [['Building', '37 / 38'], ['Footprint', '≈ 9,300 m²']],
  },
  {
    id: 'dream', name: 'D:DREAM Hall', sub: 'Student team workshop', kind: 'facility', ref: '23', bid: 44385782,
    year: '', color: '#c0ff6b',
    blurb: 'Where the Dream Teams build solar cars, hyperloop pods and the next Nuna — a hall packed with student-built machines.',
    facts: [['Teams', 'Nuna, Hyperloop, Forze …']],
  },
  {
    id: 'bouwcampus', name: 'Bouwcampus', sub: 'Building campus', kind: 'facility', ref: '26', bid: 253722355,
    year: '', color: '#ffc36b',
    blurb: 'A research and innovation hub for the construction sector, rising eleven storeys at the east edge of the campus.',
    facts: [['Floors', '11'], ['Building', '26']],
  },
  {
    id: 'gele', name: 'Gele Scheikunde', sub: 'The "Yellow Chemistry" labs', kind: 'landmark', ref: '—', bid: 44383737,
    year: '1940s', color: '#ffe066',
    blurb: 'The yellow-brick sister of the Red Chemistry building: one of the old chemical laboratory complexes along Julianalaan.',
    facts: [['Material', 'Yellow brick'], ['Footprint', '≈ 4,300 m²']],
  },
  {
    id: 'simona', name: 'SIMONA Flight Simulator', sub: 'Research flight simulator', kind: 'facility', ref: '63', bid: 158716548,
    year: '1997', color: '#8ad0ff',
    blurb: 'A hexapod-motion research simulator used for human-in-the-loop flight and control research.',
    facts: [['Building', '63'], ['Opened', '1997']],
  },
  {
    id: 'church', name: 'Immanuëlkerk', sub: 'Neighbouring heritage church', kind: 'landmark', ref: '—', bid: 253722357,
    year: '', color: '#d9b38c',
    blurb: 'A listed church on the northern edge of the campus — a quiet reminder that the university grew up inside an old city.',
    facts: [['Status', 'Monument']],
  },
]

export const TOUR = ['library', 'aula', 'eemcs', 'ceg', 'ide', 'tpm', 'as', 'bk', '3me', 'cs', 'echo', 'ae']

export const FACULTIES = POIS.filter((p) => p.kind === 'faculty')
