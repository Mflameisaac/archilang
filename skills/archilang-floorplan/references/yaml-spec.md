# ARCHILANG YAML仕様リファレンス

## 基本テンプレート

```yaml
archilang: "0.2"

site:
  orientation: south    # north / south / east / west

building:
  structure: 木造軸組
  module: shaku         # 910mm
  stories: 1
  defaults:
    ceiling_height: 2400mm
    external_wall:
      thickness: 130mm
    internal_wall:
      partition: 90mm

rendering:
  grid_lines:
    enabled: true       # 通り芯表示
  area_table:
    enabled: true       # 面積表表示

geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [3, 5]   # X方向スパン（モジュール単位）
      y_spans: [4, 3]   # Y方向スパン（モジュール単位）

  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rect: { x: 3, y: 0, w: 5, h: 7 }

  walls:
    mode: additive
    segments: []

  openings:
    - id: W1
      type: AW
      style: 引違い窓
      room: ldk
      wall: south
      position: center
      size: { w: 2530, h: 2000 }
      sill: 0

  equipment:
    - id: K1
      type: kitchen_counter
      room: ldk
      wall: south
      position: { offset: 0 }
```

## グリッド座標系

- 原点: 左下
- Y軸: 上向き（建築慣習）
- 1モジュール = 910mm
- grid_rect の x,y はグリッド座標、w,h はモジュール数

## 部屋定義

### 単一矩形
```yaml
- id: bedroom
  floor: 1F
  type: 寝室
  grid_rect: { x: 0, y: 3, w: 3, h: 4 }
```

### 複数矩形（L字型等）
```yaml
- id: ldk
  floor: 1F
  type: LDK
  grid_rects:
    - { x: 0, y: 0, w: 7, h: 4 }
    - { x: 3, y: 4, w: 4, h: 3 }
```

### サブルーム
```yaml
- id: bath
  floor: 1F
  type: 浴室・洗面
  grid_rect: { x: 4, y: 4, w: 4, h: 3 }
  sub_rooms:
    - id: bath_tub
      type: 浴室
      seed: { x: 5, y: 5 }
    - id: wash
      type: 洗面
      seed: { x: 7, y: 5 }
```

## 開口部

### 壁指定型（窓）
```yaml
- id: W1
  type: AW           # AW=アルミ窓
  style: 引違い窓
  room: ldk
  wall: south
  position: center    # or { offset: 500 }
  size: { w: 2530, h: 2000 }
  sill: 0
```

### 接続型（ドア）
```yaml
- id: D1
  type: WD            # WD=木製ドア, AD=アルミドア
  style: 片開き       # or 引き戸
  connects: [bedroom, ldk]
  size: { w: 800, h: 2000 }
```

### スタイル
| スタイル | 用途 |
|---------|------|
| 引違い窓 | 窓（青い平行線） |
| 片開き | 開き戸（ヒンジ+弧） |
| 引き戸 | スライドドア（パネル+レール） |

## 明示壁

```yaml
walls:
  mode: additive      # additive（デフォルト）or explicit_only
  segments:
    - id: w_partition
      floor: 1F
      from: { grid: { x: 3, y: 0 } }
      to: { grid: { x: 3, y: 4 } }
      thickness: 90mm
      type: internal
```

端点指定方式:
- mm直接: `{ x: 2730, y: 0 }`
- グリッド: `{ grid: { x: 3, y: 0 } }`
- グリッド+オフセット: `{ grid: { x: 3, y: 0 }, dx: 150, dy: 0 }`

## 設備プリセット

| type | 表示名 | デフォルトサイズ w×h |
|------|--------|-------------------|
| kitchen_counter | キッチン | 2550×650 |
| unit_bath | UB | 1600×1600 |
| toilet | 便器 | 450×700 |
| washbasin | 洗面 | 750×550 |
| washing_machine | 洗濯機 | 640×640 |
| refrigerator | 冷蔵庫 | 685×650 |

w = 壁に沿った方向、h = 壁からの奥行き。
`size` でオーバーライド可能。

## 3LDK完全サンプル

```yaml
archilang: "0.2"
site:
  orientation: south
building:
  structure: 木造軸組
  module: shaku
  stories: 1
  defaults:
    ceiling_height: 2400mm
    external_wall:
      thickness: 130mm
    internal_wall:
      partition: 90mm
rendering:
  area_table:
    enabled: true
geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [3, 5]
      y_spans: [3, 4]
  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rect: { x: 3, y: 0, w: 5, h: 7 }
    - id: bedroom
      floor: 1F
      type: 寝室
      grid_rect: { x: 0, y: 3, w: 3, h: 4 }
    - id: bath_area
      floor: 1F
      type: 浴室・洗面
      grid_rect: { x: 0, y: 0, w: 3, h: 3 }
  openings:
    - id: W_ldk_s
      type: AW
      style: 引違い窓
      room: ldk
      wall: south
      position: center
      size: { w: 3640, h: 2000 }
      sill: 0
    - id: W_bed_n
      type: AW
      style: 引違い窓
      room: bedroom
      wall: north
      position: center
      size: { w: 1690, h: 1100 }
      sill: 800
    - id: ED_ldk_e
      type: AD
      style: 片開き
      room: ldk
      wall: east
      position: { offset: 200 }
      size: { w: 900, h: 2000 }
    - id: D_bed_ldk
      type: WD
      style: 片開き
      connects: [bedroom, ldk]
      size: { w: 800, h: 2000 }
    - id: D_bath_ldk
      type: WD
      style: 引き戸
      connects: [bath_area, ldk]
      size: { w: 800, h: 2000 }
  equipment:
    - id: UB1
      type: unit_bath
      room: bath_area
      wall: west
      position: { offset: 0 }
    - id: WB1
      type: washbasin
      room: bath_area
      wall: east
      position: { offset: 0 }
```
