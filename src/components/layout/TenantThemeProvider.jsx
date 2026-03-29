import { useEffect } from "react";
import { useTenant } from "@/hooks/useTenant";

function hexToHsl(hex) {
  if (!hex || !hex.startsWith("#")) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function TenantThemeProvider({ children }) {
  const { tenantConfig } = useTenant();

  useEffect(() => {
    if (!tenantConfig) return;
    const root = document.documentElement;
    if (tenantConfig.primary_color) {
      const hsl = hexToHsl(tenantConfig.primary_color);
      if (hsl) {
        root.style.setProperty("--primary", hsl);
        root.style.setProperty("--ring", hsl);
        root.style.setProperty("--sidebar-primary", hsl);
        root.style.setProperty("--sidebar-ring", hsl);
        root.style.setProperty("--chart-1", hsl);
      }
    }
    if (tenantConfig.accent_color) {
      const hsl = hexToHsl(tenantConfig.accent_color);
      if (hsl) {
        root.style.setProperty("--accent", hsl);
        root.style.setProperty("--chart-2", hsl);
      }
    }
  }, [tenantConfig]);

  return children;
}