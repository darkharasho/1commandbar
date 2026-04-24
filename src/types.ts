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

export interface UrlRef {
  href: string;
  primary: boolean;
}

export interface ItemField {
  id: string;
  label: string;
  type: string;
  purpose: string;
  value: string | null;
  totp: string | null;
}

export interface ItemDetail {
  id: string;
  title: string;
  category: string;
  vault: { id: string; name: string };
  urls: UrlRef[];
  fields: ItemField[];
}

export interface AppConfig {
  clipboard_timeout_secs: number;
  hotkey: string;
  vault_filter: string[];
  recents_max: number;
  cache_ttl_secs: number;
  onboarded: boolean;
}
