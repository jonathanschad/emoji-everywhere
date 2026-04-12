import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getSource,
  getEmojiOverrides,
  getEffectiveEmojiEntriesForSource,
  watchSources,
  watchEmojiOverrides,
} from "@/lib/storage";
import { searchEmojis } from "@/lib/emoji-search";
import { resolveImageUrl, TRANSPARENT_PIXEL } from "@/lib/emoji-image-resolver";
import type {
  EffectiveEmojiEntry,
  EmojiMap,
  EmojiOverride,
  EmojiOverrideProfile,
  EmojiOverrideRule,
} from "@/lib/types";

const BATCH_SIZE = 100;

interface Props {
  sourceId: string;
  onStatusChange: () => void | Promise<void>;
}

interface EmojiGridEntry extends EffectiveEmojiEntry {}

const DEFAULT_PROFILE: EmojiOverrideProfile = {
  disabled: false,
  name: null,
  aliases: [],
  nativeEmojis: [],
};

const DEFAULT_OVERRIDE: EmojiOverride = {
  default: DEFAULT_PROFILE,
  rules: [],
};

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^\.+/, "").replace(/\.+$/, "");
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function combineRuleLocation(hostname: string, pathname: string | null): string {
  const normalizedHostname = normalizeDomain(hostname);
  const normalizedPathname = pathname ? normalizePathname(pathname) : "";
  return `${normalizedHostname}${normalizedPathname === "/" ? "/" : normalizedPathname}`;
}

function parseRuleLocation(input: string): { hostname: string; pathname: string | null } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { hostname: "", pathname: null };
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return {
      hostname: normalizeDomain(parsed.hostname),
      pathname: parsed.pathname && parsed.pathname !== "/"
        ? normalizePathname(parsed.pathname)
        : null,
    };
  } catch {
    const slashIndex = trimmed.indexOf("/");
    const hostname = normalizeDomain(slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex));
    const pathname = slashIndex === -1
      ? null
      : normalizePathname(trimmed.slice(slashIndex));

    return {
      hostname,
      pathname: pathname || null,
    };
  }
}

function createEmptyProfile(): EmojiOverrideProfile {
  return {
    disabled: false,
    name: null,
    aliases: [],
    nativeEmojis: [],
  };
}

function cloneOverride(override: EmojiOverride): EmojiOverride {
  return {
    default: {
      ...override.default,
      aliases: [...override.default.aliases],
      nativeEmojis: [...override.default.nativeEmojis],
    },
    rules: override.rules.map((rule) => ({
      ...rule,
      override: {
        ...rule.override,
        aliases: [...rule.override.aliases],
        nativeEmojis: [...rule.override.nativeEmojis],
      },
    })),
  };
}

function buildRuleId(hostname: string, pathname: string, index: number): string {
  return `${hostname}:${pathname || ""}:${Date.now()}:${index}`;
}

function parseAliases(value: string): string[] {
  return value.split(",").map((alias) => alias.trim()).filter(Boolean);
}

function parseNativeEmojis(value: string): string[] {
  return value.split(/\s+/).map((emoji) => emoji.trim()).filter(Boolean);
}

export default function EmojiGrid({ sourceId, onStatusChange }: Props) {
  const [entries, setEntries] = useState<EmojiGridEntry[]>([]);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedEntry, setSelectedEntry] = useState<EmojiGridEntry | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadEntries = useCallback(async () => {
    const [source, overrides] = await Promise.all([
      getSource(sourceId),
      getEmojiOverrides(),
    ]);

    if (!source) {
      setEntries([]);
      setSelectedEntry(null);
      return;
    }

    const sourceOverrides = overrides[sourceId] ?? {};
    const nextEntries = getEffectiveEmojiEntriesForSource(source, overrides, {
      includeDisabled: true,
    }).map((entry) => ({
      ...entry,
      override: sourceOverrides[entry.originalName] ?? DEFAULT_OVERRIDE,
    }));

    nextEntries.sort((a, b) => a.primaryName.localeCompare(b.primaryName));
    setEntries(nextEntries);
    setSelectedEntry((current) =>
      current
        ? nextEntries.find((entry) => entry.originalName === current.originalName) ?? null
        : null,
    );
  }, [sourceId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const unwatchSources = watchSources((nextSources) => {
      if (nextSources.some((source) => source.id === sourceId)) {
        void loadEntries();
      }
    });
    const unwatchOverrides = watchEmojiOverrides(() => {
      void loadEntries();
    });

    return () => {
      unwatchSources();
      unwatchOverrides();
    };
  }, [loadEntries, sourceId]);

  const searchableMap = useMemo(() => {
    const map: EmojiMap = {};
    for (const entry of entries) {
      map[entry.primaryName] = entry.ref;
      for (const alias of entry.aliases) {
        map[alias] = entry.ref;
      }
    }
    return map;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!search) return entries;

    const matchedNames = new Set(
      searchEmojis(search, searchableMap).map((result) => result.name),
    );

    return entries.filter((entry) =>
      matchedNames.has(entry.primaryName)
      || entry.aliases.some((alias) => matchedNames.has(alias)),
    );
  }, [entries, search, searchableMap]);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    scrollRef.current?.scrollTo(0, 0);
  }, [search]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount],
  );

  const loadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + BATCH_SIZE, filteredEntries.length),
    );
  }, [filteredEntries.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (observedEntries) => {
        if (observedEntries[0].isIntersecting) loadMore();
      },
      { root: scrollRef.current, rootMargin: "100px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const saveOverride = useCallback(async (
    emojiName: string,
    override: EmojiOverride,
  ) => {
    setSavingName(emojiName);
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: "UPDATE_EMOJI_OVERRIDE",
        sourceId,
        emojiName,
        override,
      });

      if (!response?.success) {
        throw new Error(response?.error ?? "Failed to save emoji settings");
      }

      await loadEntries();
      await onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emoji settings");
    } finally {
      setSavingName(null);
    }
  }, [loadEntries, onStatusChange, sourceId]);

  if (entries.length === 0) {
    return (
      <div className="py-2 text-center text-xs text-gray-400">
        No emojis in this source
      </div>
    );
  }

  const hasMore = visibleCount < filteredEntries.length;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${entries.length} emojis...`}
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto p-1"
      >
        {visibleEntries.map((entry) => (
          <EmojiCell
            key={entry.originalName}
            entry={entry}
            onClick={() => setSelectedEntry(entry)}
          />
        ))}

        {hasMore && <div ref={sentinelRef} className="col-span-8 h-1" />}
      </div>

      {filteredEntries.length === 0 && search && (
        <p className="py-1 text-center text-xs text-gray-400">
          No emojis matching &ldquo;{search}&rdquo;
        </p>
      )}

      {selectedEntry && (
        <EmojiConfigModal
          entry={selectedEntry}
          saving={savingName === selectedEntry.originalName}
          onClose={() => setSelectedEntry(null)}
          onSave={saveOverride}
        />
      )}
    </div>
  );
}

function EmojiCell({
  entry,
  onClick,
}: {
  entry: EmojiGridEntry;
  onClick: () => void;
}) {
  const [src, setSrc] = useState(TRANSPARENT_PIXEL);

  useEffect(() => {
    let cancelled = false;
    resolveImageUrl(entry.ref).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.ref]);

  return (
    <button
      onClick={onClick}
      className={`group relative flex h-8 w-8 items-center justify-center rounded transition-colors cursor-pointer ${
        entry.enabled ? "hover:bg-gray-100" : "bg-gray-100 opacity-60 hover:bg-gray-200"
      }`}
      title={`:${entry.primaryName}:`}
    >
      <img
        src={src}
        alt={`:${entry.primaryName}:`}
        className="h-5 w-5"
        loading="lazy"
      />
      {!entry.enabled && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gray-500" />
      )}
    </button>
  );
}

function EmojiConfigModal({
  entry,
  saving,
  onClose,
  onSave,
}: {
  entry: EmojiGridEntry;
  saving: boolean;
  onClose: () => void;
  onSave: (emojiName: string, override: EmojiOverride) => Promise<void>;
}) {
  const [src, setSrc] = useState(TRANSPARENT_PIXEL);
  const [draft, setDraft] = useState<EmojiOverride>(cloneOverride(entry.override));
  const [activeTabId, setActiveTabId] = useState<string>("default");
  const [localError, setLocalError] = useState<string | null>(null);
  const [ruleLocationInput, setRuleLocationInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    resolveImageUrl(entry.ref).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.ref]);

  useEffect(() => {
    setDraft(cloneOverride(entry.override));
    setActiveTabId("default");
    setLocalError(null);
  }, [entry.override, entry.originalName]);

  useEffect(() => {
    const activeRule = activeTabId === "default"
      ? null
      : draft.rules.find((rule) => rule.id === activeTabId) ?? null;
    setRuleLocationInput(
      activeRule ? combineRuleLocation(activeRule.hostname, activeRule.pathname) : "",
    );
  }, [activeTabId, draft.rules]);

  const tabs = useMemo(() => [
    {
      id: "default",
      label: "Default",
      subtitle: "Used when no website rule matches",
      profile: draft.default,
      hostname: null,
      pathname: null,
    },
    ...draft.rules.map((rule) => ({
      id: rule.id,
      label: rule.hostname || "New site",
      subtitle: rule.pathname ?? "All paths",
      profile: rule.override,
      hostname: rule.hostname,
      pathname: rule.pathname,
    })),
  ], [draft]);

  const activeRule = activeTabId === "default"
    ? null
    : draft.rules.find((rule) => rule.id === activeTabId) ?? null;
  const activeProfile = activeRule?.override ?? draft.default;

  const updateDefault = (updater: (profile: EmojiOverrideProfile) => EmojiOverrideProfile) => {
    setDraft((current) => ({
      ...current,
      default: updater(current.default),
    }));
  };

  const updateRule = (ruleId: string, updater: (rule: EmojiOverrideRule) => EmojiOverrideRule) => {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => rule.id === ruleId ? updater(rule) : rule),
    }));
  };

  const updateActiveProfile = (updater: (profile: EmojiOverrideProfile) => EmojiOverrideProfile) => {
    if (activeRule) {
      updateRule(activeRule.id, (rule) => ({
        ...rule,
        override: updater(rule.override),
      }));
      return;
    }

    updateDefault(updater);
  };

  const handleAddRule = () => {
    const nextRule: EmojiOverrideRule = {
      id: buildRuleId("", "", draft.rules.length),
      hostname: "",
      pathname: null,
      override: { ...activeProfile, aliases: [...activeProfile.aliases], nativeEmojis: [...activeProfile.nativeEmojis] },
    };

    setDraft((current) => ({
      ...current,
      rules: [...current.rules, nextRule],
    }));
    setActiveTabId(nextRule.id);
    setLocalError(null);
  };

  const handleRemoveRule = (ruleId: string) => {
    setDraft((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.id !== ruleId),
    }));
    setActiveTabId("default");
    setLocalError(null);
  };

  const commitRuleLocation = (): EmojiOverride | null => {
    if (!activeRule) return draft;

    const { hostname, pathname } = parseRuleLocation(ruleLocationInput);
    if (!hostname) {
      setLocalError("Please enter a valid URL or hostname for this tab.");
      return null;
    }

    const duplicate = draft.rules.some((rule) =>
      rule.id !== activeRule.id
      && rule.hostname === hostname
      && (rule.pathname ?? "") === (pathname ?? ""),
    );
    if (duplicate) {
      setLocalError("That website config already exists.");
      return null;
    }

    const nextDraft: EmojiOverride = {
      ...draft,
      rules: draft.rules.map((rule) =>
        rule.id === activeRule.id
          ? {
              ...rule,
              hostname,
              pathname,
            }
          : rule
      ),
    };
    setDraft(nextDraft);
    setRuleLocationInput(combineRuleLocation(hostname, pathname));
    setLocalError(null);
    return nextDraft;
  };

  const handleSave = async () => {
    const nextDraft = commitRuleLocation();
    if (!nextDraft) return;
    setLocalError(null);
    await onSave(entry.originalName, nextDraft);
  };

  const handleResetAll = () => {
    setDraft(cloneOverride(DEFAULT_OVERRIDE));
    setActiveTabId("default");
    setLocalError(null);
  };

  const aliasPreview = activeProfile.aliases.length > 0
    ? activeProfile.aliases.map((alias) => `:${alias}:`).join(" ")
    : "No extra aliases";
  const nativeEmojiPreview = activeProfile.nativeEmojis.length > 0
    ? activeProfile.nativeEmojis.join(" ")
    : "No native emoji triggers";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-gray-100 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50">
            <img src={src} alt={`:${entry.primaryName}:`} className="h-7 w-7" loading="lazy" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-gray-900">
                :{entry.primaryName}:
              </p>
              {saving && <span className="text-[11px] text-gray-400">Saving...</span>}
            </div>
            <p className="text-[11px] text-gray-500">
              Original: :{entry.originalName}:
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              Active names: {aliasPreview}
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              Native triggers: {nativeEmojiPreview}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(100vh-5.5rem)] overflow-y-auto p-3 pb-4">
          <div className="mb-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Config Tabs
            </p>
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`min-w-0 shrink-0 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                      activeTabId === tab.id
                        ? "border-purple-300 bg-purple-50 text-purple-800"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="max-w-28 truncate text-xs font-medium">{tab.label}</div>
                    <div className="max-w-28 truncate text-[11px] text-gray-500">{tab.subtitle}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleAddRule}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                aria-label="Add website tab"
                title="Add website tab"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <div className="pb-1">
            {localError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {localError}
              </div>
            )}

            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  {activeRule ? activeRule.hostname : "Default config"}
                </p>
                <p className="text-[11px] text-gray-500">
                  {activeRule
                    ? activeRule.pathname
                      ? `Applies on ${activeRule.hostname}${activeRule.pathname} and below`
                      : `Applies on ${activeRule.hostname} across all paths`
                    : "Fallback config used when no website tab matches"}
                </p>
              </div>
              {activeRule && (
                <button
                  onClick={() => handleRemoveRule(activeRule.id)}
                  className="rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remove Tab
                </button>
              )}
            </div>

            {activeRule && (
              <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-gray-600">Configured URL</span>
                  <input
                    type="text"
                    value={ruleLocationInput}
                    onChange={(e) => {
                      setRuleLocationInput(e.target.value);
                    }}
                    onBlur={() => {
                      commitRuleLocation();
                    }}
                    placeholder="example.com/chat"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </label>
              </div>
            )}

            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-xs font-medium text-gray-700">Enabled</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  checked={!activeProfile.disabled}
                  onChange={(e) => {
                    updateActiveProfile((profile) => ({
                      ...profile,
                      disabled: !e.target.checked,
                    }));
                  }}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-gray-600">Primary name</span>
                <input
                  type="text"
                  value={activeProfile.name ?? ""}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    updateActiveProfile((profile) => ({
                      ...profile,
                      name: value || null,
                    }));
                  }}
                  placeholder={entry.originalName}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-gray-600">Aliases</span>
                <input
                  type="text"
                  value={activeProfile.aliases.join(", ")}
                  onChange={(e) => {
                    updateActiveProfile((profile) => ({
                      ...profile,
                      aliases: parseAliases(e.target.value),
                    }));
                  }}
                  placeholder="name2, name3"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-gray-600">Replace native emojis</span>
                <input
                  type="text"
                  value={activeProfile.nativeEmojis.join(" ")}
                  onChange={(e) => {
                    updateActiveProfile((profile) => ({
                      ...profile,
                      nativeEmojis: parseNativeEmojis(e.target.value),
                    }));
                  }}
                  placeholder="🥸 🤖"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[11px] text-gray-500">
                  Any matching emoji character on the page will be swapped for this custom emoji.
                </p>
              </label>

              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleResetAll}
                    className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Reset All
                  </button>
                </div>
                <button
                  onClick={() => void handleSave()}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
