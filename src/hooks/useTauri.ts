import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, CopyField, ItemDetail, SearchResult } from "../types";

export const api = {
  search: (query: string) => invoke<SearchResult[]>("search", { query }),
  getRecents: () => invoke<SearchResult[]>("get_recents"),
  refreshCache: () => invoke<void>("refresh_cache"),
  copyField: (itemId: string, field: CopyField) =>
    invoke<void>("copy_field", { itemId, field }),
  openIn1Password: (itemId: string) =>
    invoke<void>("open_in_1password", { itemId }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  hideWindow: () => invoke<void>("hide_window"),
  getItemDetail: (itemId: string) =>
    invoke<ItemDetail>("get_item_detail", { itemId }),
  resizeWindow: (height: number) =>
    invoke<void>("resize_window", { height }),
  getConfig: () => invoke<AppConfig>("get_config"),
  getAutostartEnabled: () => invoke<boolean>("get_autostart_enabled"),
  setAutostartEnabled: (enabled: boolean) =>
    invoke<void>("set_autostart_enabled", { enabled }),
  setClipboardTimeout: (secs: number) =>
    invoke<void>("set_clipboard_timeout", { secs }),
  signin: () => invoke<void>("signin"),
  restartClean: () => invoke<void>("restart_clean"),
};
