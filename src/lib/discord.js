/**
 * Sends a Discord embed notification to a webhook URL.
 * Silently fails if the webhook is not configured or the request errors.
 */
export async function sendDiscordNotification(webhookUrl, { title, description, color = 0x00d4ff, fields = [] }) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Arena SaaS" },
          },
        ],
      }),
    });
  } catch (e) {
    console.warn("[Discord] Webhook failed:", e.message);
  }
}