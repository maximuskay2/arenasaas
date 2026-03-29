import { maxikay } from "@/api/maxikayClient";
import { sendDiscordNotification } from "./discord";

/**
 * Send a Slack webhook notification.
 */
async function sendSlackNotification(webhookUrl, text) {
  if (!webhookUrl) return;
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

/**
 * Send an email + optional Discord notification to a captain.
 */
export async function notifyCaptain({ email, subject, body, discordWebhook, discordPayload, slackWebhook }) {
  // Email
  if (email) {
    maxikay.integrations.Core.SendEmail({ to: email, subject, body }).catch(() => {});
  }
  // Discord
  if (discordWebhook && discordPayload) {
    sendDiscordNotification(discordWebhook, discordPayload);
  }
  // Slack
  if (slackWebhook && discordPayload) {
    sendSlackNotification(slackWebhook, `*${discordPayload.title}*\n${discordPayload.description || ""}`);
  }
}

export function matchScheduledNotif({ match, captainEmail, webhook }) {
  if (captainEmail) {
    maxikay.entities.Notification.create({
      user_email: captainEmail,
      type: "match_scheduled",
      title: `Match Scheduled: ${match.team_a_name} vs ${match.team_b_name}`,
      body: `Round ${match.round} — Match #${match.match_number}. Check in on time!`,
      link: `/matches/${match.id}`,
      tournament_id: match.tournament_id,
      match_id: match.id,
    }).catch(() => {});
  }
  return notifyCaptain({
    email: captainEmail,
    subject: `Match Scheduled: ${match.team_a_name} vs ${match.team_b_name}`,
    body: `Your team has been scheduled for a match!\n\n${match.team_a_name} vs ${match.team_b_name}\nRound ${match.round} — Match #${match.match_number}\n\nPlease check in on time. Good luck!`,
    discordWebhook: webhook,
    discordPayload: {
      title: "📅 Match Scheduled",
      description: `**${match.team_a_name}** vs **${match.team_b_name}** — Round ${match.round}`,
      color: 0x00d4ff,
    },
  });
}

export function opponentCheckedInNotif({ match, notifyTeam, webhook }) {
  const opponentName = notifyTeam === "a" ? match.team_b_name : match.team_a_name;
  const myTeam = notifyTeam === "a" ? match.team_a_name : match.team_b_name;
  return notifyCaptain({
    email: null, // email unknown without roster lookup, Discord suffices
    subject: `Opponent Checked In`,
    body: `${opponentName} has checked in for your match. Please check in now!`,
    discordWebhook: webhook,
    discordPayload: {
      title: "⚡ Opponent Checked In",
      description: `**${opponentName}** has checked in for **${myTeam}** vs **${opponentName}**. Check in now!`,
      color: 0xffa500,
    },
  });
}

export function tournamentStageChangedNotif({ tournamentName, stage, captainEmail, webhook }) {
  if (captainEmail && stage === "in_progress") {
    maxikay.entities.Notification.create({
      user_email: captainEmail,
      type: "tournament_started",
      title: `${tournamentName} has started!`,
      body: "The tournament is now in progress. Check the bracket for your first match.",
      link: "/tournaments",
    }).catch(() => {});
  }
  return notifyCaptain({
    email: captainEmail,
    subject: `Tournament Update: ${tournamentName} — ${stage}`,
    body: `The tournament "${tournamentName}" has moved to a new stage: ${stage}.\n\nLog in to check the latest bracket standings.`,
    discordWebhook: webhook,
    discordPayload: {
      title: "🏆 Tournament Stage Changed",
      description: `**${tournamentName}** is now: **${stage.replace(/_/g, " ")}**`,
      color: 0x00d4ff,
    },
  });
}

export function reportReviewedNotif({ report, status, reviewNotes, captainEmail, webhook }) {
  const approved = status === "approved";
  const email = captainEmail || report.submitted_by;
  if (email) {
    maxikay.entities.Notification.create({
      user_email: email,
      type: status === "approved" ? "score_reported" : "score_disputed",
      title: `Score Report ${approved ? "Approved ✅" : "Rejected ❌"}`,
      body: `Your report (${report.reported_score_a}:${report.reported_score_b}) was ${status}.${reviewNotes ? ` Note: ${reviewNotes}` : ""}`,
      link: `/matches/${report.match_id}`,
      match_id: report.match_id,
    }).catch(() => {});
  }
  return notifyCaptain({
    email,
    subject: `Score Report ${approved ? "Approved" : "Rejected"}`,
    body: `Your score report (${report.reported_score_a}:${report.reported_score_b}) has been ${status}.\n${reviewNotes ? `Note from organizer: ${reviewNotes}` : ""}`,
    discordWebhook: webhook,
    discordPayload: {
      title: approved ? "✅ Score Report Approved" : "❌ Score Report Rejected",
      description: `Report for **${report.reported_score_a}:${report.reported_score_b}** was **${status}**.${reviewNotes ? `\n> ${reviewNotes}` : ""}`,
      color: approved ? 0x00c851 : 0xff4444,
    },
  });
}