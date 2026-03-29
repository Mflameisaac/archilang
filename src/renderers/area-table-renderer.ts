import { BuildingModel } from '../types.js';
import { SvgRenderConfig, mmToSvgLength, escapeXml } from '../svg-utils.js';
import { computeAreaSummary, AreaRow } from '../area-table.js';

// Table layout constants (SVG px)
const COL_NAME = 150;
const COL_AREA = 85;
const COL_TATAMI = 75;
const TABLE_W = COL_NAME + COL_AREA + COL_TATAMI;
const ROW_H = 26;
const HEADER_H = 32;
const PAD_X = 8;
const FONT_SIZE = 13;
const HEADER_FONT_SIZE = 15;
const GAP = 30; // gap between drawing and table

export interface AreaTableResult {
  svg: string;
  width: number;
  height: number;  // total table height in SVG px (from top of table)
}

export function renderAreaTable(model: BuildingModel, config: SvgRenderConfig): AreaTableResult {
  const summary = computeAreaSummary(model);
  const elements: string[] = [];

  // Position: right of drawing
  const drawingW = mmToSvgLength(model.totalGridX * model.moduleSize, config);
  const tx = config.margin + drawingW + config.margin * 2 + GAP;
  const ty = config.margin;

  let y = ty;

  // Title row
  elements.push(rect(tx, y, TABLE_W, HEADER_H, '#f0f0f0', '#999'));
  elements.push(text(tx + TABLE_W / 2, y + HEADER_H / 2 + 5, '面積表', HEADER_FONT_SIZE, 'middle', 'bold', '#222'));
  y += HEADER_H;

  // Column headers
  elements.push(rect(tx, y, COL_NAME, ROW_H, '#f8f8f8', '#ccc'));
  elements.push(rect(tx + COL_NAME, y, COL_AREA, ROW_H, '#f8f8f8', '#ccc'));
  elements.push(rect(tx + COL_NAME + COL_AREA, y, COL_TATAMI, ROW_H, '#f8f8f8', '#ccc'));
  elements.push(text(tx + PAD_X, y + ROW_H / 2 + 5, '部屋', FONT_SIZE, 'start', 'bold', '#444'));
  elements.push(text(tx + COL_NAME + COL_AREA - PAD_X, y + ROW_H / 2 + 5, 'm²', FONT_SIZE, 'end', 'bold', '#444'));
  elements.push(text(tx + COL_NAME + COL_AREA + COL_TATAMI - PAD_X, y + ROW_H / 2 + 5, '畳', FONT_SIZE, 'end', 'bold', '#444'));
  y += ROW_H;

  // Data rows
  for (const row of summary.rows) {
    const isChild = !!row.parentRoomId;
    const bg = isChild ? '#fafafa' : '#fff';
    const namePrefix = isChild ? '  ' : '';
    const nameColor = isChild ? '#666' : '#333';

    elements.push(rect(tx, y, COL_NAME, ROW_H, bg, '#ddd'));
    elements.push(rect(tx + COL_NAME, y, COL_AREA, ROW_H, bg, '#ddd'));
    elements.push(rect(tx + COL_NAME + COL_AREA, y, COL_TATAMI, ROW_H, bg, '#ddd'));

    elements.push(text(tx + PAD_X, y + ROW_H / 2 + 5, escapeXml(namePrefix + row.type), FONT_SIZE, 'start', 'normal', nameColor));
    elements.push(text(tx + COL_NAME + COL_AREA - PAD_X, y + ROW_H / 2 + 5, row.areaM2.toFixed(1), FONT_SIZE, 'end', 'normal', '#333'));
    elements.push(text(tx + COL_NAME + COL_AREA + COL_TATAMI - PAD_X, y + ROW_H / 2 + 5, row.tatami.toFixed(1), FONT_SIZE, 'end', 'normal', '#333'));
    y += ROW_H;
  }

  // Summary row (total floor area)
  elements.push(rect(tx, y, COL_NAME, ROW_H, '#e8e8e8', '#999'));
  elements.push(rect(tx + COL_NAME, y, COL_AREA, ROW_H, '#e8e8e8', '#999'));
  elements.push(rect(tx + COL_NAME + COL_AREA, y, COL_TATAMI, ROW_H, '#e8e8e8', '#999'));
  elements.push(text(tx + PAD_X, y + ROW_H / 2 + 5, '延床面積', FONT_SIZE, 'start', 'bold', '#222'));
  elements.push(text(tx + COL_NAME + COL_AREA - PAD_X, y + ROW_H / 2 + 5, summary.totalFloorAreaM2.toFixed(1), FONT_SIZE, 'end', 'bold', '#222'));

  const totalTatami = summary.totalFloorAreaMm2 / (2 * model.moduleSize * model.moduleSize);
  elements.push(text(tx + COL_NAME + COL_AREA + COL_TATAMI - PAD_X, y + ROW_H / 2 + 5, totalTatami.toFixed(1), FONT_SIZE, 'end', 'bold', '#222'));

  const tableBottom = y + ROW_H; // bottom of summary row
  return {
    svg: `<g id="area-table">\n${elements.join('\n')}\n</g>`,
    width: TABLE_W + GAP,
    height: tableBottom - ty,
  };
}

function rect(x: number, y: number, w: number, h: number, fill: string, stroke: string): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>`;
}

function text(
  x: number, y: number, content: string,
  fontSize: number, anchor: string, weight: string, fill: string,
): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${fontSize}" font-family="sans-serif" font-weight="${weight}" fill="${fill}">${content}</text>`;
}
