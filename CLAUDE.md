# CLAUDE.md

『ほしふる灯台』(Starfall Lighthouse) — ブラウザで遊べる日本語のみの 2D ターン制 JRPG。Vite + TypeScript (strict) + Phaser 3 で作り、GitHub Pages に公開する。

## まず読むもの

- `docs/GAME_DESIGN.md` — **仕様の正本**。式・ID・データ構造・UI はここに従う。実装と食い違ったらどちらを直すか決めて一致させる
- `docs/PLAN.md` — 工程（Phase 0〜8）、マイルストーン、決定事項（§9）
- `docs/ART_PROMPTS.md` — 素材の ID・ファイル名・置き場所・後処理の規約
- `docs/ADR/` — 技術選定の理由。依存を増やす前に読む

## コマンド

- `npm run dev` — 開発サーバー (http://localhost:5173、ポート固定)
- `npm run check` — lint → format:check → typecheck → test → build。PR 前に必ず通す
- `npm run test` / `npm run test:coverage` — Vitest（`tests/unit/**/*.test.ts`）
- `npm run e2e` — Playwright スモーク。build → preview を自動起動する（ポートは `E2E_PORT`、既定 4173。複数 checkout で同時に回すときは別ポートを指定）
  - サンドボックスでは `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e`（`playwright install` は実行しない）
- `BASE_PATH=/starfall-lighthouse/ npm run build` — GitHub Pages 向けビルド（deploy.yml が設定。ローカルでは未設定で `/`）
- ファイルを書いたら `npx prettier --write <files>`。format:check は `*.md` / `*.yml` / `*.json` を含むリポジトリ全体が対象

## アーキテクチャ規約

- `src/core/` は **純 TypeScript。Phaser を import しない**。戦闘・成長・インベントリ・セーブはここに置き、必ず Vitest テストを付ける（カバレッジ閾値は `vitest.config.ts`: lines/functions/statements 80%、branches 70%）
- `src/scenes/` は薄い Phaser シーン。描画と入力だけを担当し、ロジックは `src/core/` を呼ぶ
- ゲームの内容（敵・スキル・アイテム・会話・クエスト）は `src/data/` に型付きデータとして置く。シーン内にマジックナンバーを書かない
- シーンキーは `src/scenes/keys.ts` の `SceneKey` のみを使う（文字列直書き禁止）
- import はパスエイリアス（`@core/*`, `@data/*`, `@scenes/*`, `@ui/*`, `@/*`）を使う。相対パスでの `../../` 越えは避ける
- TypeScript は strict。`any` 禁止、`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` が有効なので配列・Record のアクセスは undefined を処理する。型 import は `import type`
- 画像はすべて `src/assets/manifest.ts`（Phase 2/6 で作成）経由で参照する。本番素材が無い間は `BootScene` がプレースホルダー描画をコードで生成する
- マップの正本は `src/data/maps/<map_id>.ts`（ASCII グリッド＋legend＋objects、`docs/ADR/0002-map-authoring.md`）。`compileMap()` が Tiled 互換 JSON を生成して Phaser に渡す。新しいマップは `src/data/maps/index.ts` に登録し、`tests/unit/maps-data.test.ts` で検証される。`public/assets/maps/*.json`（Tiled 由来）を置く場合も **手で編集しない**。レイヤー規約は `docs/GAME_DESIGN.md` §9.3
- 素材の流れ: 生成した原画は `art/raw/`（gitignore 対象）→ 後処理した本番素材を `public/assets/` → `docs/CREDITS.md` に行を追加。クレジット無しの素材追加は不可
- セーブ形式を変えるときは `SAVE_SCHEMA_VERSION` を上げ、`src/core/save.ts` の `migrate()` に移行ステップを追加し、旧→新のテストを書く
- 設定値（解像度 640×360、`TILE_SIZE` 32、パレット）は `src/config.ts` から import する

## 言語・表記

- ゲーム内 UI 文言は日本語。コード・コメント・コミットメッセージ・ファイル名・画像プロンプトは英語
- ドキュメント（`docs/`, `*.md`）は日本語
- ID は snake_case の英小文字＋接頭辞（`docs/GAME_DESIGN.md` §2）

## Git 運用

- ブランチ: `feat/*`, `fix/*`, `content/*`, `art/*`。`main` へは PR 経由のみ
- Conventional Commits: `feat:`, `fix:`, `content:`, `art:`, `chore:`, `docs:`, `test:`, `ci:`
- PR は 1 Phase の 1 タスクに絞る。PR 前に `npm run check` と e2e を通し、`.github/PULL_REQUEST_TEMPLATE.md` のチェックを埋める
- `dist/`, `coverage/`, `test-results/`, `playwright-report/` はコミットしない（gitignore 済み）
- 依存パッケージの追加・削除は `docs/ADR/` に記録してから行う（既存 ADR への追記で可）
- 新しい Phaser API を使うときは Phaser **3.x** のドキュメントを参照する（4.x ではない）
