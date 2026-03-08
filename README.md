# cola-dag

Interactive DAG (Directed Acyclic Graph) visualiser with simultaneous 2D and 3D views. Parses [DOT](https://graphviz.org/doc/info/lang.html) graph descriptions and renders them using constraint-based layout via [WebCola](https://github.com/tgdwyer/WebCola).

## Features

- **2D view** — SVG rendering with D3.js and WebCola's `d3adaptor` for force-directed layout with constraints
- **3D view** — WebGL rendering with Three.js and WebCola's `Layout3D`
- **Split view** — Resizable side-by-side 2D/3D panels with draggable splitter
- **Group collapse/expand** — Double-click nodes or use the legend to collapse DOT subgraphs into single proxy nodes
- **Multi-DAG support** — Automatically detects independent DAG roots and provides a selector to switch between them
- **Interactive controls** — Drag nodes, zoom, pan, recolor, re-layout, and adjust physics parameters
- **Live updates** — REST API with SSE broadcast for pushing graph and colour changes to all connected clients
- **Production server** — Standalone Node.js HTTP server for deploying built assets
- **Docker support** — Multi-stage Dockerfile for containerised deployment

## Getting Started

```sh
make install   # or: npm install
```

### Development

```sh
make dev       # or: npm run dev
```

Opens a Vite dev server with hot module replacement at `http://localhost:5173`.

Pass a `?data=` query parameter to load a specific DOT file:

```
http://localhost:5173/?data=path/to/graph.dot
```

If no `data` parameter is provided, the viewer defaults to loading `/default.dot`.

### Production Build

```sh
make build     # or: npm run build
```

Outputs minified JS + CSS to `dist/`. Preview the production build with:

```sh
make preview   # or: npm run preview
```

### Docker

```sh
make docker    # builds the Docker image as cola-dag:latest
```

Run the container:

```sh
docker run -p 3000:3000 cola-dag
```

The server listens on port 3000 by default (override with the `PORT` environment variable).

### Testing & Linting

```sh
make test      # or: npm test     — run vitest suite
make lint      # or: npm run lint — run ESLint
make lint-fix  # auto-fix lint issues
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
│   └── styling.js              # Colour palette, group colour assignment, utilities
├── test/
│   ├── dot-parser.test.js      # Unit tests for DOT parsing
│   ├── shared-state.test.js    # Unit tests for state management
│   ├── styling.test.js         # Unit tests for colour assignment
│   └── api.test.js             # Integration tests for API endpoints
├── public/
│   └── default.dot             # Example dependency graph
├── vite-plugin-graph-api.js    # Vite plugin: REST API + SSE middleware
├── server.js                   # Production HTTP server
├── package.json
├── vite.config.js
├── Dockerfile                  # Multi-stage Docker build
├── Makefile
├── LICENSE                     # MIT License
└── THIRD-PARTY-NOTICES         # Third-party library licenses
```

## API

The Vite plugin (and production server) expose the following endpoints:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/graph-events` | SSE stream for live graph & colour updates |
| POST | `/update-graph` | Push new DOT text, broadcast to SSE clients |
| GET | `/api/graph-dot` | Export current DAG as DOT (`?styled=true` for colours) |
| GET | `/api/graph-colors` | Current colour state as JSON |
| POST | `/api/graph-colors` | Apply partial colour updates, broadcast via SSE |

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

## Makefile Targets

| Target | Description |
|---|---|
| `install` | Install npm dependencies |
| `dev` | Start Vite dev server with HMR |
| `build` | Production build to `dist/` |
| `preview` | Preview production build |
| `test` | Run vitest suite |
| `lint` | Run ESLint |
| `lint-fix` | Auto-fix lint issues |
| `docker` | Build Docker image (`cola-dag:local`) |
| `clean` | Remove `dist/` and `node_modules/` |
| `update` | Update dependencies |
| `bump` | Bump version in `package.json` and lockfile (`v=patch\|minor\|major`) |
| `release` | Create GitHub release from current version tag |

## Releasing

1. Bump the version (updates `package.json` and `package-lock.json`):
   ```sh
   make bump v=patch   # or minor, major
   ```
2. Commit the version change:
   ```sh
   git add package.json package-lock.json
   git commit -m "bump version to $(node -p \"require('./package.json').version\")"
   ```
3. Create the GitHub release:
   ```sh
   make release
   ```

## Third-Party Libraries

| Library | Version | License |
|---|---|---|
| [D3.js](https://github.com/d3/d3) | 7.x | ISC |
| [Three.js](https://github.com/mrdoob/three.js) | 0.183.2 | MIT |
| [WebCola](https://github.com/tgdwyer/WebCola) | 3.4.0 | MIT |
| [@dagrejs/graphlib-dot](https://github.com/dagrejs/graphlib-dot) | 1.0.2 | MIT |

See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for full license texts.

## License

[MIT](LICENSE)
