import { createContext, useContext, useEffect, useState } from "react";

const THEME_STORAGE_KEY = "designTheme";
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [designTheme, setDesignTheme] = useState(
    () => localStorage.getItem(THEME_STORAGE_KEY) || "classic",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = designTheme;
    localStorage.setItem(THEME_STORAGE_KEY, designTheme);
  }, [designTheme]);

  function toggleTheme() {
    setDesignTheme((current) => (current === "classic" ? "minimal" : "classic"));
  }

  return (
    <ThemeContext.Provider value={{ designTheme, isMinimal: designTheme === "minimal", toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
