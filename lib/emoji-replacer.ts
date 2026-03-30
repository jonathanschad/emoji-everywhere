import type { EmojiMap } from "./types";
import { resolveEmoji } from "./slack";
import { resolveImageUrl, TRANSPARENT_PIXEL } from "./emoji-image-resolver";

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
const POPOVER_ID = "slack-emoji-popover";
const POPOVER_GAP = 8;

let popoverEl: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function getPopover(): HTMLElement {
  if (popoverEl && popoverEl.isConnected) return popoverEl;

  const el = document.createElement("div");
  el.id = POPOVER_ID;
  el.setAttribute("popover", "manual");
  el.style.cssText = `
    position: fixed;
    margin: 0;
    padding: 8px 12px;
    background: #1a1a2e;
    color: #fff;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    pointer-events: none;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: none;
    opacity: 0;
    transition: opacity 0.12s ease;
  `;

  const preview = document.createElement("img");
  preview.style.cssText = `
    width: 72px;
    height: 72px;
    object-fit: contain;
    flex-shrink: 0;
  `;
  preview.dataset.role = "preview";

  const label = document.createElement("span");
  label.style.cssText = `
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  label.dataset.role = "label";

  el.appendChild(preview);
  el.appendChild(label);
  document.body.appendChild(el);
  popoverEl = el;
  return el;
}

function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const popW = popover.offsetWidth;
  const popH = popover.offsetHeight;

  let top = rect.top - popH - POPOVER_GAP;
  let left = rect.left + rect.width / 2 - popW / 2;

  if (top < POPOVER_GAP) {
    top = rect.bottom + POPOVER_GAP;
  }
  left = Math.max(POPOVER_GAP, Math.min(left, window.innerWidth - popW - POPOVER_GAP));

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function showEmojiPopover(img: HTMLImageElement): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const popover = getPopover();
  const preview = popover.querySelector('[data-role="preview"]') as HTMLImageElement;
  const label = popover.querySelector('[data-role="label"]') as HTMLSpanElement;

  preview.src = img.src;
  label.textContent = img.alt;

  try { popover.showPopover(); } catch { /* already open */ }

  positionPopover(popover, img);
  popover.style.opacity = "1";
}

function hideEmojiPopover(): void {
  hideTimeout = setTimeout(() => {
    if (!popoverEl) return;
    popoverEl.style.opacity = "0";
    setTimeout(() => {
      try { popoverEl?.hidePopover(); } catch { /* already closed */ }
    }, 120);
  }, 80);
}

function attachPopoverListeners(img: HTMLElement): void {
  img.addEventListener("mouseenter", () => showEmojiPopover(img as HTMLImageElement));
  img.addEventListener("mouseleave", hideEmojiPopover);
}

function shouldSkipNode(node: Node): boolean {
  let current = node.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    if (current.isContentEditable) return true;
    if (current.dataset?.slackEmojiSkip) return true;
    current = current.parentElement;
  }
  return false;
}

function createEmojiImg(ref: string, name: string): HTMLElement {
  const img = document.createElement("img");
  img.src = TRANSPARENT_PIXEL;
  img.alt = `:${name}:`;
  img.className = "slack-custom-emoji";
  img.style.cssText = `
    display: inline;
    width: 1em;
    height: 1em;
    object-fit: contain;
    vertical-align: -0.1em;
    margin: 0 1px;
  `;

  resolveImageUrl(ref).then((resolved) => {
    if (img.isConnected) img.src = resolved;
  });

  attachPopoverListeners(img);
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
