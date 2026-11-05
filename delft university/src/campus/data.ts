import raw from '../data/campus.json'
import { decode, type Pt } from './geo'

export interface PartData { p: number[]; h: number; mh: number; roof: string; col: string; mat: string; name: string; lv: number }
export interface BuildingData {
  id: number; p: number[]; h: number; mh: number; t: string; roof: string; rh: number; col: string; mat: string
  ref: string; name: string; lv: number; a: number; cx: number; cz: number; skip: number; parts: PartData[]
}
export interface RoadData { k: string; w: number; br: number; p: number[]; nm: string; fw: string }
export interface AreaData { k: string; p: number[]; a: number }
export interface WaterLine { w: number; p: number[]; br: number }
export interface CampusData {
  buildings: BuildingData[]; roads: RoadData[]; areas: AreaData[]; water: WaterLine[]; trees: number[]
  meta: { lat0: number; lon0: number }
}

export const DATA = raw as unknown as CampusData
export const ptsOf = (p: number[]): Pt[] => decode(p)

export const buildingById = (id: number) => DATA.buildings.find((b) => b.id === id)

/** simple uniform grid for point-in-polygon / proximity lookups */
export class Grid<T> {
  private cells = new Map<number, T[]>()
  constructor(private size = 24) {}
  private key(ix: number, iz: number) { return (ix + 5000) * 10000 + (iz + 5000) }
  addBox(x0: number, z0: number, x1: number, z1: number, item: T) {
    const s = this.size
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this.key(ix, iz)
        const a = this.cells.get(k)
        if (a) a.push(item); else this.cells.set(k, [item])
      }
    }
  }
  get(x: number, z: number): T[] {
    return this.cells.get(this.key(Math.floor(x / this.size), Math.floor(z / this.size))) ?? []
  }
}

export const bbox = (P: Pt[]) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1] }
  return { x0, z0, x1, z1 }
}
