import { maxikay } from "@/api/maxikayClient";
import { getTenantSlug } from "./routingLogic";

/**
 * White-label CSS override system
 * Dynamically applies tenant branding to the platform
 */

export async function applyTenantBranding() {
  const tenantSlug = getTenantSlug();
  if (!tenantSlug) {
    // Public site - use default branding
    applyBranding({
      primary: "hsl(190 100% 50%)",
      secondary: "hsl(222 30% 14%)",
      accent: "hsl(348 83% 60%)",
      displayFont: "Orbitron",
    });
    return;
  }

  try {
    // Fetch tenant config
    const configs = await maxikay.entities.TenantConfig.filter(
      { custom_domain: { $exists: false } }, // Use slug matching instead
      "-updated_date",
      1
    );

    const config = configs.find((c) => {
      // Match by tenant_id or from cached tenant lookup
      return c.tenant_id; // Will be populated by lookup
    });

    if (config) {
      applyBranding({
        primary: config.primary_color || "hsl(190 100% 50%)",
        secondary: config.secondary_color || "hsl(222 30% 14%)",
        accent: config.accent_color || "hsl(348 83% 60%)",
        displayFont: config.display_font || "Orbitron",
        logoUrl: config.logo_url,
      });
    }
  } catch (err) {
    console.warn("Failed to load tenant branding:", err);
  }
}

function applyBranding({ primary, secondary, accent, displayFont, logoUrl }) {
  // Create or update CSS variable stylesheet
  let styleEl = document.getElementById("tenant-branding");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "tenant-branding";
    document.head.appendChild(styleEl);
  }

  const css = `
    :root {
      --primary: ${hexToHsl(primary)};
      --accent: ${hexToHsl(accent)};
      --secondary: ${hexToHsl(secondary)};
      --font-display: '${displayFont}', system-ui, sans-serif;
    }
  `;

  styleEl.textContent = css;

  // Update favicon if tenant has custom logo
  if (logoUrl) {
    updateFavicon(logoUrl);
  }
}

function hexToHsl(hex) {
  // If already HSL format, return as-is
  if (hex.includes("hsl")) return hex;

  // Convert hex to HSL
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  const hDeg = Math.round(h * 360);
  const sPercent = Math.round(s * 100);
  const lPercent = Math.round(l * 100);

  return `${hDeg} ${sPercent}% ${lPercent}%`;
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
 * (for violations, testing, etc.)
 */
export async function overrideTenantBranding(tenantId, overrideConfig) {
  try {
    await maxikay.entities.TenantConfig.update(tenantId, {
      primary_color: overrideConfig.primaryColor,
      secondary_color: overrideConfig.secondaryColor,
      accent_color: overrideConfig.accentColor,
      display_font: overrideConfig.displayFont,
    });

    // Reapply branding
    applyTenantBranding();
  } catch (err) {
    console.error("Failed to override branding:", err);
  }
}