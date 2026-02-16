#!/usr/bin/env bash
# ClaudeMonitor ワンコマンドセットアップスクリプト
# 使い方: curl -fsSL https://raw.githubusercontent.com/dan-soncillan/claude-monitor/main/scripts/quick-setup.sh | bash
set -euo pipefail

REPO_URL="https://github.com/dan-soncillan/claude-monitor.git"
INSTALL_DIR="$HOME/claude-monitor"
PORT=4001

echo "================================================"
echo "  ClaudeMonitor セットアップ"
echo "================================================"
echo ""

# Bunのインストールチェック
if ! command -v bun &> /dev/null; then
  echo "📦 Bunをインストールしています..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo "✅ Bunのインストール完了"
else
  echo "✅ Bun はインストール済みです"
fi

# jqのインストールチェック（macOS限定）
if [[ "$OSTYPE" == "darwin"* ]]; then
  if ! command -v jq &> /dev/null; then
    echo "📦 jqをインストールしています..."
    if command -v brew &> /dev/null; then
      brew install jq
      echo "✅ jqのインストール完了"
    else
      echo "⚠️  jqがインストールされていません。Homebrewをインストールしてから再実行してください。"
      echo "   Homebrew: https://brew.sh"
      exit 1
    fi
  else
    echo "✅ jq はインストール済みです"
  fi
fi

# リポジトリのクローン
if [ -d "$INSTALL_DIR" ]; then
  echo "✅ $INSTALL_DIR は既に存在します"
  cd "$INSTALL_DIR"
  echo "📥 最新版に更新しています..."
  git pull --quiet
else
  echo "📥 リポジトリをクローンしています..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "✅ リポジトリの準備完了"

# 依存関係のインストール
echo "📦 依存関係をインストールしています..."
PATH="$HOME/.bun/bin:$PATH" bun install --silent

echo "✅ 依存関係のインストール完了"

# .envファイルの作成
if [ ! -f .env ]; then
  echo "⚙️  .envファイルを作成しています..."
  cp .env.example .env
  echo "✅ .envファイル作成完了"
else
  echo "✅ .envファイルは既に存在します"
fi

# フックのインストール
echo "🔗 Claude Code フックをインストールしています..."
./scripts/install.sh

echo ""
echo "================================================"
echo "  セットアップ完了！"
echo "================================================"
echo ""
echo "サーバーを起動するには:"
echo "  cd $INSTALL_DIR"
echo "  PATH=\"\$HOME/.bun/bin:\$PATH\" bun run dev"
echo ""
echo "または、以下のコマンドでサーバーを起動してブラウザを開きます:"
echo "  cd $INSTALL_DIR && PATH=\"\$HOME/.bun/bin:\$PATH\" bun run dev &"
echo "  sleep 3 && open http://localhost:5173"
echo ""
echo "ブラウザでダッシュボードを開いたら、右上の「インストール」ボタンをクリックして"
echo "PWAとしてインストールできます。"
echo ""
