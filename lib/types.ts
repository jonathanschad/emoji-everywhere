export interface EmojiMap {
  [name: string]: string;
}

export interface EmojiOverrideProfile {
  disabled: boolean;
  name: string | null;
  aliases: string[];
  nativeEmojis: string[];
}

export interface EmojiOverrideRule {
  id: string;
  hostname: string;
  pathname: string | null;
  override: EmojiOverrideProfile;
}

export interface EmojiOverride {
  default: EmojiOverrideProfile;
  rules: EmojiOverrideRule[];
}

export interface EmojiOverridesBySource {
  [sourceId: string]: {
    [emojiName: string]: EmojiOverride;
  };
}

export interface EffectiveEmojiEntry {
  sourceId: string;
  originalName: string;
  primaryName: string;
  aliases: string[];
  nativeEmojis: string[];
  enabled: boolean;
  ref: string;
  override: EmojiOverride;
}

export type SourceDomainFilterMode = "allow" | "deny";

export interface SourceDomainFilter {
  mode: SourceDomainFilterMode;
  domains: string[];
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
  domainFilter: SourceDomainFilter;
  lastRefresh: number | null;
  error: string | null;
}

export interface ZipSource {
  type: "zip";
  id: string;
  name: string;
  emojis: EmojiMap;
  domainFilter: SourceDomainFilter;
  addedAt: number;
}

export type EmojiSource = SlackSource | ZipSource;

export interface SourceSummary {
  id: string;
  type: EmojiSource["type"];
  name: string;
  emojiCount: number;
  effectiveEmojiCount: number;
  domainFilter: SourceDomainFilter;
  lastRefresh: number | null;
  error: string | null;
}

export interface DuplicateEmojiInfo {
  name: string;
  sourceNames: string[];
}

export interface ExtensionStatus {
  sources: SourceSummary[];
  totalEmojiCount: number;
  duplicateCount: number;
  duplicateEmojis: DuplicateEmojiInfo[];
}

export type MessageType =
  | { type: "START_OAUTH" }
  | { type: "FETCH_EMOJIS"; sourceId: string }
  | { type: "FETCH_ALL_EMOJIS" }
  | { type: "GET_STATUS" }
  | { type: "REORDER_SOURCES"; sourceIds: string[] }
  | { type: "REMOVE_SOURCE"; sourceId: string }
  | { type: "RENAME_SOURCE"; sourceId: string; name: string }
  | {
    type: "UPDATE_EMOJI_OVERRIDE";
    sourceId: string;
    emojiName: string;
    override: Partial<EmojiOverride>;
  }
  | {
    type: "UPDATE_SOURCE_DOMAIN_FILTER";
    sourceId: string;
    domainFilter: SourceDomainFilter;
  }
  | { type: "STATUS_RESPONSE"; status: ExtensionStatus }
  | { type: "OAUTH_COMPLETE"; success: boolean; error?: string }
  | { type: "EMOJIS_UPDATED" }
  | { type: "ADD_EXCLUDED_DOMAIN"; domain: string }
  | { type: "REMOVE_EXCLUDED_DOMAIN"; domain: string }
  | { type: "GET_EXCLUDED_DOMAINS" }
  | { type: "REFRESH_IF_STALE" };

export const EMOJI_REF_PREFIX = "ref:";

export const DEFAULT_SOURCE_DOMAIN_FILTER: SourceDomainFilter = {
  mode: "deny",
  domains: [],
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  emojiSize: 20,
  slackClientId: "",
};
