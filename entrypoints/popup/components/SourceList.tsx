import { useState, useRef, useEffect } from "react";
import type { SourceDomainFilterMode, SourceSummary } from "@/lib/types";
import { getEmojiImageData, getEmojiOverrides, getSource, replaceEmojiOverridesForSource, updateSource } from "@/lib/storage";
import { ICON_PACK_CONFIG_FILE, buildIconPackConfig, parseIconPackConfig } from "@/lib/icon-pack";
import EmojiGrid from "./EmojiGrid";

interface Props {
  sources: SourceSummary[];
  onStatusChange: () => void | Promise<void>;
}

export default function SourceList({ sources, onStatusChange }: Props) {
  const priorityOrderedSources = [...sources].reverse();

  const moveSource = async (sourceId: string, direction: -1 | 1) => {
    const currentIndex = priorityOrderedSources.findIndex((source) => source.id === sourceId);
    const targetIndex = currentIndex + direction;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= priorityOrderedSources.length) {
      return;
    }

    const next = [...priorityOrderedSources];
    const [movedSource] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, movedSource);

    const response = await browser.runtime.sendMessage({
      type: "REORDER_SOURCES",
      sourceIds: next.map((source) => source.id).reverse(),
    });

    if (response?.success) {
      await onStatusChange();
    }
  };

  return (
    <div className="space-y-2">
      {priorityOrderedSources.map((source, index) => (
        <SourceCard
          key={source.id}
          source={source}
          isHighestPriority={index === 0}
          isLowestPriority={index === priorityOrderedSources.length - 1}
          onMoveHigher={() => moveSource(source.id, -1)}
          onMoveLower={() => moveSource(source.id, 1)}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

function SourceCard({
  source,
  isHighestPriority,
  isLowestPriority,
  onMoveHigher,
  onMoveLower,
  onStatusChange,
}: {
  source: SourceSummary;
  isHighestPriority: boolean;
  isLowestPriority: boolean;
  onMoveHigher: () => void | Promise<void>;
  onMoveLower: () => void | Promise<void>;
  onStatusChange: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(source.name);
  const [domainMode, setDomainMode] = useState<SourceDomainFilterMode>(
    source.domainFilter.mode,
  );
  const [domainInput, setDomainInput] = useState("");
  const [savingFilter, setSavingFilter] = useState(false);
  const [showDomainRules, setShowDomainRules] = useState(false);
  const [configViewer, setConfigViewer] = useState<{
    loading: boolean;
    json: string;
    saving: boolean;
    error: string | null;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDomainMode(source.domainFilter.mode);
  }, [source.domainFilter.mode]);

  const saveDomainFilter = async (
    mode: SourceDomainFilterMode,
    domains: string[],
  ) => {
    setSavingFilter(true);
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: "UPDATE_SOURCE_DOMAIN_FILTER",
        sourceId: source.id,
        domainFilter: {
          mode,
          domains,
        },
      });

      if (!response?.success) {
        throw new Error(response?.error ?? "Failed to save icon pack rules");
      }

      await onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save icon pack rules");
      setDomainMode(source.domainFilter.mode);
    } finally {
      setSavingFilter(false);
    }
  };

  useEffect(() => {
    if (editing) {
      cancelledRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = async () => {
    if (savingRef.current || cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const trimmed = editName.trim();
    if (!trimmed || trimmed === source.name) {
      setEditName(source.name);
      setEditing(false);
      return;
    }
    savingRef.current = true;
    try {
      const resp = await browser.runtime.sendMessage({
        type: "RENAME_SOURCE",
        sourceId: source.id,
        name: trimmed,
      });
      if (resp?.success) {
        await onStatusChange();
      } else {
        setEditName(source.name);
      }
    } catch {
      setEditName(source.name);
    } finally {
      savingRef.current = false;
      setEditing(false);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    setError(null);
    setInfo(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: "FETCH_EMOJIS",
        sourceId: source.id,
      });
      if (!response?.success) {
        setError(response?.error ?? "Failed to refresh");
      }
      onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    setInfo(null);

    try {
      const [imageData, overrides] = await Promise.all([
        getEmojiImageData(source.id),
        getEmojiOverrides(),
      ]);
      if (!imageData) throw new Error("Source not found");

      const entries = Object.entries(imageData);
      setExportProgress({ current: 0, total: entries.length });

      const { BlobWriter, ZipWriter, BlobReader } = await import(
        "@zip.js/zip.js"
      );
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        useWebWorkers: false,
      });
      const config = buildIconPackConfig({
        sourceName: source.name,
        domainFilter: source.domainFilter,
        overrides: overrides[source.id],
      });
      await zipWriter.add(
        ICON_PACK_CONFIG_FILE,
        new BlobReader(
          new Blob([JSON.stringify(config, null, 2)], {
            type: "application/json",
          }),
        ),
      );

      let completed = 0;
      for (const [name, url] of entries) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = extFromUrl(url) || mimeToExt(blob.type);
          await zipWriter.add(`${name}.${ext}`, new BlobReader(blob));
        } catch {
          // skip emojis that can't be fetched
        }
        completed++;
        setExportProgress({ current: completed, total: entries.length });
      }

      const zipBlob = await zipWriter.close();
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${source.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportProgress(null);
    }
  };

  const loadCurrentConfigJson = async () => {
    const [sourceDetails, overrides] = await Promise.all([
      getSource(source.id),
      getEmojiOverrides(),
    ]);

    if (!sourceDetails) {
      throw new Error("Source not found");
    }

    const config = buildIconPackConfig({
      sourceName: sourceDetails.name,
      domainFilter: sourceDetails.domainFilter,
      overrides: overrides[source.id],
    });

    return JSON.stringify(config, null, 2);
  };

  const applyConfig = async (raw: string) => {
    const sourceDetails = await getSource(source.id);
    if (!sourceDetails) {
      throw new Error("Source not found");
    }

    const config = parseIconPackConfig(raw, Object.keys(sourceDetails.emojis));
    await updateSource(source.id, (current) => ({
      ...current,
      name: config.sourceName ?? current.name,
      domainFilter: config.domainFilter,
    }));
    await replaceEmojiOverridesForSource(source.id, config.overrides);
    await onStatusChange();
    return loadCurrentConfigJson();
  };

  const handleImportConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    setInfo(null);
    browser.windows.create({
      url: browser.runtime.getURL(`popup.html?mode=config-import&sourceId=${encodeURIComponent(source.id)}`),
      type: "popup",
      width: 420,
      height: 380,
    });
  };

  const handleViewConfig = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfigViewer({
      loading: true,
      json: "",
      saving: false,
      error: null,
    });
    setInfo(null);

    try {
      setConfigViewer({
        loading: false,
        json: await loadCurrentConfigJson(),
        saving: false,
        error: null,
      });
    } catch (err) {
      setConfigViewer({
        loading: false,
        json: "",
        saving: false,
        error: err instanceof Error ? err.message : "Failed to load config",
      });
    }
  };

  const handleSaveViewedConfig = async (nextJson: string) => {
    setError(null);
    setInfo(null);
    setConfigViewer((current) => current
      ? {
          ...current,
          saving: true,
          error: null,
          json: nextJson,
        }
      : current);

    try {
      const persistedJson = await applyConfig(nextJson);
      setInfo("Config saved and reloaded.");
      setConfigViewer({
        loading: false,
        saving: false,
        json: persistedJson,
        error: null,
      });
    } catch (err) {
      setConfigViewer((current) => current
        ? {
            ...current,
            saving: false,
            error: err instanceof Error ? err.message : "Failed to save config",
          }
        : current);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await browser.runtime.sendMessage({
      type: "REMOVE_SOURCE",
      sourceId: source.id,
    });
    onStatusChange();
  };

  const lastSyncText = source.lastRefresh
    ? formatRelativeTime(source.lastRefresh)
    : "Never";
  const hasDomainRules = source.domainFilter.domains.length > 0;
  const filterSummary = hasDomainRules
    ? `${source.domainFilter.mode === "allow" ? "Only on" : "Everywhere except"} ${source.domainFilter.domains.length} domain${source.domainFilter.domains.length === 1 ? "" : "s"}`
    : source.domainFilter.mode === "allow"
      ? "Inactive until an allowed domain is added"
      : "Active on every domain";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
      >
        <SourceIcon type={source.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    inputRef.current?.blur();
                  }
                  if (e.key === "Escape") {
                    cancelledRef.current = true;
                    setEditName(source.name);
                    inputRef.current?.blur();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded px-1.5 py-0.5 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 min-w-0 w-full"
              />
            ) : (
              <span className="text-sm font-medium text-gray-900 truncate">
                {source.name}
              </span>
            )}
            <span className="text-xs text-gray-400 shrink-0">
              {source.effectiveEmojiCount}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {isHighestPriority
              ? "Highest duplicate priority"
              : isLowestPriority
                ? "Lowest duplicate priority"
                : "Medium duplicate priority"}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {source.type === "slack" ? `Synced ${lastSyncText}` : `Imported ${lastSyncText}`}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {filterSummary}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2">
          {source.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
              {source.error}
            </div>
          )}

          {info && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700">
              {info}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <EmojiGrid sourceId={source.id} onStatusChange={onStatusChange} />

          <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDomainRules((prev) => !prev);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700">Where this pack is active</p>
                <p className="text-[11px] text-gray-500 truncate">{filterSummary}</p>
              </div>
              {savingFilter && (
                <span className="text-[11px] text-gray-400">Saving...</span>
              )}
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showDomainRules ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDomainRules && (
              <div className="border-t border-gray-200 p-3 space-y-2">
                <p className="text-[11px] text-gray-500">
                  Use an allow list to limit this pack to specific sites, or a deny list to block it on selected sites.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDomainMode("deny");
                      void saveDomainFilter("deny", source.domainFilter.domains);
                    }}
                    disabled={savingFilter}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      domainMode === "deny"
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Deny list
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDomainMode("allow");
                      void saveDomainFilter("allow", source.domainFilter.domains);
                    }}
                    disabled={savingFilter}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      domainMode === "allow"
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Allow list
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const normalized = domainInput.toLowerCase().trim().replace(/^\.+/, "").replace(/\.+$/, "");
                    if (!normalized || source.domainFilter.domains.includes(normalized)) return;
                    setDomainInput("");
                    void saveDomainFilter(domainMode, [
                      ...source.domainFilter.domains,
                      normalized,
                    ]);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="example.com"
                    className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={!domainInput.trim() || savingFilter}
                    className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </form>

                {source.domainFilter.domains.length === 0 ? (
                  <p className="text-[11px] text-gray-500">
                    {domainMode === "allow"
                      ? "No domains added yet, so this pack will stay inactive until you add one."
                      : "No domains blocked yet, so this pack is active everywhere."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {source.domainFilter.domains.map((domain) => (
                      <button
                        key={domain}
                        onClick={(e) => {
                          e.stopPropagation();
                          void saveDomainFilter(
                            domainMode,
                            source.domainFilter.domains.filter((item) => item !== domain),
                          );
                        }}
                        disabled={savingFilter}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer"
                        title={`Remove ${domain}`}
                      >
                        <span>{domain}</span>
                        <span aria-hidden="true">x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
            <span className="text-xs font-medium text-gray-700">Priority</span>
            <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {isHighestPriority
                ? "Top"
                : isLowestPriority
                  ? "Bottom"
                  : "Middle"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onMoveHigher();
                }}
                disabled={isHighestPriority}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Move higher priority"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onMoveLower();
                }}
                disabled={isLowestPriority}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Move lower priority"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditName(source.name);
                setEditing(true);
              }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              Rename
            </button>
            {source.type === "slack" && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <svg
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exportProgress !== null}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export ZIP
            </button>
            <button
              onClick={handleViewConfig}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12H9m12 0A9 9 0 113 12a9 9 0 0118 0z"
                />
              </svg>
              Config
            </button>
            <button
              onClick={handleRemove}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer ml-auto"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Remove
            </button>
          </div>
        </div>
      )}

      {exportProgress && (
        <ExportModal
          sourceName={source.name}
          current={exportProgress.current}
          total={exportProgress.total}
        />
      )}

      {configViewer && (
        <ConfigViewerModal
          sourceName={source.name}
          loading={configViewer.loading}
          saving={configViewer.saving}
          json={configViewer.json}
          error={configViewer.error}
          onImport={handleImportConfig}
          onSave={handleSaveViewedConfig}
          onClose={() => setConfigViewer(null)}
        />
      )}
    </div>
  );
}

function ExportModal({
  sourceName,
  current,
  total,
}: {
  sourceName: string;
  current: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-72 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              Exporting {sourceName}
            </p>
            <p className="text-xs text-gray-500">
              {current} of {total} emojis
            </p>
          </div>
        </div>

        <div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-right text-xs text-gray-400 mt-1">{pct}%</p>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <svg
            className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            Keep this popup open until the export finishes. Closing it will cancel the download.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConfigViewerModal({
  sourceName,
  loading,
  saving,
  json,
  error,
  onImport,
  onSave,
  onClose,
}: {
  sourceName: string;
  loading: boolean;
  saving: boolean;
  json: string;
  error: string | null;
  onImport: (e: React.MouseEvent) => void;
  onSave: (json: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(json);

  useEffect(() => {
    setDraft(json);
  }, [json]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              Config for {sourceName}
            </p>
            <p className="text-xs text-gray-500">
              Import, edit, and save the JSON currently loaded for this source.
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

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-96 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={onImport}
                  disabled={saving}
                  className="rounded-md border border-teal-200 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import Config
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDraft(json)}
                    disabled={saving}
                    className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => void onSave(draft)}
                    disabled={saving}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : "Save Config"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceIcon({ type }: { type: string }) {
  if (type === "slack") {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#4A154B] flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 54 54" fill="none">
          <path
            d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386"
            fill="#36C5F0"
          />
          <path
            d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387"
            fill="#2EB67D"
          />
          <path
            d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386"
            fill="#ECB22E"
          />
          <path
            d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.25m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.25a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.386"
            fill="#E01E5A"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    </div>
  );
}

function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot === -1) return null;
    const ext = pathname.slice(lastDot + 1).toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return ext;
    return null;
  } catch {
    return null;
  }
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function mimeToExt(mime: string): string {
  return MIME_TO_EXT[mime] ?? "png";
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
