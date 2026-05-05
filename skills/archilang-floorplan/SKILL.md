---
name: archilang-floorplan
description: archilang CLIで建築間取り図面（SVG平面図）を生成する。YAML仕様を書いてvalidate→fix→renderのループで図面を完成させる。ユーザーが「間取りを作って」「3LDKの図面」「archilangで描いて」「平面図を生成」「floor plan」「間取り図」「archilang」と言ったとき、または住宅の間取り・部屋配置・設備配置に関する図面作成を求められたときに使用する。部屋数やタイプ（LDK、寝室等）の指定があればそれに従い、なければヒアリングする。
---

# archilang Floor Plan Generator

archilang CLIを使ってYAML間取り仕様からSVG平面図を生成するスキル。

## 前提

- archilangプロジェクト: `/Users/akihito/Documents/my-life/.06_Projects/archilang/`
- CLI実行: `npx tsx src/main.ts` （archilangディレクトリから実行）
- 出力先: ユーザー指定がなければ archilang プロジェクト内の `output/` に保存

## ワークフロー

### Step 1: 要件ヒアリング

ユーザーの指示から以下を確認する。不足があれば質問する:

- **間取りタイプ**: 1R, 2LDK, 3LDK, 4LDK 等
- **方位**: 南向き、東向き等（デフォルト: south）
- **特別な要件**: L字型、中庭、設備指定等

最低限「部屋数とタイプ」が決まれば着手できる。細かい寸法はこちらで適切に決める。

### Step 2: グリッド設計

910mmモジュール（尺）でグリッドを設計する。目安:

| 間取り | 典型的なグリッド | 延床面積目安 |
|--------|-----------------|-------------|
| 1R | 4×4 | ~13m² |
| 2LDK | 6×7 | ~35m² |
| 3LDK | 10×8 | ~66m² |
| 4LDK | 12×8 | ~80m² |

部屋配置の原則:
- LDKは南面（採光確保）に配置し、最も広くする
- 水回り（浴室・トイレ・洗面）は北側にまとめる（配管集約）
- 寝室は静かな位置（LDKから離す）
- 玄関は方位（orientation）側に配置

### Step 3: YAML生成

[references/yaml-spec.md](references/yaml-spec.md) のYAML仕様に従ってYAMLを生成する。

**出力先ファイル**: `/Users/akihito/Documents/my-life/.06_Projects/archilang/output/plan.yaml`

YAML生成時の注意:
- `archilang: "0.2"` は必須
- `openings: []` ではなくブロック形式で書く（solveコマンドとの互換性）
- 全ての部屋にドアを設ける（`ROOM_WITHOUT_DOOR` を避ける）
- 壁座標はグリッド整合させる（`GRID_MISALIGNMENT` を避ける）
- 設備は部屋サイズに収まるようにする（`EQUIPMENT_OUT_OF_BOUNDS` を避ける）

### Step 4: validate → inspect → fix ループ

```bash
cd /Users/akihito/Documents/my-life/.06_Projects/archilang

# 1. バリデーション（JSON形式でfix_hint取得）
npx tsx src/main.ts validate output/plan.yaml --format json

# 2. ASCIIマップで空間確認
npx tsx src/main.ts inspect output/plan.yaml --ascii-map

# 3. エラーがあれば自動修正を試みる
npx tsx src/main.ts solve output/plan.yaml --out output/plan.yaml

# 4. 自動修正できないエラーはfix_hintを参考にYAMLを手動修正
# 5. 再度validate → エラー0になるまで繰り返す
```

**ループの判断基準:**
- `errorCount: 0` になれば次のステップへ進む
- `warning` は許容（ただし `OPENING_OVERLAP` は修正推奨）
- 3回ループしても解決しない場合、残りのエラーをユーザーに報告して判断を仰ぐ

### Step 5: レンダリング

```bash
cd /Users/akihito/Documents/my-life/.06_Projects/archilang

# SVG + HTML生成
npx tsx src/main.ts output/plan.yaml output/plan.svg

# 面積表も生成
npx tsx src/main.ts output/plan.yaml output/plan.svg --area-table
```

生成物:
- `output/plan.svg` — ベクター図面
- `output/plan.html` — ブラウザプレビュー
- `output/plan.area.json` — 面積表（`--area-table` 指定時）

### Step 6: 結果報告

以下を報告する:
- 生成されたファイルのパス
- ASCIIマップ（最終版）
- 面積サマリー（部屋ごとのm²/畳数）
- 残りの warning があれば内容

## 設備配置ガイド

設備を配置する場合の目安:

| 設備 | 配置先 | wall | position目安 |
|------|--------|------|-------------|
| kitchen_counter | LDK/キッチン | 壁に沿って | offset: 0 |
| unit_bath | 浴室 | north | offset: 0 |
| toilet | トイレ | north | offset: 200 |
| washbasin | 洗面 | east or west | offset: 0 |
| washing_machine | 洗面 | washbasinと同じ壁 | washbasinの隣 |
| refrigerator | LDK/キッチン | kitchen_counterと直交する壁 | offset: 0 |

設備サイズが部屋に収まらない場合は `size` でオーバーライドする。

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| `UNREACHABLE_ROOM` | ドアが外部に繋がっていない | 玄関→廊下→各部屋の接続経路を確認 |
| `ISOLATED_SUBAREA` | 壁が部屋を完全分断 | 壁を短くするか、ドアを追加 |
| `EQUIPMENT_OUT_OF_BOUNDS` | 設備が部屋からはみ出し | size を小さくするか position を調整 |
| `SKIPPED_OPENING` | 共有壁が見つからない | connects の部屋IDが隣接しているか確認 |
