import logo from "../assets/rotary-logo.png";

// Swapping in a real/updated logo later is a one-file replacement: drop the
// new image in as src/assets/rotary-logo.png (or repoint this single import)
// — no other code needs to change. Also update backend/app/assets/rotary-logo.png
// (Story 2b.14's PDF/PPTX report generation keeps its own copy so report
// generation doesn't depend on the frontend source tree being present).
const APP_TITLE = "Rotary Club of Discovery Bay Database";

export default function BrandHeader({ size = "medium" }) {
  // The login page has no other heading, so its (large) brand title is the
  // page's h1. In the post-login app shell, every page already has its own
  // h1, so the header there uses non-heading text instead of competing.
  const TitleTag = size === "large" ? "h1" : "p";

  return (
    <div className={`brand-header brand-header--${size}`}>
      <img src={logo} alt="Rotary Club of Discovery Bay logo" className="brand-logo" />
      <TitleTag className="brand-title">{APP_TITLE}</TitleTag>
    </div>
  );
}
