# 設備配置機能 — 実装プラン

> ロードマップ Tier 2 #5「設備配置（キッチン/UB/トイレ）」の実装計画

## なぜ必要か

水回り設備のない間取りは「部屋割り図」であり「間取り」ではない（scaling-roadmap.md）。
設備シンボルがあることで:
- 設計レビュー時に動線・使い勝手を視覚的に評価できる
- 将来の給排水ルート検証・法規チェック（換気等）の基盤になる
- テンプレート/プリセット機能（Tier 2 #7）との相乗効果が高い

## スコープ

### Phase 1: 基本設備シンボル（今回実装）

以下の住宅標準設備を簡易シンボルとして描画する:

| カテゴリ | 設備ID | 表示名 | シンボル概要 | 標準サイズ (mm) |
|---------|--------|--------|-------------|----------------|
| キッチン | `kitchen_counter` | キッチン | I型カウンター + シンク○ + コンロ□□ | 2550×650 |
| 浴室 | `unit_bath` | ユニットバス | 浴槽矩形 + 洗い場 | 1600×1600 (1616) |
| トイレ | `toilet` | 便器 | 便器シンボル (上面図) | 450×700 |
| 洗面 | `washbasin` | 洗面台 | カウンター + ボウル○ | 750×550 |
| 洗濯機 | `washing_machine` | 洗濯機パン | 正方形 + 円 | 640×640 |
| 冷蔵庫 | `refrigerator` | 冷蔵庫 | 矩形 | 685×650 |

### Phase 2（将来）: 対象外

- 給排水配管ルート
- 電気設備（コンセント・スイッチ・照明）
- エアコン・換気設備
- 設備同士の干渉チェック
- PS（パイプスペース）自動配置

## YAML仕様設計

`geometry` 直下に `equipment` 配列を追加。既存の `rooms` / `openings` / `walls` と同階層。

```yaml
geometry:
  grids: ...
  rooms: ...
  openings: ...
  equipment:                          # ← NEW
    - id: K1
      type: kitchen_counter           # 設備種別（プリセットから選択）
      room: ldk                       # 配置先ルームID
      wall: south                     # 壁寄せ方向
      position: { offset: 500 }       # 壁からの横方向オフセット (mm) or "center"
      # size は type のデフォルトを使用。オーバーライドも可:
      # size: { w: 2700, h: 650 }

    - id: UB1
      type: unit_bath
      room: bath
      wall: north
      position: center

    - id: T1
      type: toilet
      room: toilet
      wall: north
      position: center

    - id: WB1
      type: washbasin
      room: senmen
      wall: east
      position: center

    - id: WM1
      type: washing_machine
      room: senmen
      wall: south
      position: { offset: 100 }
```

### 設計判断

1. **`wall` + `position` パターンを採用** — openings と同じ配置モデル。学習コストゼロ
2. **プリセット型 (`type`)** — 自由形状ではなくプリセットで制約。YAML簡潔さ優先
3. **`size` オプショナル** — type ごとのデフォルトサイズを持ち、必要時のみオーバーライド
4. **`rotation` は不要** — `wall` 方向で自動決定（キッチンは壁に沿って長辺配置、トイレは壁に向かって奥行き方向配置）。壁方向から90°/180°/270°を推論
5. **壁からの離隔距離** — 設備外面が壁内面に接する（gap: 0mm）をデフォルトとする。将来 `gap` パラメータ追加可能

## 型定義

```typescript
// === types.ts に追加 ===

export interface EquipmentSpec {
  id: string;
  type: EquipmentType;
  room: string;                      // 配置先 room ID
  wall: WallSide;                    // 壁寄せ方向
  position: 'center' | { offset: number };  // 横方向位置 (openingsと同じ)
  size?: { w: number; h: number };   // オーバーライド (mm)
}

export type EquipmentType =
  | 'kitchen_counter'
  | 'unit_bath'
  | 'toilet'
  | 'washbasin'
  | 'washing_machine'
  | 'refrigerator';

export interface ResolvedEquipment {
  id: string;
  type: EquipmentType;
  roomId: string;
  // 配置後の絶対座標 (mm)
  x: number;          // 左下 x
  y: number;          // 左下 y
  w: number;          // 幅
  h: number;          // 奥行き
  wallSide: WallSide; // どの壁に寄せたか（描画方向決定用）
}

// Geometry に追加
export interface Geometry {
  grids: Grids;
  rooms: RoomSpec[];
  openings: OpeningSpec[];
  walls?: WallsSpec;
  equipment?: EquipmentSpec[];       // ← NEW
}

// BuildingModel に追加
export interface BuildingModel {
  // ... existing fields ...
  equipment: ResolvedEquipment[];    // ← NEW
}
```

## 実装ステップ

### Step 1: 型定義 & プリセット定義
**ファイル:** `types.ts`, 新規 `equipment-presets.ts`

- `EquipmentSpec`, `EquipmentType`, `ResolvedEquipment` を `types.ts` に追加
- `Geometry.equipment` フィールド追加
- `BuildingModel.equipment` フィールド追加
- `equipment-presets.ts`: 各 type のデフォルトサイズ・シンボルメタデータを定義

```typescript
// equipment-presets.ts
export interface EquipmentPreset {
  type: EquipmentType;
  defaultSize: { w: number; h: number };  // mm
  label: string;                          // 日本語表示名
  // 壁方向に対する配置: 'along' = 壁に沿って長辺, 'perpendicular' = 壁に向かって奥行き
  orientation: 'along' | 'perpendicular';
}

export const EQUIPMENT_PRESETS: Record<EquipmentType, EquipmentPreset> = {
  kitchen_counter: { type: 'kitchen_counter', defaultSize: { w: 2550, h: 650 }, label: 'キッチン', orientation: 'along' },
  unit_bath:       { type: 'unit_bath',       defaultSize: { w: 1600, h: 1600 }, label: 'UB', orientation: 'along' },
  toilet:          { type: 'toilet',          defaultSize: { w: 450, h: 700 },   label: '便器', orientation: 'perpendicular' },
  washbasin:       { type: 'washbasin',       defaultSize: { w: 750, h: 550 },   label: '洗面', orientation: 'along' },
  washing_machine: { type: 'washing_machine', defaultSize: { w: 640, h: 640 },   label: '洗濯機', orientation: 'along' },
  refrigerator:    { type: 'refrigerator',    defaultSize: { w: 685, h: 650 },   label: '冷蔵庫', orientation: 'perpendicular' },
};
```

### Step 2: パーサー拡張
**ファイル:** `parser.ts`

- `geometry.equipment` の読み取りとバリデーション
- 必須フィールド: `id`, `type`, `room`, `wall`, `position`
- `type` が `EQUIPMENT_PRESETS` に存在するか検証
- 既存パース処理への影響なし（追加のみ）

### Step 3: リゾルバー拡張
**ファイル:** `resolver.ts`

- `resolveEquipment()` 関数を追加
- 処理フロー:
  1. `room` IDから `ResolvedRoom` を取得
  2. `wall` 方向から、部屋内面の壁座標を算出
  3. `position` (center / offset) で壁沿い方向の位置を決定
  4. プリセットの `orientation` に基づき w/h を回転（along: 長辺が壁沿い、perpendicular: 長辺が壁に垂直）
  5. `ResolvedEquipment` を生成（絶対mm座標）
- `BuildingModel.equipment` にセット

**配置ロジック詳細:**

```
wall=south の場合:
  - 設備の y = room.y (部屋の南端内面)
  - 設備の x = position で決定
  - orientation=along → w が壁沿い(x方向), h が壁から離れる(y方向)
  - orientation=perpendicular → h が壁沿い, w が壁から離れる

wall=north の場合:
  - 設備の y+h = room.y + room.h (部屋の北端内面)
  - 他は同様

wall=west の場合:
  - 設備の x = room.x (部屋の西端内面)
  - orientation=along → h が壁沿い(y方向)

wall=east の場合:
  - 設備の x+w = room.x + room.w
```

### Step 4: 設備レンダラー
**ファイル:** 新規 `renderers/equipment-renderer.ts`

設備種別ごとにSVGシンボルを描画。建築図面の標準的な上面図表現を使用。

| 設備 | SVG表現 |
|------|---------|
| `kitchen_counter` | 矩形(カウンター) + 楕円(シンク) + 2小矩形(コンロ) |
| `unit_bath` | 外枠矩形 + 内側矩形(浴槽、角丸) + 残り(洗い場) |
| `toilet` | 楕円(便器ボウル) + 矩形(タンク) |
| `washbasin` | 矩形(カウンター) + 楕円(ボウル) |
| `washing_machine` | 矩形(パン) + 円(ドラム) |
| `refrigerator` | 矩形 + 対角線(×マーク、区別用) |

共通スタイル:
- stroke: `#888` (グレー、壁や建具より薄く)
- fill: `none` or `#f5f5f5` (極薄グレー)
- stroke-width: `0.8` (壁より細く)
- class: `equipment` + `equipment-{type}`

壁方向 (`wallSide`) に応じて座標系を回転して描画。

### Step 5: SVGコンポーザー統合
**ファイル:** `svg-composer.ts`

- `renderEquipment()` を壁レイヤーの後、ラベルレイヤーの前に挿入
- レイヤー順: grid → walls → **equipment** → openings → labels → dimensions → meta → gridlines

設備は壁の上に描画し、建具（openings）はさらにその上に重ねる。

### Step 6: バリデーション
**ファイル:** `validator.ts`

最小限のバリデーション:
- 設備の `room` が存在するか
- 設備がルームの矩形内に収まるか（はみ出し警告）
- 同一ルーム内で設備同士が重複していないか（警告レベル、エラーではない）

### Step 7: テスト
**ファイル:** `src/__tests__/equipment.test.ts`

- プリセットサイズのデフォルト解決
- 各 wall 方向の配置座標計算
- center / offset 配置
- size オーバーライド
- orientation=along/perpendicular の回転
- はみ出し検知
- SVGシンボル出力の構造検証

### Step 8: サンプルYAML
**ファイル:** `samples/3ldk-with-equipment.yaml`

既存の `3ldk-house.yaml` をベースに設備を追加したサンプル。

## ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/types.ts` | 修正 | `EquipmentSpec`, `ResolvedEquipment`, `EquipmentType` 追加 |
| `src/equipment-presets.ts` | **新規** | プリセット定義 |
| `src/parser.ts` | 修正 | equipment パース追加 |
| `src/resolver.ts` | 修正 | `resolveEquipment()` 追加 |
| `src/renderers/equipment-renderer.ts` | **新規** | SVGシンボル描画 |
| `src/svg-composer.ts` | 修正 | equipment レイヤー追加 |
| `src/validator.ts` | 修正 | 設備バリデーション追加 |
| `src/__tests__/equipment.test.ts` | **新規** | テスト |
| `samples/3ldk-with-equipment.yaml` | **新規** | サンプル |

## リスクと制約

1. **壁厚考慮** — 設備は壁の内面に配置するが、auto-extracted walls は壁の中心線ベース。内面オフセットは `thickness/2` で計算する必要あり
2. **multi-rect 部屋への配置** — L字型部屋の場合、`wall` 指定だけでは配置先が曖昧になる可能性あり。Phase 1 では boundingRect ベースで処理し、はみ出しを警告で対応
3. **sub_rooms** — sub_room 内への設備配置は Phase 1 では room ID にparent room を指定する前提。sub_room ID 直接指定は Phase 2
4. **スケール** — 現在の SVG スケール (0.12px/mm) ではトイレ (450mm) が約54px。シンボル詳細度はこのスケールで視認可能なレベルに留める
