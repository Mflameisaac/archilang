import { BuildingModel, ResolvedSubRoom } from './types.js';

export interface AreaRow {
  roomId: string;
  type: string;
  parentRoomId?: string;
  areaMm2: number;
  areaM2: number;
  tatami: number;
}

export interface AreaSummary {
  rows: AreaRow[];
  totalFloorAreaMm2: number;
  totalFloorAreaM2: number;
  moduleSize: number;
}

export function computeAreaSummary(model: BuildingModel): AreaSummary {
  const tatamiUnit = 2 * model.moduleSize * model.moduleSize;
  const rows: AreaRow[] = [];

  const subRoomsByParent = new Map<string, ResolvedSubRoom[]>();
  for (const sr of model.subRooms ?? []) {
    const list = subRoomsByParent.get(sr.parentRoomId) || [];
    list.push(sr);
    subRoomsByParent.set(sr.parentRoomId, list);
  }

  let totalFloorAreaMm2 = 0;

  for (const room of model.rooms) {
    const areaMm2 = room.rects.reduce((sum, r) => sum + r.w * r.h, 0);
    rows.push({
      roomId: room.id,
      type: room.type,
      areaMm2,
      areaM2: areaMm2 / 1_000_000,
      tatami: areaMm2 / tatamiUnit,
    });
    totalFloorAreaMm2 += areaMm2;

    const subs = subRoomsByParent.get(room.id);
    if (subs) {
      for (const sr of subs) {
        rows.push({
          roomId: sr.id,
          type: sr.type,
          parentRoomId: sr.parentRoomId,
          areaMm2: sr.areaMm2,
          areaM2: sr.areaMm2 / 1_000_000,
          tatami: sr.areaMm2 / tatamiUnit,
        });
      }
    }
  }

  return {
    rows,
    totalFloorAreaMm2,
    totalFloorAreaM2: totalFloorAreaMm2 / 1_000_000,
    moduleSize: model.moduleSize,
  };
}

export function areaSummaryToJson(summary: AreaSummary): object {
  return {
    rooms: summary.rows.map(r => ({
      id: r.roomId,
      type: r.type,
      ...(r.parentRoomId ? { parent: r.parentRoomId } : {}),
      area_m2: round2(r.areaM2),
      tatami: round1(r.tatami),
    })),
    summary: {
      total_floor_area_m2: round2(summary.totalFloorAreaM2),
      building_area_m2: round2(summary.totalFloorAreaM2),
    },
  };
}

function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
