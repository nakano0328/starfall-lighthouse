# ADR-0002: マップは ASCII 形式で記述し、実行時に Tiled 互換 JSON へコンパイルする

- 日付: 2026-10-05
- 状態: 採用

## 状況

`docs/GAME_DESIGN.md` §9.3 は Tiled のエクスポート JSON（レイヤー `ground` / `deco` / `above` / `collision` / `events`、オブジェクトの type とプロパティ）を前提にしている。
しかし本プロジェクトの実装は主に自動化されたセッションで進めるため、GUI の Tiled でマップを描く工程が制作のボトルネックになる。マップは 26 枚あり、レビューや差分管理もしやすい形式が望ましい。

## 決定

- マップの正本は `src/data/maps/<map_id>.ts` に置く **ASCII 形式**（`MapSource`: `tiles` の文字グリッド、文字→タイルの `legend`、`objects` のリスト、`meta`）とする
- `src/core/map/compile.ts` の `compileMap()` が、§9.3 の規約どおりの **Tiled 互換 JSON**（`TiledMap`）を生成する。`collision` レイヤーはタイル定義の `solid` から自動生成し、`legend` の `solid` や `blocked` グリッドで上書きできる
- 潮の干満（§3.2）を持つマップは `meta.tideAware: true` とし、`tide.high` / `tide.low` の 2 グリッド（`overlay` と同じ書式。各文字は `deco` と `solid` だけを持つ legend 項目）で「その潮位のときだけ存在するセル」を書く。`compileMap()` はこれを `deco_water_<tide>` / `collision_<tide>` レイヤーに分け、共通の `collision` には含めない。実行時は `collisionForTide()`（`src/core/map/tide.ts`）が `collision` と現在の潮のレイヤーを合成する
- `WorldScene` は生成した JSON を Phaser の tilemap キャッシュに登録して読み込む。現時点でローダーが読むのは ASCII ソースとプレースホルダータイルセットのみで、形式に依存しないのは `parseMapObjects` と `CollisionGrid` である。出力が Tiled 形式なので、Tiled でエクスポートした JSON を読む経路（`public/assets/maps/*.json` のロードと `tilesets` に応じたタイルセット選択）は将来追加できる（GUI で描き直す選択肢を残す）
- オブジェクトの読み取り（`parseMapObjects`）と当たり判定（`CollisionGrid`）は Tiled JSON を入力とし、生成元が ASCII か Tiled かに依存しない
- `public/assets/maps/` は Tiled 由来の JSON 用に残す（現在は空）。置く場合も手で編集しない

## 理由

- テキストなので diff・レビュー・自動生成がしやすく、Vitest で全マップを検証できる（サイズ、未知の文字、オブジェクトの範囲、ワープ先の存在と通行可否）
- Tiled 互換の中間形式を挟むことで、Phaser の tilemap 機能（レイヤー描画・カリング）をそのまま使え、仕様書の規約も変わらない
- タイルセットの差し替え（Phase 6）はプレースホルダーのタイル名と実タイルの対応表を変えるだけで済む

## 影響・代替案

- 1 文字 = 1 タイルのため、複数タイルにまたがる装飾（大きな木や建物の屋根）は複数の文字で表現する。地形の見た目が単調になりがちだが v1.0 の範囲では許容する
- 代替案「Tiled を正本にする」は、GUI 作業が必須になるため見送り。代替案「独自 JSON 形式」は Phaser の tilemap と二重管理になるため見送り
- `docs/GAME_DESIGN.md` §9.3 の規約は「生成される JSON の仕様」として維持する
