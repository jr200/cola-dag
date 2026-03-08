# cola-dag

Interactive DAG (Directed Acyclic Graph) visualiser with simultaneous 2D and 3D views. Parses [DOT](https://graphviz.org/doc/info/lang.html) graph descriptions and renders them using constraint-based layout via [WebCola](https://github.com/tgdwyer/WebCola).

## Features

- **2D view** — SVG rendering with D3.js and WebCola's `d3adaptor` for force-directed layout with constraints
- **3D view** — WebGL rendering with Three.js and WebCola's `Layout3D`
- **Split view** — Resizable side-by-side 2D/3D panels with draggable splitter
- **Group collapse/expand** — Double-click nodes or use the legend to collapse DOT subgraphs into single proxy nodes
- **Multi-DAG support** — Automatically detects independent DAG roots and provides a selector to switch between them
- **Interactive controls** — Drag nodes, zoom, pan, recolor, re-layout, and adjust physics parameters

## Getting Started

```sh
npm install
```

### Development

```sh
make dev       # or: npm run dev
```

Opens a Vite dev server with hot module replacement.

Pass a `?data=` query parameter to load a specific DOT file:

```
http://localhost:5173/?data=path/to/graph.dot
```

If no `data` parameter is provided, the viewer defaults to loading `../graph-data.dot`.

### Production Build

```sh
make build     # or: npm run build
```

Outputs minified JS + CSS to `dist/`. Preview the production build with:

```sh
make preview   # or: npm run preview
```

## Project Structure

```
cola-dag/
├── index.html                  # Entry point (Vite root)
├── src/
│   ├── graph-init.js           # Bootstrap: fetch DOT, parse, init renderers
│   ├── dot-parser.js           # DOT → internal spec adapter (uses @dagrejs/graphlib-dot)
│   ├── shared-state.js         # Shared state store with event-emitter pattern
│   ├── renderer-2d.js          # 2D SVG renderer (D3 + WebCola d3adaptor)
│   ├── renderer-3d.js          # 3D WebGL renderer (Three.js + WebCola Layout3D)
│   ├── controls.js             # Toolbar, physics panels, legend, DAG selector
│   ├── styling.js              # Colour palette, group colour assignment, utilities
│   └── style.css               # All styles
├── package.json
├── vite.config.js
├── Makefile
├── LICENSE                     # MIT License
└── THIRD-PARTY-NOTICES         # Third-party library licenses
```

## Controls

| Action | 2D | 3D |
|---|---|---|
| Pan | Scroll drag | Shift + drag |
| Zoom | Scroll wheel | Scroll wheel |
| Rotate | — | Drag |
| Select node | Click | Click |
| Collapse/expand group | Double-click | Double-click |
| Unpin node | Right-click | — |
| Recenter | — | `r` key or Recenter button |

## Third-Party Libraries

| Library | Version | License |
|---|---|---|
| [D3.js](https://github.com/d3/d3) | 4.x | ISC |
| [Three.js](https://github.com/mrdoob/three.js) | 0.148.0 | MIT |
| [WebCola](https://github.com/tgdwyer/WebCola) | 3.4.0 | MIT |
| [@dagrejs/graphlib-dot](https://github.com/dagrejs/graphlib-dot) | 1.0.2 | MIT |

See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for full license texts.

## License

[MIT](LICENSE)
