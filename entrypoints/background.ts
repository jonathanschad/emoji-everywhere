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

const ALARM_NAME = "refresh-emojis";

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
    const redirectUri = browser.identity.getRedirectURL();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const authUrl = getAuthorizeUrl(redirectUri, codeChallenge);

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

async function importZip(name: string, emojis: EmojiMap): Promise<void> {
  const id = generateId();
  const refs = await storeEmojis(id, emojis);

  await addSource({
    type: "zip",
    id,
    name,
    emojis: refs,
    addedAt: Date.now(),
  });
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

async function setupAlarm(): Promise<void> {
  const settings = await getSettings();
  await browser.alarms.clear(ALARM_NAME);
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.refreshInterval,
  });
}

export default defineBackground(() => {
  console.log("Redirect URL:", browser.identity.getRedirectURL());

  browser.runtime.onInstalled.addListener(async () => {
    await refreshAllSlackSources().catch(() => {});
    await setupAlarm();
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    await refreshAllSlackSources().catch(() => {});
  });

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

      case "REMOVE_SOURCE":
        removeSource(message.sourceId).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case "IMPORT_ZIP":
        importZip(message.name, message.emojis)
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
