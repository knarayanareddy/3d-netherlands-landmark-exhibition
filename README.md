# 3D Netherlands Landmark Exhibition 🇳🇱

An interactive 3D spatial exhibition of iconic architectural and engineering landmarks across the Netherlands, built with React, Three.js, and Vite.

## Features

- **Interactive 3D Map & Landmarks**: Explore custom-modeled landmarks across the Netherlands, including:
  - Afsluitdijk
  - Keukenhof
  - Rijksmuseum
  - Erasmusbrug
  - Euromast
  - Evoluon
  - Kinderdijk Windmills
  - Rotterdam Cube Houses (Kubuswoningen)
  - Dom Tower (Utrecht)
  - Oosterscheldekering (Delta Works)
  - Amsterdam Canal Houses & Bridges
- **Exploration Modes**: Free Orbit mode and Walk/First-Person inspection mode.
- **Lighting & Time of Day**: Switch between Day, Dusk, and Night modes with dynamic atmospheric lighting, shadows, and building illuminations.
- **Minimap Navigation**: 2D interactive minimap with landmark radar and instant teleportation.
- **Audio & Tour Experience**: Guided exhibition tours with historical narratives and statistics.

## Tech Stack

- **React 19**
- **Three.js**
- **Vite**
- **Tailwind CSS v4**
- **TypeScript**

## Individual Landmark Projects

In addition to the main combined 3D exhibition, this repository includes individual standalone landmark showcase projects:
- `Afsluitdijk/`
- `artis/`
- `Cubehouses/`
- `Diergaarde Blijdorp/`
- `Eastern Scheldt Barrier/`
- `erasmus-bridge/`
- `euromast/`
- `kinderdijk/`
- `Kuekenhof/`
- `Rijksmuseum/`
- `VanGoghmuseum/`

Each landmark folder can be run independently using `npm install` and `npm run dev`.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm / pnpm / yarn

### Installation

```bash
git clone https://github.com/knarayanareddy/3d-netherlands-landmark-exhibition.git
cd 3d-netherlands-landmark-exhibition
npm install
```

### Development

Run local development server:

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

## License

MIT
