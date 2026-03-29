import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isLeagueHostUser } from "@/lib/routingLogic";

/**
 * Blocks league-only routes for plain players (tenant members without host role).
 */
export default function RequireLeagueHost({ children }) {
  const { user } = useAuth();
  if (!isLeagueHostUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
