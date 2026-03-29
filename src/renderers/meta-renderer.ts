import { BuildingModel } from '../types.js';
import { SvgRenderConfig, mmToSvg, mmToSvgLength, svgGroup } from '../svg-utils.js';

export function renderMeta(model: BuildingModel, config: SvgRenderConfig): string {
  const elements: string[] = [];

  // Compass rose
  elements.push(renderCompass(model, config));

  // Scale bar
  elements.push(renderScaleBar(model, config));

  return svgGroup('meta', elements);
}

function renderCompass(model: BuildingModel, config: SvgRenderConfig): string {
  const totalW = model.totalGridX * model.moduleSize;
  const totalH = model.totalGridY * model.moduleSize;

  // Position: top-right of drawing
  const pos = mmToSvg(totalW + 600, totalH - 200, config);
  const r = 20; // radius in px

  // Map orientation to compass rotation angle (degrees)
  // orientation indicates the direction the building faces (front door direction)
  // When orientation="south", north is up (0 degrees rotation)
  const orientationAngles: Record<string, number> = {
    north: 180,
    south: 0,
    east: 90,
    west: -90,
  };
  const northAngle = orientationAngles[model.orientation] ?? 0;

  const nx = pos.x;
  const ny = pos.y;

  return `<g id="compass" transform="translate(${nx.toFixed(2)}, ${ny.toFixed(2)}) rotate(${northAngle})">
  <circle cx="0" cy="0" r="${r}" fill="none" stroke="#999" stroke-width="0.5"/>
  <polygon points="0,${-r + 2} -5,5 0,-2 5,5" fill="#333" stroke="none"/>
  <polygon points="0,${r - 2} -5,-5 0,2 5,-5" fill="#ccc" stroke="#999" stroke-width="0.3"/>
  <text x="0" y="${-r - 5}" text-anchor="middle" font-size="10" font-family="sans-serif" font-weight="bold" fill="#333">N</text>
</g>`;
}

function renderScaleBar(model: BuildingModel, config: SvgRenderConfig): string {
  const totalW = model.totalGridX * model.moduleSize;

  // Position: bottom-right
  const basePos = mmToSvg(totalW + 200, -500, config);
  const barLengthMm = 1000; // 1m
  const barPx = mmToSvgLength(barLengthMm, config);

  const x = basePos.x;
  const y = basePos.y;

  return `<g id="scale-bar">
  <line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + barPx).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#333" stroke-width="1.5"/>
  <line x1="${x.toFixed(2)}" y1="${(y - 3).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y + 3).toFixed(2)}" stroke="#333" stroke-width="1"/>
  <line x1="${(x + barPx).toFixed(2)}" y1="${(y - 3).toFixed(2)}" x2="${(x + barPx).toFixed(2)}" y2="${(y + 3).toFixed(2)}" stroke="#333" stroke-width="1"/>
  <text x="${(x + barPx / 2).toFixed(2)}" y="${(y - 6).toFixed(2)}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#333">1m</text>
  <text x="${(x + barPx / 2).toFixed(2)}" y="${(y + 14).toFixed(2)}" text-anchor="middle" font-size="8" font-family="sans-serif" fill="#666">S=1:100</text>
</g>`;
}
