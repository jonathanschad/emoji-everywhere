import type { EmojiMap } from "./types";

const DEFAULT_SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID;
const SLACK_API = "https://slack.com/api";

export function getEffectiveClientId(override?: string): string {
  return override?.trim() || DEFAULT_SLACK_CLIENT_ID;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const str = String.fromCharCode(...bytes);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

export function getAuthorizeUrl(
  redirectUri: string,
  codeChallenge: string,
  clientId?: string,
): string {
  const params = new URLSearchParams({
    client_id: getEffectiveClientId(clientId),
    scope: "emoji:read",
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://slack.com/oauth/v2_user/authorize?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  clientId?: string,
): Promise<{ accessToken: string; teamName?: string }> {
  const res = await fetch(`${SLACK_API}/oauth.v2.user.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEffectiveClientId(clientId),
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Slack API error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id: string; name?: string };
  };

  if (!data.ok || !data.access_token) {
    throw new Error(`Slack OAuth failed: ${data.error ?? "unknown"}`);
  }

  let teamName = data.team?.name;
  if (!teamName && data.access_token) {
    teamName = await fetchTeamName(data.access_token);
  }

  return {
    accessToken: data.access_token,
    teamName,
  };
}

async function fetchTeamName(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${SLACK_API}/auth.test`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = (await res.json()) as { ok: boolean; team?: string };
    return data.ok ? data.team : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchEmojis(token: string): Promise<EmojiMap> {
  const allEmojis: EmojiMap = {};
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { token };
    if (cursor) params.cursor = cursor;

    const res = await fetch(`${SLACK_API}/emoji.list`, {
      method: "POST",
      body: new URLSearchParams(params),
    });

    if (!res.ok) {
      throw new Error(`Slack API request failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      ok: boolean;
      emoji?: Record<string, string>;
      error?: string;
      response_metadata?: { next_cursor?: string };
    };

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    Object.assign(allEmojis, data.emoji ?? {});
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return allEmojis;
}

export function resolveEmoji(
  name: string,
  emojis: EmojiMap,
  maxDepth = 5,
): string | null {
  let current = emojis[name];
  let depth = 0;

  while (current?.startsWith("alias:") && depth < maxDepth) {
    const aliasName = current.slice(6);
    current = emojis[aliasName];
    depth++;
  }

  if (!current || current.startsWith("alias:")) return null;
  return current;
}

/**
 * Resolve all aliases in an emoji map, returning a flat map where every
 * entry points to an actual URL. Broken/circular aliases are dropped.
 */
export function resolveAllEmojis(rawEmojis: EmojiMap): EmojiMap {
  const resolved: EmojiMap = {};
  for (const name of Object.keys(rawEmojis)) {
    const url = resolveEmoji(name, rawEmojis);
    if (url) resolved[name] = url;
  }
  return resolved;
}
