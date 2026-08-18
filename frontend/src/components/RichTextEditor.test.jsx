import { act, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RichTextEditor from "./RichTextEditor";

function renderEditor(props = {}) {
  const ref = createRef();
  render(<RichTextEditor ref={ref} {...props} />);
  return ref;
}

function insertImage(ref, url, alt) {
  act(() => {
    ref.current.insertImage(url, alt);
  });
}

function setHTML(ref, html) {
  act(() => {
    ref.current.setHTML(html);
  });
}

describe("RichTextEditor", () => {
  it("inserts multiple images into the same message", () => {
    const ref = renderEditor();

    insertImage(ref, "https://example.com/first.jpg", "First");
    insertImage(ref, "https://example.com/second.jpg", "Second");

    const html = ref.current.getHTML();
    const imgTags = html.match(/<img/g) || [];
    expect(imgTags).toHaveLength(2);
    expect(html).toContain("first.jpg");
    expect(html).toContain("second.jpg");
  });

  it("notifies onChange after each image insert", () => {
    const onChange = vi.fn();
    const ref = renderEditor({ onChange });

    insertImage(ref, "https://example.com/a.jpg", "A");
    insertImage(ref, "https://example.com/b.jpg", "B");

    expect(onChange).toHaveBeenCalled();
    const lastCallHtml = onChange.mock.calls.at(-1)[0];
    expect(lastCallHtml.match(/<img/g) || []).toHaveLength(2);
  });

  it("shows a resize handle when an inserted image is clicked", () => {
    const ref = renderEditor();
    insertImage(ref, "https://example.com/photo.jpg", "Photo");

    expect(screen.queryByTestId("image-resize-handle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByAltText("Photo"));

    expect(screen.getByTestId("image-resize-handle")).toBeInTheDocument();
  });

  it("hides the resize handle when clicking outside the image", () => {
    const ref = renderEditor();
    insertImage(ref, "https://example.com/photo.jpg", "Photo");
    fireEvent.click(screen.getByAltText("Photo"));
    expect(screen.getByTestId("image-resize-handle")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId("image-resize-handle")).not.toBeInTheDocument();
  });

  it("dragging the resize handle updates the image width and syncs onChange", () => {
    const onChange = vi.fn();
    const ref = renderEditor({ onChange });
    insertImage(ref, "https://example.com/photo.jpg", "Photo");
    const img = screen.getByAltText("Photo");
    fireEvent.click(img);

    const handle = screen.getByTestId("image-resize-handle");
    onChange.mockClear();

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 160 });
    fireEvent.mouseUp(document);

    // jsdom has no real layout engine, so the exact resulting pixel value
    // isn't meaningful — what matters is that a resize was applied (an
    // explicit width was set) and the editor was told its content changed.
    expect(img.style.width).toMatch(/px$/);
    expect(onChange).toHaveBeenCalled();
  });

  it("clearing the editor via setHTML deselects any selected image", () => {
    const ref = renderEditor();
    insertImage(ref, "https://example.com/photo.jpg", "Photo");
    fireEvent.click(screen.getByAltText("Photo"));
    expect(screen.getByTestId("image-resize-handle")).toBeInTheDocument();

    setHTML(ref, "");

    expect(screen.queryByTestId("image-resize-handle")).not.toBeInTheDocument();
  });
});
