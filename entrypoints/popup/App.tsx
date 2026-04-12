import { useState, useEffect, useCallback, useRef } from "react";
import type { ExtensionStatus } from "@/lib/types";
import SourceList from "./components/SourceList";
import AddSource from "./components/AddSource";
import ZipImport from "./components/ZipImport";
import ConfigImport from "./components/ConfigImport";
import SettingsPage from "./components/SettingsPage";
import ExcludedDomains from "./components/ExcludedDomains";

const popupMode = new URLSearchParams(window.location.search).get("mode");

export default function App() {
  if (popupMode === "import") {
    return <ZipImport />;
  }

  if (popupMode === "config-import") {
    return <ConfigImport />;
  }

  return <PopupMain />;
}

function PopupMain() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<"main" | "settings" | "excluded">("main");
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [domainExcluded, setDomainExcluded] = useState(false);
  const [excludeLoading, setExcludeLoading] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          const hostname = new URL(tab.url).hostname.toLowerCase();
          if (hostname) {
            setCurrentDomain(hostname);
            const response = await browser.runtime.sendMessage({ type: "GET_EXCLUDED_DOMAINS" });
            if (response?.domains) {
              setDomainExcluded(
                response.domains.some((d: string) => hostname === d || hostname.endsWith(`.${d}`)),
              );
            }
          }
        }
      } catch {}
    })();
  }, []);

  if (page === "settings") {
    return <SettingsPage onBack={() => setPage("main")} />;
  }

  if (page === "excluded") {
    return <ExcludedDomains onBack={() => setPage("main")} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const handleExcludeToggle = async () => {
    if (!currentDomain) return;
    setExcludeLoading(true);
    if (domainExcluded) {
      await browser.runtime.sendMessage({ type: "REMOVE_EXCLUDED_DOMAIN", domain: currentDomain });
      setDomainExcluded(false);
    } else {
      await browser.runtime.sendMessage({ type: "ADD_EXCLUDED_DOMAIN", domain: currentDomain });
      setDomainExcluded(true);
    }
    setExcludeLoading(false);
  };

  const hasSources = (status?.sources.length ?? 0) > 0;

  return (
    <div className="p-4 space-y-4">
      {domainExcluded && currentDomain && (
        <div className="flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800">Disabled on this site</p>
            <p className="text-xs text-amber-600 truncate">{currentDomain}</p>
          </div>
        </div>
      )}

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
          <a
            href="https://github.com/jonathanschad/emoji-everywhere"
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            title="GitHub"
          >
            <svg className="w-[18px] h-[18px] text-gray-600" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
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
            <DuplicateInfo
              duplicateCount={status!.duplicateCount}
              duplicateEmojis={status!.duplicateEmojis}
            />
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

      <div className="border-t border-gray-200 pt-3 flex gap-2">
        {currentDomain && (
          <button
            onClick={handleExcludeToggle}
            disabled={excludeLoading}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
              domainExcluded
                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
            title={domainExcluded ? `Re-enable on ${currentDomain}` : `Disable on ${currentDomain}`}
          >
            {domainExcluded ? (
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
            <span className="truncate min-w-0">
              {domainExcluded ? `Re-enable on ${currentDomain}` : `Disable on ${currentDomain}`}
            </span>
          </button>
        )}
        <button
          onClick={() => setPage("excluded")}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Manage excluded domains"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function DuplicateInfo({
  duplicateCount,
  duplicateEmojis,
}: {
  duplicateCount: number;
  duplicateEmojis: { name: string; sourceNames: string[] }[];
}) {
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
          <p>
            When the same emoji name exists in multiple sources, the source shown
            first in the list takes priority. Use the priority buttons on each
            source to reorder duplicates.
          </p>
          {duplicateEmojis.length > 0 && (
            <div className="mt-2 space-y-2">
              {duplicateEmojis.map((emoji) => (
                <div key={emoji.name} className="rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
                  <div className="font-mono text-[11px] text-amber-800">{emoji.name}</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    In: {emoji.sourceNames.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
