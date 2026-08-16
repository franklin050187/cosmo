"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  labelId?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 4, labelId }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const wrapSelection = useCallback((tag: keyof HTMLElementTagNameMap, decorate?: (el: HTMLElement) => void) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    let wrapper: Element | null = null;
    let node: Node | null = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node && node.parentElement) {
      wrapper = node.parentElement.closest(tag);
    }

    if (wrapper) {
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        parent.removeChild(wrapper);
      }
    } else {
      const el = document.createElement(tag);
      if (decorate) decorate(el);
      if (range.collapsed) {
        el.appendChild(document.createElement("br"));
        range.insertNode(el);
        const r = document.createRange();
        r.setStart(el, 0);
        r.collapse(true);
        selection.removeAllRanges();
        selection.addRange(r);
      } else {
        try {
          range.surroundContents(el);
        } catch {
          const fragment = range.extractContents();
          el.appendChild(fragment);
          range.insertNode(el);
        }
        const r = document.createRange();
        r.setStartAfter(el);
        r.collapse(true);
        selection.removeAllRanges();
        selection.addRange(r);
      }
    }
    onChange(editor.innerHTML);
  }, [onChange]);

  const confirmLink = useCallback(() => {
    if (!linkUrl) return;
    wrapSelection("a", (el) => {
      el.setAttribute("href", linkUrl);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    });
    setLinkUrl("");
    setLinkMode(false);
  }, [linkUrl, wrapSelection]);

  const toggleList = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    let node: Node | null = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const existing = node?.parentElement?.closest?.("ul");
    if (existing) {
      while (existing.firstChild) {
        const child = existing.firstChild as Element;
        if (child.tagName === "LI") {
          existing.parentNode?.insertBefore(child, existing);
          while (child.firstChild) existing.parentNode?.insertBefore(child.firstChild, child);
          existing.parentNode?.removeChild(child);
        } else {
          existing.parentNode?.insertBefore(child, existing);
        }
      }
      existing.parentNode?.removeChild(existing);
    } else {
      const ul = document.createElement("ul");
      const li = document.createElement("li");
      if (range.collapsed) {
        li.appendChild(document.createElement("br"));
        ul.appendChild(li);
        range.insertNode(ul);
      } else {
        try {
          range.surroundContents(li);
        } catch {
          const fragment = range.extractContents();
          li.appendChild(fragment);
          range.insertNode(li);
        }
        ul.appendChild(li);
        if (li.parentNode !== ul) {
          li.parentNode?.insertBefore(ul, li);
          ul.appendChild(li);
        }
      }
    }
    onChange(editor.innerHTML);
  }, [onChange]);

  const removeFormat = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const unwrappable = new Set(["B", "I", "U", "EM", "STRONG", "A"]);
    const candidates: Element[] = [];
    const root = range.commonAncestorContainer;
    const rootEl = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
    if (!rootEl) return;

    const collect = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE && unwrappable.has((node as Element).tagName)) {
        const elRange = document.createRange();
        elRange.selectNodeContents(node);
        const startsInside = elRange.compareBoundaryPoints(Range.START_TO_START, range) >= 0;
        const endsInside = elRange.compareBoundaryPoints(Range.END_TO_END, range) <= 0;
        if (startsInside && endsInside) candidates.push(node as Element);
      }
      for (const child of Array.from(node.childNodes)) collect(child);
    };
    collect(rootEl);

    for (const el of candidates) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
    onChange(editor.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? "");
  }, [onChange]);

  return (
    <div dir="ltr" className="border border-gray-400 rounded overflow-hidden">
      <div className="flex gap-0.5 px-1 py-1 bg-[#0a1e33] border-b border-gray-400">
        <ToolBtn onClick={() => wrapSelection("b")} title="Bold">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn onClick={() => wrapSelection("i")} title="Italic">
          <em>I</em>
        </ToolBtn>
        <ToolBtn onClick={() => wrapSelection("u")} title="Underline">
          <span className="underline">U</span>
        </ToolBtn>
        <ToolBtn onClick={() => { setLinkMode(true); setLinkUrl(""); linkInputRef.current?.focus(); }} title="Link">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={toggleList} title="Bullet list">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </ToolBtn>
        {linkMode && (
          <>
            <input
              ref={linkInputRef}
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkMode(false);
                  setLinkUrl("");
                }
              }}
              className="flex-1 px-2 py-1 text-xs text-white bg-[#021526] border border-[#1C598C]/40 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            <ToolBtn onClick={confirmLink} title="Set link">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </ToolBtn>
            <ToolBtn onClick={() => { setLinkMode(false); setLinkUrl(""); }} title="Cancel link">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </ToolBtn>
          </>
        )}
        <ToolBtn onClick={removeFormat} title="Clear formatting">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </ToolBtn>
      </div>
      <div
        ref={editorRef}
        id={labelId}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : placeholder || "Rich text editor"}
        role="textbox"
        aria-multiline="true"
        dir="ltr"
        className="w-full bg-[#021526] text-white p-2 focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-500 [&_a]:text-cyan-400 [&_a]:underline [&_li]:ml-4 [&_ul]:list-disc"
        style={{ direction: "ltr", unicodeBidi: "embed", minHeight: `${rows * 1.5}rem` }}
      />
    </div>
  );
}

function ToolBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="px-1.5 py-0.5 text-xs text-blue-200 hover:text-white hover:bg-[#1C598C]/40 rounded transition-colors"
    >
      {children}
    </button>
  );
}
