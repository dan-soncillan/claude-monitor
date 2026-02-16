import { useSettingsStore, type EditorType } from "../stores/settingsStore";
import type { TerminalInfo } from "@claude-monitor/shared";

interface EditorLinkProps {
  cwd: string;
  terminalInfo?: TerminalInfo | null;
}

export function EditorLink({ cwd, terminalInfo }: EditorLinkProps) {
  const editor = useSettingsStore((s) => s.editor);
  const setSetting = useSettingsStore((s) => s.setSetting);
  if (!cwd) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: EditorType = editor === "cursor" ? "vscode" : editor === "vscode" ? "terminal" : "cursor";
    setSetting("editor", next);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Generate label and URL based on editor type
  let label = "Cursor";
  let url = "";
  let title = "Open in Cursor";

  if (editor === "cursor") {
    url = `cursor://file${cwd}`;
    label = "Cursor";
    title = "Open in Cursor";
  } else if (editor === "vscode") {
    url = `vscode://file${cwd}`;
    label = "VSCode";
    title = "Open in VSCode";
  } else if (editor === "terminal" && terminalInfo) {
    // For terminal, generate reconnection command
    const cmd = generateTerminalReconnectCommand(terminalInfo);
    label = "Terminal";
    title = cmd ? "Copy reconnect command" : "Terminal info not available";
    url = ""; // No URL for terminal mode; we'll use copy functionality
  } else if (editor === "terminal") {
    label = "Terminal";
    title = "Terminal not detected";
    url = "";
  }

  const handleTerminalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editor === "terminal") {
      if (terminalInfo) {
        const cmd = generateTerminalReconnectCommand(terminalInfo);
        if (cmd) {
          navigator.clipboard.writeText(cmd)
            .then(() => {
              // Show brief visual feedback
              const btn = e.currentTarget as HTMLButtonElement;
              const original = btn.textContent;
              btn.textContent = "Copied!";
              setTimeout(() => { btn.textContent = original; }, 2000);
            })
            .catch(console.error);
        }
      } else {
        // Terminal info not available - show alert to user
        alert("Terminal session info not available. This session may not have started in tmux or screen.");
      }
    }
  };

  return (
    <span className="flex items-center gap-1 shrink-0">
      {editor === "terminal" ? (
        <button
          onClick={handleTerminalClick}
          className="text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 border border-emerald-900/30 rounded px-1.5 py-0.5 transition-colors cursor-pointer active:text-emerald-200 active:bg-emerald-900/50"
          title={title}
        >
          {label}
        </button>
      ) : (
        <a
          href={url}
          onClick={handleClick}
          className="text-[11px] text-blue-400 hover:text-blue-300 bg-blue-950/30 border border-blue-900/30 rounded px-1.5 py-0.5 transition-colors"
          title={title}
        >
          {label}
        </a>
      )}
      <button
        onClick={toggle}
        className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
        title={`Switch to ${editor === "cursor" ? "VSCode" : editor === "vscode" ? "Terminal" : "Cursor"}`}
      >
        &#8644;
      </button>
    </span>
  );
}

/**
 * Generate terminal reconnection command based on terminal multiplexer type
 */
function generateTerminalReconnectCommand(terminalInfo: TerminalInfo | null | undefined): string {
  if (!terminalInfo) return "";

  switch (terminalInfo.type) {
    case "tmux":
      return `tmux attach -t ${terminalInfo.session_id}`;
    case "screen":
      return `screen -r ${terminalInfo.session_id}`;
    case "wezterm":
      // WezTerm doesn't have a direct session attach command in the same way
      return `# WezTerm session: ${terminalInfo.session_id}`;
    default:
      return "";
  }
}
