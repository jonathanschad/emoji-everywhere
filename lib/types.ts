export interface EmojiMap {
  [name: string]: string;
}

export interface Settings {
  enabled: boolean;
  emojiSize: number;
  slackClientId: string;
}

export interface SlackSource {
  type: "slack";
  id: string;
  name: string;
  teamName: string | null;
  token: string;
  emojis: EmojiMap;
  lastRefresh: number | null;
  error: string | null;
}

export interface ZipSource {
  type: "zip";
  id: string;
  name: string;
  emojis: EmojiMap;
  addedAt: number;
}

export type EmojiSource = SlackSource | ZipSource;

export interface SourceSummary {
  id: string;
  type: EmojiSource["type"];
  name: string;
  emojiCount: number;
  lastRefresh: number | null;
  error: string | null;
}

export interface ExtensionStatus {
  sources: SourceSummary[];
  totalEmojiCount: number;
  duplicateCount: number;
}

export type MessageType =
  | { type: "START_OAUTH" }
  | { type: "FETCH_EMOJIS"; sourceId: string }
  | { type: "FETCH_ALL_EMOJIS" }
  | { type: "GET_STATUS" }
  | { type: "REMOVE_SOURCE"; sourceId: string }
  | { type: "RENAME_SOURCE"; sourceId: string; name: string }
  | { type: "STATUS_RESPONSE"; status: ExtensionStatus }
  | { type: "OAUTH_COMPLETE"; success: boolean; error?: string }
  | { type: "EMOJIS_UPDATED" }
  | { type: "ADD_EXCLUDED_DOMAIN"; domain: string }
  | { type: "REMOVE_EXCLUDED_DOMAIN"; domain: string }
  | { type: "GET_EXCLUDED_DOMAINS" }
  | { type: "REFRESH_IF_STALE" };

export const EMOJI_REF_PREFIX = "ref:";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  emojiSize: 20,
  slackClientId: "",
};
