import { maxikay } from "@/api/maxikayClient";
import { getTenantSlug } from "./routingLogic";

/**
 * White-label CSS override system.
 * Tailwind tokens use bare HSL channels: --primary: 186 100% 48%;
 * then colors are applied as hsl(var(--primary)). Never inject full hsl(...).
 */

/** Normalize hex / hsl(...) / "h s% l%" → "h s% l%" for CSS variables. */
export function toHslChannels(color) {
  if (color == null || color === "") return null;
  const s = String(color).trim();

  // Already channel form: "186 100% 48%" or "186, 100%, 48%"
  const bare = s.match(/^(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)%?\s*[,\s]\s*(\d+(?:\.\d+)?)%?$/);
  if (bare && !s.toLowerCase().includes("hsl") && !s.startsWith("#")) {
    return `${bare[1]} ${bare[2]}% ${bare[3]}%`;
  }

  // hsl(186 100% 48%) / hsl(186, 100%, 48%) / hsla(...)
  const hsl = s.match(
    /hsla?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)%?\s*[, ]\s*([0-9.]+)%?/i
  );
  if (hsl) {
    return `${hsl[1]} ${hsl[2]}% ${hsl[3]}%`;
  }

  // #rgb / #rrggbb
  let hex = s.replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let sat = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
}

export async function applyTenantBranding() {
  const tenantSlug = getTenantSlug();
  if (!tenantSlug) {
    // Public / default site — leave :root tokens from index.css alone
    clearBrandingOverrides();
    return;
  }

  try {
    const configs = await maxikay.entities.TenantConfig.filter(
      { custom_domain: { $exists: false } },
      "-updated_date",
      1
    );

    const config = configs.find((c) => c.tenant_id);

    if (config) {
      applyBranding({
        primary: config.primary_color,
        secondary: config.secondary_color,
        accent: config.accent_color,
        displayFont: config.display_font || "Orbitron",
        logoUrl: config.logo_url,
      });
    }
  } catch (err) {
    console.warn("Failed to load tenant branding:", err);
  }
}

function clearBrandingOverrides() {
  const styleEl = document.getElementById("tenant-branding");
  if (styleEl) styleEl.textContent = "";
}

function applyBranding({ primary, secondary, accent, displayFont, logoUrl }) {
  let styleEl = document.getElementById("tenant-branding");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "tenant-branding";
    document.head.appendChild(styleEl);
  }

  const p = toHslChannels(primary);
  const a = toHslChannels(accent);
  const sec = toHslChannels(secondary);
  const font = (displayFont || "Orbitron").replace(/['"]/g, "");

  const lines = [":root {"];
  if (p) {
    lines.push(`  --primary: ${p};`);
    lines.push(`  --ring: ${p};`);
    lines.push(`  --sidebar-primary: ${p};`);
    lines.push(`  --sidebar-ring: ${p};`);
    lines.push(`  --chart-1: ${p};`);
  }
  if (a) {
    lines.push(`  --accent: ${a};`);
    lines.push(`  --chart-2: ${a};`);
  }
  if (sec) {
    lines.push(`  --secondary: ${sec};`);
  }
  if (font) {
    lines.push(`  --font-display: '${font}', system-ui, sans-serif;`);
  }
  lines.push("}");

  styleEl.textContent = lines.join("\n");

  if (logoUrl) {
    updateFavicon(logoUrl);
  }
}

function updateFavicon(logoUrl) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = logoUrl;
}

/**
 * System admin override - force branding on a tenant
 */
export async function overrideTenantBranding(tenantId, overrideConfig) {
  try {
    await maxikay.entities.TenantConfig.update(tenantId, {
      primary_color: overrideConfig.primaryColor,
      secondary_color: overrideConfig.secondaryColor,
      accent_color: overrideConfig.accentColor,
      display_font: overrideConfig.displayFont,
    });

    applyTenantBranding();
  } catch (err) {
    console.error("Failed to override branding:", err);
  }
}
