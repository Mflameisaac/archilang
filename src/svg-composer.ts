import { BuildingModel } from './types.js';
import { SvgRenderConfig, DEFAULT_CONFIG, mmToSvgLength } from './svg-utils.js';
import { renderGrid } from './renderers/grid-renderer.js';
import { renderGridLines, getGridLinePadding } from './renderers/gridline-renderer.js';
import { renderWalls } from './renderers/wall-renderer.js';
import { renderOpenings } from './renderers/opening-renderer.js';
import { renderLabels } from './renderers/label-renderer.js';
import { renderDimensions } from './renderers/dimension-renderer.js';
import { renderMeta } from './renderers/meta-renderer.js';
import { renderAreaTable } from './renderers/area-table-renderer.js';
import { renderEquipment } from './renderers/equipment-renderer.js';

export function composeSvg(model: BuildingModel): string {
  const config: SvgRenderConfig = {
    ...DEFAULT_CONFIG,
    totalHeight: model.totalGridY * model.moduleSize,
  };

  const totalW = model.totalGridX * model.moduleSize;
  const totalH = model.totalGridY * model.moduleSize;

  // Grid line labels may extend beyond the base margin on the left/top edges
  const gridLinePad = model.rendering?.grid_lines?.enabled
    ? getGridLinePadding(config)
    : 0;

  // Content bounding box (all rendered elements)
  const contentLeft = -gridLinePad;
  const contentTop = -gridLinePad;
  let contentRight = mmToSvgLength(totalW, config) + config.margin * 3;
  let contentBottom = mmToSvgLength(totalH, config) + config.margin * 3;

  const layers = [
    renderGrid(model, config),
    renderWalls(model, config),
    ...(model.equipment.length > 0 ? [renderEquipment(model, config)] : []),
    renderOpenings(model, config),
    renderLabels(model, config),
    renderDimensions(model, config),
    renderMeta(model, config),
    ...(model.rendering?.grid_lines?.enabled ? [renderGridLines(model, config)] : []),
  ];

  if (model.rendering?.area_table?.enabled) {
    const areaResult = renderAreaTable(model, config);
    layers.push(areaResult.svg);
    contentRight += areaResult.width;
    const tableBottom = config.margin + areaResult.height;
    contentBottom = Math.max(contentBottom, tableBottom);
  }

  // Uniform canvas padding around all content
  const canvasPad = 20;
  const vbX = contentLeft - canvasPad;
  const vbY = contentTop - canvasPad;
  const svgWidth = (contentRight - contentLeft) + canvasPad * 2;
  const svgHeight = (contentBottom - contentTop) + canvasPad * 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX.toFixed(0)} ${vbY.toFixed(0)} ${svgWidth.toFixed(0)} ${svgHeight.toFixed(0)}"
     width="${svgWidth.toFixed(0)}" height="${svgHeight.toFixed(0)}"
     style="background: white;">
  <style>
    text { user-select: none; }
  </style>
${layers.join('\n')}
</svg>`;
}
