import sunflowers from '../assets/sunflowers.jpg'
import bedroom from '../assets/bedroom.jpg'
import potato from '../assets/potato.jpg'
import selfportrait from '../assets/selfportrait.jpg'
import yellowhouse from '../assets/yellowhouse.jpg'
import almond from '../assets/almond.jpg'
import crows from '../assets/crows.jpg'
import thunder from '../assets/thunder.jpg'

export interface PaintingDef {
  id: string
  title: string
  year: string
  place: string
  dims: string
  hCm: number
  img: string
  level: number
  frame: 'gold' | 'white' | 'black'
  text: string
}

/** Public-domain works from the Van Gogh Museum collection (images via Wikimedia Commons). */
export const PAINTINGS: PaintingDef[] = [
  {
    id: 'potato', title: 'The Potato Eaters', year: 'April–May 1885', place: 'Nuenen', dims: '82 × 114 cm', hCm: 82, img: potato, level: 1, frame: 'black',
    text: 'Van Gogh’s first great masterpiece. He wanted to show peasants who had “dug the earth with these very hands”, painting them in earthy, dark tones lit by a single lamp.',
  },
  {
    id: 'selfportrait', title: 'Self-Portrait with Grey Felt Hat', year: 'Winter 1887–88', place: 'Paris', dims: '44.5 × 37.2 cm', hCm: 44.5, img: selfportrait, level: 1, frame: 'gold',
    text: 'In Paris Van Gogh discovered Pointillism and complementary colours. Short, radiating brushstrokes of blue and orange make the background vibrate around his face.',
  },
  {
    id: 'yellowhouse', title: 'The Yellow House (‘The Street’)', year: 'September 1888', place: 'Arles', dims: '72 × 91.5 cm', hCm: 72, img: yellowhouse, level: 2, frame: 'white',
    text: 'The house on the left, where Van Gogh rented four rooms, was to be the base of his “studio of the South” – the setting for his dream of an artists’ colony with Gauguin.',
  },
  {
    id: 'bedroom', title: 'The Bedroom', year: 'October 1888', place: 'Arles', dims: '72 × 90 cm', hCm: 72, img: bedroom, level: 2, frame: 'white',
    text: '“Looking at the painting should rest the brain, or rather the imagination.” Van Gogh painted his bedroom in the Yellow House in flat, bright colours and a deliberately tilted perspective.',
  },
  {
    id: 'sunflowers', title: 'Sunflowers', year: 'January 1889', place: 'Arles', dims: '95 × 73 cm', hCm: 95, img: sunflowers, level: 2, frame: 'gold',
    text: 'One of the most famous paintings in the world. Van Gogh painted this version as a replica of the one in London, using chrome-yellow paint in thick, sculpted impasto.',
  },
  {
    id: 'almond', title: 'Almond Blossom', year: 'February 1890', place: 'Saint-Rémy-de-Provence', dims: '73.3 × 92.4 cm', hCm: 73.3, img: almond, level: 3, frame: 'gold',
    text: 'Painted to celebrate the birth of his nephew, Vincent Willem. The branches against a turquoise sky show the influence of Japanese woodblock prints.',
  },
  {
    id: 'thunder', title: 'Wheatfield under Thunderclouds', year: 'July 1890', place: 'Auvers-sur-Oise', dims: '50 × 101 cm', hCm: 50, img: thunder, level: 3, frame: 'black',
    text: 'One of the last paintings Van Gogh made. In a letter he described “vast fields of wheat under turbulent skies” and said he had “made no effort to express sadness, extreme loneliness”.',
  },
  {
    id: 'crows', title: 'Wheatfield with Crows', year: 'July 1890', place: 'Auvers-sur-Oise', dims: '50.5 × 103 cm', hCm: 50.5, img: crows, level: 3, frame: 'black',
    text: 'Often wrongly called his last painting. Paths that lead nowhere, a heavy sky and flying crows give the double-square canvas a dramatic, unsettled energy.',
  },
]

export const QUOTES = [
  'I am seeking, I am striving, I am in it with all my heart.',
  'What would life be if we had no courage to attempt anything?',
  'The sight of the stars always makes me dream.',
  'It is good to love many things, for therein lies the true strength.',
]
