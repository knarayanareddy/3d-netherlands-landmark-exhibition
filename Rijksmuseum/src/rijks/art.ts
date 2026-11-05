import * as THREE from 'three'
import nightwatch from '../assets/art/nightwatch.jpg'
import milkmaid from '../assets/art/milkmaid.jpg'
import bride from '../assets/art/bride.jpg'
import street from '../assets/art/street.jpg'
import avercamp from '../assets/art/avercamp.jpg'
import merry from '../assets/art/merry.jpg'
import paul from '../assets/art/paul.jpg'

export interface ArtPiece {
  id: string
  title: string
  artist: string
  year: string
  note: string
  tex: THREE.Texture
  aspect: number // width / height
}

const SRC: Omit<ArtPiece, 'tex' | 'aspect'>[] = [
  { id: 'nightwatch', title: 'The Night Watch', artist: 'Rembrandt van Rijn', year: '1642', note: 'Militia Company of District II under Captain Frans Banninck Cocq. Roughly 3.6 × 4.4 m – the museum was built around it.' },
  { id: 'milkmaid', title: 'The Milkmaid', artist: 'Johannes Vermeer', year: 'c. 1660', note: 'A kitchen maid pours milk in a quiet, luminous interior – one of fewer than 40 surviving Vermeers.' },
  { id: 'bride', title: 'The Jewish Bride', artist: 'Rembrandt van Rijn', year: 'c. 1665–69', note: 'A late masterpiece, famous for its thickly worked reds and golds and the tender gesture of the couple’s hands.' },
  { id: 'street', title: 'The Little Street', artist: 'Johannes Vermeer', year: 'c. 1658', note: 'One of only two known Vermeer cityscapes, showing brick house fronts in Delft.' },
  { id: 'avercamp', title: 'Winter Landscape with Ice Skaters', artist: 'Hendrick Avercamp', year: 'c. 1608', note: 'The Little Ice Age as a social stage: nobles, farmers and children all share the frozen canal.' },
  { id: 'merry', title: 'The Merry Drinker', artist: 'Frans Hals', year: 'c. 1628–30', note: 'Hals’ loose, rapid brushwork makes a fleeting, laughing glance feel alive.' },
  { id: 'paul', title: 'Self-portrait as the Apostle Paul', artist: 'Rembrandt van Rijn', year: '1661', note: 'Rembrandt paints himself, late in life, as the apostle with a sword and a letter.' },
]
const URLS: Record<string, string> = { nightwatch, milkmaid, bride, street, avercamp, merry, paul }

export async function loadArt(progress?: (i: number, n: number) => void): Promise<Record<string, ArtPiece>> {
  const loader = new THREE.TextureLoader()
  const out: Record<string, ArtPiece> = {}
  let i = 0
  await Promise.all(SRC.map(async (s) => {
    const tex = await loader.loadAsync(URLS[s.id])
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    const img = tex.image as HTMLImageElement
    out[s.id] = { ...s, tex, aspect: img.width / img.height }
    progress?.(++i, SRC.length)
  }))
  return out
}
