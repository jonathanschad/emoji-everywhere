import {
  getSources,
  getSource,
  addSource,
  updateSource,
  removeSource,
  getSettings,
  setEmojiImageData,
  removeEmojiImageData,
  buildEmojiRefs,
  getExcludedDomains,
  addExcludedDomain,
  removeExcludedDomain,
  watchExcludedDomains,
  watchSettings,
} from "@/lib/storage";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  getAuthorizeUrl,
  exchangeCodeForToken,
  fetchEmojis,
  resolveAllEmojis,
} from "@/lib/slack";
import { preCacheImages, clearImageCache } from "@/lib/emoji-cache";
import type { EmojiSource, ExtensionStatus, SlackSource, SourceSummary, EmojiMap } from "@/lib/types";
import predefinedExclusionsRaw from "@/excluded-domains.txt?raw";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const SEEDED_KEY = "seededPredefinedExclusions";

function parsePredefinedExclusions(): string[] {
  return predefinedExclusionsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * Seeds predefined exclusions that haven't been seeded yet.
 * Tracks which domains were seeded so user-removed ones aren't re-added.
 */
async function seedPredefinedExclusions(): Promise<void> {
  const predefined = parsePredefinedExclusions();
  if (predefined.length === 0) return;

  const result = await browser.storage.local.get(SEEDED_KEY);
  const alreadySeeded: string[] = (result[SEEDED_KEY] as string[]) ?? [];
  const toSeed = predefined.filter((d) => !alreadySeeded.includes(d));

  for (const domain of toSeed) {
    await addExcludedDomain(domain);
  }

  if (toSeed.length > 0) {
    await browser.storage.local.set({
      [SEEDED_KEY]: [...alreadySeeded, ...toSeed],
    });
  }
}

// ---------------------------------------------------------------------------
// Icon + badge — grey smiley and "OFF" badge when extension is inactive.
// Grey PNGs are generated at build time by the greyIconPlugin in wxt.config.
// ---------------------------------------------------------------------------

// Resolve the correct action API (MV3: browser.action, MV2: browser.browserAction)
const actionApi: typeof browser.action =
  browser.action ?? (browser as any).browserAction;

function isHostnameExcluded(hostname: string, excludedDomains: string[]): boolean {
  return excludedDomains.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
}

function drawGreyIcon(size: number): ImageData {
  const s = size / 128;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  if (typeof OffscreenCanvas !== "undefined") {
    ctx = new OffscreenCanvas(size, size).getContext("2d")!;
  } else {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    ctx = c.getContext("2d")!;
  }

  ctx.beginPath();
  ctx.arc(64 * s, 64 * s, 60 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#9CA3AF";
  ctx.fill();

  ctx.fillStyle = "#6B7280";
  ctx.beginPath();
  ctx.arc(46 * s, 52 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(82 * s, 52 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = "#6B7280";
  ctx.lineWidth = 5 * s;
  ctx.lineCap = "round";
  ctx.moveTo(38 * s, 78 * s);
  ctx.quadraticCurveTo(64 * s, 102 * s, 90 * s, 78 * s);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

async function setTabIcon(tabId: number, inactive: boolean): Promise<void> {
  const pathObj = inactive
    ? { 16: "icons-grey/16.png", 32: "icons-grey/32.png", 48: "icons-grey/48.png", 128: "icons-grey/128.png" }
    : { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" };

  // Strategy 1: path dictionary
  try {
    await actionApi.setIcon({ tabId, path: pathObj });
    return;
  } catch (e) {
    console.warn("[emoji-ext] setIcon path dict failed:", e);
  }

  // Strategy 2: single path string (simpler, wider compat)
  try {
    const singlePath = inactive ? "icons-grey/48.png" : "icons/48.png";
    await actionApi.setIcon({ tabId, path: singlePath });
    return;
  } catch (e) {
    console.warn("[emoji-ext] setIcon single path failed:", e);
  }

  // Strategy 3: imageData drawn via canvas (only for grey; active uses manifest default)
  if (inactive) {
    try {
      const imageData: Record<string, ImageData> = {};
      for (const size of [16, 32, 48, 128]) {
        imageData[String(size)] = drawGreyIcon(size);
      }
      await actionApi.setIcon({ tabId, imageData });
      return;
    } catch (e) {
      console.warn("[emoji-ext] setIcon imageData failed:", e);
    }
  }
}

async function updateIconForTab(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;

    const hostname = new URL(tab.url).hostname.toLowerCase();
    if (!hostname) return;

    const [excludedDomains, settings] = await Promise.all([
      getExcludedDomains(),
      getSettings(),
    ]);

    const inactive = !settings.enabled || isHostnameExcluded(hostname, excludedDomains);

    await setTabIcon(tabId, inactive);

    await actionApi.setBadgeText({ tabId, text: inactive ? "OFF" : "" });
    if (inactive) {
      await actionApi.setBadgeBackgroundColor({ tabId, color: "#6B7280" });
      try {
        await actionApi.setBadgeTextColor({ tabId, color: "#FFFFFF" });
      } catch {
        // setBadgeTextColor not available in older Firefox
      }
    }
  } catch (e) {
    console.warn("updateIconForTab failed:", e);
  }
}

async function updateIconForActiveTab(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await updateIconForTab(tab.id);
  } catch {}
}

function generateId(): string {
  return crypto.randomUUID();
}

function summarizeSource(source: EmojiSource): SourceSummary {
  return {
    id: source.id,
    type: source.type,
    name: source.name,
    emojiCount: Object.keys(source.emojis).length,
    lastRefresh: source.type === "slack" ? source.lastRefresh : source.addedAt,
    error: source.type === "slack" ? source.error : null,
  };
}

/**
 * Shared import logic: stores resolved images as individual keys and
 * returns a lightweight ref map for the source's emojis field.
 */
async function storeEmojis(
  sourceId: string,
  resolvedImages: EmojiMap,
): Promise<EmojiMap> {
  await setEmojiImageData(sourceId, resolvedImages);
  return buildEmojiRefs(sourceId, Object.keys(resolvedImages));
}

async function startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await getSettings();
    const clientId = settings.slackClientId || undefined;
    const redirectUri = browser.identity.getRedirectURL();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const authUrl = getAuthorizeUrl(redirectUri, codeChallenge, clientId);

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    const url = new URL(responseUrl);
    const error = url.searchParams.get("error");

    if (error) {
      return { success: false, error: `Slack denied access: ${error}` };
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return { success: false, error: "No authorization code received" };
    }

    const { accessToken, teamName } = await exchangeCodeForToken(
      code,
      redirectUri,
      codeVerifier,
      clientId,
    );

    const existing = (await getSources()).find(
      (s) => s.type === "slack" && s.teamName === teamName,
    );
    if (existing) {
      await updateSource(existing.id, (s) => ({
        ...s,
        token: accessToken,
        teamName: teamName ?? (s as SlackSource).teamName,
        error: null,
      }) as EmojiSource);
      await refreshSourceEmojis(existing.id);
    } else {
      const source: SlackSource = {
        type: "slack",
        id: generateId(),
        name: teamName ?? "Slack Workspace",
        teamName: teamName ?? null,
        token: accessToken,
        emojis: {},
        lastRefresh: null,
        error: null,
      };
      await addSource(source);
      await refreshSourceEmojis(source.id);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

async function refreshSourceEmojis(sourceId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source || source.type !== "slack") return;

  try {
    const rawEmojis = await fetchEmojis(source.token);
    const resolvedImages = resolveAllEmojis(rawEmojis);

    const oldNames = Object.keys(source.emojis);
    const refs = await storeEmojis(sourceId, resolvedImages);

    const removedNames = oldNames.filter((n) => !(n in refs));
    if (removedNames.length > 0) {
      await removeEmojiImageData(sourceId, removedNames);
    }

    await updateSource(sourceId, (s) => ({
      ...s,
      emojis: refs,
      lastRefresh: Date.now(),
      error: null,
    }) as EmojiSource);

    preCacheImages(resolvedImages).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateSource(sourceId, (s) => ({
      ...s,
      error: message,
    }) as EmojiSource);
    throw err;
  }
}

async function refreshAllSlackSources(): Promise<void> {
  const sources = await getSources();
  const slackSources = sources.filter((s) => s.type === "slack");

  await Promise.allSettled(
    slackSources.map((s) => refreshSourceEmojis(s.id)),
  );
}

async function getStatus(): Promise<ExtensionStatus> {
  const sources = await getSources();
  let totalEmojiCount = 0;
  const allNames = new Set<string>();

  const summaries = sources.map((s) => {
    const summary = summarizeSource(s);
    totalEmojiCount += summary.emojiCount;
    for (const name of Object.keys(s.emojis)) {
      allNames.add(name);
    }
    return summary;
  });

  const duplicateCount = totalEmojiCount - allNames.size;

  return { sources: summaries, totalEmojiCount, duplicateCount };
}

async function refreshStaleSlackSources(): Promise<void> {
  const sources = await getSources();
  const now = Date.now();
  const stale = sources.filter(
    (s) =>
      s.type === "slack" &&
      (s.lastRefresh === null || now - s.lastRefresh >= STALE_THRESHOLD_MS),
  );
  if (stale.length === 0) return;
  await Promise.allSettled(stale.map((s) => refreshSourceEmojis(s.id)));
}

export default defineBackground(() => {
  console.log("Redirect URL:", browser.identity.getRedirectURL());

  // Seed predefined exclusions on install and update, then refresh the icon
  browser.runtime.onInstalled.addListener(async () => {
    await seedPredefinedExclusions();
    await updateIconForActiveTab();
  });

  // Set the icon immediately for the currently active tab on startup
  updateIconForActiveTab();

  // Update the action icon whenever the active tab or its URL changes
  browser.tabs.onActivated.addListener(({ tabId }) => {
    updateIconForTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      updateIconForTab(tabId);
    }
  });

  // Re-evaluate the icon when excluded domains or global settings change
  watchExcludedDomains(() => updateIconForActiveTab());
  watchSettings(() => updateIconForActiveTab());

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;

    switch (message.type) {
      case "START_OAUTH":
        startOAuthFlow().then((result) => {
          sendResponse({ type: "OAUTH_COMPLETE", ...result });
        });
        return true;

      case "FETCH_EMOJIS":
        refreshSourceEmojis(message.sourceId)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;

      case "FETCH_ALL_EMOJIS":
        refreshAllSlackSources()
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;

      case "GET_STATUS":
        getStatus().then((status) => {
          sendResponse({ type: "STATUS_RESPONSE", status });
        });
        return true;

      case "RENAME_SOURCE":
        updateSource(message.sourceId, (s) => ({
          ...s,
          name: message.name,
        }) as EmojiSource)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;

      case "REMOVE_SOURCE":
        removeSource(message.sourceId).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case "ADD_EXCLUDED_DOMAIN":
        addExcludedDomain(message.domain)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;

      case "REMOVE_EXCLUDED_DOMAIN":
        removeExcludedDomain(message.domain)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;

      case "GET_EXCLUDED_DOMAINS":
        getExcludedDomains().then((domains) => {
          sendResponse({ domains });
        });
        return true;

      case "REFRESH_IF_STALE":
        refreshStaleSlackSources()
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;
    }

    return false;
  });
});
