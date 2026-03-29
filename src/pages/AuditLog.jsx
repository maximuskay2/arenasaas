import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { ScrollText } from "lucide-react";
import { motion } from "framer-motion";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import moment from "moment";

export default function AuditLog() {
  const { tenantId, isSuperAdmin } = useTenant();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.AuditLog.filter({ tenant_id: tenantId }, "-created_date", 100)
      : maxikay.entities.AuditLog.list("-created_date", 100),
  });

  if (isLoading) return <LoadingSpinner />;

  const actionColors = {
    score_submitted: "text-green-400",
    score_override: "text-yellow-400",
    match_disputed: "text-orange-400",
    match_forfeit: "text-red-400",
    team_disqualified: "text-red-400",
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader title="Audit Log" subtitle="Track all administrative actions" />

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries" description="Actions will be logged here automatically" />
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass rounded-xl p-4 flex items-start gap-4"
            >
              <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-display font-semibold tracking-wider uppercase ${actionColors[log.action] || "text-primary"}`}>
                    {log.action?.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">on {log.entity_type}</span>
                </div>
                <p className="text-sm text-foreground mt-0.5">{log.actor_email}</p>
                {log.details && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{log.details}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {moment(log.created_date).fromNow()}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}