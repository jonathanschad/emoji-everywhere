import {
  buildMergedEmojisForHostname,
  buildMergedNativeEmojiMapForHostname,
  getEmojiOverrides,
  getSettings,
  getExcludedDomains,
  getSources,
  watchEmojiOverrides,
  watchSettings,
  watchExcludedDomains,
  watchSources,
} from "@/lib/storage";
import { scanAndReplace, createObserver } from "@/lib/emoji-replacer";
import { initAutocomplete, updateEmojis } from "@/lib/emoji-autocomplete";
import { clearResolverCache } from "@/lib/emoji-image-resolver";
import type { EmojiMap, EmojiOverridesBySource, EmojiSource, Settings } from "@/lib/types";

function isDomainExcluded(excludedDomains: string[]): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return excludedDomains.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main() {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname || "/";
    let sources: EmojiSource[] = await getSources();
    let overrides: EmojiOverridesBySource = await getEmojiOverrides();
    let emojis: EmojiMap = buildMergedEmojisForHostname(sources, hostname, overrides, pathname);
    let nativeEmojiMap: EmojiMap = buildMergedNativeEmojiMapForHostname(sources, hostname, overrides, pathname);
    let settings: Settings = await getSettings();
    let excludedDomains: string[] = await getExcludedDomains();
    let observer: MutationObserver | null = null;
    let teardownAutocomplete: (() => void) | null = null;

    function startAutocomplete() {
      if (Object.keys(emojis).length === 0) return;
      teardownAutocomplete = initAutocomplete(emojis);
    }

    function stopAutocomplete() {
      teardownAutocomplete?.();
      teardownAutocomplete = null;
    }

    function isActive() {
      return settings.enabled && !isDomainExcluded(excludedDomains);
    }

    function start() {
      if (!isActive() || Object.keys(emojis).length === 0) return;

      scanAndReplace(document.body, emojis, nativeEmojiMap);

      observer = createObserver(emojis, nativeEmojiMap);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      stopAutocomplete();
      startAutocomplete();
    }

    function stop() {
      observer?.disconnect();
      observer = null;
      stopAutocomplete();
    }

    function restart() {
      stop();
      start();
    }

    start();

    browser.runtime.sendMessage({ type: "REFRESH_IF_STALE" }).catch(() => {});

    watchSources((newSources) => {
      sources = newSources;
      emojis = buildMergedEmojisForHostname(sources, hostname, overrides, pathname);
      nativeEmojiMap = buildMergedNativeEmojiMapForHostname(sources, hostname, overrides, pathname);
      clearResolverCache();
      updateEmojis(emojis);
      restart();
    });

    watchEmojiOverrides((newOverrides) => {
      overrides = newOverrides;
      emojis = buildMergedEmojisForHostname(sources, hostname, overrides, pathname);
      nativeEmojiMap = buildMergedNativeEmojiMapForHostname(sources, hostname, overrides, pathname);
      clearResolverCache();
      updateEmojis(emojis);
      restart();
    });

    watchSettings((newSettings) => {
      const wasEnabled = settings.enabled;
      settings = newSettings;

      if (!settings.enabled && wasEnabled) {
        stop();
      } else if (settings.enabled) {
        restart();
      }
    });

    watchExcludedDomains((newDomains) => {
      const wasExcluded = isDomainExcluded(excludedDomains);
      excludedDomains = newDomains;
      const isNowExcluded = isDomainExcluded(excludedDomains);

      if (isNowExcluded && !wasExcluded) {
        stop();
      } else if (!isNowExcluded && wasExcluded) {
        restart();
      }
    });
  },
});
