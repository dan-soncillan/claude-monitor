import { create } from "zustand";
import { api } from "../hooks/useApi";

export type EditorType = "cursor" | "vscode" | "terminal";
export type CurrencyType = "usd" | "jpy";

interface Settings {
  editor: EditorType;
  autoOpenEditorOnWaitingInput: boolean;
  autoOpenEditorOnClick: boolean;
  macNotifications: boolean;
  macNotificationSound: boolean;
  currency: CurrencyType;
}

interface SettingsState extends Settings {
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  loadServerSettings: () => Promise<void>;
}

const STORAGE_KEY = "claude-monitor-settings";
const LEGACY_EDITOR_KEY = "claude-monitor-editor";

/** Keys that are synced to the server */
const SERVER_KEYS = new Set<keyof Settings>(["macNotifications", "macNotificationSound", "editor"]);

function loadSettings(): Settings {
  const defaults: Settings = {
    editor: "cursor",
    autoOpenEditorOnWaitingInput: false,
    autoOpenEditorOnClick: false,
    macNotifications: false,
    macNotificationSound: true,
    currency: "usd",
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }

  // Fallback: migrate from legacy editor key
  try {
    const legacy = localStorage.getItem(LEGACY_EDITOR_KEY) as EditorType | null;
    if (legacy) {
      defaults.editor = legacy;
      localStorage.removeItem(LEGACY_EDITOR_KEY);
    }
  } catch { /* ignore */ }

  return defaults;
}

function persistSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadSettings(),
  setSetting: (key, value) =>
    set((state) => {
      const next: Settings = {
        editor: state.editor,
        autoOpenEditorOnWaitingInput: state.autoOpenEditorOnWaitingInput,
        autoOpenEditorOnClick: state.autoOpenEditorOnClick,
        macNotifications: state.macNotifications,
        macNotificationSound: state.macNotificationSound,
        currency: state.currency,
        [key]: value,
      };
      persistSettings(next);
      // Sync server-side settings
      if (SERVER_KEYS.has(key)) {
        api.updateServerSettings({ [key]: value }).catch(console.error);
      }
      return { [key]: value };
    }),
  loadServerSettings: async () => {
    try {
      const serverSettings = await api.getServerSettings();
      set((state) => {
        const next: Settings = {
          editor: state.editor,
          autoOpenEditorOnWaitingInput: state.autoOpenEditorOnWaitingInput,
          autoOpenEditorOnClick: state.autoOpenEditorOnClick,
          currency: state.currency,
          macNotifications: serverSettings.macNotifications ?? false,
          macNotificationSound: serverSettings.macNotificationSound ?? true,
          // Server editor setting takes precedence
          ...(serverSettings.editor ? { editor: serverSettings.editor } : {}),
        };
        persistSettings(next);
        return { macNotifications: next.macNotifications, macNotificationSound: next.macNotificationSound, editor: next.editor };
      });
    } catch (err) {
      console.error("[Settings] Failed to load server settings:", err);
    }
  },
}));
