export interface SearchResult {
  id: string;
  title: string;
  username: string;
  vault: string;
  url: string | null;
  category: string;
  score: number;
}

export type CopyField = "password" | "username" | "totp";

export interface AppConfig {
  clipboard_timeout_secs: number;
  hotkey: string;
  vault_filter: string[];
  recents_max: number;
  cache_ttl_secs: number;
  onboarded: boolean;
}
