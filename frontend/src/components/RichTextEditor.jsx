import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Membership Application-style toolbar: plain muted text buttons on a
// hairline-bottomed strip, not bordered boxes.
const TOOL_BUTTON_CLASS =
  "border-none bg-transparent px-1.5 py-0 text-[13px] text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]";

const MIN_IMAGE_WIDTH = 60;
const HANDLE_SIZE = 12;

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
  const wrapperRef = useRef(null);
  const editorRef = useRef(null);
  // Multiple-images fix: clicking a toolbar button (e.g. "Image") blurs the
  // contentEditable field, and browsers then clear/collapse its live
  // Selection — so `window.getSelection()` no longer points inside the
  // editor by the time insertImage() runs. Without remembering the last
  // real cursor position ourselves, every image after the first one used to
  // fall through to "append at the very end" instead of the cursor,
  // regardless of where the user had actually clicked. Saved on every
  // mouseup/keyup while the selection is inside the editor.
  const lastRangeRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Resizable images: plain contentEditable divs don't get native resize
  // handles in current browsers (that behavior is tied to the long-deprecated
  // execCommand('enableObjectResizing')/designMode, not a bare
  // contentEditable div) — so this draws its own drag handle over whichever
  // <img> the user last clicked. `selectedImage` is the raw DOM node (images
  // here are plain innerHTML, not React elements), `handleRect` mirrors its
  // current box so the little square can be positioned/re-rendered as React
  // state instead of poking the DOM by hand on every mousemove.
  const [selectedImage, setSelectedImage] = useState(null);
  const [handleRect, setHandleRect] = useState(null);

  function setEmpty(value) {
    setIsEmpty(value);
    onEmptyChange?.(value);
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      lastRangeRef.current = range.cloneRange();
    }
  }

  function updateHandleRect(img) {
    setHandleRect({
      left: img.offsetLeft + img.offsetWidth - HANDLE_SIZE / 2,
      top: img.offsetTop + img.offsetHeight - HANDLE_SIZE / 2,
    });
  }

  function selectImage(img) {
    setSelectedImage(img);
    updateHandleRect(img);
  }

  function clearImageSelection() {
    setSelectedImage(null);
    setHandleRect(null);
  }

  function handleEditorClick(event) {
    if (event.target.tagName === "IMG") {
      selectImage(event.target);
    } else {
      clearImageSelection();
    }
  }

  // Click anywhere outside the editor (including the toolbar) deselects the
  // image and hides the handle.
  useEffect(() => {
    function handlePointerDown(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        clearImageSelection();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleResizeStart(event) {
    const img = selectedImage;
    if (!img || !editorRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const maxWidth = editorRef.current.clientWidth;

    function handleMouseMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(Math.max(startWidth + delta, MIN_IMAGE_WIDTH), maxWidth);
      img.style.width = `${nextWidth}px`;
      // Deliberately no explicit `height` — leaving it unset keeps the
      // image's natural aspect ratio as `width` changes, same as the
      // browser's own native image-resize handles would.
      img.style.height = "auto";
      updateHandleRect(img);
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      // Resizing mutates the <img> node directly (it's not a React element),
      // so nothing tells the editor its content changed — sync manually,
      // same as insertImage() does below.
      onChange?.(editorRef.current.innerHTML);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  useImperativeHandle(ref, () => ({
    setHTML(html) {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = html || "";
      const empty = editorRef.current.textContent.trim() === "";
      setEmpty(empty);
      clearImageSelection();
      lastRangeRef.current = null;
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
      img.style.cursor = "pointer";

      // Insert at the current cursor position when the selection is inside
      // the editor; otherwise fall back to the last known position inside
      // the editor (see lastRangeRef's comment — this is what makes
      // inserting several images in one message actually land where
      // expected instead of always at the end); if neither is available
      // (e.g. jsdom in tests, or nothing was ever focused), just append.
      const selection = window.getSelection();
      let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = lastRangeRef.current;
      }
      if (range && editor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.setEndAfter(img);
        selection.removeAllRanges();
        selection.addRange(range);
        lastRangeRef.current = range.cloneRange();
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
    <div className="border border-[var(--border)] rounded-[8px] overflow-hidden" ref={wrapperRef}>
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
          onClick={handleEditorClick}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          className="min-h-[220px] text-[13.5px] leading-relaxed text-[var(--ink)] outline-none [&_div]:my-2 [&_img]:align-bottom"
        />
        {selectedImage && handleRect && (
          <div
            data-testid="image-resize-handle"
            onMouseDown={handleResizeStart}
            className="absolute rounded-[2px] border border-white bg-[var(--accent)] cursor-nwse-resize"
            style={{
              left: handleRect.left,
              top: handleRect.top,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
            }}
          />
        )}
      </div>
    </div>
  );
});

export default RichTextEditor;
