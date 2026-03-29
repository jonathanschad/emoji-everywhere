import { getEmojis, getSettings, watchEmojis, watchSettings } from "@/lib/storage";
import { scanAndReplace, createObserver } from "@/lib/emoji-replacer";
import { initAutocomplete, updateEmojis } from "@/lib/emoji-autocomplete";
import type { EmojiMap, Settings } from "@/lib/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main() {
    let emojis: EmojiMap = await getEmojis();
    let settings: Settings = await getSettings();
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

    function start() {
      if (!settings.enabled || Object.keys(emojis).length === 0) return;

      scanAndReplace(document.body, emojis);

      observer = createObserver(emojis);
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

    watchEmojis((newEmojis) => {
      emojis = newEmojis;
      updateEmojis(newEmojis);
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
  },
});
