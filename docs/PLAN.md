# 『ほしふる灯台』(Starfall Lighthouse) 制作計画書

ブラウザで遊べる2Dターン制JRPGを、GitHubリポジトリ作成からv1.0リリースまで一気通貫で作るための計画です。
Claude Code（このセッション）が実装を担当し、画像生成が必要な箇所はユーザー側で生成ツールに投げられるプロンプトを用意しています。

---

## 0. 結論（先に全体像）

| 項目              | 決定内容（デフォルト案）                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| ジャンル          | 2Dトップビュー・ターン制コマンドバトルRPG（SNES期JRPG風）                                                    |
| プレイ時間        | 1.5〜2時間でクリアできるコンパクトな一本                                                                     |
| 配信形態          | ブラウザ（GitHub Pages）。インストール不要                                                                   |
| 技術              | TypeScript / Vite / Phaser 3 / Tiled / Vitest / Playwright / GitHub Actions                                  |
| アート            | 最初はコード生成のプレースホルダー → AI生成画像に差し替え                                                    |
| リポジトリ        | [nakano0328/starfall-lighthouse](https://github.com/nakano0328/starfall-lighthouse)（公開・MIT）**決定済み** |
| 画像生成          | Gemini（ユーザー側で生成。プロンプトは `docs/ART_PROMPTS.md`）**決定済み**                                   |
| 言語              | 日本語のみ **決定済み**                                                                                      |
| スプライト/タイル | CC0素材で速く進める（デフォルト。変更があれば Phase 6 までに反映）                                           |
| 工程              | Phase 0〜8、計 約12〜16セッション（1セッション=半日〜1日作業の想定）                                         |

2026-10-05 時点で §9 の決定事項はすべて確定しました（スプライト/タイル方針のみデフォルト適用）。

---

## 1. ゲーム企画

### 1.1 タイトル・コンセプト

- **タイトル**: ほしふる灯台 / Starfall Lighthouse
- **一言コンセプト**: 「消えた灯台の光を取り戻すため、島に散った三つの星の欠片を集める、短くて優しい王道JRPG」
- **ターゲット**: 王道JRPGが好きな人。1〜2時間で遊び切れる長さを重視
- **トーン**: 温かく少し切ない。難易度は中程度（レベル上げを強要しない）

### 1.2 あらすじ

海辺の小さな島「ミナト島」。島の灯台は夜ごと星の光を集めて海を照らし、空から落ちてきた「迷い星」を空へ帰す役目を担っていた。
ある夜、灯台の核「星心（せいしん）」が砕け、三つの欠片が島の各地へ飛び散る。灯台の光は消え、迷い星は帰れずに魔物となって島を徘徊し始めた。
灯台守の見習い**ルカ**は、幼なじみの**ミオ**、元鉱夫の**ゴロー**と共に欠片を集める旅に出る。
だが欠片を狙うもう一人の存在「影の収集家**ノクス**」が、灯台そのものを手に入れようとしていた。

### 1.3 登場キャラクター（パーティ3人）

| 名前          | 役割                       | 戦闘スタイル                               | 性格メモ                                               |
| ------------- | -------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| ルカ (Luka)   | 主人公・灯台守見習い・16歳 | バランス型。剣＋「光」属性スキル・回復少し | 真面目で少し心配性。灯台守の祖父を尊敬                 |
| ミオ (Mio)    | 漁師の娘・16歳             | 速攻型。短剣／弓、デバフ・先制・連撃       | 明るく行動派。ルカの背中を押す                         |
| ゴロー (Goro) | 元鉱夫・48歳               | 耐久型。大槌、挑発、防御バフ               | 無口で面倒見がよい。廃坑に因縁                         |
| ノクス (Nox)  | 敵・影の収集家             | 最終ボス（2段階）                          | 星を独占したい孤独な存在。倒すと迷い星として帰っていく |

### 1.4 ワールド構成（進行順）

1. **ミナト村**（スタート・拠点）… 宿屋、道具屋、灯台への道
2. **ささやきの森** → ダンジョン1「森の祠」… ボス：古木のウロ（欠片1）
3. **鉱山町ハガネ** … ゴローが加入。防具屋
4. **廃坑** → ダンジョン2 … ボス：岩のゴーレム（欠片2）
5. **沈んだ遺跡**（潮の干満で通路が変わる）→ ダンジョン3 … ボス：遺跡の番人（欠片3）
6. **灯台の塔**（最終ダンジョン・5階層）… 最終ボス：ノクス
7. **エンディング**（灯台が再点灯、迷い星が空へ帰る）

### 1.5 コアシステム

- **移動**: 4方向グリッド移動（32px）、マップ遷移、NPC会話、宝箱、看板
- **エンカウント**: マップ上のシンボル（敵が見える）方式 → 理不尽さを減らす
- **戦闘**: ターン制コマンド（たたかう／スキル／アイテム／防御／逃げる）。素早さ順の行動。弱点属性（光・炎・水・土）
- **成長**: レベル（最大30）、スキルはレベル習得。装備は武器・防具・アクセサリ各1
- **アイテム**: 回復薬、MP回復、状態異常治療、脱出アイテム、鍵アイテム
- **状態異常**: 毒・麻痺・暗闇・防御ダウン・攻撃アップ（最小限）
- **セーブ**: localStorageに3スロット。宿屋とセーブポイント（星の祠）で保存
- **設定**: 文字送り速度、BGM/SE音量、バトル速度
- **操作**: キーボード（矢印/WASD、Z/Enter決定、X/Esc戻る）＋ゲームパッド＋スマホ用タッチパッド

### 1.6 スコープの線引き（やらないこと）

- オープンワールド、クラフト、マルチプレイ、ガチャ、ボイス
- 4人以上のパーティ、転職、サブクエスト大量（サブクエは3つまで）
- ネイティブアプリ化（v1.0ではブラウザのみ）

---

## 2. 技術設計

### 2.1 技術スタック

| 層             | 採用                                           | 理由                                                       |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| 言語           | TypeScript（strict）                           | 型でデータ定義ミスを防ぐ                                   |
| ビルド         | Vite                                           | 高速・GitHub Pagesへの静的出力が簡単                       |
| ゲームエンジン | Phaser 3（最新安定版）                         | タイルマップ・入力・シーン管理・音声が揃っている           |
| マップ         | Tiled（JSONエクスポート）                      | Phaserが標準対応。レイヤーとオブジェクトで会話・宝箱を配置 |
| テスト         | Vitest（ロジック）、Playwright（起動スモーク） | 戦闘計算は描写と分離して単体テスト                         |
| Lint/Format    | ESLint + Prettier                              | CIで強制                                                   |
| CI/CD          | GitHub Actions                                 | PRでlint/typecheck/test/build、mainでPagesデプロイ         |
| 配信           | GitHub Pages                                   | 無料・URL共有が簡単                                        |

### 2.2 設計方針

- **描画とロジックの分離**: `src/core/`（純TS、Phaser非依存）に戦闘・成長・インベントリ・セーブ形式を置き、Vitestでテスト。`src/scenes/` はPhaserで描くだけ
- **データ駆動**: 敵・スキル・アイテム・会話・クエストフラグはJSON/TSデータ。バランス調整はデータ編集のみで可能
- **アセット差し替え前提**: 全画像を `assets/manifest.ts` で一元管理。プレースホルダー（コードで描く矩形・円）→ AI画像へ差し替えてもコード変更ゼロ
- **フラグ管理**: 進行は `flags: Record<string, boolean|number>` の一枚で管理し、セーブデータに含める

### 2.3 リポジトリ構成（案）

```
starfall-lighthouse/
├─ .github/
│  ├─ workflows/ci.yml            # lint / typecheck / test / build
│  ├─ workflows/deploy.yml        # main → GitHub Pages
│  └─ ISSUE_TEMPLATE/             # bug / feature / balance
├─ CLAUDE.md                      # Claude Code向け開発ルール
├─ README.md                      # 遊び方・スクショ・開発方法
├─ docs/
│  ├─ PLAN.md                     # この計画書
│  ├─ GAME_DESIGN.md              # 仕様の正本
│  ├─ ART_PROMPTS.md              # 画像生成プロンプト集
│  └─ ADR/                        # 技術決定の記録
├─ public/assets/
│  ├─ images/{characters,enemies,tiles,ui,backgrounds,portraits}
│  ├─ maps/                       # Tiled JSON
│  └─ audio/{bgm,se}
├─ src/
│  ├─ main.ts                     # Phaser起動
│  ├─ config.ts
│  ├─ core/                       # 純ロジック（テスト対象）
│  │  ├─ battle/  (engine.ts, damage.ts, ai.ts, status.ts)
│  │  ├─ party/   (character.ts, growth.ts, equipment.ts)
│  │  ├─ inventory.ts
│  │  ├─ flags.ts
│  │  └─ save.ts
│  ├─ data/                       # 敵・スキル・アイテム・会話・クエスト
│  ├─ scenes/                     # Boot, Title, World, Battle, Menu, Dialog, Ending
│  ├─ ui/                         # ウィンドウ、カーソル、タッチパッド
│  └─ assets/manifest.ts
├─ tests/
│  ├─ unit/                       # Vitest
│  └─ e2e/                        # Playwright スモーク
├─ scripts/                       # バランス表エクスポート等
├─ package.json / tsconfig.json / vite.config.ts / .eslintrc / .prettierrc
└─ LICENSE (MIT)
```

### 2.4 ブランチ・運用ルール

- `main` は保護（PR必須、CI必須）。`feat/*`, `fix/*`, `art/*`, `content/*` から PR
- Conventional Commits（`feat:`, `fix:`, `content:`, `art:`, `chore:`）
- 1 Phase = 1 マイルストーン（GitHub Milestones）。タスクは Issue 化し、PRにリンク
- `v0.x` を各Phase末にタグ付け、`v1.0.0` でリリース

---

## 3. 工程計画（Phase 0〜8）

各Phaseに「やること／成果物／完了条件／目安」を記載。目安の「S」はClaude Codeの1セッション（半日〜1日分の作業量）。

### Phase 0: 企画確定（本書）— 目安 0.5S

- やること: 本計画書のレビュー、§9の4点を決定
- 成果物: `docs/PLAN.md`（本書）、`docs/GAME_DESIGN.md` の骨子
- 完了条件: ユーザーが「進めてOK」と判断

### Phase 1: リポジトリ作成と開発基盤 — 目安 1S

1. GitHubリポジトリ作成（`starfall-lighthouse`、公開、MIT、README、.gitignore(Node)）
   - 本セッションのGitHub権限は現在の案件リポジトリに限定されているため、**ユーザーがGitHub上で空リポジトリを作成 → このセッションに追加**するのが確実。API経由での作成も試行可能
2. Vite + TypeScript + Phaser 3 の雛形、`npm run dev` でHello World（タイトル文字が出る）
3. ESLint / Prettier / Vitest / Playwright 設定、`npm test` が通る
4. GitHub Actions: `ci.yml`（PR時）、`deploy.yml`（main時にPages）
5. `CLAUDE.md`（コーディング規約・ディレクトリ規約・テスト必須ルール）、Issueテンプレート、ブランチ保護
6. 初回Pagesデプロイで公開URLを確認

- 成果物: 動くリポジトリ、公開URL、CIバッジ付きREADME
- 完了条件: PRを出すとCIが回り、mainにマージするとPagesが更新される

### Phase 2: フィールド基盤（歩けるゲーム）— 目安 2S

1. シーン構成（Boot → Title → World）、アセットローダー、プレースホルダー描画
2. Tiledマップ読み込み（地面・装飾・当たり判定・イベントの4レイヤー規約）
3. プレイヤー4方向グリッド移動、カメラ追従、マップ遷移（ワープオブジェクト）
4. NPC配置と会話ウィンドウ（文字送り、選択肢、名前表示）
5. 宝箱・看板・扉（鍵）・セーブポイント
6. メニュー（ステータス／アイテム／装備／セーブ／設定）の骨格
7. セーブ／ロード（3スロット、バージョン番号付きJSON）

- 完了条件: ミナト村（仮マップ）を歩き、NPCと話し、宝箱を開け、セーブして再開できる。`core/save.ts`, `core/flags.ts` に単体テスト

### Phase 3: 戦闘システム — 目安 2〜3S

1. `core/battle/engine.ts`: ターン進行、素早さ順、コマンド解決、勝敗判定を**純関数**で実装
2. ダメージ式（例: `攻撃×係数 − 防御/2 ± 10%乱数`、弱点1.5倍、クリティカル）、状態異常、バフ・デバフ
3. 敵AI（行動テーブル：通常／HP低下時／特定ターン）
4. 経験値・レベルアップ・スキル習得・装備補正（`core/party/`）
5. BattleSceneのUI: コマンドウィンドウ、ターゲット選択、ダメージ数字、ログ、勝利リザルト
6. シンボルエンカウント（敵スプライトに接触で戦闘開始、逃走成功で一定時間無敵）
7. ゲームオーバー → タイトル／最後のセーブから再開

- 完了条件: 単体テストでダメージ式・状態異常・レベルアップが検証済み。3体の敵と戦って勝敗・リザルトが動く

### Phase 4: コンテンツ制作（マップ・データ・シナリオ）— 目安 3〜4S

1. データ投入: 敵18種（通常14＋ボス4）、スキル約25、アイテム約30、装備約24
2. Tiledで全マップ制作: 村2、森、廃坑（3層）、遺跡（2層＋潮ギミック）、灯台（5層）、フィールド接続マップ
3. シナリオ: 全会話テキスト（JSON）、進行フラグ表、サブクエスト3本
4. ボス4体の専用行動パターンとギミック（例: ゴーレムは「硬化」中は物理無効）
5. バランス初版: 想定レベル曲線（村Lv1 → 森Lv5 → 廃坑Lv10 → 遺跡Lv16 → 灯台Lv22〜25）
6. `scripts/export-balance.ts` で敵・装備パラメータをCSV出力し、見直しやすくする

- 完了条件: 最初から最後まで（プレースホルダー絵で）通しプレイできる＝**ホワイトボックス完成**

### Phase 5: ゲームフロー仕上げ — 目安 1S

1. タイトル（はじめから／つづきから／設定）、オープニング演出、エンディング＆スタッフロール
2. 章タイトル表示、ボス前の演出（画面揺れ・フェード）、イベントシーン用の簡易スクリプト（移動・向き・待機・会話を順に実行）
3. 設定の永続化、ゲームパッド・タッチ操作

- 完了条件: 操作説明なしで初見の人がクリアまで迷わない導線になっている

### Phase 6: アート・サウンド差し替え — 目安 2S（＋ユーザー側の画像生成作業）

1. ユーザーが `docs/ART_PROMPTS.md`（§4）のプロンプトで画像を生成し、`public/assets/images/` に配置
2. Claude Codeが背景除去／リサイズ／スプライトシート化（ImageMagick / sharp）、`manifest.ts` 更新
3. 歩行アニメは「AI生成の立ち絵を参照にドット絵化」か「CC0素材パック（Kenney等）」のどちらか（§4.1参照）
4. BGM/SE: CC0素材（例: OpenGameArt, Kenney Audio）または音楽生成AI。曲数目安: BGM 9曲（タイトル・村・フィールド・森・洞窟・遺跡・戦闘・ボス・エンディング）、SE 20種
5. フォント: Noto Sans JP または PixelMplus（ドット絵フォント・ライセンス確認）

- 完了条件: プレースホルダーが全て置き換わり、ライセンス一覧（`docs/CREDITS.md`）が揃う

### Phase 7: QA・バランス調整・磨き — 目安 1〜2S

1. 通しテストプレイ3周（通常／最短／寄り道フル）、所要時間計測
2. バランス修正（詰みポイント、ボスの理不尽さ、金銭バランス）
3. Playwright E2E: タイトル→ニューゲーム→最初の戦闘勝利→セーブ、の自動スモーク
4. パフォーマンス（60fps維持、初回ロード3秒以内を目標、画像圧縮）
5. アクセシビリティ: 文字サイズ、色弱配慮の弱点表示（アイコン併用）、ボタン連打防止
6. バグトリアージ（Issue）、既知の問題リスト

- 完了条件: クリティカル／メジャーバグ0、E2Eグリーン

### Phase 8: リリース — 目安 0.5S

1. `v1.0.0` タグ、GitHub Release（変更履歴・スクショ・遊び方）
2. READMEにプレイURL・スクショ・操作方法・クレジット
3. OG画像（SNS共有用）とfavicon
4. 任意: itch.io への同時公開、X/ブログ告知文のドラフト

- 完了条件: 公開URLで誰でも最初から最後まで遊べる

### Phase 9（任意・リリース後）

- 難易度選択、実績、ニューゲーム＋、英語版（i18n）、Electron/PWA化

### マイルストーン早見表

| マイルストーン | 内容                               | 累計目安 |
| -------------- | ---------------------------------- | -------- |
| M1 `v0.1`      | 基盤完成・Pages公開                | 1.5S     |
| M2 `v0.2`      | 歩ける・話せる・セーブできる       | 3.5S     |
| M3 `v0.3`      | 戦える                             | 6S       |
| M4 `v0.5`      | 通しプレイ可能（ホワイトボックス） | 10S      |
| M5 `v0.8`      | 本番アート・音入り                 | 13S      |
| M6 `v1.0`      | リリース                           | 15S前後  |

---

## 4. 画像生成プロンプト集

### 4.1 前提と運用ルール

- プロンプトは英語（生成モデルは英語の方が安定）。日本語の注記を併記
- 想定ツール: **Gemini**（決定）。本節は汎用版の下書きで、Gemini向けに調整した最終版は `docs/ART_PROMPTS.md` を正とする
- **AI生成が得意なもの**: キービジュアル、戦闘背景、キャラ立ち絵・顔アイコン、敵の一枚絵、アイテムアイコン、UI枠
- **AI生成が苦手なもの**: 32px等倍のドット絵、グリッドに揃ったスプライトシート、歩行アニメの一貫性、タイルセットの継ぎ目
  - 対策A: 立ち絵を参照にAsepriteなどで手作業ドット化（最も品質が高い）
  - 対策B: 歩行スプライトとタイルはCC0素材（Kenney "RPG Urban/Nature", OpenGameArt LPC系）を使い、AI画像は一枚絵系に限定（最も速い）
  - 推奨: **対策B**で始め、気になる箇所だけ対策Aで差し替え
- 生成後の加工（Claude Code側で実施）: 背景除去 → 指定サイズへリサイズ（最近傍補間）→ 必要ならスプライトシート結合 → PNG圧縮
- 1素材につき4枚程度生成し、1枚を採用。採用画像は `docs/ART_PROMPTS.md` に「採用プロンプト・シード・ツール名」を記録

### 4.2 共通スタイル指定

全プロンプトの先頭に付ける共通句（STYLE）:

```
16-bit pixel art, SNES-era JRPG style, clean pixel outlines, limited 32-color palette,
flat shading with 2-tone highlights, no anti-aliasing, no gradients, crisp edges,
warm nostalgic coastal fantasy mood
```

共通ネガティブプロンプト（NEG、対応ツールのみ）:

```
blurry, photorealistic, 3D render, smooth shading, text, letters, watermark, signature,
extra limbs, deformed hands, cropped, duplicate, modern clothing, gun
```

一枚絵系（キービジュアル・背景）は STYLE の代わりに以下（ILLUST）を使う:

```
detailed pixel art illustration, 16-bit JRPG key art style, painterly dithering,
rich but limited palette, soft bloom from starlight, cinematic composition
```

### 4.3 キービジュアル・画面系

| ID    | 用途             | サイズ    | プロンプト                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KV-01 | タイトル画面背景 | 1920×1080 | `{ILLUST}. A small coastal island at night with a tall white lighthouse on a cliff, its lamp dark, hundreds of shooting stars falling into the sea, a 16-year-old lighthouse keeper apprentice boy with a lantern standing on the shore looking up, calm waves, fishing village lights in the distance, wide shot, space at the top-center for a game logo. {NEG}` |
| KV-02 | エンディング     | 1920×1080 | `{ILLUST}. The same lighthouse now shining with a brilliant golden-white beam, countless small star spirits rising from the island into the night sky like fireflies, three heroes (boy with sword, girl with bow, large bearded man with hammer) seen from behind on the lighthouse balcony, dawn beginning at the horizon, hopeful mood. {NEG}`                  |
| KV-03 | ゲームオーバー   | 1280×720  | `{ILLUST}. A single extinguished lantern lying on dark wet sand at night, faint starlight, muted desaturated blue palette, melancholic, lots of empty space. {NEG}`                                                                                                                                                                                                |
| KV-04 | OG画像/README用  | 1200×630  | KV-01のバリエーション。`horizontal banner composition, logo space on the right third` を追加                                                                                                                                                                                                                                                                       |
| UI-00 | favicon          | 64×64     | `{STYLE}. A tiny lighthouse icon with a four-pointed star above it, white and gold on deep navy circle, centered, readable at 16px. {NEG}`                                                                                                                                                                                                                         |

### 4.4 キャラクター（立ち絵・顔アイコン・スプライト参照）

各キャラにつき3種類: 立ち絵（A）、顔アイコン（B）、歩行スプライト参照（C）。

**ルカ (Luka)**

- CH-01A 立ち絵 1024×1024: `{STYLE}. Full body portrait of a 16-year-old boy, lighthouse keeper apprentice, short messy dark-teal hair, honest worried expression, navy coat with brass buttons, white scarf, brown boots, holding a small lantern and a short sword, transparent background, front 3/4 view, centered. {NEG}`
- CH-01B 顔アイコン 256×256: `{STYLE}. Face portrait bust of the same boy, dark-teal hair, navy coat, white scarf, neutral expression, transparent background, centered, for a dialogue box. {NEG}` （表情差分: `smiling`, `surprised`, `determined` を各1枚）
- CH-01C スプライト参照 512×512: `{STYLE}. Character sprite sheet reference, chibi proportions 1:2 head-to-body, same boy in navy coat and white scarf, four directions (front, back, left, right) standing pose, 32x32 pixel grid feel, transparent background, evenly spaced in one row. {NEG}`

**ミオ (Mio)**

- CH-02A: `{STYLE}. Full body portrait of a 16-year-old fisher girl, sun-tanned skin, wavy orange hair tied in a high ponytail with a seashell hairpin, bright confident grin, sleeveless teal fisher vest, rolled-up shorts, barefoot sandals, short bow on her back, transparent background, front 3/4 view. {NEG}`
- CH-02B: 顔アイコン（同じ特徴、`cheerful`, `pouting`, `serious` 差分）
- CH-02C: スプライト参照（同形式）

**ゴロー (Goro)**

- CH-03A: `{STYLE}. Full body portrait of a 48-year-old former miner, broad and tall, thick grey-streaked beard, kind tired eyes, dented mining helmet with a small lamp, leather apron over a dark red shirt, huge two-handed hammer resting on shoulder, transparent background, front 3/4 view. {NEG}`
- CH-03B: 顔アイコン（`gentle smile`, `stern`, `laughing` 差分）
- CH-03C: スプライト参照（同形式、`taller and wider than the others` を追加）

**ノクス (Nox)**

- CH-04A 立ち絵: `{STYLE}. Full body portrait of a mysterious collector of stars, androgynous tall figure wrapped in a long midnight-blue cloak that fades into drifting shadow at the hem, silver mask shaped like a crescent moon, dozens of tiny glowing star fragments orbiting their hands, elegant and lonely, transparent background. {NEG}`
- CH-04B 顔アイコン（`calm`, `cracked mask revealing a sad eye` の2種）
- CH-04C スプライト参照（同形式）

**村人・NPC汎用**（CH-10〜15、各512×512、4方向立ちポーズ）: 老灯台守（ルカの祖父）、宿屋の女将、道具屋の少年、漁師の男、鉱山町の職人、遺跡の学者。プロンプト例:
`{STYLE}. Character sprite sheet reference, chibi proportions, an elderly lighthouse keeper with a white beard, long grey coat and captain's hat, four directions standing pose, transparent background, evenly spaced. {NEG}`

### 4.5 敵キャラクター（戦闘用一枚絵）

サイズ: 通常敵 512×512、ボス 1024×1024。全て `transparent background, centered, facing the viewer slightly from the left, battle sprite` を付与。

| ID     | 名前                  | 出現地 | プロンプト本文（{STYLE} と共通句は省略）                                                                                                                                   |
| ------ | --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EN-01  | 迷い星スライム        | 全域   | `a translucent round slime made of pale blue starlight with a tiny glowing star core, cute but sad face`                                                                   |
| EN-02  | ささやきコウモリ      | 森     | `a small purple bat with oversized ears and faint musical note sparkles around it`                                                                                         |
| EN-03  | キノコの子            | 森     | `a walking spotted mushroom creature with stubby legs and a mischievous smile`                                                                                             |
| EN-04  | 森オオカミ            | 森     | `a lean grey forest wolf with moss growing on its back and glowing green eyes`                                                                                             |
| EN-05  | トゲツタ              | 森     | `an animated thorny vine monster with a flower bud head, snapping tendrils`                                                                                                |
| EN-06  | 廃坑ネズミ            | 廃坑   | `a large rat with a miner's lamp stuck on its head, glowing yellow eyes`                                                                                                   |
| EN-07  | 鉱石クモ              | 廃坑   | `a cave spider whose body is a cluster of amethyst crystals, eight thin legs`                                                                                              |
| EN-08  | トロッコゴースト      | 廃坑   | `a ghostly miner spirit riding a floating broken mine cart, lantern for a face`                                                                                            |
| EN-09  | ヒカリムシ            | 廃坑   | `a swarm of glowing cave fireflies forming one vaguely humanoid shape`                                                                                                     |
| EN-10  | 潮だまりカニ          | 遺跡   | `an armored crab with ancient ruin fragments as its shell, barnacles, one huge claw`                                                                                       |
| EN-11  | 遺跡の石像兵          | 遺跡   | `a cracked stone soldier statue animated by blue light in its joints, holding a spear`                                                                                     |
| EN-12  | うつろ貝              | 遺跡   | `a giant spiral seashell monster with a dark void inside and small glowing eyes`                                                                                           |
| EN-13  | 影の手                | 灯台   | `a pair of large shadowy hands floating over a scattering of stolen star fragments`                                                                                        |
| EN-14  | 偽りの灯              | 灯台   | `a floating lantern with a cold purple flame and a wicked grinning face`                                                                                                   |
| BO-01  | 古木のウロ（ボス1）   | 森の祠 | `an enormous ancient hollow tree with a face in its trunk, one star fragment glowing inside the hollow, roots like arms, owls nesting in branches, imposing but not evil`  |
| BO-02  | 岩のゴーレム（ボス2） | 廃坑   | `a massive golem built from mine rubble, rusted rails and ore, a star fragment embedded in its chest, glowing orange cracks, hunched forward`                              |
| BO-03  | 遺跡の番人（ボス3）   | 遺跡   | `a colossal sunken-ruin guardian statue half covered in coral and seaweed, blue runic lights, trident, water dripping, star fragment in its forehead`                      |
| BO-04a | ノクス 第1形態        | 灯台頂 | `the masked star collector Nox in a dramatic pose, cloak spread wide, star fragments swirling into a dark sphere behind them`                                              |
| BO-04b | ノクス 第2形態        | 灯台頂 | `Nox transformed into a towering shadow figure with the cracked crescent mask, body made of swirling night sky and falling stars, the broken lighthouse lamp in its chest` |

### 4.6 戦闘背景（1280×720、各地形）

| ID    | 場所               | プロンプト                                                                                                                                                                                                        |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BG-01 | 草原・海岸         | `{ILLUST}. Battle background, side view, a grassy coastal path with the sea and the dark lighthouse far in the background, late afternoon light, no characters, empty foreground ground plane for sprites. {NEG}` |
| BG-02 | ささやきの森       | `{ILLUST}. Battle background, deep whispering forest with giant mossy trees, floating motes of light, dappled shade, empty foreground. {NEG}`                                                                     |
| BG-03 | 廃坑               | `{ILLUST}. Battle background, abandoned mine tunnel with wooden supports, rusted rails, scattered glowing amethyst, a single hanging lantern, empty foreground. {NEG}`                                            |
| BG-04 | 沈んだ遺跡         | `{ILLUST}. Battle background, half-submerged ancient stone ruins, shallow water on the floor reflecting blue runes, broken pillars, seaweed, empty foreground. {NEG}`                                             |
| BG-05 | 灯台内部           | `{ILLUST}. Battle background, inside a tall lighthouse spiral staircase, brass fittings, cold purple light leaking from above, empty foreground. {NEG}`                                                           |
| BG-06 | 灯台頂（ラスボス） | `{ILLUST}. Battle background, the top balcony of a lighthouse at night, the huge dark lamp lens behind, the entire starry sky swirling as if being pulled down, dramatic, empty foreground. {NEG}`                |

### 4.7 タイルセット参照（CC0素材を使わない場合）

AIにグリッド整合を期待せず、「参照画」として生成し手作業でタイル化する前提。各1024×1024。

- TL-01 村: `{STYLE}. Tileset reference sheet for a top-down JRPG fishing village: grass, dirt path, cobblestone, wooden pier planks, shallow water edge, house walls (white plaster and blue roof tiles), doors, windows, fences, barrels, nets, flower boxes, laid out as separate 32x32 tiles on a grid, transparent background. {NEG}`
- TL-02 森: `... whispering forest: dark grass, roots, mossy rocks, giant tree trunks, mushrooms, fallen logs, stone shrine pieces, glowing flowers ...`
- TL-03 廃坑: `... abandoned mine: rock walls, dirt floor, wooden supports, rails, mine carts, ore veins, lanterns, ladders, pits ...`
- TL-04 遺跡: `... sunken ruins: cracked marble floor, shallow water, broken pillars, blue rune tiles, coral, seaweed, stairs ...`
- TL-05 灯台: `... lighthouse interior: iron spiral stairs, brass railings, white plaster walls, round windows, lamp machinery, red-white stripe exterior ...`

### 4.8 UI・アイコン

| ID    | 用途                         | サイズ     | プロンプト                                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 | 会話/メニュー窓枠（9-slice） | 256×256    | `{STYLE}. A JRPG dialogue window frame, deep navy semi-transparent center, thin brass border with small star ornaments at the four corners, designed as a 9-slice frame, transparent outside. {NEG}`                                                                                                            |
| UI-02 | カーソル                     | 32×32      | `{STYLE}. A small pointing hand cursor icon, white glove with gold trim, pointing right, transparent background. {NEG}`                                                                                                                                                                                         |
| UI-03 | 属性アイコン4種              | 32×32      | `{STYLE}. Four elemental icons in one row: a golden four-pointed star (light), an orange flame (fire), a blue water drop (water), a brown rock (earth), transparent background, evenly spaced. {NEG}`                                                                                                           |
| UI-04 | 状態異常アイコン5種          | 32×32      | `{STYLE}. Five status icons in one row: purple skull bubble (poison), yellow lightning (paralysis), grey closed eye (blind), cracked blue shield (defense down), red up arrow with sword (attack up), transparent. {NEG}`                                                                                       |
| UI-05 | アイテムアイコン             | 32×32×約30 | 1枚ずつ生成。例: `{STYLE}. Item icon, a small glass bottle of glowing red healing potion with a cork, transparent background, centered, readable at 32px. {NEG}` 対象: 薬草/回復薬(小中大)/星のしずく(MP)/万能薬/毒消し/帰還の羽/鍵3種/欠片3種/各武器(剣3・短剣3・大槌3)/防具(服・革・鎖・星の衣)/アクセサリ4種 |
| UI-06 | タッチ用ボタン               | 64×64      | `{STYLE}. Semi-transparent round touch button icons set: D-pad, A button, B button, menu, white outline on dark, transparent background. {NEG}`                                                                                                                                                                 |

### 4.9 生成枚数の目安

| カテゴリ               | 点数                      | 生成試行の目安 |
| ---------------------- | ------------------------- | -------------- |
| キービジュアル・画面   | 5                         | 20枚           |
| キャラ立ち絵・顔・参照 | 4人×3＋表情差分約10＋NPC6 | 約70枚         |
| 敵・ボス               | 19                        | 約60枚         |
| 戦闘背景               | 6                         | 約20枚         |
| タイル参照（任意）     | 5                         | 約15枚         |
| UI・アイコン           | 約45                      | 約90枚         |
| 合計                   | 約90点                    | 約275枚        |

---

## 5. サウンド計画（参考）

- BGM 9曲: タイトル／ミナト村／フィールド／森／廃坑／遺跡／通常戦闘／ボス戦／エンディング（＋ゲームオーバー短曲）
- SE 約20種: 決定・キャンセル・カーソル・足音・扉・宝箱・戦闘開始・斬撃・打撃・魔法（光/炎/水/土）・回復・被弾・レベルアップ・セーブ・フェード
- 入手方針: CC0（Kenney Audio、OpenGameArt）を第一候補。音楽生成AIを使う場合のプロンプト例:
  `Calm 16-bit chiptune, coastal village theme, 90 BPM, marimba lead, gentle waves ambience, loopable, 1 minute`

---

## 6. 品質基準（Definition of Done）

- 全PRでCI（lint / typecheck / unit test / build）グリーン
- `core/` のテストカバレッジ 80%以上（戦闘・成長・セーブ）
- 通しプレイ3周で進行不能バグ0
- 初回ロード3秒以内（圧縮後のアセット合計 15MB以下目標）、60fps
- クレジット／ライセンス一覧（`docs/CREDITS.md`）に全素材を記載

## 7. リスクと対策

| リスク                                 | 対策                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| AI画像のドット絵が崩れる・統一感がない | 一枚絵系に限定、スプライト/タイルはCC0素材。共通STYLE句とシード固定。採用基準を先に決める |
| コンテンツ量が膨らんで終わらない       | Phase 4の数量を上限として固定。追加案はPhase 9へ                                          |
| バランス崩壊                           | ダメージ式を純関数化しテーブル駆動で調整。CSVエクスポートで俯瞰                           |
| Phaserのバージョン差で情報が古い       | 採用時に最新安定版を確認し、ADRに記録                                                     |
| セーブ互換性                           | セーブJSONにschemaVersionを持ち、マイグレーション関数を用意                               |
| GitHub権限（新規リポジトリ作成）       | ユーザーがUIで作成し、セッションに追加する手順を第一候補にする                            |

## 8. 直近の着手手順（「進めてOK」をもらった後の最初の1セッション）

1. ユーザー: GitHubで `starfall-lighthouse` を作成（公開・README/.gitignore(Node)/MIT）し、このセッションにリポジトリを追加
2. Claude Code: 雛形生成 → ローカルで `npm run dev` と `npm test` を確認 → CI/Pagesワークフロー → `CLAUDE.md` → 初回PR
3. Claude Code: `docs/PLAN.md`（本書）、`docs/GAME_DESIGN.md`、`docs/ART_PROMPTS.md`（§4を分離）を投入
4. Claude Code: Phase 2 のタスクを Issue 化し、Milestone M2 を作成
5. ユーザー: 並行して §4.3（KV-01）と §4.4（主人公3人の顔アイコン）から画像生成を開始すると、Phase 6で待ちが発生しない

## 9. 決定事項（2026-10-05 確定）

1. **リポジトリ**: `nakano0328/starfall-lighthouse`（公開・MIT）
2. **画像生成ツール**: Gemini。プロンプトは Gemini 向けに調整したものを `docs/ART_PROMPTS.md` に置く（ネガティブプロンプト欄がないため文中に除外指示を含める、透過PNGが出ないため単色背景で生成して後処理で抜く、など）
3. **スプライトとタイルの方針**: CC0素材で速く進める（デフォルト適用。手作業ドット絵で品質重視に切り替える場合は Phase 6 開始前に申告）
4. **言語**: 日本語のみ
