import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getEmojis } from "@/lib/storage";
import { resolveEmoji } from "@/lib/slack";
import { loadCachedImages } from "@/lib/emoji-cache";
import { searchEmojis } from "@/lib/emoji-search";
import type { EmojiMap } from "@/lib/types";

const BATCH_SIZE = 100;

export default function EmojiGrid() {
  const [emojis, setEmojis] = useState<EmojiMap>({});
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [cachedSrcs, setCachedSrcs] = useState<Record<string, string>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getEmojis().then(setEmojis);
  }, []);

  const allResolved = useMemo(() => {
    const results: { name: string; url: string }[] = [];
    for (const name of Object.keys(emojis)) {
      const url = resolveEmoji(name, emojis);
      if (url) results.push({ name, url });
    }
    return results;
  }, [emojis]);

  const filteredEntries = useMemo(
    () => (search ? searchEmojis(search, emojis) : allResolved),
    [emojis, search, allResolved],
  );

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    scrollRef.current?.scrollTo(0, 0);
  }, [search]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount],
  );

  useEffect(() => {
    const urls = visibleEntries.map((e) => e.url);
    if (urls.length === 0) return;

    loadCachedImages(urls).then((cached) => {
      if (cached.size === 0) return;
      const newEntries: Record<string, string> = {};
      cached.forEach((blobUrl, originalUrl) => {
        newEntries[originalUrl] = blobUrl;
      });
      setCachedSrcs((prev) => ({ ...prev, ...newEntries }));
    });
  }, [visibleEntries]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + BATCH_SIZE, filteredEntries.length),
    );
  }, [filteredEntries.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRef.current, rootMargin: "100px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  if (Object.keys(emojis).length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-4">
        No emojis loaded yet
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
        placeholder={`Search ${filteredEntries.length} emojis...`}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />

      <div
        ref={scrollRef}
        className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1"
      >
        {visibleEntries.map(({ name, url }) => {
          const src = cachedSrcs[url] || url;

          return (
            <button
              key={name}
              className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative cursor-pointer"
              title={`:${name}:`}
            >
              <img
                src={src}
                alt={`:${name}:`}
                className="w-6 h-6"
                loading="lazy"
              />
            </button>
          );
        })}

        {hasMore && <div ref={sentinelRef} className="col-span-8 h-1" />}
      </div>

      {filteredEntries.length === 0 && search && (
        <p className="text-center text-xs text-gray-400 py-2">
          No emojis matching &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  );
}
