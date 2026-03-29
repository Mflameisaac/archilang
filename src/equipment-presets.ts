import { EquipmentType } from './types.js';

export interface EquipmentPreset {
  type: EquipmentType;
  defaultSize: { w: number; h: number }; // mm — w: along-wall dimension, h: depth from wall
  label: string;
  // 'along': long side runs along the wall; 'perpendicular': long side runs away from wall
  orientation: 'along' | 'perpendicular';
}

export const EQUIPMENT_PRESETS: Record<EquipmentType, EquipmentPreset> = {
  kitchen_counter: { type: 'kitchen_counter', defaultSize: { w: 2550, h: 650 },  label: 'キッチン', orientation: 'along' },
  unit_bath:       { type: 'unit_bath',       defaultSize: { w: 1600, h: 1600 }, label: 'UB',       orientation: 'along' },
  toilet:          { type: 'toilet',          defaultSize: { w: 450,  h: 700 },  label: '便器',     orientation: 'perpendicular' },
  washbasin:       { type: 'washbasin',       defaultSize: { w: 750,  h: 550 },  label: '洗面',     orientation: 'along' },
  washing_machine: { type: 'washing_machine', defaultSize: { w: 640,  h: 640 },  label: '洗濯機',   orientation: 'along' },
  refrigerator:    { type: 'refrigerator',    defaultSize: { w: 685,  h: 650 },  label: '冷蔵庫',   orientation: 'perpendicular' },
};

export const VALID_EQUIPMENT_TYPES = Object.keys(EQUIPMENT_PRESETS) as EquipmentType[];
