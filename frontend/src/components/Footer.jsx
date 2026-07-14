import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <span>© {year} Rotary Club of Discovery Bay. All rights reserved.</span>
      <span className="app-footer-links">
        <Link to="/terms">Terms of Usage</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">Privacy Policy</Link>
        <span aria-hidden="true">·</span>
        <a href="mailto:rcdbball@gmail.com">Support</a>
      </span>
    </footer>
  );
}
