import { maxikay } from "@/api/maxikayClient";

/**
 * Centralized email notification helpers.
 * All functions are fire-and-forget (no await needed in callers).
 */

export async function sendTeamRegistrationEmail({ team, tournament, captainEmail }) {
  try {
    await maxikay.integrations.Core.SendEmail({
      to: captainEmail,
      from_name: "ArenaSaaS",
      subject: `✅ Team "${team.name}" registered for ${tournament.name}`,
      body: `Hi ${team.name} captain,\n\nYour team has been successfully registered for "${tournament.name}"!\n\nTournament starts: ${tournament.start_date ? new Date(tournament.start_date).toLocaleString() : "TBD"}\n\nGood luck!\n\n— ArenaSaaS`,
    });
  } catch (_) {}
}

export async function sendMatchScheduledEmail({ match, teamEmail, teamName }) {
  if (!teamEmail) return;
  try {
    await maxikay.integrations.Core.SendEmail({
      to: teamEmail,
      from_name: "ArenaSaaS",
      subject: `📅 Match Scheduled: ${match.team_a_name} vs ${match.team_b_name}`,
      body: `Hi ${teamName},\n\nYour next match has been scheduled!\n\n${match.team_a_name} vs ${match.team_b_name}\nRound: ${match.round}\nTime: ${match.scheduled_time ? new Date(match.scheduled_time).toLocaleString() : "TBD"}\n\nDon't forget to check in before the deadline!\n\n— ArenaSaaS`,
    });
  } catch (_) {}
}

export async function sendScoreDisputedEmail({ match, reporterEmail }) {
  if (!reporterEmail) return;
  try {
    await maxikay.integrations.Core.SendEmail({
      to: reporterEmail,
      from_name: "ArenaSaaS",
      subject: `⚠️ Score Dispute: ${match.team_a_name} vs ${match.team_b_name}`,
      body: `A score dispute has been raised for match: ${match.team_a_name} vs ${match.team_b_name}.\n\nAn organizer will review the submitted evidence and resolve the dispute shortly.\n\n— ArenaSaaS`,
    });
  } catch (_) {}
}

export async function sendPrizePaidEmail({ teamName, captainEmail, amount, currency, placement }) {
  if (!captainEmail) return;
  try {
    await maxikay.integrations.Core.SendEmail({
      to: captainEmail,
      from_name: "ArenaSaaS",
      subject: `🏆 Prize Payment: ${currency} ${amount} for ${teamName}`,
      body: `Congratulations ${teamName}!\n\nYour prize payout for placing #${placement} has been processed.\n\nAmount: ${currency} ${amount}\n\nThank you for competing!\n\n— ArenaSaaS`,
    });
  } catch (_) {}
}

export async function sendCheckInReminderEmail({ match, teamEmail, teamName }) {
  if (!teamEmail) return;
  try {
    await maxikay.integrations.Core.SendEmail({
      to: teamEmail,
      from_name: "ArenaSaaS",
      subject: `⏰ Check-In Reminder: ${match.team_a_name} vs ${match.team_b_name}`,
      body: `Hi ${teamName},\n\nThis is a reminder to check in for your upcoming match!\n\n${match.team_a_name} vs ${match.team_b_name}\nDeadline: ${match.check_in_deadline ? new Date(match.check_in_deadline).toLocaleString() : "Soon"}\n\nFailure to check in may result in a forfeit.\n\n— ArenaSaaS`,
    });
  } catch (_) {}
}