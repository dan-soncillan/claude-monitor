import { getSetting } from "./settings";
import type { Session, SessionStatus } from "@claude-monitor/shared";

let hasTerminalNotifier: boolean | null = null;

/** Check once whether terminal-notifier is available */
async function checkTerminalNotifier(): Promise<boolean> {
  if (hasTerminalNotifier !== null) return hasTerminalNotifier;
  try {
    const proc = Bun.spawn(["which", "terminal-notifier"], { stdout: "ignore", stderr: "ignore" });
    const code = await proc.exited;
    hasTerminalNotifier = code === 0;
  } catch {
    hasTerminalNotifier = false;
  }
  return hasTerminalNotifier;
}

/** Extract the last directory name from a cwd path */
function cwdDirName(cwd: string): string {
  if (!cwd) return "Claude Code";
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "Claude Code";
}

/** Build the editor URL for click-to-open */
function buildEditorUrl(cwd: string, editor: "cursor" | "vscode"): string {
  const scheme = editor === "cursor" ? "cursor" : "vscode";
  return `${scheme}://file${cwd}`;
}

/** Send a macOS native banner notification */
export async function sendMacNotification(
  session: Session,
  newStatus: "waiting_input" | "completed"
): Promise<void> {
  if (process.platform !== "darwin") return;
  if (!getSetting("macNotifications")) return;
  if (!session.task_description) return;

  const dirName = cwdDirName(session.cwd);
  const message = newStatus === "waiting_input"
    ? "入力を待っています"
    : "セッションが完了しました";

  const useTerminalNotifier = await checkTerminalNotifier();
  const editor = getSetting("editor");
  const playSound = getSetting("macNotificationSound");

  if (useTerminalNotifier) {
    const args = [
      "terminal-notifier",
      "-title", "ClaudeMonitor",
      "-subtitle", dirName,
      "-message", message,
      "-group", `claude-monitor-${session.id}-${Date.now()}`,
      ...(playSound ? ["-sound", "default"] : []),
      "-open", buildEditorUrl(session.cwd, editor),
    ];
    try {
      const proc = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
      await proc.exited;
    } catch (err) {
      console.error("[MacNotifier] terminal-notifier error:", err);
    }
  } else {
    // Fallback: osascript (no click action)
    const escapedMessage = message.replace(/"/g, '\\"');
    const escapedTitle = "ClaudeMonitor";
    const escapedSubtitle = dirName.replace(/"/g, '\\"');
    const script = playSound
      ? `display notification "${escapedMessage}" with title "${escapedTitle}" subtitle "${escapedSubtitle}" sound name "default"`
      : `display notification "${escapedMessage}" with title "${escapedTitle}" subtitle "${escapedSubtitle}"`;
    try {
      const proc = Bun.spawn(["osascript", "-e", script], { stdout: "ignore", stderr: "ignore" });
      await proc.exited;
    } catch (err) {
      console.error("[MacNotifier] osascript error:", err);
    }
  }
}
