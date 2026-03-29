import type { EmojiMap } from "./types";
import { resolveEmoji } from "./slack";

export interface EmojiSearchResult {
  name: string;
  url: string;
}

/**
 * Greedy subsequence match: every character in `query` must appear in `target`
 * in order, but not necessarily contiguously. Returns the total number of
 * skipped characters between matched positions, or null if no match.
 */
function subsequenceGap(query: string, target: string): number | null {
  let qi = 0;
  let gap = 0;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (query[qi] === target[ti]) {
      qi++;
    } else if (qi > 0) {
      gap++;
    }
  }

  return qi === query.length ? gap : null;
}

const SCORE_EXACT = 0;
const SCORE_PREFIX = 1;
const SCORE_WORD_PREFIX = 2;
const SCORE_SUBSTRING = 3;
const SCORE_SUBSEQUENCE_BASE = 4;

function scoreMatch(query: string, name: string): number {
  const lq = query.toLowerCase();
  const ln = name.toLowerCase();

  if (ln === lq) return SCORE_EXACT;
  if (ln.startsWith(lq)) return SCORE_PREFIX;

  const segments = ln.split(/[-_]/);
  for (const seg of segments) {
    if (seg.startsWith(lq)) return SCORE_WORD_PREFIX;
  }

  if (ln.includes(lq)) return SCORE_SUBSTRING;

  const gap = subsequenceGap(lq, ln);
  if (gap !== null) return SCORE_SUBSEQUENCE_BASE + gap * 0.001;

  return -1;
}

export function searchEmojis(
  query: string,
  emojiMap: EmojiMap,
  limit?: number,
): EmojiSearchResult[] {
  if (!query) return [];

  const scored: { name: string; url: string; score: number }[] = [];

  for (const name of Object.keys(emojiMap)) {
    const score = scoreMatch(query, name);
    if (score < 0) continue;

    const url = resolveEmoji(name, emojiMap);
    if (!url) continue;

    scored.push({ name, url, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.name.length - b.name.length;
  });

  if (limit != null) scored.length = Math.min(scored.length, limit);
  return scored.map(({ name, url }) => ({ name, url }));
}
