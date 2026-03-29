import { BuildingModel, Rect } from '../types.js';
import { SvgRenderConfig, mmToSvg, svgGroup, escapeXml } from '../svg-utils.js';

function renderLabelAt(
  name: string,
  areaMm2: number,
  rect: Rect,
  moduleSize: number,
  elements: string[],
  config: SvgRenderConfig,
): void {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const center = mmToSvg(cx, cy, config);

  const areaM2 = areaMm2 / 1_000_000;
  // Tatami: 1 tatami ≈ 2 grid cells = 2 * moduleSize²
  const tatamiUnit = 2 * moduleSize * moduleSize;
  const tatami = (areaMm2 / tatamiUnit).toFixed(1);

  // Room name
  elements.push(
    `<text x="${center.x.toFixed(2)}" y="${(center.y - 8).toFixed(2)}" ` +
    `text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="bold" fill="#222">${escapeXml(name)}</text>`
  );

  // Area display
  elements.push(
    `<text x="${center.x.toFixed(2)}" y="${(center.y + 10).toFixed(2)}" ` +
    `text-anchor="middle" font-size="10" font-family="sans-serif" fill="#666">${areaM2.toFixed(1)}m²</text>`
  );

  // Tatami count
  elements.push(
    `<text x="${center.x.toFixed(2)}" y="${(center.y + 23).toFixed(2)}" ` +
    `text-anchor="middle" font-size="9" font-family="sans-serif" fill="#999">(${tatami}畳)</text>`
  );
}

export function renderLabels(model: BuildingModel, config: SvgRenderConfig): string {
  const elements: string[] = [];

  // Collect parent room IDs that have sub_rooms
  const subRooms = model.subRooms ?? [];
  const roomsWithSubRooms = new Set(subRooms.map(s => s.parentRoomId));

  for (const room of model.rooms) {
    if (roomsWithSubRooms.has(room.id)) {
      // Render sub_room labels instead of parent label
      const subs = subRooms.filter(s => s.parentRoomId === room.id);
      for (const sub of subs) {
        renderLabelAt(sub.type, sub.areaMm2, sub.rect, model.moduleSize, elements, config);
      }
    } else {
      // Standard room label — sum area of all component rects (non-overlapping guaranteed by parser)
      const areaMm2 = room.rects.reduce((sum, r) => sum + r.w * r.h, 0);
      // Place label at center of largest rect (avoids concave region for L-shapes)
      const largestRect = room.rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
      renderLabelAt(room.type, areaMm2, largestRect, model.moduleSize, elements, config);
    }
  }

  return svgGroup('labels', elements);
}
