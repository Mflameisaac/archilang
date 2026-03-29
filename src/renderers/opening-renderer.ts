import { BuildingModel, ResolvedOpening } from '../types.js';
import { SvgRenderConfig, mmToSvg, mmToSvgLength, svgGroup, escapeXml } from '../svg-utils.js';

export function renderOpenings(model: BuildingModel, config: SvgRenderConfig): string {
  const elements: string[] = [];

  for (const opening of model.openings) {
    if (opening.style === '引違い窓') {
      elements.push(renderSlidingWindow(opening, config));
    } else if (opening.style === '片開き') {
      elements.push(renderSwingDoor(opening, model, config));
    } else if (opening.style === '引き戸') {
      elements.push(renderSlidingDoor(opening, config));
    }
  }

  return svgGroup('openings', elements);
}

function renderSlidingWindow(o: ResolvedOpening, config: SvgRenderConfig): string {
  // Sliding window: two parallel glass lines slightly offset
  const halfW = o.w / 2;
  const glassOffset = 15; // mm offset between two glass panes

  if (o.orientation === 'horizontal') {
    // Window on horizontal wall (north/south)
    const leftX = o.cx - halfW;
    const rightX = o.cx + halfW;
    const y = o.cy;

    const p1l = mmToSvg(leftX, y - glassOffset, config);
    const p1r = mmToSvg(rightX - halfW * 0.3, y - glassOffset, config);
    const p2l = mmToSvg(leftX + halfW * 0.3, y + glassOffset, config);
    const p2r = mmToSvg(rightX, y + glassOffset, config);

    return `<g class="opening window" data-id="${escapeXml(o.id)}">
  <line x1="${p1l.x.toFixed(2)}" y1="${p1l.y.toFixed(2)}" x2="${p1r.x.toFixed(2)}" y2="${p1r.y.toFixed(2)}" stroke="#2196F3" stroke-width="2"/>
  <line x1="${p2l.x.toFixed(2)}" y1="${p2l.y.toFixed(2)}" x2="${p2r.x.toFixed(2)}" y2="${p2r.y.toFixed(2)}" stroke="#2196F3" stroke-width="2"/>
</g>`;
  } else {
    // Window on vertical wall (east/west)
    const bottomY = o.cy - halfW;
    const topY = o.cy + halfW;
    const x = o.cx;

    const p1b = mmToSvg(x - glassOffset, bottomY, config);
    const p1t = mmToSvg(x - glassOffset, topY - halfW * 0.3, config);
    const p2b = mmToSvg(x + glassOffset, bottomY + halfW * 0.3, config);
    const p2t = mmToSvg(x + glassOffset, topY, config);

    return `<g class="opening window" data-id="${escapeXml(o.id)}">
  <line x1="${p1b.x.toFixed(2)}" y1="${p1b.y.toFixed(2)}" x2="${p1t.x.toFixed(2)}" y2="${p1t.y.toFixed(2)}" stroke="#2196F3" stroke-width="2"/>
  <line x1="${p2b.x.toFixed(2)}" y1="${p2b.y.toFixed(2)}" x2="${p2t.x.toFixed(2)}" y2="${p2t.y.toFixed(2)}" stroke="#2196F3" stroke-width="2"/>
</g>`;
  }
}

/**
 * Sliding door (引き戸): two parallel lines representing the door panel and track.
 * Architectural convention: a single solid line (panel) offset from a thinner line (track/rail).
 */
function renderSlidingDoor(o: ResolvedOpening, config: SvgRenderConfig): string {
  const halfW = o.w / 2;
  const panelOffset = 20; // mm offset between panel and rail

  if (o.orientation === 'horizontal') {
    const leftX = o.cx - halfW;
    const rightX = o.cx + halfW;
    const y = o.cy;

    // Panel line (full width, thicker)
    const pl = mmToSvg(leftX, y - panelOffset, config);
    const pr = mmToSvg(rightX, y - panelOffset, config);
    // Rail/track line (full width, thinner)
    const rl = mmToSvg(leftX, y + panelOffset, config);
    const rr = mmToSvg(rightX, y + panelOffset, config);

    return `<g class="opening sliding-door" data-id="${escapeXml(o.id)}">
  <line x1="${pl.x.toFixed(2)}" y1="${pl.y.toFixed(2)}" x2="${pr.x.toFixed(2)}" y2="${pr.y.toFixed(2)}" stroke="#333" stroke-width="2"/>
  <line x1="${rl.x.toFixed(2)}" y1="${rl.y.toFixed(2)}" x2="${rr.x.toFixed(2)}" y2="${rr.y.toFixed(2)}" stroke="#333" stroke-width="1" stroke-dasharray="4,2"/>
</g>`;
  } else {
    const bottomY = o.cy - halfW;
    const topY = o.cy + halfW;
    const x = o.cx;

    const pb = mmToSvg(x - panelOffset, bottomY, config);
    const pt = mmToSvg(x - panelOffset, topY, config);
    const rb = mmToSvg(x + panelOffset, bottomY, config);
    const rt = mmToSvg(x + panelOffset, topY, config);

    return `<g class="opening sliding-door" data-id="${escapeXml(o.id)}">
  <line x1="${pb.x.toFixed(2)}" y1="${pb.y.toFixed(2)}" x2="${pt.x.toFixed(2)}" y2="${pt.y.toFixed(2)}" stroke="#333" stroke-width="2"/>
  <line x1="${rb.x.toFixed(2)}" y1="${rb.y.toFixed(2)}" x2="${rt.x.toFixed(2)}" y2="${rt.y.toFixed(2)}" stroke="#333" stroke-width="1" stroke-dasharray="4,2"/>
</g>`;
  }
}

function renderSwingDoor(o: ResolvedOpening, model: BuildingModel, config: SvgRenderConfig): string {
  const doorWidth = o.w;

  if (o.orientation === 'horizontal') {
    // Door on horizontal wall
    const hingeX = o.cx - doorWidth / 2;
    const hingeY = o.cy;

    // Swing direction based on wall side: swing inward (toward room interior)
    // south wall → swing +Y (into room), north wall → swing -Y (into room)
    // Fallback to isExternal heuristic if wallSide unavailable
    const swingDir = o.wallSide === 'north' ? -1
      : o.wallSide === 'south' ? 1
      : o.isExternal ? -1 : 1;

    const hinge = mmToSvg(hingeX, hingeY, config);
    const doorEnd = mmToSvg(hingeX, hingeY + doorWidth * swingDir, config);
    const arcEnd = mmToSvg(hingeX + doorWidth, hingeY, config);
    const radius = mmToSvgLength(doorWidth, config);

    // Draw: door line + arc
    const sweepFlag = swingDir > 0 ? 1 : 0;
    return `<g class="opening door" data-id="${escapeXml(o.id)}">
  <line x1="${hinge.x.toFixed(2)}" y1="${hinge.y.toFixed(2)}" x2="${doorEnd.x.toFixed(2)}" y2="${doorEnd.y.toFixed(2)}" stroke="#333" stroke-width="1.5"/>
  <path d="M ${doorEnd.x.toFixed(2)} ${doorEnd.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 ${sweepFlag} ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}" fill="none" stroke="#333" stroke-width="0.8" stroke-dasharray="3,2"/>
</g>`;
  } else {
    // Door on vertical wall
    const hingeX = o.cx;
    const hingeY = o.cy - doorWidth / 2;

    // west wall → swing +X (into room), east wall → swing -X (into room)
    const swingDir = o.wallSide === 'east' ? -1
      : o.wallSide === 'west' ? 1
      : o.isExternal ? -1 : 1;

    const hinge = mmToSvg(hingeX, hingeY, config);
    const doorEnd = mmToSvg(hingeX + doorWidth * swingDir, hingeY, config);
    const arcEnd = mmToSvg(hingeX, hingeY + doorWidth, config);
    const radius = mmToSvgLength(doorWidth, config);

    const sweepFlag = swingDir > 0 ? 0 : 1;
    return `<g class="opening door" data-id="${escapeXml(o.id)}">
  <line x1="${hinge.x.toFixed(2)}" y1="${hinge.y.toFixed(2)}" x2="${doorEnd.x.toFixed(2)}" y2="${doorEnd.y.toFixed(2)}" stroke="#333" stroke-width="1.5"/>
  <path d="M ${doorEnd.x.toFixed(2)} ${doorEnd.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 ${sweepFlag} ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}" fill="none" stroke="#333" stroke-width="0.8" stroke-dasharray="3,2"/>
</g>`;
  }
}
