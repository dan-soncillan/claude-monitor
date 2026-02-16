import { useSettingsStore, type EditorType } from "../stores/settingsStore";

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const editor = useSettingsStore((s) => s.editor);
  const autoOpen = useSettingsStore((s) => s.autoOpenEditorOnWaitingInput);
  const autoOpenOnClick = useSettingsStore((s) => s.autoOpenEditorOnClick);
  const macNotifications = useSettingsStore((s) => s.macNotifications);
  const macNotificationSound = useSettingsStore((s) => s.macNotificationSound);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const editors: { value: EditorType; label: string }[] = [
    { value: "cursor", label: "Cursor" },
    { value: "vscode", label: "VSCode" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-200">Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-5">
          {/* Editor selection */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Editor
            </label>
            <div className="flex gap-2">
              {editors.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setSetting("editor", e.value)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    editor === e.value
                      ? "bg-blue-950/40 border-blue-600 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-open toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Auto-open on waiting input
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically open the editor when clicking a waiting_input session
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoOpen}
                onClick={() => setSetting("autoOpenEditorOnWaitingInput", !autoOpen)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                  autoOpen ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    autoOpen ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Auto-open on all states toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Auto-open on other states
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Open the editor when clicking sessions in non-waiting states (running, idle, etc.)
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoOpenOnClick}
                onClick={() => setSetting("autoOpenEditorOnClick", !autoOpenOnClick)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                  autoOpenOnClick ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    autoOpenOnClick ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mac banner notifications toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Mac banner notifications
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  macOSのバナー通知を表示（ブラウザを閉じていても動作）
                </p>
              </div>
              <button
                role="switch"
                aria-checked={macNotifications}
                onClick={() => setSetting("macNotifications", !macNotifications)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                  macNotifications ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    macNotifications ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mac notification sound toggle */}
          {macNotifications && (
            <div className="pl-4 border-l-2 border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Notification sound
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    通知時にサウンドを再生する
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={macNotificationSound}
                  onClick={() => setSetting("macNotificationSound", !macNotificationSound)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                    macNotificationSound ? "bg-blue-600" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                      macNotificationSound ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
