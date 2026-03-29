/**
 * Automated match operations: check-in enforcement, forfeit handling
 * Railway env: DISCORD_WEBHOOK_URL
 */

import { maxikay } from '../api/arenaClient.js';

export async function enforceCheckIn(matchId) {
  try {
    const match = await maxikay.entities.Match.filter({ id: matchId }).then(r => r[0]);
    if (!match) return { success: false, error: 'Match not found' };

    // Check if deadline passed
    if (!match.check_in_deadline || new Date(match.check_in_deadline) > new Date()) {
      return { success: false, error: 'Check-in still open' };
    }

    // If one team checked in, other forfeits
    if (match.team_a_checked_in && !match.team_b_checked_in) {
      await maxikay.entities.Match.update(matchId, {
        status: 'forfeited',
        winner_id: match.team_a_id,
        winner_name: match.team_a_name,
        notes: 'Team B forfeited (no check-in)',
        expected_version: match.version ?? 1,
        expected_status: match.status,
      });

      // Notify organizer
      await sendDiscordNotification(
        `⚠️ **Forfeit**: ${match.team_b_name} failed to check in for ${match.team_a_name} vs ${match.team_b_name}`
      );

      return { success: true, action: 'team_b_forfeited' };
    }

    if (match.team_b_checked_in && !match.team_a_checked_in) {
      await maxikay.entities.Match.update(matchId, {
        status: 'forfeited',
        winner_id: match.team_b_id,
        winner_name: match.team_b_name,
        notes: 'Team A forfeited (no check-in)',
        expected_version: match.version ?? 1,
        expected_status: match.status,
      });

      await sendDiscordNotification(
        `⚠️ **Forfeit**: ${match.team_a_name} failed to check in for ${match.team_a_name} vs ${match.team_b_name}`
      );

      return { success: true, action: 'team_a_forfeited' };
    }

    return { success: false, error: 'Both teams checked in or neither checked in' };
  } catch (err) {
    console.error('enforceCheckIn error:', err);
    return { success: false, error: err.message };
  }
}

export async function startMatch(matchId) {
  try {
    const match = await maxikay.entities.Match.filter({ id: matchId }).then(r => r[0]);
    if (!match) return { success: false, error: 'Match not found' };

    await maxikay.entities.Match.update(matchId, {
      status: 'in_progress',
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });

    // Send notification
    await sendDiscordNotification(
      `🎮 **Match Started**: ${match.team_a_name} vs ${match.team_b_name} (Round ${match.round})`
    );

    return { success: true };
  } catch (err) {
    console.error('startMatch error:', err);
    return { success: false, error: err.message };
  }
}

async function sendDiscordNotification(message) {
  if (!process.env.DISCORD_WEBHOOK_URL) return;

  try {
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.warn('Discord notification failed:', err.message);
  }
}