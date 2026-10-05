# 0001. 技術スタックの選定

- 日付: 2026-10-05
- 状態: 採用

## 状況

『ほしふる灯台』は 1.5〜2 時間で遊べる 2D ターン制 JRPG を、ブラウザ（GitHub Pages）向けに 12〜16 セッション程度で完成させる計画です（`docs/PLAN.md` §0, §3）。
開発は少人数・短期間で、以下を満たす必要がありました。

- タイルマップ（Tiled）・シーン管理・入力・音声が揃った 2D エンジンで、学習資料と実例が豊富なこと
- 戦闘式やセーブ形式などのロジックを描画から切り離し、単体テストで守れること
- 静的ファイルとしてビルドし、GitHub Actions だけで Pages に公開できること
- 型・lint・整形を CI で強制し、長期のデータ投入（Phase 4）でもミスを早期に検出できること

## 決定

| 層             | 採用                                                           | バージョン（`package.json`）                   |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| ゲームエンジン | Phaser **3.x**                                                 | `phaser ^3.90.0`                               |
| ビルド         | Vite 8（Rolldown ベース）                                      | `vite ^8.3.2`                                  |
| 言語           | TypeScript 5.9（strict）                                       | `typescript ^5.9.3`                            |
| 単体テスト     | Vitest 5 + `@vitest/coverage-v8`                               | `vitest ^5.0.3`                                |
| E2E            | Playwright（Chromium のみ、起動スモーク）                      | `@playwright/test ^1.63.0`                     |
| Lint           | ESLint 10（flat config `eslint.config.js`）+ typescript-eslint | `eslint ^10.12.0`, `typescript-eslint ^8.71.0` |
| 整形           | Prettier                                                       | `prettier ^3.9.9`                              |
| ホスティング   | GitHub Pages（`deploy.yml`、`BASE_PATH` 環境変数）             | —                                              |
| セーブ         | `localStorage`（3 スロット、`schemaVersion` 付き JSON）        | —                                              |
| 実行環境       | Node.js 22（`.nvmrc`、`engines.node >= 22`）                   | —                                              |

## 理由

### Phaser 3.90（4.x ではなく）

- 採用時点で npm の最新は Phaser 4.x ですが、Tiled タイルマップ・シーン遷移・入力周りの公式ドキュメント、サンプル、コミュニティの Q&A は 3.x 向けが圧倒的に多く、短期開発での調査コストが低い
- 3.90 は 3 系の最終安定版で、本作が使う機能（タイルマップ、カメラ、Tween、Graphics によるプレースホルダー生成、Scale Manager）はすべて揃っている
- 4.x は API の大部分が 3.x と互換なので、必要になれば後から ADR を追加して移行できる。逆に、新しいメジャーバージョン特有の不具合・情報不足を小規模プロジェクトで抱えるリスクを避けた
- `CLAUDE.md` に「Phaser 3.x のドキュメントを参照」と明記し、4.x 向けの API を混ぜない

### Vite 8

- 開発サーバーの起動が速く、`vite build` でそのまま GitHub Pages に置ける静的ファイルが出る
- 8 系はバンドラーが Rolldown に置き換わっており、Phaser（minify 後約 1.2 MB）を含むビルドでも十分速い。`chunkSizeWarningLimit` を 2000 に上げて警告を抑えている
- `base` を環境変数 `BASE_PATH` から読むことで、ローカル（`/`）と Pages（`/starfall-lighthouse/`）を同じ設定で扱える

### TypeScript 5.9（7 ではなく）

- 採用時点で npm の最新 TypeScript は 7 系ですが、`typescript-eslint` の peerDependencies が `typescript >=4.8.4 <6.1.0` で、6.1 以上をサポートしていない
- lint を CI で強制する方針のため、typescript-eslint が対応するまでは 5.9 に留める。対応後に別 ADR で引き上げる
- `strict` に加えて `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` を有効化し、データ駆動で増えるテーブル参照のミスをコンパイル時に検出する

### Vitest 5

- Vite と設定（`define`, `resolve.alias`）を共有でき、`__APP_VERSION__` やパスエイリアスを二重管理せずに済む
- `src/core/**` に限定したカバレッジ閾値（lines/functions/statements 80%、branches 70%）を `vitest.config.ts` で強制。Phaser 非依存のロジックだけを対象にすることで、閾値を現実的に保つ

### ESLint 10 flat config + typescript-eslint

- ESLint 10 は flat config のみをサポートするため、`eslint.config.js` 一本で管理する
- `typescript-eslint` の `recommended` に、`consistent-type-imports`・`eqeqeq`・`no-console`（warn/error/info のみ許可）を追加。整形は Prettier に任せ、`eslint-config-prettier` で競合ルールを無効化

### Playwright（スモーク E2E）

- ゲームの中身は単体テストで守り、E2E は「ビルド成果物がブラウザで起動し、タイトルが入力待ちになり、コンソールエラーが 0」の 1 本に絞る（`tests/e2e/smoke.spec.ts`）
- `window.__starfall` を公開して Phaser の状態を外から確認できるようにし、Canvas の画素比較には頼らない
- `playwright.config.ts` の `webServer` が `npm run build && npm run preview` を自動起動する。CI では `npx playwright install --with-deps chromium`、ブラウザのダウンロードが禁止されたサンドボックスでは `PW_CHROMIUM_PATH` で既存バイナリを使う

### GitHub Pages + `BASE_PATH`

- 無料で URL を共有でき、`deploy.yml`（`actions/upload-pages-artifact` → `actions/deploy-pages`）だけで公開が完了する
- Pages のサブパス配信（`/starfall-lighthouse/`）に合わせて `BASE_PATH` を deploy ワークフローで注入し、ローカル開発では未設定のまま `/` で動かす
- 初回のみリポジトリ設定で Pages の Source を「GitHub Actions」にする必要がある

### localStorage セーブ

- サーバーを持たないので、ブラウザ内に保存するのが唯一の選択肢。3 スロット × 数 KB の JSON なら容量（5 MB 程度）に余裕がある
- `SAVE_SCHEMA_VERSION` と `migrate()`（`src/core/save.ts`）で前方互換を確保し、将来 IndexedDB やエクスポート機能に広げる余地を残す

## 影響・代替案

- **影響**
  - Phaser 4 固有の機能（新レンダラーなど）は使えない。移行する場合は別 ADR と全シーンの動作確認が必要
  - TypeScript 6/7 の新機能は使えない。Dependabot が TS のメジャー更新を提案しても、typescript-eslint の対応を確認してから取り込む
  - `src/core/` に Phaser を import するとカバレッジ対象に描画コードが混ざるため禁止（`CLAUDE.md`）
- **検討した代替案**
  - Phaser 4.x: 最新だが情報が少なく、小規模・短期の本作では利点より調査コストが大きいと判断
  - PixiJS + 自作シーン管理 / Kaplay / Excalibur: タイルマップやシーン遷移を自作・薄いライブラリで補う必要があり、JRPG に必要な機能が揃った Phaser の方が総工数が少ない
  - Jest: Vite の設定を共有できず、ESM / パスエイリアスの設定が二重になるため見送り
  - Cypress: Playwright より起動が重く、Chromium 1 本のスモークには過剰
  - itch.io / Netlify: GitHub Pages で要件を満たすため v1.0 では採用しない（itch.io は Phase 8 の任意項目）
  - IndexedDB: データ量に対して過剰。必要になれば `save.ts` の下にアダプタを足す
