import type { EmojiMap } from "./types";
import { resolveEmoji } from "./slack";

const EMOJI_PATTERN = /:([\w+-]+):/g;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "CODE",
  "PRE",
  "NOSCRIPT",
  "SELECT",
  "OPTION",
]);

const PROCESSED_ATTR = "data-slack-emoji-processed";

function shouldSkipNode(node: Node): boolean {
  let current = node.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    if (current.isContentEditable) return true;
    current = current.parentElement;
  }
  return false;
}

function createEmojiImg(url: string, name: string): HTMLElement {
  const img = document.createElement("img");
  img.src = url;
  img.alt = `:${name}:`;
  img.title = `:${name}:`;
  img.className = "slack-custom-emoji";
  img.style.cssText = `
    display: inline;
    width: 1em;
    height: 1em;
    object-fit: contain;
    vertical-align: -0.1em;
    margin: 0 1px;
  `;
  return img;
}

function processTextNode(
  textNode: Text,
  emojis: EmojiMap,
): void {
  const text = textNode.textContent;
  if (!text || !EMOJI_PATTERN.test(text)) return;

  EMOJI_PATTERN.lastIndex = 0;

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let hadReplacement = false;

  while ((match = EMOJI_PATTERN.exec(text)) !== null) {
    const emojiName = match[1];
    const emojiUrl = resolveEmoji(emojiName, emojis);

    if (!emojiUrl) continue;

    hadReplacement = true;

    if (match.index > lastIndex) {
      fragment.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index)),
      );
    }

    fragment.appendChild(createEmojiImg(emojiUrl, emojiName));
    lastIndex = match.index + match[0].length;
  }

  if (!hadReplacement) return;

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

export function scanAndReplace(
  root: Node,
  emojis: EmojiMap,
): void {
  if (Object.keys(emojis).length === 0) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !EMOJI_PATTERN.test(node.textContent)) {
        EMOJI_PATTERN.lastIndex = 0;
        return NodeFilter.FILTER_REJECT;
      }
      EMOJI_PATTERN.lastIndex = 0;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    processTextNode(textNode, emojis);
  }
}

export function createObserver(
  emojis: EmojiMap,
): MutationObserver {
  let pending = false;
  const pendingNodes: Set<Node> = new Set();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node instanceof HTMLElement &&
          node.getAttribute(PROCESSED_ATTR) === "true"
        ) {
          continue;
        }
        pendingNodes.add(node);
      }
    }

    if (pendingNodes.size > 0 && !pending) {
      pending = true;
      requestAnimationFrame(() => {
        for (const node of pendingNodes) {
          if (node.isConnected) {
            scanAndReplace(node, emojis);
          }
        }
        pendingNodes.clear();
        pending = false;
      });
    }
  });

  return observer;
}
