import { useSettingsStore, type EditorType } from "../stores/settingsStore";

export function EditorLink({ cwd }: { cwd: string }) {
  const editor = useSettingsStore((s) => s.editor);
  const setSetting = useSettingsStore((s) => s.setSetting);
  if (!cwd) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: EditorType = editor === "cursor" ? "vscode" : "cursor";
    setSetting("editor", next);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const url = `${editor}://file${cwd}`;
  const label = editor === "cursor" ? "Cursor" : "VSCode";

  return (
    <span className="flex items-center gap-1 shrink-0">
      <a
        href={url}
        onClick={handleClick}
        className="text-[11px] text-blue-400 hover:text-blue-300 bg-blue-950/30 border border-blue-900/30 rounded px-1.5 py-0.5 transition-colors"
        title={`Open in ${label}`}
      >
        {label}
      </a>
      <button
        onClick={toggle}
        className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
        title={`Switch to ${editor === "cursor" ? "VSCode" : "Cursor"}`}
      >
        &#8644;
      </button>
    </span>
  );
}
