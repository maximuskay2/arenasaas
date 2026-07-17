import { useEffect } from "react";
import { useTenant } from "@/hooks/useTenant";
import { toHslChannels } from "@/lib/whiteLabelManager";

export default function TenantThemeProvider({ children }) {
  const { tenantConfig } = useTenant();

  useEffect(() => {
    if (!tenantConfig) return;
    const root = document.documentElement;
    if (tenantConfig.primary_color) {
      const hsl = toHslChannels(tenantConfig.primary_color);
      if (hsl) {
        root.style.setProperty("--primary", hsl);
        root.style.setProperty("--ring", hsl);
        root.style.setProperty("--sidebar-primary", hsl);
        root.style.setProperty("--sidebar-ring", hsl);
        root.style.setProperty("--chart-1", hsl);
      }
    }
    if (tenantConfig.accent_color) {
      const hsl = toHslChannels(tenantConfig.accent_color);
      if (hsl) {
        root.style.setProperty("--accent", hsl);
        root.style.setProperty("--chart-2", hsl);
      }
    }
  }, [tenantConfig]);

  return children;
}