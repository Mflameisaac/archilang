// SVG building utilities

export interface SvgRenderConfig {
  scale: number;        // mm to px (e.g., 0.1 for 1/100 scale → 1mm=0.1px, but we use larger for screen)
  margin: number;       // px margin around drawing
  flipY: boolean;       // architectural = bottom-left origin, SVG = top-left
  totalHeight: number;  // total building height in mm (for Y flip)
}

export const DEFAULT_CONFIG: SvgRenderConfig = {
  scale: 0.12,       // ~1:83 at screen resolution, good for viewing
  margin: 80,
  flipY: true,
  totalHeight: 0,    // set dynamically
};

export function mmToSvg(mmX: number, mmY: number, config: SvgRenderConfig): { x: number; y: number } {
  const x = mmX * config.scale + config.margin;
  const y = config.flipY
    ? (config.totalHeight - mmY) * config.scale + config.margin
    : mmY * config.scale + config.margin;
  return { x, y };
}

export function mmToSvgLength(mm: number, config: SvgRenderConfig): number {
  return mm * config.scale;
}

export function svgElement(tag: string, attrs: Record<string, string | number>, content?: string): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  if (content !== undefined) {
    return `<${tag} ${attrStr}>${content}</${tag}>`;
  }
  return `<${tag} ${attrStr}/>`;
}

export function svgGroup(id: string, children: string[], attrs?: Record<string, string | number>): string {
  const extra = attrs ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') : '';
  return `<g id="${id}"${extra}>\n${children.join('\n')}\n</g>`;
}

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
