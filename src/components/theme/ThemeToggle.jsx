import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Theme control available on every shell.
 * - `icon` — single-click toggle light ↔ dark (default)
 * - `menu` — light / dark / system dropdown
 * - `button` — labeled toggle for settings pages
 */
export default function ThemeToggle({
  className,
  variant = "icon",
  size = "icon",
  showLabel = false,
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", resolvedTheme === "light" ? "#f4f6fa" : "#070a12");
  }, [mounted, resolvedTheme]);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={size === "icon" ? "icon" : "sm"}
        className={cn("shrink-0 text-muted-foreground", className)}
        aria-label="Toggle color theme"
        disabled
      >
        <Sun className="h-4 w-4 opacity-40" />
        {showLabel || variant === "button" ? (
          <span className="text-xs font-medium opacity-40">Theme</span>
        ) : null}
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  if (variant === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={size === "icon" ? "icon" : "sm"}
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/70",
              className
            )}
            aria-label="Color theme"
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {showLabel ? (
              <span className="text-xs font-medium capitalize">{theme || "system"}</span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 glass border-border/60">
          <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            Light
            {theme === "light" ? <span className="ml-auto text-primary text-[10px]">●</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
            <Moon className="h-4 w-4 text-primary" />
            Dark
            {theme === "dark" ? <span className="ml-auto text-primary text-[10px]">●</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            System
            {theme === "system" ? <span className="ml-auto text-primary text-[10px]">●</span> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-2", className)}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {isDark ? "Light mode" : "Dark mode"}
      </Button>
    );
  }

  // icon — simple toggle
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "icon" ? "icon" : "sm"}
      className={cn(
        "shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/70",
        className
      )}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel ? (
        <span className="text-xs font-medium">{isDark ? "Light" : "Dark"}</span>
      ) : null}
    </Button>
  );
}
