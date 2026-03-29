import { BuildingModel, ResolvedEquipment, WallSide } from '../types.js';
import { SvgRenderConfig, mmToSvg, mmToSvgLength, svgGroup, escapeXml } from '../svg-utils.js';

const STROKE = '#888';
const STROKE_WIDTH = '0.8';
const FILL_LIGHT = '#f5f5f5';
const FILL_NONE = 'none';

export function renderEquipment(model: BuildingModel, config: SvgRenderConfig): string {
  const elements: string[] = [];
  for (const eq of model.equipment) {
    elements.push(renderEquipmentItem(eq, config));
  }
  return svgGroup('equipment', elements);
}

function renderEquipmentItem(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  switch (eq.type) {
    case 'kitchen_counter': return renderKitchen(eq, config);
    case 'unit_bath':       return renderUnitBath(eq, config);
    case 'toilet':          return renderToilet(eq, config);
    case 'washbasin':       return renderWashbasin(eq, config);
    case 'washing_machine': return renderWashingMachine(eq, config);
    case 'refrigerator':    return renderRefrigerator(eq, config);
  }
}

// ─── Helper: rectangle in mm → SVG rect ───

function svgRect(
  mmX: number, mmY: number, mmW: number, mmH: number,
  config: SvgRenderConfig,
  opts?: { fill?: string; rx?: number },
): string {
  const p = mmToSvg(mmX, mmY + mmH, config); // mmToSvg flips Y; top-left in SVG = (x, y+h) in mm
  const w = mmToSvgLength(mmW, config);
  const h = mmToSvgLength(mmH, config);
  const fill = opts?.fill ?? FILL_NONE;
  const rx = opts?.rx ? ` rx="${mmToSvgLength(opts.rx, config).toFixed(2)}"` : '';
  return `<rect x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"${rx}/>`;
}

function svgEllipse(
  mmCx: number, mmCy: number, mmRx: number, mmRy: number,
  config: SvgRenderConfig,
  opts?: { fill?: string },
): string {
  const c = mmToSvg(mmCx, mmCy, config);
  const rx = mmToSvgLength(mmRx, config);
  const ry = mmToSvgLength(mmRy, config);
  const fill = opts?.fill ?? FILL_NONE;
  return `<ellipse cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>`;
}

function svgLine(
  mmX1: number, mmY1: number, mmX2: number, mmY2: number,
  config: SvgRenderConfig,
): string {
  const p1 = mmToSvg(mmX1, mmY1, config);
  const p2 = mmToSvg(mmX2, mmY2, config);
  return `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>`;
}

// ─── Coordinate helpers ───
// Equipment coordinates: (eq.x, eq.y) is bottom-left, wall side determines layout direction

/** Get the "wall edge" position and the inward direction */
function getLayout(eq: ResolvedEquipment) {
  return { x: eq.x, y: eq.y, w: eq.w, h: eq.h, wall: eq.wallSide };
}

// ─── Kitchen counter: rect + sink ellipse + 2 burner squares ───

function renderKitchen(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h, wall } = getLayout(eq);
  const parts: string[] = [];

  // Outer counter rect
  parts.push(svgRect(x, y, w, h, config, { fill: FILL_LIGHT }));

  // Place sink and burners along the counter
  // Sink: ellipse at ~35% from left, burners: two small squares at ~70% from left
  // Adapt for wall orientation
  if (wall === 'south' || wall === 'north') {
    // Counter runs horizontally (x-axis)
    const sinkCx = x + w * 0.35;
    const sinkCy = y + h * 0.5;
    const sinkRx = Math.min(w * 0.1, 200);
    const sinkRy = Math.min(h * 0.3, 150);
    parts.push(svgEllipse(sinkCx, sinkCy, sinkRx, sinkRy, config));

    const burnerSize = Math.min(h * 0.35, 150);
    const burnerY = y + (h - burnerSize) / 2;
    const b1x = x + w * 0.65;
    const b2x = x + w * 0.78;
    parts.push(svgRect(b1x, burnerY, burnerSize, burnerSize, config));
    parts.push(svgRect(b2x, burnerY, burnerSize, burnerSize, config));
  } else {
    // Counter runs vertically (y-axis)
    const sinkCx = x + w * 0.5;
    const sinkCy = y + h * 0.35;
    const sinkRx = Math.min(w * 0.3, 150);
    const sinkRy = Math.min(h * 0.1, 200);
    parts.push(svgEllipse(sinkCx, sinkCy, sinkRx, sinkRy, config));

    const burnerSize = Math.min(w * 0.35, 150);
    const burnerX = x + (w - burnerSize) / 2;
    const b1y = y + h * 0.65;
    const b2y = y + h * 0.78;
    parts.push(svgRect(burnerX, b1y, burnerSize, burnerSize, config));
    parts.push(svgRect(burnerX, b2y, burnerSize, burnerSize, config));
  }

  return `<g class="equipment equipment-kitchen_counter" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}

// ─── Unit bath: outer rect + inner bathtub (rounded) + wash area ───

function renderUnitBath(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h, wall } = getLayout(eq);
  const parts: string[] = [];

  // Outer frame
  parts.push(svgRect(x, y, w, h, config, { fill: FILL_LIGHT }));

  // Bathtub occupies ~55% of depth from wall side, full width minus margins
  const margin = Math.min(w, h) * 0.05;
  if (wall === 'south' || wall === 'north') {
    const tubH = h * 0.5;
    const tubY = wall === 'south' ? y : y + h - tubH;
    parts.push(svgRect(x + margin, tubY + (wall === 'south' ? margin : -margin), w - margin * 2, tubH - margin, config, { rx: 60 }));
  } else {
    const tubW = w * 0.5;
    const tubX = wall === 'west' ? x : x + w - tubW;
    parts.push(svgRect(tubX + (wall === 'west' ? margin : -margin), y + margin, tubW - margin, h - margin * 2, config, { rx: 60 }));
  }

  return `<g class="equipment equipment-unit_bath" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}

// ─── Toilet: tank rect + bowl ellipse ───

function renderToilet(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h, wall } = getLayout(eq);
  const parts: string[] = [];

  // Tank is against the wall (~25% of depth), bowl is the rest
  if (wall === 'south' || wall === 'north') {
    const tankH = h * 0.25;
    const tankY = wall === 'south' ? y : y + h - tankH;
    const bowlCy = wall === 'south' ? y + tankH + (h - tankH) / 2 : y + (h - tankH) / 2;
    parts.push(svgRect(x, tankY, w, tankH, config, { fill: FILL_LIGHT }));
    parts.push(svgEllipse(x + w / 2, bowlCy, w * 0.42, (h - tankH) * 0.42, config));
  } else {
    const tankW = w * 0.25;
    const tankX = wall === 'west' ? x : x + w - tankW;
    const bowlCx = wall === 'west' ? x + tankW + (w - tankW) / 2 : x + (w - tankW) / 2;
    parts.push(svgRect(tankX, y, tankW, h, config, { fill: FILL_LIGHT }));
    parts.push(svgEllipse(bowlCx, y + h / 2, (w - tankW) * 0.42, h * 0.42, config));
  }

  return `<g class="equipment equipment-toilet" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}

// ─── Washbasin: counter rect + bowl ellipse ───

function renderWashbasin(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h, wall } = getLayout(eq);
  const parts: string[] = [];

  // Counter
  parts.push(svgRect(x, y, w, h, config, { fill: FILL_LIGHT }));

  // Bowl ellipse centered
  if (wall === 'south' || wall === 'north') {
    parts.push(svgEllipse(x + w / 2, y + h / 2, Math.min(w * 0.3, 180), Math.min(h * 0.35, 130), config));
  } else {
    parts.push(svgEllipse(x + w / 2, y + h / 2, Math.min(w * 0.35, 130), Math.min(h * 0.3, 180), config));
  }

  return `<g class="equipment equipment-washbasin" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}

// ─── Washing machine: rect pan + drum circle ───

function renderWashingMachine(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h } = getLayout(eq);
  const parts: string[] = [];

  // Pan (outer rect)
  parts.push(svgRect(x, y, w, h, config, { fill: FILL_LIGHT }));

  // Drum circle
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.35;
  parts.push(svgEllipse(cx, cy, r, r, config));

  return `<g class="equipment equipment-washing_machine" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}

// ─── Refrigerator: rect + X mark ───

function renderRefrigerator(eq: ResolvedEquipment, config: SvgRenderConfig): string {
  const { x, y, w, h } = getLayout(eq);
  const parts: string[] = [];

  // Outer rect
  parts.push(svgRect(x, y, w, h, config, { fill: FILL_LIGHT }));

  // X mark for identification
  const m = Math.min(w, h) * 0.1; // margin
  parts.push(svgLine(x + m, y + m, x + w - m, y + h - m, config));
  parts.push(svgLine(x + w - m, y + m, x + m, y + h - m, config));

  return `<g class="equipment equipment-refrigerator" data-id="${escapeXml(eq.id)}">\n${parts.join('\n')}\n</g>`;
}
