# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
bun install                    # Install all dependencies
bun run dev                    # Start all apps (server + web) via Turborepo
bun run dev:server             # Backend only (Hono on :4001)
bun run dev:web                # Frontend only (Vite on :5173)
bun run dev:slack              # Slack bot only
bun run build                  # Build all packages (turborepo)
bun run lint                   # TypeScript type-check all packages
```

No test suite exists yet. Verify changes by building (`bun run build`) and checking the web UI manually.

## Architecture

Monorepo (Bun workspaces + Turborepo) with three apps and a shared types package:

```
Claude Code hooks (bash) → POST /api/events → Hono backend (Bun + SQLite WAL)
                                                  ├── WebSocket broadcast → React UI (Zustand stores)
                                                  └── WebSocket broadcast → Slack bot (@slack/bolt)
```

**Event flow**: Hook scripts in `hooks/` fire on Claude Code lifecycle events, POST JSON to the backend, which stores in SQLite, evaluates approval rules, and broadcasts via WebSocket to all connected clients.

**Approval system**: `pre-tool-use.sh` sends tool info → backend matches against regex rules in `approval_rules` table → hook polls `/api/approvals/:id` (1s interval, 10min timeout) → exit 0 (approved) or exit 2 (rejected).

**Session lifecycle**: `session_start` → idle, `user_prompt` → running, `stop(end_turn)` → completed (kept in DB for 2 hours), `stop(tool_use)` → no change, `session_end` → completed. Events arriving before `session_start` auto-create the session. Cleanup job deletes completed sessions after 2 hours and marks stale running sessions as completed after 15 minutes.

**Stop hook transcript reading**: `hooks/stop.sh` reads the Claude Code transcript JSONL file (`transcript_path` from hook input) to extract the last assistant response text, which is displayed in the timeline.

## Key Packages

| Path | Tech | Purpose |
|------|------|---------|
| `packages/shared/src/types/` | TypeScript | Session, Event, Approval, WS message types shared across all apps |
| `apps/server/src/` | Hono + bun:sqlite | REST API, WebSocket broadcaster, approval engine |
| `apps/web/src/` | React 19 + Vite + Tailwind 4 + Zustand | Dashboard UI with real-time updates |
| `apps/slack/src/` | @slack/bolt (Socket Mode) | Slash commands and interactive approval buttons |
| `hooks/` | Bash + jq + curl | Claude Code hook scripts, `common.sh` has shared helpers |

## Server Internals

- **DB singleton**: `apps/server/src/db/client.ts` — lazy-initialized SQLite with WAL mode
- **Schema**: `apps/server/src/db/schema.ts` — tables: sessions, events, approvals, approval_rules (auto-created on startup)
- **Approval engine**: `apps/server/src/services/approval-engine.ts` — regex matching on tool_name + tool_input
- **WebSocket**: `apps/server/src/ws/broadcaster.ts` — maintains client set, broadcast to all on state changes
- **Session cleanup**: `apps/server/src/routes/sessions.ts` — `cleanupStaleSessions()` deletes ghost sessions (30min) and old completed sessions (2h), must delete events/approvals before sessions (foreign keys)
- **System tag stripping**: `apps/server/src/routes/events.ts` — `stripSystemTags()` removes `<system-reminder>`, `<task-notification>` XML from prompts before storing

## Frontend Patterns

- **Zustand stores**: `sessionStore` (sessions + selection), `eventStore` (events for selected session, deduped by ID), `approvalStore` (pending approvals)
- **WebSocket hook**: `useWebSocket.ts` — auto-reconnects every 3s, filters `event_created` to only add for selected session
- **EventTimeline**: Groups consecutive pre/post tool events into collapsible blocks using FIFO stack matching. Displays prompt, tools, notification, assistant response, and system blocks.
- **Session merge**: `setSessions` uses Map-based merge (not overwrite) to preserve existing sessions during WebSocket initial sync

## Hook Scripts

All hooks source `hooks/common.sh` which provides `read_input`, `get_session_id`, and `send_event` helpers. The `CLAUDE_MONITOR_URL` env var (default: `http://localhost:4001`) must be set in the shell where Claude Code runs.

Hook registration: `./scripts/install.sh` writes entries to `~/.claude/settings.json`.

## Build Performance & Troubleshooting

フルビルド正常時は **1-2秒**。webパッケージ(`tsc -b && vite build`)が律速。サーバーのみの変更時は `bun build apps/server/src/index.ts --outdir apps/server/dist --target bun`（~10ms）が最速。

ビルドハング・メモリリーク・プロセスリークの詳細な対処手順は **`/build-troubleshoot`** スキルを参照。

## Environment

Copy `.env.example` to `.env`. Current dev port is **4001** (not default 4000). The `CLAUDE_MONITOR_URL` in `hooks/common.sh` defaults to `http://localhost:4001`.
