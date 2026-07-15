import { ThemeProvider as NextThemesProvider } from "next-themes";

const STORAGE_KEY = "arena-theme";

/** Migrate legacy Sidebar key `theme` → `arena-theme` once. */
function migrateLegacyTheme() {
  try {
    if (typeof window === "undefined") return;
    const next = localStorage.getItem(STORAGE_KEY);
    if (next) return;
    const legacy = localStorage.getItem("theme");
    if (legacy === "light" || legacy === "dark") {
      localStorage.setItem(STORAGE_KEY, legacy);
    }
  } catch {
    /* ignore */
  }
}

migrateLegacyTheme();

/**
 * App-wide light / dark / system theme.
 * Uses class on <html>: "light" | "dark" (matches index.css tokens).
 */
export default function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey={STORAGE_KEY}
      themes={["light", "dark"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
