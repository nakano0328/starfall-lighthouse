# コントリビューションガイド

『ほしふる灯台』への参加ありがとうございます。短いプロジェクトなので手順も短くしています。

## セットアップ

```bash
git clone https://github.com/nakano0328/starfall-lighthouse.git
cd starfall-lighthouse
nvm install        # .nvmrc の Node 22 を入れて切り替え（既に入っていれば nvm use）
npm ci
npm run dev        # http://localhost:5173
```

E2E を動かす場合は初回に `npx playwright install --with-deps chromium` を実行してください。
ブラウザのダウンロードが制限されたサンドボックスでは `playwright install` を実行せず、`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e` で既存バイナリを使います。

## ブランチと PR

1. `main` から作業ブランチを切る。接頭辞は `feat/`, `fix/`, `content/`（マップ・会話・データ）, `art/`（素材）
2. 1 PR = 1 タスク。`docs/PLAN.md` §3 の Phase と対応する Issue にリンクする
3. PR を出す前に次を通す
   ```bash
   npm run check    # lint / format:check / typecheck / unit test / build
   npm run e2e      # Playwright スモーク（サンドボックスでは PW_CHROMIUM_PATH=/opt/pw-browsers/chromium を付ける）
   ```
4. `.github/PULL_REQUEST_TEMPLATE.md` の項目を埋める。見た目の変更にはスクリーンショットを添付
5. CI（`.github/workflows/ci.yml`）がグリーンになったらレビュー依頼

## コミットメッセージ

Conventional Commits を使います。本文・件名は英語。

```
feat: add grid movement to WorldScene
fix: reject saves with unknown facing value
content: add minato village dialogue
art: add CC0 tileset for whispering forest
docs: describe save migration flow
test: cover damage formula edge cases
chore: bump vite
ci: cache playwright browsers
```

## Issue

バグ・提案・バランスは GitHub Issues へ。テンプレートを用意しています（空の Issue は作成できません）。

- **バグ報告** — 再現手順、期待／実際の挙動、ブラウザ・OS
- **機能提案** — 目的、提案内容、対象 Phase。スコープ外の項目は `docs/PLAN.md` §1.6 を先に確認
- **バランス報告** — 場所、パーティのレベル、何が理不尽か

仕様の変更を伴う提案は、実装前に `docs/GAME_DESIGN.md` の該当節を更新する PR から始めてください。

## 素材（画像・音）の追加

- ライセンスが明確なもののみ（CC0 / CC BY / MIT 等）。出典 URL を控える
- 生成画像の原画は `art/raw/`（gitignore 対象）に置き、後処理した本番素材だけを `public/assets/` に追加する。ファイル名の規約は `docs/ART_PROMPTS.md` §2
- 追加した素材は **必ず** `docs/CREDITS.md` に 1 行追加する（CI は通りますが、レビューで差し戻します）
- Tiled マップ（`public/assets/maps/*.json`）は Tiled からエクスポートしたものをそのままコミットし、手で編集しない

## コードの約束

詳細は `CLAUDE.md` を参照してください。要点のみ:

- `src/core/` は Phaser 非依存の純 TypeScript。テスト必須
- ゲームデータは `src/data/` に型付きで置き、シーンに数値を直書きしない
- UI 文言は日本語、コード・コメントは英語
