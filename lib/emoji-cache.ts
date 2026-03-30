import type { EmojiMap } from "./types";

const CACHE_NAME = "slack-emoji-images-v1";
const CONCURRENCY = 20;

/**
 * Pre-cache all emoji image URLs using the Cache API.
 * Runs in the background service worker after each emoji refresh.
 * Only fetches images that aren't already cached.
 */
export async function preCacheImages(emojis: EmojiMap): Promise<void> {
  if (typeof caches === "undefined") return;

  const cache = await caches.open(CACHE_NAME);
  const imageUrls = [
    ...new Set(
      Object.values(emojis).filter(
        (url) =>
          url.startsWith("https://") || url.startsWith("http://"),
      ),
    ),
  ];

  const uncached: string[] = [];
  for (const url of imageUrls) {
    if (!(await cache.match(url))) {
      uncached.push(url);
    }
  }

  if (uncached.length === 0) return;

  for (let i = 0; i < uncached.length; i += CONCURRENCY) {
    const batch = uncached.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        } catch {
          // non-critical — image will load from network on demand
        }
      }),
    );
  }
}

/**
 * Batch-load cached blob URLs for a list of image URLs.
 * Returns a Map from the original URL to a blob: URL that can be used as img src.
 * Blob URLs are tied to the calling document/context and auto-revoke when it closes.
 */
export async function loadCachedImages(
  urls: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (typeof caches === "undefined") return result;

  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await cache.match(url);
          if (res) {
            const blob = await res.blob();
            if (blob.size > 0) {
              result.set(url, URL.createObjectURL(blob));
            }
          }
        } catch {
          // fall through — caller uses the original URL as fallback
        }
      }),
    );
  } catch {
    // Cache API unavailable or errored
  }

  return result;
}

export async function clearImageCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete(CACHE_NAME);
}
