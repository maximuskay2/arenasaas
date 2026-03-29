/**
 * SEO-friendly public player profile route: /players/:username
 * Reads the username param and renders PlayerProfile with ?email= resolved via lookup.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import PlayerProfile from "./PlayerProfile";

export default function PlayerProfilePublic() {
  const { username } = useParams();
  const navigate = useNavigate();

  // Try to find a user or free agent with this username (email prefix match)
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agent-lookup", username],
    queryFn: () => maxikay.entities.FreeAgent.filter({ is_active: true }, "-created_date", 200),
    staleTime: 60000,
  });

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );

  // Match by email prefix (username = part before @)
  const agent = agents.find((a) => a.player_email?.split("@")[0]?.toLowerCase() === username?.toLowerCase());
  const resolvedEmail = agent?.player_email;

  if (!resolvedEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-2xl font-display font-bold">Player Not Found</p>
          <p className="text-muted-foreground text-sm">No player with username <strong>{username}</strong> exists.</p>
          <button onClick={() => navigate("/free-agents")} className="text-primary text-sm hover:underline">
            Browse Free Agents →
          </button>
        </div>
      </div>
    );
  }

  // Inject email into query string and render PlayerProfile
  const originalSearch = window.location.search;
  const url = new URL(window.location.href);
  url.searchParams.set("email", resolvedEmail);
  window.history.replaceState(null, "", url.toString());

  return <PlayerProfile />;
}