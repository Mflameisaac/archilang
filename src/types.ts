// ARCHILANG YAML structure types

export interface RenderingOptions {
  grid_lines?: { enabled: boolean };
  area_table?: { enabled: boolean };
}

// Equipment types

export type EquipmentType =
  | 'kitchen_counter'
  | 'unit_bath'
  | 'toilet'
  | 'washbasin'
  | 'washing_machine'
  | 'refrigerator';

export interface EquipmentSpec {
  id: string;
  type: EquipmentType;
  room: string;
  wall: WallSide;
  position: 'center' | { offset: number };
  size?: { w: number; h: number };
}

export interface ResolvedEquipment {
  id: string;
  type: EquipmentType;
  roomId: string;
  wallId: string;   // ID of the WallEdge this equipment is placed against
  x: number;        // left-bottom x (mm)
  y: number;        // left-bottom y (mm)
  w: number;        // width along wall (mm)
  h: number;        // depth perpendicular to wall (mm)
  wallSide: WallSide;
}

export interface Archilang {
  archilang: string;
  site: Site;
  building: Building;
  geometry: Geometry;
  rendering?: RenderingOptions;
}

export interface Site {
  orientation: string;
}

export interface Building {
  structure: string;
  module: string;
  stories: number;
  defaults: BuildingDefaults;
}

export interface BuildingDefaults {
  ceiling_height: string;
  external_wall: { thickness: string };
  internal_wall: { partition: string };
}

// Explicit wall definitions

export interface WallPointMm {
  x: number;
  y: number;
}

export interface WallPointGrid {
  grid: { x: number; y: number };
  dx?: number;
  dy?: number;
}

export type WallPointSpec = WallPointMm | WallPointGrid;

export interface WallSegmentSpec {
  id: string;
  floor: string;
  from: WallPointSpec;
  to: WallPointSpec;
  thickness?: string; // e.g. "130mm"
  type?: 'external' | 'internal';
  grid_line?: boolean;
}

export interface WallsSpec {
  mode?: 'additive' | 'explicit_only';
  segments: WallSegmentSpec[];
}

export interface Geometry {
  grids: Grids;
  rooms: RoomSpec[];
  openings: OpeningSpec[];
  walls?: WallsSpec;
  equipment?: EquipmentSpec[];
}

export interface Grids {
  module: string;
  [floor: string]: FloorGrid | string;
}

export interface FloorGrid {
  x_spans: number[];
  y_spans: number[];
}

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SubRoomSpec {
  id: string;
  type: string;
  seed: { x: number; y: number }; // grid coordinates — any point inside the sub-area
}

export interface RoomSpec {
  id: string;
  floor: string;
  type: string;
  grid_rect?: GridRect;
  grid_rects?: GridRect[];
  sub_rooms?: SubRoomSpec[];
}

export interface OpeningSpec {
  id: string;
  type: string;
  style: string;
  room?: string;
  wall?: string;
  connects?: [string, string];
  position: string | { offset: number };
  size: { w: number; h: number };
  sill?: number;
}

// Resolved model types (after grid→mm conversion)

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolvedRoom {
  id: string;
  type: string;
  /** Bounding rect encompassing all rects (mm) */
  boundingRect: Rect;
  /** Individual component rects (mm). Single-rect rooms have exactly one entry. */
  rects: Rect[];
  /** Grid-level rects (as specified in YAML, normalized to array) */
  gridRects: GridRect[];
}

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface WallEdge {
  id: string;
  side: WallSide;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isExternal: boolean;
  thickness: number;
  rooms: string[]; // room ids sharing this edge
  source?: 'auto' | 'explicit';
  hasOffset?: boolean; // true if grid+offset was used (intentional misalignment)
}

export interface ResolvedOpening {
  id: string;
  type: string;
  style: string;
  wallId: string;
  cx: number; // center x in mm
  cy: number; // center y in mm
  w: number;  // width in mm
  h: number;  // height in mm
  orientation: 'horizontal' | 'vertical';
  isExternal: boolean;
  wallSide?: WallSide;
  sill?: number;
  // which side the door opens towards (for swing doors)
  swingDirection?: 'inward' | 'outward';
  connectedRooms?: [string, string];
}

export interface ExtraGridLines {
  x: number[]; // mm positions for additional vertical grid lines
  y: number[]; // mm positions for additional horizontal grid lines
}

export type SkipReasonCode = 'UNKNOWN_ROOM_REF' | 'NO_SHARED_WALL' | 'WALL_NOT_FOUND' | 'OTHER';

export interface SkippedOpening {
  id: string;
  reason: string;
  reasonCode: SkipReasonCode;
  connects?: [string, string];
  room?: string;
}

export interface ResolvedSubRoom {
  id: string;
  type: string;
  parentRoomId: string;
  rect: Rect;           // bounding rect in mm (from flood-fill)
  areaMm2: number;      // actual area in mm² (sum of flood-fill cells)
  isFullPartition: boolean; // wall fully divides the parent room
  barrierWallIds?: string[]; // wall IDs forming the boundary of this sub-room
}

export interface BuildingModel {
  moduleSize: number;
  externalWallThickness: number;
  internalWallThickness: number;
  totalGridX: number;
  totalGridY: number;
  xSpans: number[];
  ySpans: number[];
  rooms: ResolvedRoom[];
  walls: WallEdge[];
  openings: ResolvedOpening[];
  skippedOpenings: SkippedOpening[];
  orientation: string;
  rendering?: RenderingOptions;
  extraGridLines: ExtraGridLines;
  subRooms: ResolvedSubRoom[];
  equipment: ResolvedEquipment[];
}
