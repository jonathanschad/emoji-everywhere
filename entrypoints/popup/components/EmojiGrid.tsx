import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getSource } from "@/lib/storage";
import { searchEmojis } from "@/lib/emoji-search";
import { resolveImageUrl, TRANSPARENT_PIXEL } from "@/lib/emoji-image-resolver";
import type { EmojiMap } from "@/lib/types";

const BATCH_SIZE = 100;

interface Props {
  sourceId: string;
}

export default function EmojiGrid({ sourceId }: Props) {
  const [emojis, setEmojis] = useState<EmojiMap>({});
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSource(sourceId).then((source) => {
      if (source) setEmojis(source.emojis);
    });
  }, [sourceId]);

  const allEntries = useMemo(() => {
    return Object.entries(emojis).map(([name, ref]) => ({ name, url: ref }));
  }, [emojis]);

  const filteredEntries = useMemo(
    () => (search ? searchEmojis(search, emojis) : allEntries),
    [emojis, search, allEntries],
  );

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
      <div className="text-center text-xs text-gray-400 py-2">
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
        placeholder={`Search ${allEntries.length} emojis...`}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />

      <div
        ref={scrollRef}
        className="grid grid-cols-8 gap-1 max-h-36 overflow-y-auto p-1"
      >
        {visibleEntries.map(({ name, url }) => (
          <LazyEmojiCell key={name} name={name} emojiRef={url} />
        ))}

        {hasMore && <div ref={sentinelRef} className="col-span-8 h-1" />}
      </div>

      {filteredEntries.length === 0 && search && (
        <p className="text-center text-xs text-gray-400 py-1">
          No emojis matching &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  );
}

function LazyEmojiCell({ name, emojiRef }: { name: string; emojiRef: string }) {
  const [src, setSrc] = useState(TRANSPARENT_PIXEL);

  useEffect(() => {
    let cancelled = false;
    resolveImageUrl(emojiRef).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => { cancelled = true; };
  }, [emojiRef]);

  return (
    <button
      className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative cursor-pointer"
      title={`:${name}:`}
    >
      <img
        src={src}
        alt={`:${name}:`}
        className="w-5 h-5"
        loading="lazy"
      />
    </button>
  );
}
