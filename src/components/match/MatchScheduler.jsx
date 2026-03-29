import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Clock, RefreshCw, Check, X } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";
import { notifyCaptain } from "@/lib/notifications";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Australia/Sydney",
];

function RescheduleRequestCard({ req, onApprove, onReject, isAdmin }) {
  return (
    <div className="glass rounded-xl p-4 border border-border/40 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{req.requested_by_team}</p>
          <p className="text-[11px] text-muted-foreground">{req.requested_by_email}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${
          req.status === "approved" ? "text-green-400 border-green-500/30 bg-green-500/10" :
          req.status === "rejected" ? "text-destructive border-destructive/30 bg-destructive/10" :
          "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
        }`}>{req.status}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-primary">
        <Clock className="w-3 h-3" />
        <span>Proposed: {moment(req.proposed_time).format("MMM D, YYYY h:mm A")} UTC</span>
      </div>
      {req.reason && <p className="text-xs text-muted-foreground italic">"{req.reason}"</p>}
      {isAdmin && req.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => onApprove(req)}>
            <Check className="w-3 h-3" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1 text-destructive border-destructive/30" onClick={() => onReject(req)}>
            <X className="w-3 h-3" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MatchScheduler({ match, tenantConfig, isAdmin }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [proposedTime, setProposedTime] = useState("");
  const [reason, setReason] = useState("");
  const [teamName, setTeamName] = useState(match?.team_a_name || "");
  const [captainEmail, setCaptainEmail] = useState("");

  const { data: requests = [] } = useQuery({
    queryKey: ["reschedule-requests", match?.id],
    queryFn: () => maxikay.entities.RescheduleRequest.filter({ match_id: match.id }, "-created_date"),
    enabled: !!match?.id && open,
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      const utcTime = new Date(proposedTime).toISOString();
      await maxikay.entities.RescheduleRequest.create({
        match_id: match.id,
        tournament_id: match.tournament_id,
        requested_by_email: captainEmail,
        requested_by_team: teamName,
        proposed_time: utcTime,
        reason,
        status: "pending",
      });
      notifyCaptain({
        email: null,
        subject: `Reschedule Request: ${match.team_a_name} vs ${match.team_b_name}`,
        body: `${teamName} has requested to reschedule.\nProposed: ${moment(proposedTime).format("MMM D, h:mm A")} (${timezone})\nReason: ${reason}`,
        discordWebhook: tenantConfig?.discord_webhook_url,
        discordPayload: {
          title: "🗓️ Reschedule Requested",
          description: `**${teamName}** wants to reschedule **${match.team_a_name} vs ${match.team_b_name}**\nProposed: ${moment(proposedTime).format("MMM D, h:mm A")} (${timezone})\n${reason ? `> ${reason}` : ""}`,
          color: 0xffa500,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests", match.id] });
      toast.success("Reschedule request submitted!");
      setReason(""); setProposedTime("");
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (req) => {
      await maxikay.entities.RescheduleRequest.update(req.id, { status: "approved", reviewed_by: "organizer" });
      await maxikay.entities.Match.update(match.id, {
        scheduled_time: req.proposed_time,
        expected_version: match.version ?? 1,
        expected_status: match.status,
      });
      notifyCaptain({
        email: req.requested_by_email,
        subject: "Reschedule Approved",
        body: `Your reschedule request for ${match.team_a_name} vs ${match.team_b_name} has been approved.\nNew time: ${moment(req.proposed_time).format("MMM D, YYYY h:mm A")} UTC`,
        discordWebhook: tenantConfig?.discord_webhook_url,
        discordPayload: {
          title: "✅ Reschedule Approved",
          description: `**${req.requested_by_team}**'s request approved.\nNew time: **${moment(req.proposed_time).format("MMM D, h:mm A")} UTC**`,
          color: 0x00c851,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests", match.id] });
      queryClient.invalidateQueries({ queryKey: ["match", match.id] });
      toast.success("Reschedule approved & match time updated!");
    },
  });

  const rejectRequest = useMutation({
    mutationFn: (req) => maxikay.entities.RescheduleRequest.update(req.id, { status: "rejected", reviewed_by: "organizer" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reschedule-requests", match.id] });
      toast.success("Reschedule rejected.");
    },
  });

  // Suggest 3 optimal times: next weekday evenings at 7pm local
  const suggestedTimes = [];
  let d = moment().add(1, "day");
  while (suggestedTimes.length < 3) {
    if (d.isoWeekday() <= 5) suggestedTimes.push(d.clone().hour(19).minute(0).second(0));
    d.add(1, "day");
  }

  if (!match) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
          <Calendar className="w-3.5 h-3.5" /> Schedule / Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" /> Match Scheduling
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {match.team_a_name} vs {match.team_b_name} · Round {match.round}
          </p>
        </DialogHeader>

        {/* Current scheduled time */}
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Scheduled Time</p>
            <p className="text-sm font-semibold text-foreground">
              {match.scheduled_time ? moment(match.scheduled_time).format("MMM D, YYYY h:mm A [UTC]") : "Not scheduled yet"}
            </p>
          </div>
        </div>

        {/* Suggested optimal times */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Suggested Times (weekday evenings)</p>
          <div className="grid grid-cols-3 gap-2">
            {suggestedTimes.map((t, i) => (
              <button
                key={i}
                onClick={() => setProposedTime(t.format("YYYY-MM-DDTHH:mm"))}
                className="text-xs glass rounded-lg p-2.5 text-center border border-border/30 hover:border-primary/40 hover:text-primary transition-colors"
              >
                <p className="font-semibold text-foreground">{t.format("MMM D")}</p>
                <p className="text-muted-foreground">{t.format("h:mm A")}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Request form */}
        <div className="space-y-3 pt-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Submit Reschedule Request</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Your Team</Label>
              <Select value={teamName} onValueChange={setTeamName}>
                <SelectTrigger className="mt-1 bg-secondary/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={match.team_a_name}>{match.team_a_name}</SelectItem>
                  <SelectItem value={match.team_b_name}>{match.team_b_name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Your Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="mt-1 bg-secondary/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Captain Email</Label>
            <Input type="email" value={captainEmail} onChange={(e) => setCaptainEmail(e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="captain@team.gg" />
          </div>
          <div>
            <Label className="text-xs">Proposed Time</Label>
            <Input type="datetime-local" value={proposedTime} onChange={(e) => setProposedTime(e.target.value)} className="mt-1 bg-secondary/50 text-xs" />
            {proposedTime && (
              <p className="text-[11px] text-primary mt-1">
                {moment(proposedTime).format("MMM D, YYYY h:mm A")} ({timezone})
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 bg-secondary/50 text-xs" rows={2} placeholder="Briefly explain why you need to reschedule..." />
          </div>
          <Button
            className="w-full text-xs font-display tracking-wider"
            onClick={() => submitRequest.mutate()}
            disabled={!proposedTime || !captainEmail || submitRequest.isPending}
          >
            {submitRequest.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </div>

        {/* Existing requests */}
        {requests.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Requests ({requests.length})</p>
            {requests.map((req) => (
              <RescheduleRequestCard
                key={req.id}
                req={req}
                isAdmin={isAdmin}
                onApprove={(r) => approveRequest.mutate(r)}
                onReject={(r) => rejectRequest.mutate(r)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}