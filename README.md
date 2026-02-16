# ClaudeMonitor

並列で動作する Claude Code セッションをリアルタイムに監視するダッシュボード。セッション状態の追跡、ツール実行の承認/拒否、Web UI からの指示送信が可能です。

## アーキテクチャ

```
Claude Code Sessions ──(hooks/HTTP POST)──> Backend (Hono/Bun:4001)
                                                │
                                  ┌─────────────┼─────────────┐
                                  │ SQLite      │ WebSocket   │
                                  │             ▼             │
                                  │     ┌───────────────┐     │
                                  │     │ Broadcaster   │     │
                                  │     └───┬───────┬───┘     │
                                  │         │       │         │
                                  ▼         ▼       ▼         │
                            ┌─────────┐ ┌───────────────┐     │
                            │ Web UI  │ │ Slack Bot     │     │
                            │ React   │ │ (optional)    │     │
                            │ :5173   │ │               │     │
                            └─────────┘ └───────────────┘     │
                                                              │
Backend ──(Bun.spawn: claude -r <sid> -p)──> Claude Code CLI ─┘
```

## クイックスタート

### 前提条件

- [Bun](https://bun.sh) v1.2+
- [jq](https://jqlang.github.io/jq/)（フックスクリプトで使用）

### 1. 依存関係のインストール

```bash
bun install
```

### 2. 環境設定

```bash
cp .env.example .env
```

`.env` ファイルには最低限以下の設定が必要です:

```
PORT=4001
```

バックエンドサーバー、Vite プロキシ、フックスクリプトはすべてポート **4001** を前提としています。この設定がない場合、サーバーはデフォルトのポート 4000 で起動し、接続に失敗します。

### 3. Claude Code フックのインストール

```bash
./scripts/install.sh
```

フックスクリプトが `~/.claude/settings.json` に登録されます。設定内容のプレビュー:

```bash
./scripts/generate-settings.sh
```

### 4. 開発サーバーの起動

```bash
# バックエンドとフロントエンドを同時に起動
bun run dev

# 個別に起動する場合
bun run dev:server   # バックエンド :4001
bun run dev:web      # フロントエンド :5173
```

### 5. Claude Code セッションの開始

任意のプロジェクトディレクトリで Claude Code を通常通り起動してください。フックがイベントを収集し、`http://localhost:5173` のダッシュボードに表示されます。

## 機能

### Web ダッシュボード

- **セッション一覧**: アクティブ・完了済みセッションをリアルタイムで表示（リポジトリ別グループ化）
- **イベントタイムライン**: ツール呼び出し、通知、ライフサイクルイベントを時系列で表示
- **承認システム**: ツール実行の承認/拒否を実行前に制御
- **指示送信**: 実行中のセッションに指示を送信
- **新規タスク**: ダッシュボードから新しい Claude Code タスクを開始
- **コンテキスト引き継ぎ**: セッション分裂時にプラン内容やタスク説明を自動で新セッションに引き継ぎ

### Mac バナー通知（オプション）

ブラウザを閉じていても、セッションが `waiting_input` や `completed` に遷移した際に macOS ネイティブのバナー通知を表示できます。通知をクリックすると Cursor/VSCode でプロジェクトを開きます。

**セットアップ:**

```bash
# terminal-notifier のインストール（推奨、クリックでエディタを開く機能が有効になる）
brew install terminal-notifier
```

`terminal-notifier` 未インストールの場合は `osascript` にフォールバックします（バナー表示のみ、クリックアクションなし）。

**有効化:** Web UI の Settings で "Mac banner notifications" を ON にしてください。設定はサーバー側の SQLite に保存されるため、ブラウザを閉じても保持されます。

### 承認ルール

ツール実行の承認制御ルールを設定できます:

```bash
# すべての Bash コマンドに承認を要求
curl -X POST http://localhost:4001/api/rules \
  -H "Content-Type: application/json" \
  -d '{"tool_pattern": "Bash", "action": "require_approval", "description": "Require approval for shell commands"}'

# Read ツールを自動承認
curl -X POST http://localhost:4001/api/rules \
  -H "Content-Type: application/json" \
  -d '{"tool_pattern": "Read", "action": "auto_approve"}'

# 破壊的コマンドを自動拒否
curl -X POST http://localhost:4001/api/rules \
  -H "Content-Type: application/json" \
  -d '{"tool_pattern": "Bash", "input_pattern": "rm -rf|DROP TABLE", "action": "auto_deny"}'
```

#### 永続性とサーバー未起動時の動作

**ルールは永続的です。** 承認ルールは SQLite データベースに保存されるため、サーバーを再起動してもルールは保持されます。

**サーバーが起動していない場合、すべてのツール実行は自動的に許可されます。** フックスクリプトはサーバーへの接続に失敗すると `exit 0`（許可）を返すため、ClaudeMonitor はあくまでオプションの監視レイヤーとして動作します。承認制御を有効にするには、サーバーが起動している必要があります。

| 状態 | 動作 |
|------|------|
| サーバー起動中 + ルールあり | ルールに基づいて承認制御が適用される |
| サーバー起動中 + ルールなし | すべてのツール実行が許可される |
| サーバー未起動 | すべてのツール実行が許可される（graceful degradation） |

## プロジェクト構成

```
ClaudeMonitor/
├── packages/shared/src/        # 共有 TypeScript 型定義
├── apps/
│   ├── server/src/             # Hono バックエンド (SQLite, WebSocket, REST API)
│   ├── web/src/                # React フロントエンド (Vite, Tailwind, Zustand)
│   └── slack/src/              # Slack Bot (@slack/bolt, Socket Mode)
├── hooks/                      # Claude Code フックスクリプト
└── scripts/                    # セットアップ・インストールスクリプト
```

## トラブルシューティング

### ビルドがハングする / Vite build が応答しない

**症状**: `bun run build` や `vite build` が無限に待機し、完了しない。

**原因**: 過去のビルドやdevサーバーのクラッシュ等により、esbuild のゾンビプロセスがシステムに残留し、新しいesbuildプロセスがリソースを確保できなくなる。特に macOS では `UE`（Uninterruptible Exit）ステートのプロセスが `kill -9` でも停止できないことがある。

**確認方法**:

```bash
# ゾンビ化したesbuild/vite/turboプロセスの確認
ps aux | grep -E 'esbuild|vite|turbo' | grep -v grep
```

**解決方法**:

```bash
# 1. 停止可能なプロセスを終了
pkill -f 'esbuild.*--service' 2>/dev/null
pkill -f 'turbo.*daemon' 2>/dev/null

# 2. node_modules とキャッシュを完全削除
rm -rf node_modules apps/server/node_modules apps/web/node_modules apps/slack/node_modules .turbo bun.lockb

# 3. 依存関係を再インストール
bun install

# 4. ビルド実行
bun run build
```

UE ステートのプロセスが残っている場合でも、node_modules を再インストールすれば新しいesbuildバイナリが使われるため、ビルドは成功します。UE プロセス自体は OS 再起動で消えます。

**予防策**:
- dev サーバーは `Ctrl+C` で正常終了させる（ターミナルを直接閉じない）
- ビルドがハングした場合は、プロセス確認を最初に行う
- CI/CD 環境では各ビルド前に `rm -rf node_modules && bun install` をクリーンステップとして入れることを推奨

## 既知の制限事項

### プラン承認後のセッション分裂

**症状**: ExitPlanMode（プラン承認待ち）でユーザーが承認した後、ダッシュボードにセッションが2つ表示されることがある。

**原因**: Claude Code がプラン承認後に内部的に新しいセッションIDで処理を再開することがある。これは Claude Code 側の動作であり、ClaudeMonitor からは制御できない。session_id は Claude Code が生成・管理しており、フックスクリプトはそれを受動的に受け取る。

**対処（自動）**: ClaudeMonitor は新しいセッション開始時に、同じディレクトリで直近（3分以内）にプランや質問を表示していた旧セッションを自動検出し、コンテキスト（プラン内容・タスク説明）を新セッションに引き継ぐ。旧セッションは自動的に completed に遷移する。

**マージしない理由**: 同じディレクトリの別作業を誤って統合するリスクを避けるため、セッション自体の統合は行わず、コンテキストの引き継ぎのみを行う設計としている。旧セッションは2時間後に自動削除される。

## Slack 連携（オプション）

Slack からセッション管理や承認操作を行えます。

### セットアップ

1. Socket Mode を有効にした Slack アプリを作成
2. Bot Token スコープを追加: `chat:write`, `commands`
3. スラッシュコマンドを作成: `/claude-sessions`, `/claude-status`, `/claude-send`, `/claude-start`
4. 環境変数を設定:

```bash
cp .env.example .env
# .env に Slack トークンを記入
```

5. Slack Bot を起動:

```bash
bun run dev:slack
```

### スラッシュコマンド

- `/claude-sessions [status]` - セッション一覧（ステータスでフィルタ可能）
- `/claude-status <session_id>` - セッション詳細を表示
- `/claude-send <session_id> <instruction>` - セッションに指示を送信
- `/claude-start <cwd> <instruction>` - 新規タスクを開始

### インタラクティブ操作

- 承認リクエストの承認/拒否ボタン
- セッション詳細のコンテキスト表示

## API エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/sessions` | セッション一覧 |
| GET | `/api/sessions/:id` | セッション取得 |
| GET | `/api/sessions/:id/events` | セッションイベント取得 |
| POST | `/api/events` | フックイベント受信 |
| GET | `/api/approvals` | 承認一覧 |
| GET | `/api/approvals/:id` | 承認取得（ポーリング） |
| PUT | `/api/approvals/:id` | 承認/拒否 |
| GET | `/api/rules` | 承認ルール一覧 |
| POST | `/api/rules` | ルール作成 |
| PUT | `/api/rules/:id` | ルール更新 |
| DELETE | `/api/rules/:id` | ルール削除 |
| POST | `/api/sessions/:id/send` | 指示送信 |
| POST | `/api/tasks` | 新規タスク開始 |
| GET | `/api/settings` | サーバー設定取得 |
| PUT | `/api/settings` | サーバー設定更新 |
| WS | `/ws` | リアルタイムイベント用 WebSocket |

## 技術スタック

| コンポーネント | 技術 |
|----------------|------|
| ランタイム | Bun |
| バックエンド | Hono |
| データベース | SQLite (bun:sqlite, WAL mode) |
| フロントエンド | React 19 + Vite + Tailwind CSS 4 |
| 状態管理 | Zustand |
| Slack | @slack/bolt (Socket Mode) |
| モノレポ | Turborepo + Bun workspaces |
