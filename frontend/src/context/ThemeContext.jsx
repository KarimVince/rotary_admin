import { createContext, useContext, useEffect } from "react";

// The app now ships a single design ("Minimal") — the old Classic/Minimal
// toggle was removed. This context and its `isMinimal` flag are kept
// (hardcoded true) purely so components mid-cleanup that still branch on
// `isMinimal` keep working without churn; new code shouldn't rely on it.
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.dataset.theme = "minimal";
  }, []);

  return <ThemeContext.Provider value={{ isMinimal: true }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
