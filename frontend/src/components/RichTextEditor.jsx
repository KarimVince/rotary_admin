import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

const TOOL_BUTTON_CLASS =
  "border border-[var(--color-card-border)] bg-white rounded-lg px-3 py-1.5 text-[13px] text-[var(--color-muted-text-strong)] cursor-pointer hover:border-[var(--color-brand-blue)] hover:text-[var(--color-brand-blue)]";

// Minimal reference (Membership Application-style toolbar): plain muted
// text buttons on a hairline-bottomed strip, not bordered boxes.
const TOOL_BUTTON_CLASS_MINIMAL =
  "border-none bg-transparent px-1.5 py-0 text-[13px] text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]";

function ToolbarDivider({ isMinimal }) {
  return (
    <div
      className={isMinimal ? "w-px bg-[var(--border)] my-0.5 mx-1" : "w-px bg-[var(--color-card-border)] my-1 mx-1.5"}
    />
  );
}

// Reusable contentEditable rich-text body editor, used by every message
// compose flow (member email, friend email, ...). Uncontrolled by design —
// callers preset/reset content imperatively via the ref rather than through
// a `value` prop, since contentEditable doesn't support controlled updates
// without fighting the cursor position.
const RichTextEditor = forwardRef(function RichTextEditor(
  { placeholder = "Write your message…", extraButtons = [], onChange, onEmptyChange, disabled = false },
  ref,
) {
  const { isMinimal } = useTheme();
  const toolButtonClass = isMinimal ? TOOL_BUTTON_CLASS_MINIMAL : TOOL_BUTTON_CLASS;
  const editorRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  function setEmpty(value) {
    setIsEmpty(value);
    onEmptyChange?.(value);
  }

  useImperativeHandle(ref, () => ({
    setHTML(html) {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = html || "";
      const empty = editorRef.current.textContent.trim() === "";
      setEmpty(empty);
      onChange?.(editorRef.current.innerHTML);
    },
    getHTML() {
      return editorRef.current?.innerHTML ?? "";
    },
    insertImage(url, alt = "") {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();

      const img = document.createElement("img");
      img.src = url;
      img.alt = alt;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";

      // Insert at the current cursor position when the selection is inside
      // the editor; otherwise (or in environments without a live selection,
      // e.g. jsdom) just append to the end — simpler and more portable than
      // relying on the deprecated execCommand('insertHTML', ...) for
      // something fully within our control.
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (range && editor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.setEndAfter(img);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.appendChild(img);
      }

      setEmpty(false);
      onChange?.(editor.innerHTML);
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  function exec(command, value) {
    editorRef.current?.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // Some environments (e.g. jsdom in tests) don't implement
      // execCommand at all — formatting is best-effort there.
    }
    handleInput();
  }

  function handleInput() {
    if (!editorRef.current) return;
    setEmpty(editorRef.current.textContent.trim() === "");
    onChange?.(editorRef.current.innerHTML);
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (url) exec("createLink", url);
  }

  return (
    <div className={isMinimal ? "border border-[var(--border)] rounded-[8px] overflow-hidden" : undefined}>
      <div
        className={
          isMinimal
            ? "flex items-center gap-1 py-[7px] px-[11px] border-b border-[var(--line-2)] flex-wrap"
            : "flex gap-1 py-3 border-b border-[var(--color-card-border)] flex-wrap"
        }
      >
        <button type="button" className={`${toolButtonClass} font-bold`} onClick={() => exec("bold")} disabled={disabled}>
          B
        </button>
        <button type="button" className={`${toolButtonClass} italic`} onClick={() => exec("italic")} disabled={disabled}>
          I
        </button>
        <button
          type="button"
          className={`${toolButtonClass} underline`}
          onClick={() => exec("underline")}
          disabled={disabled}
        >
          U
        </button>
        <ToolbarDivider isMinimal={isMinimal} />
        <button type="button" className={toolButtonClass} onClick={() => exec("insertUnorderedList")} disabled={disabled}>
          • List
        </button>
        <button type="button" className={toolButtonClass} onClick={() => exec("insertOrderedList")} disabled={disabled}>
          1. List
        </button>
        <ToolbarDivider isMinimal={isMinimal} />
        <button type="button" className={toolButtonClass} onClick={handleLink} disabled={disabled}>
          Link
        </button>
        {extraButtons.map((button, index) => (
          <button
            key={button.key}
            type="button"
            className={
              isMinimal
                ? `${index === 0 ? "ml-auto" : ""} border-none bg-transparent px-1.5 py-0 text-[12.5px] font-semibold text-[var(--accent)] cursor-pointer hover:text-[var(--accent-ink)]`
                : TOOL_BUTTON_CLASS
            }
            title={button.title}
            onClick={button.onClick}
            disabled={disabled}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div className={isMinimal ? "relative p-[11px]" : "relative mt-4"}>
        {isEmpty && (
          <div
            className={
              isMinimal
                ? "absolute top-[11px] left-[11px] text-[var(--faint)] text-[13.5px] pointer-events-none"
                : "absolute top-0 left-0 text-[var(--color-muted-text)] text-[15px] pointer-events-none"
            }
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          data-testid="email-body-editor"
          contentEditable={!disabled}
          onInput={handleInput}
          className={
            isMinimal
              ? "min-h-[220px] text-[13.5px] leading-relaxed text-[var(--ink)] outline-none [&_div]:my-2"
              : "min-h-[260px] text-[15px] leading-relaxed text-[var(--color-brand-blue-dark)] outline-none [&_div]:my-3"
          }
        />
      </div>
    </div>
  );
});

export default RichTextEditor;
