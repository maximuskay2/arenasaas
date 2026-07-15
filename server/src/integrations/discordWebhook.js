/**
 * Optional Discord engagement webhooks (not a full bot).
 * Set DISCORD_WEBHOOK_URL (platform) or per-tenant config discord_webhook_url.
 */

export async function postDiscordWebhook(webhookUrl, { content, embeds } = {}) {
  const url = String(webhookUrl || process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) return { skipped: true, reason: 'no_webhook' };

  const body = {};
  if (content) body.content = String(content).slice(0, 1900);
  if (Array.isArray(embeds) && embeds.length) body.embeds = embeds.slice(0, 10);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[discord] webhook failed', res.status, text.slice(0, 200));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[discord] webhook error', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Fire-and-forget match result announcement. */
export function notifyDiscordMatchResult({
  webhookUrl,
  tournamentName,
  teamA,
  teamB,
  scoreA,
  scoreB,
  winnerName,
  matchUrl,
}) {
  const title = tournamentName ? `${tournamentName} — result` : 'Match result';
  const desc = [
    `**${teamA || 'Team A'}** ${scoreA ?? 0} – ${scoreB ?? 0} **${teamB || 'Team B'}**`,
    winnerName ? `Winner: **${winnerName}**` : null,
    matchUrl ? `[Watch / details](${matchUrl})` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return postDiscordWebhook(webhookUrl, {
    embeds: [
      {
        title,
        description: desc,
        color: 0x00d4ff,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch(() => ({ ok: false }));
}
