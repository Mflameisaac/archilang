import { BuildingModel } from '../types.js';
import { SvgRenderConfig, mmToSvg, svgGroup } from '../svg-utils.js';

export function renderGrid(model: BuildingModel, config: SvgRenderConfig): string {
  const elements: string[] = [];
  const mod = model.moduleSize;
  const totalW = model.totalGridX * mod;
  const totalH = model.totalGridY * mod;

  // Vertical grid lines
  for (let i = 0; i <= model.totalGridX; i++) {
    const x = i * mod;
    const p1 = mmToSvg(x, 0, config);
    const p2 = mmToSvg(x, totalH, config);
    elements.push(
      `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="#ddd" stroke-width="0.3" stroke-dasharray="4,4"/>`
    );
  }

  // Horizontal grid lines
  for (let j = 0; j <= model.totalGridY; j++) {
    const y = j * mod;
    const p1 = mmToSvg(0, y, config);
    const p2 = mmToSvg(totalW, y, config);
    elements.push(
      `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="#ddd" stroke-width="0.3" stroke-dasharray="4,4"/>`
    );
  }

  return svgGroup('grid', elements, { opacity: '0.6' });
}
