export interface EmojiMap {
  [name: string]: string;
}

export interface Settings {
  refreshInterval: number;
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
  | { type: "IMPORT_ZIP"; name: string; emojis: EmojiMap }
  | { type: "STATUS_RESPONSE"; status: ExtensionStatus }
  | { type: "OAUTH_COMPLETE"; success: boolean; error?: string }
  | { type: "EMOJIS_UPDATED" };

export const EMOJI_REF_PREFIX = "ref:";

export const DEFAULT_SETTINGS: Settings = {
  refreshInterval: 30,
  enabled: true,
  emojiSize: 20,
  slackClientId: "",
};
