import { useState, useEffect, useCallback, useRef } from "react";
import type { ExtensionStatus } from "@/lib/types";
import SourceList from "./components/SourceList";
import AddSource from "./components/AddSource";
import ZipImport from "./components/ZipImport";
import SettingsPage from "./components/SettingsPage";

const isImportMode = new URLSearchParams(window.location.search).get("mode") === "import";

export default function App() {
  if (isImportMode) {
    return <ZipImport />;
  }

  return <PopupMain />;
}

function PopupMain() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<"main" | "settings">("main");

  const refreshStatus = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "GET_STATUS",
      });
      if (response?.status) {
        setStatus(response.status);
      }
    } catch (err) {
      console.error("Failed to get status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  if (page === "settings") {
    return <SettingsPage onBack={() => setPage("main")} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const hasSources = (status?.sources.length ?? 0) > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            Emoji Everywhere
          </h1>
          {hasSources && (
            <p className="text-xs text-gray-400 mt-0.5">
              {status!.totalEmojiCount} emojis from{" "}
              {status!.sources.length} source{status!.sources.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasSources && <AddSource onStatusChange={refreshStatus} />}
          <button
            onClick={() => setPage("settings")}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            title="Settings"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {hasSources ? (
        <>
          <SourceList
            sources={status!.sources}
            onStatusChange={refreshStatus}
          />
          {status!.sources.length > 1 && (
            <DuplicateInfo duplicateCount={status!.duplicateCount} />
          )}
        </>
      ) : (
        <div className="pt-2">
          <p className="text-sm text-gray-500 mb-3">
            Add an emoji source to get started.
          </p>
          <AddSource onStatusChange={refreshStatus} inline />
        </div>
      )}
    </div>
  );
}

function DuplicateInfo({ duplicateCount }: { duplicateCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [expanded]);

  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-left"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {duplicateCount > 0 ? (
          <span className="text-amber-700">
            {duplicateCount} duplicate emoji{duplicateCount !== 1 ? "s" : ""} across sources
          </span>
        ) : (
          <span className="text-gray-500">No duplicate emojis across sources</span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? height : 0 }}
      >
        <div ref={contentRef} className="px-3 pb-2.5 text-gray-500 leading-relaxed">
          When the same emoji name exists in multiple sources, the source listed
          last takes priority. The order matches the order in which sources were added.
        </div>
      </div>
    </div>
  );
}
