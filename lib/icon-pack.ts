import type {
  EmojiOverride,
  EmojiOverrideProfile,
  EmojiOverrideRule,
  EmojiOverridesBySource,
  SourceDomainFilter,
} from "./types";
import { DEFAULT_SOURCE_DOMAIN_FILTER } from "./types";

export const ICON_PACK_CONFIG_FILE = "emoji-everywhere.config.json";

interface IconPackConfigEmojiRule extends Partial<EmojiOverrideRule> {}

interface IconPackConfigEmojiOverride extends Partial<EmojiOverrideProfile> {
  originalName?: string;
  default?: Partial<EmojiOverrideProfile>;
  rules?: IconPackConfigEmojiRule[];
}

export interface IconPackConfig {
  version: 1;
  source?: {
    name?: string;
    domainFilter?: SourceDomainFilter;
  };
  emojis?: Record<string, IconPackConfigEmojiOverride>;
}

export interface ImportedIconPackConfig {
  sourceName: string | null;
  domainFilter: SourceDomainFilter;
  overrides: EmojiOverridesBySource[string];
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^\.+/, "").replace(/\.+$/, "");
}

function normalizeDomainFilter(filter?: SourceDomainFilter | null): SourceDomainFilter {
  const mode = filter?.mode === "allow" ? "allow" : "deny";
  const domains = Array.isArray(filter?.domains)
    ? Array.from(new Set(filter.domains.map(normalizeDomain).filter(Boolean)))
    : [];

  return { mode, domains };
}

function normalizeEmojiName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function isValidEmojiName(name: string): boolean {
  return /^[\w+-]+$/.test(name);
}

function normalizeOverrideProfile(
  override?: Partial<EmojiOverrideProfile> | null,
): EmojiOverrideProfile {
  const name = override?.name == null ? null : normalizeEmojiName(override.name);
  const aliases = Array.isArray(override?.aliases)
    ? Array.from(
        new Set(
          override.aliases
            .map(normalizeEmojiName)
            .filter((alias) => alias.length > 0 && isValidEmojiName(alias)),
        ),
      )
    : [];
  const nativeEmojis = Array.isArray(override?.nativeEmojis)
    ? Array.from(
        new Set(
          override.nativeEmojis
            .map((emoji) => emoji.trim())
            .filter(Boolean),
        ),
      )
    : [];
  return {
    disabled: override?.disabled === true,
    name: name && isValidEmojiName(name) ? name : null,
    aliases,
    nativeEmojis,
  };
}

function normalizeRule(
  rule?: IconPackConfigEmojiRule | null,
  index = 0,
): EmojiOverrideRule | null {
  const hostname = typeof rule?.hostname === "string" ? normalizeDomain(rule.hostname) : "";
  if (!hostname) return null;

  return {
    id: typeof rule?.id === "string" && rule.id.trim()
      ? rule.id.trim()
      : `${hostname}:${typeof rule?.pathname === "string" ? normalizePathname(rule.pathname) : ""}:${index}`,
    hostname,
    pathname: typeof rule?.pathname === "string" && rule.pathname.trim()
      ? normalizePathname(rule.pathname)
      : null,
    override: normalizeOverrideProfile(rule?.override),
  };
}

function normalizeOverride(override?: IconPackConfigEmojiOverride | null): EmojiOverride {
  const hasModernShape = override != null && ("default" in override || "rules" in override);
  return {
    default: hasModernShape
      ? normalizeOverrideProfile(override.default)
      : normalizeOverrideProfile(override),
    rules: Array.isArray(override?.rules)
      ? override.rules
          .map((rule, index) => normalizeRule(rule, index))
          .filter((rule): rule is EmojiOverrideRule => rule != null)
      : [],
  };
}

function isDefaultOverrideProfile(override: EmojiOverrideProfile): boolean {
  return !override.disabled
    && override.name == null
    && override.aliases.length === 0
    && override.nativeEmojis.length === 0;
}

function isDefaultOverride(override: EmojiOverride): boolean {
  return isDefaultOverrideProfile(override.default)
    && override.rules.length === 0;
}

export function buildIconPackConfig(params: {
  sourceName: string;
  domainFilter: SourceDomainFilter;
  overrides?: EmojiOverridesBySource[string];
}): IconPackConfig {
  const emojis: IconPackConfig["emojis"] = {};

  for (const [emojiName, override] of Object.entries(params.overrides ?? {})) {
    const normalizedName = normalizeEmojiName(emojiName);
    if (!normalizedName || !isValidEmojiName(normalizedName)) continue;

    const normalizedOverride = normalizeOverride(override);
    if (isDefaultOverride(normalizedOverride)) continue;

    emojis[normalizedName] = normalizedOverride;
  }

  return {
    version: 1,
    source: {
      name: params.sourceName.trim() || undefined,
      domainFilter: normalizeDomainFilter(params.domainFilter),
    },
    emojis,
  };
}

export function parseIconPackConfig(
  raw: string,
  availableEmojiNames: string[],
): ImportedIconPackConfig {
  const parsed = JSON.parse(raw) as IconPackConfig;

  if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
    throw new Error("Unsupported icon pack config version");
  }

  const availableNames = new Set(
    availableEmojiNames
      .map(normalizeEmojiName)
      .filter((name) => name.length > 0 && isValidEmojiName(name)),
  );

  const overrides: EmojiOverridesBySource[string] = {};
  for (const [emojiName, override] of Object.entries(parsed.emojis ?? {})) {
    const normalizedName = normalizeEmojiName(emojiName);
    if (!availableNames.has(normalizedName)) continue;

    const normalizedOverride = normalizeOverride(override);
    if (isDefaultOverride(normalizedOverride)) continue;

    overrides[normalizedName] = normalizedOverride;
  }

  const sourceName = typeof parsed.source?.name === "string" && parsed.source.name.trim()
    ? parsed.source.name.trim()
    : null;

  return {
    sourceName,
    domainFilter: normalizeDomainFilter(parsed.source?.domainFilter ?? DEFAULT_SOURCE_DOMAIN_FILTER),
    overrides,
  };
}
