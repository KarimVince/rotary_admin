import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// Membership Application-style toolbar: plain muted text buttons on a
// hairline-bottomed strip, not bordered boxes.
const TOOL_BUTTON_CLASS =
  "border-none bg-transparent px-1.5 py-0 text-[13px] text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]";

function ToolbarDivider() {
  return <div className="w-px bg-[var(--border)] my-0.5 mx-1" />;
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
    <div className="border border-[var(--border)] rounded-[8px] overflow-hidden">
      <div className="flex items-center gap-1 py-[7px] px-[11px] border-b border-[var(--line-2)] flex-wrap">
        <button type="button" className={`${TOOL_BUTTON_CLASS} font-bold`} onClick={() => exec("bold")} disabled={disabled}>
          B
        </button>
        <button type="button" className={`${TOOL_BUTTON_CLASS} italic`} onClick={() => exec("italic")} disabled={disabled}>
          I
        </button>
        <button
          type="button"
          className={`${TOOL_BUTTON_CLASS} underline`}
          onClick={() => exec("underline")}
          disabled={disabled}
        >
          U
        </button>
        <ToolbarDivider />
        <button type="button" className={TOOL_BUTTON_CLASS} onClick={() => exec("insertUnorderedList")} disabled={disabled}>
          • List
        </button>
        <button type="button" className={TOOL_BUTTON_CLASS} onClick={() => exec("insertOrderedList")} disabled={disabled}>
          1. List
        </button>
        <ToolbarDivider />
        <button type="button" className={TOOL_BUTTON_CLASS} onClick={handleLink} disabled={disabled}>
          Link
        </button>
        {extraButtons.map((button, index) => (
          <button
            key={button.key}
            type="button"
            className={`${index === 0 ? "ml-auto" : ""} border-none bg-transparent px-1.5 py-0 text-[12.5px] font-semibold text-[var(--accent)] cursor-pointer hover:text-[var(--accent-ink)]`}
            title={button.title}
            onClick={button.onClick}
            disabled={disabled}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div className="relative p-[11px]">
        {isEmpty && (
          <div className="absolute top-[11px] left-[11px] text-[var(--faint)] text-[13.5px] pointer-events-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          data-testid="email-body-editor"
          contentEditable={!disabled}
          onInput={handleInput}
          className="min-h-[220px] text-[13.5px] leading-relaxed text-[var(--ink)] outline-none [&_div]:my-2"
        />
      </div>
    </div>
  );
});

export default RichTextEditor;
