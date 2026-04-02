import { storage, browser } from "#imports";
import type { EmojiMap, EmojiSource, Settings } from "./types";
import { DEFAULT_SETTINGS, EMOJI_REF_PREFIX } from "./types";

const keys = {
  sources: storage.defineItem<EmojiSource[]>("local:emojiSources", {
    fallback: [],
  }),
  mergedEmojis: storage.defineItem<EmojiMap>("local:mergedEmojis", {
    fallback: {},
  }),
  settings: storage.defineItem<Settings>("local:settings", {
    fallback: DEFAULT_SETTINGS,
  }),
  excludedDomains: storage.defineItem<string[]>("local:excludedDomains", {
    fallback: [],
  }),
};

function buildMergedEmojis(sources: EmojiSource[]): EmojiMap {
  const merged: EmojiMap = {};
  for (const source of sources) {
    Object.assign(merged, source.emojis);
  }
  return merged;
}

async function persistMerged(sources: EmojiSource[]): Promise<void> {
  await keys.mergedEmojis.setValue(buildMergedEmojis(sources));
}

export async function getSources(): Promise<EmojiSource[]> {
  return keys.sources.getValue();
}

export async function getSource(id: string): Promise<EmojiSource | undefined> {
  const sources = await getSources();
  return sources.find((s) => s.id === id);
}

export async function addSource(source: EmojiSource): Promise<void> {
  const sources = await getSources();
  sources.push(source);
  await keys.sources.setValue(sources);
  await persistMerged(sources);
}

export async function updateSource(
  id: string,
  updater: (source: EmojiSource) => EmojiSource,
): Promise<void> {
  const sources = await getSources();
  const idx = sources.findIndex((s) => s.id === id);
  if (idx === -1) return;
  sources[idx] = updater(sources[idx]);
  await keys.sources.setValue(sources);
  await persistMerged(sources);
}

export async function removeSource(id: string): Promise<void> {
  const sources = await getSources();
  const source = sources.find((s) => s.id === id);
  const emojiNames = source ? Object.keys(source.emojis) : [];
  const filtered = sources.filter((s) => s.id !== id);
  await keys.sources.setValue(filtered);
  await persistMerged(filtered);
  await removeEmojiImageData(id, emojiNames);
}

export async function getMergedEmojis(): Promise<EmojiMap> {
  return keys.mergedEmojis.getValue();
}

export async function getSettings(): Promise<Settings> {
  return keys.settings.getValue();
}

export async function updateSettings(partial: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await keys.settings.setValue({ ...current, ...partial });
}

export function watchMergedEmojis(
  callback: (newVal: EmojiMap, oldVal: EmojiMap) => void,
): () => void {
  return keys.mergedEmojis.watch(callback);
}

export function watchSettings(
  callback: (newVal: Settings, oldVal: Settings) => void,
): () => void {
  return keys.settings.watch(callback);
}

export function watchSources(
  callback: (newVal: EmojiSource[], oldVal: EmojiSource[]) => void,
): () => void {
  return keys.sources.watch(callback);
}

// ---------------------------------------------------------------------------
// Per-image storage — same format for Slack and ZIP sources
// Key format: emojiImg:{sourceId}:{name} → image URL (remote or data URL)
// ---------------------------------------------------------------------------

const IMG_KEY_PREFIX = "emojiImg:";

/** Read a single emoji image from storage. */
export async function getEmojiImage(
  sourceId: string,
  name: string,
): Promise<string | null> {
  const key = `${IMG_KEY_PREFIX}${sourceId}:${name}`;
  const result = await browser.storage.local.get(key);
  return (result[key] as string) ?? null;
}

/**
 * Bulk-read all images for a source (used by popup grid and export).
 * Derives the key list from the source's emoji ref map.
 */
export async function getEmojiImageData(
  sourceId: string,
): Promise<EmojiMap | null> {
  const source = (await getSources()).find((s) => s.id === sourceId);
  if (!source) return null;

  const names = Object.keys(source.emojis);
  if (names.length === 0) return null;

  const storageKeys = names.map((n) => `${IMG_KEY_PREFIX}${sourceId}:${n}`);
  const result = await browser.storage.local.get(storageKeys);

  const images: EmojiMap = {};
  for (const name of names) {
    const val = result[`${IMG_KEY_PREFIX}${sourceId}:${name}`];
    if (val) images[name] = val;
  }
  return Object.keys(images).length > 0 ? images : null;
}

const STORAGE_BATCH_SIZE = 50;

/** Write all images for a source as individual keys, batched to avoid large single writes. */
export async function setEmojiImageData(
  sourceId: string,
  images: EmojiMap,
): Promise<void> {
  const entries = Object.entries(images);
  for (let i = 0; i < entries.length; i += STORAGE_BATCH_SIZE) {
    const batch = entries.slice(i, i + STORAGE_BATCH_SIZE);
    const items: Record<string, string> = {};
    for (const [name, url] of batch) {
      items[`${IMG_KEY_PREFIX}${sourceId}:${name}`] = url;
    }
    await browser.storage.local.set(items);
  }
}

/** Remove all image keys for a source. */
export async function removeEmojiImageData(
  sourceId: string,
  emojiNames: string[],
): Promise<void> {
  if (emojiNames.length === 0) return;
  await browser.storage.local.remove(
    emojiNames.map((n) => `${IMG_KEY_PREFIX}${sourceId}:${n}`),
  );
}

// ---------------------------------------------------------------------------
// Excluded domains
// ---------------------------------------------------------------------------

export async function getExcludedDomains(): Promise<string[]> {
  return keys.excludedDomains.getValue();
}

export async function addExcludedDomain(domain: string): Promise<void> {
  const domains = await getExcludedDomains();
  const normalized = domain.toLowerCase().trim();
  if (!normalized || domains.includes(normalized)) return;
  domains.push(normalized);
  await keys.excludedDomains.setValue(domains);
}

export async function removeExcludedDomain(domain: string): Promise<void> {
  const domains = await getExcludedDomains();
  const filtered = domains.filter((d) => d !== domain.toLowerCase().trim());
  await keys.excludedDomains.setValue(filtered);
}

export function watchExcludedDomains(
  callback: (newVal: string[], oldVal: string[]) => void,
): () => void {
  return keys.excludedDomains.watch(callback);
}

/** Build a ref map: name → "ref:{sourceId}/{name}" */
export function buildEmojiRefs(
  sourceId: string,
  emojiNames: string[],
): EmojiMap {
  const refs: EmojiMap = {};
  for (const name of emojiNames) {
    refs[name] = `${EMOJI_REF_PREFIX}${sourceId}/${name}`;
  }
  return refs;
}
