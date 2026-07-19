# archilang

A CLI tool that converts floor plan data written in the ARCHILANG YAML specification into SVG floor plans.

> **Fork notice.** This is a fork of [4kk11/archilang](https://github.com/4kk11/archilang) (MIT, © 2026 4kk11), maintained by Krafftt. The README has been translated from Japanese to English. Functional changes on top of upstream: a library entry point with package `exports`, an opening-style alias table so specs can be authored in English as well as Japanese, and a `prepare` build script so the package is installable straight from a git URL.

https://github.com/user-attachments/assets/ea6f60fa-00e9-45a0-94c4-95053672f335

## Overview

Reads architectural floor plan information written in the ARCHILANG format (YAML) and generates:

- **SVG floor plan** — a vector drawing including walls, windows, doors, dimension lines, an orientation symbol and a scale bar
- **HTML preview** — a preview file you can open in a browser immediately
- **Area schedule** — a table of wall-centreline areas (rendered inside the SVG via YAML settings, or emitted as JSON via a CLI option)

## Quick start

```bash
# Install dependencies
npm install

# Build
npx tsc

# Render the sample
node dist/main.js
# → generates output.svg and output.html

# Render a specific YAML file
node dist/main.js path/to/plan.yaml output.svg

# Also emit the area schedule as JSON (.area.json)
node dist/main.js path/to/plan.yaml output.svg --area-table
```

## Using it as a library

The rendering pipeline is exported from the package root. Every module reachable from that entry point is free of `node:` imports, so it is safe to bundle for the browser — the CLI (`main.ts`) and file watcher (`watcher.ts`) are deliberately not exported.

```ts
import { parseArchilang, resolveModel, validateBuilding, composeSvg } from 'archilang';

const spec       = parseArchilang(yamlText);
const model      = resolveModel(spec);
const validation = validateBuilding(model);
const svg        = composeSvg(model);
```

## Validation

A command is provided to check the consistency of floor plan data.

```bash
# Single file
node dist/main.js validate samples/4ldk-complex-invalid.yaml

# Multiple files
node dist/main.js validate samples/basic-3room.yaml samples/4ldk-complex-invalid.yaml

# All samples at once
node dist/main.js validate --all

# npm script
npm run validate -- samples/4ldk-complex-invalid.yaml
npm run validate -- --all
```

Example output:

```
✓ samples/basic-3room.yaml
✗ samples/4ldk-complex-invalid.yaml
  ERROR [ISOLATED_SUBAREA] Room "bath" has an isolated sub-area (5.0m²) created by partition wall(s): w_bath_partition
  ERROR [ISOLATED_SUBAREA] Room "closet" has an isolated sub-area (3.3m²) created by partition wall(s): w_closet_shelf
✓ samples/custom-walls-invalid.yaml
  WARN  [GRID_MISALIGNMENT] Wall "w_custom_ext" is not aligned to 910mm grid (off-grid coordinates: 2500mm, 2500mm)
```

Returns exit code 1 when there are errors.

### Validation rules

| Code | Severity | Description |
|--------|--------|------|
| `UNKNOWN_ROOM_REF` | error | A door's `connects` references a room ID that does not exist |
| `UNREACHABLE_ROOM` | error | A room (including sub-rooms) cannot be reached from an external entrance by following doors |
| `ROOM_WITHOUT_DOOR` | warning | A room with no door connections at all |
| `SUB_ROOM_WITHOUT_DOOR` | warning | A sub-room created by a full partition has no door connection |
| `ISOLATED_SUBAREA` | error | An additive wall divides a room completely in two and the side without a door is isolated |
| `SKIPPED_OPENING` | error | An opening was skipped during resolution (references a non-existent room, no shared wall, etc.) |
| `OPENING_OVERLAP` | warning | Openings overlap each other on the same wall face (judged as 1D intervals) |
| `GRID_MISALIGNMENT` | warning | An explicit wall's coordinates are not aligned to the module grid (deliberate deviations via grid+offset are excluded) |
| `EQUIPMENT_UNKNOWN_ROOM` | error | A fixture's `room` references a room ID that does not exist |
| `EQUIPMENT_OUT_OF_BOUNDS` | warning | A fixture extends outside its room's bounding rectangle |
| `EQUIPMENT_OVERLAP` | warning | Fixtures overlap each other within the same room |
| `EQUIPMENT_OPENING_WALL_OVERLAP` | warning | A fixture and an opening (window) overlap on the same wall face |
| `EQUIPMENT_DOOR_CLEARANCE_BLOCKED` | error | A fixture obstructs a door's swing clearance |

`ISOLATED_SUBAREA` is detected with a coordinate-compressed flood fill. Partial walls (walls that do not fully cross the room) can be walked around, so they are not a problem. Rooms that define `sub_rooms` skip the `ISOLATED_SUBAREA` check, delegating to door validation on the sub-room side.

`OPENING_OVERLAP` projects openings on the same wall face onto a 1D interval along the wall axis and detects overlaps with a sweep line. `GRID_MISALIGNMENT` checks whether an explicit wall's coordinates are integer multiples of the module. Walls specified in `grid+offset` form (non-zero `dx`/`dy`) are treated as deliberate deviations and skip the warning.

## JSON validation output

The `--format json` option emits validation results as structured JSON. Each issue carries `fix_hint` (repair instruction) and `auto_fixable`.

```bash
node dist/main.js validate samples/custom-walls-invalid.yaml --format json
```

Example output:

```json
{
  "file": "samples/custom-walls-invalid.yaml",
  "ok": false,
  "errorCount": 3,
  "warningCount": 1,
  "issues": [
    {
      "severity": "warning",
      "code": "GRID_MISALIGNMENT",
      "message": "Wall \"w_custom_ext\" is not aligned to 910mm grid...",
      "wallId": "w_custom_ext",
      "fix_hint": "Snap wall \"w_custom_ext\" endpoints to nearest 910mm grid (0→0, 2500→2730, 1820→1820, 2500→2730)",
      "auto_fixable": true
    }
  ]
}
```

## The `inspect` command

Outputs the structure of the floor plan data as JSON: the room graph, adjacency relationships, occupancy grid, areas and wall list.

```bash
# JSON output
node dist/main.js inspect samples/basic-3room.yaml

# ASCII map display
node dist/main.js inspect samples/basic-3room.yaml --ascii-map
```

Example ASCII map output:

```
     0   1   2   3   4   5   6   7
  +-------------------+-------------------+
6 |bedr bedr bedr bedr|ldk  ldk  ldk  ldk |
  +                   +                   +
5 |bedr bedr bedr bedr|ldk  ldk  ldk  ldk |
  +-------------------+                   +
4 |bath bath bath bath|ldk  ldk  ldk  ldk |
  +                   +                   +
3 |bath bath bath bath|ldk  ldk  ldk  ldk |
  +-------------------+-------------------+
```

Fields included in the JSON output:

| Field | Description |
|-----------|------|
| `grid` | Module size, total grid counts, spans |
| `rooms` | Room list (area, tatami count, adjacent rooms, wall list) |
| `adjacency` | Adjacency graph formed by door connections |
| `occupancyGrid` | Room ID per grid coordinate |
| `walls` | Wall list (rooms, isExternal, source) |
| `openings` | Opening list (connectedRooms, wallId) |

## The `solve` command

Attempts to automatically repair validation errors, running a `validate → auto-fix → revalidate` loop.

```bash
# Dry run (shows the fixes but does not apply them)
node dist/main.js solve samples/custom-walls-invalid.yaml --dry-run

# Apply fixes and write output
node dist/main.js solve samples/custom-walls-invalid.yaml --out fixed.yaml

# Specify the maximum number of iterations
node dist/main.js solve plan.yaml --max-iter 3 --out fixed.yaml
```

Example output:

```
Iteration 1: Snapped wall "w_custom_ext" to grid: 2500→2730, 2500→2730
Iteration 2: no auto-fixable issues remaining

Solve complete: 2 iteration(s), 1 fix(es) applied
Final: 3 error(s), 0 warning(s), ok=false
Fixed YAML written to: fixed.yaml
```

### Auto-fix rules (v1)

| Error code | Fix applied | Conditions |
|-------------|---------|------|
| `GRID_MISALIGNMENT` | Snap the explicit wall's coordinates to the nearest grid line | `hasOffset=false`, snap distance within module/2 |
| `ROOM_WITHOUT_DOOR` | Automatically add a door on a wall shared with an adjacent room | A shared wall exists and has no existing openings |

Errors that cannot be auto-fixed (`UNREACHABLE_ROOM`, `ISOLATED_SUBAREA`, etc.) require manual correction. The `fix_hint` field from `validate --format json` gives you the clue for the repair.

## Area schedule

There are two output methods:

- **Table inside the SVG** — drawn to the right of the plan when `rendering.area_table.enabled: true` is set in the YAML
- **JSON file** — emits `.area.json` via the CLI's `--area-table` option

```yaml
# Enable the SVG area schedule in YAML
rendering:
  area_table:
    enabled: true
```

```bash
# JSON output only (the SVG table follows the YAML setting)
node dist/main.js samples/4ldk-complex.yaml output.svg --area-table
# → output.area.json
```

### SVG area schedule

A table with the following columns is drawn to the right of the plan:

| Column | Description |
|----|------|
| Room | Room name (sub-rooms are indented) |
| m² | Wall-centreline area (square metres) |
| Tatami | Tatami count (1 tatami = 2 × module² = 1.6562 m²) |

The bottom row shows the total floor area (the sum of top-level room areas). Sub-room areas are included in their parent room, so they are not added to the total.

> **Note for non-shaku modules.** The tatami unit is derived from the module size (`2 × module²`), which is only correct at the 910mm shaku module. With a different module — a 500mm metric grid, say — the tatami column reports a meaningless number. Treat that column as shaku-specific.

### JSON output (`.area.json`)

```json
{
  "rooms": [
    { "id": "ldk", "type": "LDK", "area_m2": 19.87, "tatami": 12 },
    { "id": "kitchen", "type": "キッチン", "parent": "ldk", "area_m2": 7.45, "tatami": 4.5 }
  ],
  "summary": {
    "total_floor_area_m2": 82.81,
    "building_area_m2": 82.81
  }
}
```

### Area calculation method

- **Wall-centreline area**: the sum of each room's `grid_rect` / `grid_rects` rectangles (`Σ(w × h) × module²`)
- Sub-room areas use the `areaMm2` computed by flood fill or geometric subdivision
- Total floor area = the sum of top-level rooms' wall-centreline areas

## Processing pipeline

```
YAML ──→ parseArchilang() ──→ Archilang (typed data)
                                  │
                           resolve(spec) ──→ BuildingModel
                                  │            ├ rooms     (grid → mm converted)
                                  │            ├ walls     (external/internal auto-detected)
                                  │            ├ subRooms  (regions computed by flood fill)
                                  │            ├ openings  (positions resolved on walls)
                                  │            └ equipment (wall-aligned placement resolved)
                                  │
                        validateBuilding(model) ──→ ValidationResult
                                  │
                           composeSvg(model) ──→ SVG string
                                  │
                           ┌──────┼──────┐
                           │      │      │
                         grid   walls  openings
                        labels  dims    meta
                        gridline-dims  gridlines
                           │      │      │
                           └──────┼──────┘
                                  │
                           ┌──────┴──────┐
                       output.svg   output.html
                                    output.area.json (with --area-table)
```

## ARCHILANG YAML specification (v0.3)

### Basic structure

```yaml
archilang: "0.2"

site:
  orientation: south          # front elevation of the building (north / south / east / west)

building:
  structure: 木造軸組          # free-form string (e.g. "masonry", "timber frame")
  module: shaku               # shaku module (910mm)
  stories: 1
  defaults:
    ceiling_height: 2400mm
    external_wall:
      thickness: 130mm        # external wall thickness
    internal_wall:
      partition: 90mm         # internal wall thickness (partition)
```

`structure` and `module` are free-form strings and are not restricted to Japanese construction terms. The grid actually used for geometry comes from `geometry.grids.module`, so a metric plan simply sets that to e.g. `500mm`.

### Rendering options

```yaml
rendering:
  grid_lines:
    enabled: true            # show structural grid lines (default: false)
  area_table:
    enabled: true            # draw the area schedule to the right of the plan (default: false)
```

### Grid definition

Grids are defined as spans in module units (910mm).

```yaml
geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [3, 5]        # X direction: 3 modules + 5 modules = 8 total
      y_spans: [4, 3]        # Y direction: 4 modules + 3 modules = 7 total
```

### Room definition

Use `grid_rect` to specify a rectangle in grid coordinates. The origin is bottom-left.

```yaml
rooms:
  - id: ldk
    floor: 1F
    type: LDK                # display name (Japanese permitted)
    grid_rect: { x: 3, y: 0, w: 5, h: 7 }

  - id: bedroom
    floor: 1F
    type: 寝室
    grid_rect: { x: 0, y: 3, w: 3, h: 4 }
```

#### Non-rectangular rooms (multi-rect)

Non-rectangular rooms such as L-shapes and T-shapes are defined with `grid_rects` (plural) as the union of several rectangles.

```yaml
rooms:
  # L-shaped LDK (composed of 2 rectangles)
  - id: ldk
    floor: 1F
    type: LDK
    grid_rects:
      - { x: 0, y: 0, w: 7, h: 4 }   # the wide southern portion
      - { x: 3, y: 4, w: 4, h: 3 }    # the portion projecting to the north-east
```

**Constraints:**
- `grid_rect` (singular) and `grid_rects` (plural) are mutually exclusive; specifying both is an error
- Rectangles within `grid_rects` must connect along an edge (overlaps are an error)
- The union of the rectangles forms the room shape, and walls are extracted only along the outer perimeter
- Multi-rect rooms also support `sub_rooms`. Full partitions use flood fill; partial partitions use cell-based subdivision to compute regions

### Sub-room definition (`sub_rooms`)

When a room is divided by explicit walls, assign an individual name, label and area to each sub-area. A flood fill determines which sub-area the grid coordinate given in `seed` belongs to.

```yaml
rooms:
  - id: bath
    floor: 1F
    type: 浴室・洗面
    grid_rect: { x: 4, y: 4, w: 4, h: 3 }
    sub_rooms:
      - id: bath_tub
        type: 浴室
        seed: { x: 5, y: 5 }    # any grid coordinate belonging to the west side of the wall
      - id: wash
        type: 洗面
        seed: { x: 7, y: 5 }    # any grid coordinate belonging to the east side of the wall
```

**Key points:**

- `seed` is any single point (grid coordinate) inside the sub-area. The region reachable from that seed by flood fill becomes the sub-room's extent and area
- N-way division is supported (not limited to two — any number of divisions is possible given the walls and seeds)
- When a wall divides the room completely (**full partition**): flood fill computes the exact extent of each sub-area
- When a wall does not divide the room completely (**partial partition**, e.g. a counter wall): falls back to geometric subdivision using the wall position as a cut line
- Sub-room IDs can be referenced directly by a door's `connects`. Wall lookup for doors automatically falls back to the parent room
- Labels are displayed individually at the centre of each sub-room rather than at the parent room
- Sub-room IDs and room IDs must be globally unique

### Explicit wall definition

The `geometry.walls` section lets you define walls explicitly, independent of the grid. There is an `additive` mode (default) that coexists with auto-extracted walls, and an `explicit_only` mode that disables auto-extraction.

```yaml
geometry:
  walls:
    mode: additive          # additive (default) | explicit_only
    segments:
      # specified directly in mm coordinates
      - id: w_partition
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 3640 }
        thickness: 90mm     # if omitted: the default for the given type
        type: internal      # external (default) | internal
        grid_line: true     # add a structural grid line at this wall's position

      # specified as grid coordinates + offset
      - id: w_offset
        floor: 1F
        from: { grid: { x: 4, y: 4 }, dx: 150, dy: 0 }
        to: { grid: { x: 4, y: 7 }, dx: 150, dy: 0 }

      # mm and grid+offset may be mixed across from/to
      - id: w_mixed
        floor: 1F
        from: { grid: { x: 3, y: 0 }, dx: 150, dy: 0 }
        to: { x: 2880, y: 6370 }
```

**Ways to specify wall endpoints:**

| Method | Notation | Description |
|------|------|------|
| Direct mm | `{ x: 2730, y: 0 }` | Specify mm coordinates directly |
| Grid | `{ grid: { x: 3, y: 0 } }` | Snap to a grid position |
| Grid + offset | `{ grid: { x: 3, y: 0 }, dx: 150, dy: 0 }` | Offset in mm from a grid position |

**Options:**

| Field | Type | Default | Description |
|-----------|------|----------|------|
| `thickness` | `string` | depends on type | Wall thickness (e.g. `"90mm"`) |
| `type` | `string` | `"external"` | `"external"` or `"internal"` |
| `grid_line` | `boolean` | `false` | When `true`, adds a structural grid line at the wall's position. Labels are merged with the span-boundary grid lines and numbered in positional order (X1, X2, …). When the grid line position differs from a span boundary, a dimension row showing the distance between grid lines is added automatically |

**Constraints:**
- Walls must be orthogonal (horizontal or vertical). Diagonal walls are an error
- Zero-length walls are an error
- Grid coordinates must be within the valid range (`0` to the grid total), otherwise an error
- Wall IDs must be unique (they must not collide with the auto-extracted `wall_N`)

### Opening definition

Windows and doors can be placed in two ways:

**Wall-specified** — placed on a specific room's wall

```yaml
- id: W1
  type: AW                   # AW = aluminium window, WD = wooden door, AD = aluminium door
  style: 引違い窓             # see the style table below
  room: ldk
  wall: south                # which wall to place it on (north / south / east / west)
  position: center           # center, or { offset: 500 } (mm from the wall's start point)
  size: { w: 2530, h: 2000 } # in mm
  sill: 0                    # sill height (mm)
```

**Connection-specified** — places a door on the wall shared between two rooms

```yaml
- id: D1
  type: WD
  style: 片開き
  connects: [bedroom, ldk]   # a pair of room IDs
  size: { w: 800, h: 2000 }

# Sliding door (an opening method suited to tight spaces)
- id: D4
  type: WD
  style: 引き戸
  connects: [wash, ldk]
  size: { w: 800, h: 2000 }

# Sub-room IDs may also be specified
- id: D5
  type: WD
  style: 片開き
  connects: [hall, wash]      # ordinary room ↔ sub-room
  size: { w: 700, h: 2000 }

- id: D6
  type: WD
  style: 片開き
  connects: [wash, bath_tub]  # sub-room ↔ sub-room within the same parent
  size: { w: 700, h: 2000 }
```

**Opening styles:**

Each style resolves to a canonical kind through an alias table, so it may be written in either Japanese or English. Case, underscores and spaces are equivalent (`sliding_door`, `Sliding Door` and `sliding-door` all match).

| Canonical kind | Accepted spellings | Drawn as | Used for |
|---------|---------|------|------|
| sliding window | `引違い窓`, `引き違い窓`, `sliding-window` | Blue parallel lines (two panes of glass) | Windows |
| swing | `片開き`, `片開き戸`, `swing`, `swing-door`, `hinged` | Hinge point + arc (dashed) | Hinged doors |
| sliding door | `引き戸`, `引戸`, `sliding-door` | Panel line (solid) + rail line (dashed) | Sliding doors |
| fixed window | `FIX窓`, `fixed-window` | *(no renderer yet — draws nothing)* | Fixed windows |

An unrecognised style resolves to `unknown` and draws nothing, rather than raising an error.

### Fixture definition

`geometry.equipment` places sanitary and kitchen fixtures along a room's walls, using the same `wall` + `position` pattern as openings.

```yaml
geometry:
  equipment:
    - id: K1
      type: kitchen_counter     # fixture type (chosen from the presets)
      room: ldk                 # target room ID
      wall: south               # which wall to align to (north / south / east / west)
      position: { offset: 0 }   # lateral offset from the wall's start point (mm), or "center"
      size: { w: 1800, h: 650 } # optional — defaults to the preset size when omitted

    - id: UB1
      type: unit_bath
      room: bath
      wall: north
      position: { offset: 0 }

    - id: T1
      type: toilet
      room: toilet
      wall: north
      position: { offset: 200 }
```

**Fixture presets:**

| type | Label | Default size (w×h mm) | SVG symbol |
|------|--------|-------------------------|------------|
| `kitchen_counter` | キッチン (kitchen) | 2550×650 | Counter + sink ellipse + hob □□ |
| `unit_bath` | UB | 1600×1600 | Outer frame + bathtub (rounded) + washing area |
| `toilet` | 便器 (WC pan) | 450×700 | Cistern rectangle + bowl ellipse |
| `washbasin` | 洗面 (washbasin) | 750×550 | Counter + bowl ellipse |
| `washing_machine` | 洗濯機 (washing machine) | 640×640 | Tray rectangle + drum circle |
| `refrigerator` | 冷蔵庫 (refrigerator) | 685×650 | Rectangle + × mark |

- `w` is the dimension along the wall; `h` is the depth away from the wall
- Specifying `size` overrides the preset's default size
- Fixtures are placed flush against the inner face of the wall (gap: 0mm)
- Fixture orientation is determined automatically from the wall direction

> Preset labels are currently Japanese and are rendered into the SVG as-is.

## SVG layer structure

The SVG is composed of the following layers (in drawing order):

| Layer | ID | Contents |
|----------|-----|------|
| Grid | `grid` | Reference grid lines at module intervals (dashed) |
| Walls | `walls` | Rectangles for external walls (dark, thick) and internal walls (light, thin) |
| Fixtures | `equipment` | Sanitary/kitchen fixture symbols (grey, thin) |
| Openings | `openings` | Sliding windows (blue parallel lines), hinged doors (hinge + arc), sliding doors (panel + rail) |
| Labels | `labels` | Room name, area (m²), tatami count |
| Grid-line dimensions | `gridline-dimensions` | Distances between structural grid lines (shown only when a grid line differs from a span boundary; innermost row) |
| Dimensions | `dimensions` | X/Y span dimensions plus overall dimensions (with a dot at each endpoint) |
| Meta | `meta` | Orientation symbol (compass) and scale bar (1m / S=1:100) |
| Structural grid lines | `gridlines` | Structural grid lines (dash-dot) + round labels at both ends (only when `rendering.grid_lines.enabled: true`) |
| Area schedule | `area-table` | Wall-centreline area table (only when `rendering.area_table.enabled: true`) |

## Directory structure

```
archilang/
├── src/
│   ├── index.ts             # library entry point (browser-safe exports)
│   ├── main.ts              # CLI entry point
│   ├── parser.ts            # YAML parsing and validation
│   ├── resolver.ts          # grid→mm conversion, wall extraction, opening and sub-room resolution
│   ├── flood-fill.ts        # coordinate-compressed flood fill (shared by resolver and validator)
│   ├── svg-composer.ts      # layer composition and SVG generation
│   ├── svg-utils.ts         # coordinate transforms (mmToSvg), escaping
│   ├── area-table.ts        # area calculation and JSON output
│   ├── validator.ts         # connectivity, sub-room doors, isolated sub-areas, fixture validation
│   ├── opening-styles.ts    # opening style alias table (Japanese/English → canonical kind)
│   ├── fix-hints.ts         # validation JSON output and fix-hint generation
│   ├── inspect.ts           # inspect command (room graph, occupancy grid, adjacency)
│   ├── ascii-map.ts         # ASCII map rendering
│   ├── auto-fix.ts          # rule-based auto-repair (GRID_MISALIGNMENT, ROOM_WITHOUT_DOOR)
│   ├── solve.ts             # solve command (auto-fix loop orchestrator)
│   ├── types.ts             # all type definitions
│   ├── equipment-presets.ts # fixture preset definitions (6 types)
│   ├── __tests__/           # vitest tests
│   └── renderers/
│       ├── grid-renderer.ts       # grid line drawing
│       ├── gridline-renderer.ts   # structural grid lines (dash-dot + round labels)
│       ├── wall-renderer.ts       # wall drawing (including splitting around openings)
│       ├── opening-renderer.ts    # window and door drawing
│       ├── equipment-renderer.ts  # fixture symbol drawing (6 types)
│       ├── label-renderer.ts      # room label drawing
│       ├── dimension-renderer.ts  # dimension line drawing
│       ├── meta-renderer.ts       # compass and scale bar drawing
│       └── area-table-renderer.ts # area schedule SVG drawing
├── samples/                 # sample floor plan data
├── package.json
└── tsconfig.json
```

## Key design decisions

### Automatic wall detection and explicit definition

All room edges are collected and edges lying on the same line are grouped. When an edge belongs to only one room it is judged an external wall (thick); when it is shared by two rooms it is judged an internal wall (thin).

Walls defined explicitly in `geometry.walls.segments` are added to the auto-extracted walls in `additive` mode (the default); in `explicit_only` mode auto-extraction is disabled and only explicit walls are used.

Explicit walls are automatically assigned room ownership. When a wall's line segment lies on a room's perimeter edge, that room's ID is added to the wall's `rooms` property. Internal seams of multi-rect rooms are not part of the perimeter, so internal partition walls keep `rooms: []` (detection of internal walls is handled geometrically by `findBarriersInRoom`).

### Coordinate systems

- **YAML**: grid coordinates. Origin at bottom-left, Y axis pointing up (architectural convention)
- **Internal model**: millimetres. Converted as grid coordinate × module size (910mm)
- **SVG**: pixels. `mmToSvg()` flips the Y axis (SVG's origin is top-left)

### Openings and wall splitting

When a wall contains an opening, the wall is drawn split on either side of the opening. The opening's extent is clamped to within the wall, and overlapping openings are handled correctly.

## Technology stack

- **TypeScript** (ES2022 modules, strict mode)
- **yaml** — YAML parser
- **vitest** — test framework (devDependency)
- No external runtime dependencies beyond the YAML parser (Node.js standard modules only)

## npm scripts

| Command | Description |
|----------|------|
| `npm run build` | TypeScript compilation (output to `dist/`) |
| `npm run prepare` | Runs automatically after a git install; builds `dist/` |
| `npm run render` | Runs `dist/main.js` (default: `sample.yaml`) |
| `npm run render:sample --name=<name>` | Renders `samples/<name>.yaml` |
| `npm run validate -- <file ...>` | Validates floor plan data |
| `npm run validate -- --all` | Validates all samples at once |
| `npm run dev` | TypeScript watch mode |
| `npm run watch -- <file.yaml>` | Watches a YAML file and re-renders on every save (hot reload) |
| `npm test` | Runs the tests with vitest |
| `npm run test:watch` | vitest watch mode |

### Hot reload (watch mode)

Use this when iterating on a plan while editing YAML. The `watch` subcommand watches the target YAML and regenerates the SVG / HTML preview / (optionally) area.json on every save.

```bash
npm run build
npm run watch -- samples/3ldk-house.yaml
# Edit samples/3ldk-house.yaml in another terminal or your editor → save
# Open samples/3ldk-house.html in a browser and reload to see it update immediately
```

The output SVG destination and area.json can also be specified:

```bash
npm run watch -- samples/3ldk-house.yaml output/plan.svg --area-table
```

While the YAML is broken it displays the error and keeps watching (the process does not exit). Stop with Ctrl+C.

### Sample list

The `samples/` directory contains samples for various purposes.

```bash
npm run render:sample --name=basic-3room             # basic 3 rooms (LDK + bedroom + bathroom)
npm run render:sample --name=1r-studio               # 1R studio (minimal configuration)
npm run render:sample --name=2ldk-apartment          # 2LDK apartment
npm run render:sample --name=3ldk-house              # 3LDK detached house (east-facing entrance)
npm run render:sample --name=l-shaped-plan           # L-shaped plan (north-facing entrance)
npm run render:sample --name=compact-2dk             # compact 2DK (west-facing entrance)
npm run render:sample --name=4ldk-complex            # 4LDK + sub_rooms (bath/washroom split, closet split)
npm run render:sample --name=custom-walls-invalid    # explicit wall definitions (contains validation errors)
npm run render:sample --name=4ldk-complex-invalid    # 4LDK (sub_rooms undefined, ISOLATED_SUBAREA detected)
npm run render:sample --name=l-shaped-ldk            # L-shaped LDK (grid_rects multi-rect)
npm run render:sample --name=u-shaped-courtyard      # U-shaped courtyard plan
npm run render:sample --name=twin-courtyard          # twin courtyard plan
npm run render:sample --name=3ldk-with-equipment     # 3LDK + fixtures (kitchen, UB, WC, washbasin, washing machine, refrigerator)
```

The SVG and HTML previews are written into `samples/`.

## Licence

MIT © 2026 4kk11. See [LICENSE](LICENSE). This fork retains the original licence and copyright.
