import { useState, useRef, useEffect } from "react";
import type { SourceSummary } from "@/lib/types";
import { getEmojiImageData } from "@/lib/storage";
import EmojiGrid from "./EmojiGrid";

interface Props {
  sources: SourceSummary[];
  onStatusChange: () => void | Promise<void>;
}

export default function SourceList({ sources, onStatusChange }: Props) {
  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

function SourceCard({
  source,
  onStatusChange,
}: {
  source: SourceSummary;
  onStatusChange: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(source.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const cancelledRef = useRef(false);

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

    try {
      const imageData = await getEmojiImageData(source.id);
      if (!imageData) throw new Error("Source not found");

      const entries = Object.entries(imageData);
      setExportProgress({ current: 0, total: entries.length });

      const { BlobWriter, ZipWriter, BlobReader } = await import(
        "@zip.js/zip.js"
      );
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        useWebWorkers: false,
      });

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
              {source.emojiCount}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">
            {source.type === "slack" ? `Synced ${lastSyncText}` : `Imported ${lastSyncText}`}
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

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <EmojiGrid sourceId={source.id} />

          <div className="flex items-center gap-2 pt-1">
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
