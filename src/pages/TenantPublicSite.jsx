import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Trophy, Users, Calendar, DollarSign, ExternalLink, Search, Swords } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import moment from "moment";

function TournamentCard({ tournament, onView }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl overflow-hidden hover:glass-hover transition cursor-pointer group"
      onClick={() => onView(tournament)}
    >
      {tournament.banner_url && (
        <div className="h-36 overflow-hidden">
          <img src={tournament.banner_url} alt={tournament.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-semibold text-foreground">{tournament.name}</h3>
          <StatusBadge status={tournament.status} />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{tournament.description || "No description provided."}</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>{tournament.registered_teams || 0}/{tournament.max_teams} teams</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-accent" />
            <span className="capitalize">{tournament.format?.replace(/_/g, " ")}</span>
          </div>
          {tournament.prize_pool > 0 && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 font-semibold">${tournament.prize_pool.toLocaleString()}</span>
            </div>
          )}
          {tournament.start_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{moment(tournament.start_date).format("MMM D, YYYY")}</span>
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 mt-1">
          View Bracket <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
}

export default function TenantPublicSite({ tenantSlug }) {
  const [search, setSearch] = useState("");
  const [selectedTournament, setSelectedTournament] = useState(null);

  const { data: tenant } = useQuery({
    queryKey: ["tenant-by-slug", tenantSlug],
    queryFn: () => maxikay.entities.Tenant.filter({ slug: tenantSlug }).then((r) => r[0]),
    enabled: !!tenantSlug,
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant-config-public", tenant?.id],
    queryFn: () => maxikay.entities.TenantConfig.filter({ tenant_id: tenant.id }).then((r) => r[0]),
    enabled: !!tenant?.id,
  });

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ["public-tournaments", tenant?.id],
    queryFn: () =>
      maxikay.entities.Tournament.filter(
        { tenant_id: tenant.id, status: "registration_open" },
        "-start_date",
        50
      ),
    enabled: !!tenant?.id,
  });

  const { data: allTournaments = [] } = useQuery({
    queryKey: ["public-all-tournaments", tenant?.id],
    queryFn: () => maxikay.entities.Tournament.filter({ tenant_id: tenant.id }, "-start_date", 100),
    enabled: !!tenant?.id,
  });

  const primaryColor = tenantConfig?.primary_color || "#00d4ff";
  const logoUrl = tenantConfig?.logo_url || tenant?.logo_url;

  const filtered = allTournaments.filter((t) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase())
  );

  const open = filtered.filter((t) => t.status === "registration_open");
  const live = filtered.filter((t) => t.status === "in_progress");
  const past = filtered.filter((t) => t.status === "completed");

  const handleView = (t) => {
    window.open(`/public/bracket/${t.id}`, "_blank");
  };

  if (!tenantSlug) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt={tenant?.name} className="h-8 w-auto object-contain" />
            )}
            <span className="font-display font-bold text-lg">{tenant?.name || tenantSlug}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/my-matches"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/70"
            >
              <Swords className="h-3.5 w-3.5" />
              My matches
            </Link>
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tournaments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-secondary/50"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-16 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-surface pointer-events-none" />
        <div className="absolute top-10 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: primaryColor }} />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-2xl mx-auto space-y-4"
        >
          <h1 className="text-4xl font-display font-black">
            {tenant?.name || "Esports League"} <span className="text-gradient-primary">Tournaments</span>
          </h1>
          <p className="text-muted-foreground">Browse live and upcoming tournaments. Register your team and compete.</p>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" /> {open.length} open</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> {live.length} live</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> {past.length} completed</span>
          </div>
        </motion.div>
      </section>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 pb-20 space-y-10">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {live.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-display font-bold text-lg flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Live Now
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {live.map((t) => <TournamentCard key={t.id} tournament={t} onView={handleView} />)}
                </div>
              </section>
            )}

            {open.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-display font-bold text-lg flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" /> Registration Open
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {open.map((t) => <TournamentCard key={t.id} tournament={t} onView={handleView} />)}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-display font-bold text-lg text-muted-foreground">Past Tournaments</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {past.map((t) => <TournamentCard key={t.id} tournament={t} onView={handleView} />)}
                </div>
              </section>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tournaments found.</p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        Powered by <span className="text-primary font-semibold">ArenaSaaS</span>
      </footer>
    </div>
  );
}