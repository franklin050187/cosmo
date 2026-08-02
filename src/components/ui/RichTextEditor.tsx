"use client";

import { useRef, useCallback, useEffect } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 4 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const exec = useCallback((cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
  }, []);

  const handleInput = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? "");
  }, [onChange]);

  const insertLink = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (url) exec("createLink", url);
  }, [exec]);

  return (
    <div dir="ltr" className="border border-gray-400 rounded overflow-hidden">
      <div className="flex gap-0.5 px-1 py-1 bg-[#0a1e33] border-b border-gray-400">
        <ToolBtn onClick={() => exec("bold")} title="Bold">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic">
          <em>I</em>
        </ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline">
          <span className="underline">U</span>
        </ToolBtn>
        <ToolBtn onClick={insertLink} title="Link">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Bullet list">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("removeFormat")} title="Clear formatting">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </ToolBtn>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
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
      title={title}
      className="px-1.5 py-0.5 text-xs text-blue-200 hover:text-white hover:bg-[#1C598C]/40 rounded transition-colors"
    >
      {children}
    </button>
  );
}
