import type { EmojiMap } from "./types";
import { searchEmojis } from "./emoji-search";
import { resolveImageUrl, TRANSPARENT_PIXEL } from "./emoji-image-resolver";

const CONTAINER_ID = "slack-emoji-autocomplete";
const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 1;

let containerEl: HTMLElement | null = null;
let activeField: HTMLElement | null = null;
let selectedIndex = 0;
let currentMatches: { name: string; url: string }[] = [];
let emojis: EmojiMap = {};
let colonStart = -1;

export function initAutocomplete(emojiMap: EmojiMap): () => void {
  emojis = emojiMap;

  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("blur", onBlur, true);

  return () => {
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("blur", onBlur, true);
    destroy();
  };
}

export function updateEmojis(emojiMap: EmojiMap): void {
  emojis = emojiMap;
}

function onInput(e: Event): void {
  const target = e.target as HTMLElement;
  if (!target) return;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    handleStandardInput(target);
  } else if (target.isContentEditable) {
    handleContentEditable(target);
  }
}

function handleStandardInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  const cursorPos = el.selectionStart;
  if (cursorPos == null) return;

  const text = el.value.slice(0, cursorPos);
  const result = extractQuery(text);

  if (!result) {
    hide();
    return;
  }

  colonStart = result.colonIndex;
  activeField = el;
  showSuggestions(result.query, () => getCaretCoordsForInput(el, result.colonIndex));
}

function handleContentEditable(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  if (!range.collapsed) return;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    hide();
    return;
  }

  const text = node.textContent?.slice(0, range.startOffset) ?? "";
  const result = extractQuery(text);

  if (!result) {
    hide();
    return;
  }

  colonStart = result.colonIndex;
  activeField = el;

  showSuggestions(result.query, () => {
    const r = document.createRange();
    r.setStart(node, result.colonIndex);
    r.setEnd(node, result.colonIndex);
    const rect = r.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left };
  });
}

function extractQuery(textBeforeCursor: string): { query: string; colonIndex: number } | null {
  const lastColon = textBeforeCursor.lastIndexOf(":");
  if (lastColon === -1) return null;

  const query = textBeforeCursor.slice(lastColon + 1);

  if (query.length < MIN_QUERY_LENGTH) return null;
  if (/\s/.test(query)) return null;
  if (!/^[\w+-]+$/.test(query)) return null;

  const beforeColon = textBeforeCursor.slice(0, lastColon);
  if (beforeColon.length > 0 && textBeforeCursor[lastColon - 1] === ":") return null;

  return { query, colonIndex: lastColon };
}

function getCaretCoordsForInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  charIndex: number,
): { top: number; left: number } {
  const mirror = document.createElement("div");
  const computed = getComputedStyle(el);

  const props = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle",
    "letterSpacing", "wordSpacing", "textIndent", "textTransform",
    "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
    "borderLeftWidth", "borderRightWidth", "borderTopWidth", "borderBottomWidth",
    "boxSizing", "lineHeight",
  ] as const;

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.style.width = computed.width;

  for (const prop of props) {
    mirror.style[prop as any] = computed[prop as any];
  }

  const textBefore = el.value.slice(0, charIndex);
  mirror.textContent = textBefore;

  const marker = document.createElement("span");
  marker.textContent = "|";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const elRect = el.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top = elRect.top + (markerRect.top - mirrorRect.top) + markerRect.height;
  const left = elRect.left + (markerRect.left - mirrorRect.left);

  document.body.removeChild(mirror);

  return { top, left };
}

function showSuggestions(
  query: string,
  getPosition: () => { top: number; left: number },
): void {
  currentMatches = searchEmojis(query, emojis, MAX_SUGGESTIONS);

  if (currentMatches.length === 0) {
    hide();
    return;
  }

  selectedIndex = 0;
  const container = getContainer();
  renderSuggestions(container);

  const pos = getPosition();
  container.style.top = `${pos.top + 4}px`;
  container.style.left = `${pos.left}px`;
  container.style.display = "block";

  requestAnimationFrame(() => {
    clampToViewport(container);
  });
}

function clampToViewport(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();

  if (rect.right > window.innerWidth - 8) {
    el.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.left < 8) {
    el.style.left = "8px";
  }

  if (rect.bottom > window.innerHeight - 8) {
    const currentTop = parseFloat(el.style.top);
    el.style.top = `${currentTop - rect.height - 30}px`;
  }
}

function renderSuggestions(container: HTMLElement): void {
  container.innerHTML = "";

  for (let i = 0; i < currentMatches.length; i++) {
    const match = currentMatches[i];
    const row = document.createElement("div");
    row.dataset.index = String(i);
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.08s;
      background: ${i === selectedIndex ? "rgba(255,255,255,0.1)" : "transparent"};
    `;

    const img = document.createElement("img");
    img.src = TRANSPARENT_PIXEL;
    img.alt = `:${match.name}:`;
    img.style.cssText = "width: 22px; height: 22px; object-fit: contain; flex-shrink: 0;";
    resolveImageUrl(match.url).then((resolved) => { img.src = resolved; });

    const nameSpan = document.createElement("span");
    nameSpan.textContent = `:${match.name}:`;
    nameSpan.style.cssText = `
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    `;

    row.appendChild(img);
    row.appendChild(nameSpan);

    row.addEventListener("mouseenter", () => {
      selectedIndex = i;
      updateSelection(container);
    });

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectEmoji(i);
    });

    container.appendChild(row);
  }
}

function updateSelection(container: HTMLElement): void {
  const rows = container.children;
  for (let i = 0; i < rows.length; i++) {
    (rows[i] as HTMLElement).style.background =
      i === selectedIndex ? "rgba(255,255,255,0.1)" : "transparent";
  }

  const selected = rows[selectedIndex] as HTMLElement | undefined;
  selected?.scrollIntoView({ block: "nearest" });
}

function onKeydown(e: KeyboardEvent): void {
  if (!containerEl || containerEl.style.display === "none") return;
  if (currentMatches.length === 0) return;

  const container = containerEl;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    selectedIndex = (selectedIndex + 1) % currentMatches.length;
    updateSelection(container);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
    updateSelection(container);
    return;
  }

  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    selectEmoji(selectedIndex);
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    hide();
  }
}

function selectEmoji(index: number): void {
  const match = currentMatches[index];
  if (!match || !activeField) return;

  const replacement = `:${match.name}: `;

  if (
    activeField instanceof HTMLInputElement ||
    activeField instanceof HTMLTextAreaElement
  ) {
    const before = activeField.value.slice(0, colonStart);
    const after = activeField.value.slice(activeField.selectionStart ?? colonStart);
    activeField.value = before + replacement + after;
    const newPos = before.length + replacement.length;
    activeField.setSelectionRange(newPos, newPos);
    activeField.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (activeField.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent ?? "";
    const cursorOffset = range.startOffset;
    const before = text.slice(0, colonStart);
    const after = text.slice(cursorOffset);
    node.textContent = before + replacement + after;

    const newRange = document.createRange();
    const newOffset = before.length + replacement.length;
    newRange.setStart(node, newOffset);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    activeField.dispatchEvent(new Event("input", { bubbles: true }));
  }

  hide();
}

function onDocumentClick(e: Event): void {
  if (!containerEl) return;
  if (containerEl.contains(e.target as Node)) return;
  hide();
}

function onBlur(e: FocusEvent): void {
  if (!containerEl) return;
  if (containerEl.contains(e.relatedTarget as Node)) return;
  setTimeout(hide, 100);
}

function getContainer(): HTMLElement {
  if (containerEl && containerEl.isConnected) return containerEl;

  const el = document.createElement("div");
  el.id = CONTAINER_ID;
  el.dataset.slackEmojiSkip = "true";
  el.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #1a1a2e;
    color: #e0e0e0;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-height: 320px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    min-width: 220px;
    max-width: 320px;
    display: none;
    border: 1px solid rgba(255,255,255,0.08);
  `;

  document.body.appendChild(el);
  containerEl = el;
  return el;
}

function hide(): void {
  if (containerEl) {
    containerEl.style.display = "none";
  }
  currentMatches = [];
  activeField = null;
  colonStart = -1;
}

function destroy(): void {
  hide();
  containerEl?.remove();
  containerEl = null;
}
