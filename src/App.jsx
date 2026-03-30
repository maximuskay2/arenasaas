import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Tournaments from './pages/Tournaments';
import TournamentCreate from './pages/TournamentCreate';
import TournamentDetail from './pages/TournamentDetail';
import TournamentLobby from './pages/TournamentLobby';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import MatchLive from './pages/MatchLive';
import PowerRankings from './pages/PowerRankings';
import MatchLobby from './pages/MatchLobby';
import Teams from './pages/Teams';
import GameTemplates from './pages/GameTemplates';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import SuperAdmin from './pages/SuperAdmin';
import PublicBracket from './pages/PublicBracket';
import Wallet from './pages/Wallet';
import Onboarding from './pages/Onboarding';
import RevenueReport from './pages/RevenueReport';
import PlayerProfile from './pages/PlayerProfile';
import TournamentDiscovery from './pages/TournamentDiscovery';
import FreeAgents from './pages/FreeAgents';
import Sponsorships from './pages/Sponsorships';
import TeamFinance from './pages/TeamFinance';
import TeamDashboard from './pages/TeamDashboard';
import MerchandiseDashboard from './pages/MerchandiseDashboard';
import TeamManagement from './pages/TeamManagement';
import TournamentAnalytics from './pages/TournamentAnalytics';
import DevTodos from './pages/DevTodos';
import DisputeInbox from './pages/DisputeInbox';
import PlayerCheckin from './pages/PlayerCheckin';
import PlayerProfilePublic from './pages/PlayerProfilePublic';
import PublicTeamProfile from './pages/PublicTeamProfile';
import SponsorInsights from './pages/SponsorInsights';
import PublicLanding from './pages/PublicLanding';
import TenantRegister from './pages/TenantRegister';
import Login from './pages/Login';
import SystemAdmin from './pages/SystemAdmin';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import {
  isSystemAdmin,
  isPublicLanding,
  isPublicTenantSite,
  getTenantSlug,
  isOrganizerPortalEntry,
  isSimulatedSystemAdminLocalhost,
} from './lib/routingLogic';
import TenantPublicSite from './pages/TenantPublicSite';
import TenantMyMatches from './pages/TenantMyMatches';
import PlayerHubHome from './pages/player/PlayerHubHome';
import PlayerHubMatches from './pages/player/PlayerHubMatches';
import PlayerHubTeams from './pages/player/PlayerHubTeams';
import PlayerHubSettings from './pages/player/PlayerHubSettings';
import CommunityHub from './pages/CommunityHub';
import PublicShell from './components/layout/PublicShell';
import { applyTenantBranding } from './lib/whiteLabelManager';
import { useEffect } from 'react';
import PlatformAdminGate from './components/entry/PlatformAdminGate';
import RequireLeagueHost from './components/entry/RequireLeagueHost';
import RequireTenantSuperAdmin from './components/entry/RequireTenantSuperAdmin';

function OrganizerAppRoutes() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<PlayerHubHome />} />
        <Route path="/dashboard/matches" element={<PlayerHubMatches />} />
        <Route path="/dashboard/teams" element={<PlayerHubTeams />} />
        <Route path="/dashboard/wallet" element={<Wallet />} />
        <Route path="/dashboard/settings" element={<PlayerHubSettings />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/league/tournaments" element={<RequireLeagueHost><Tournaments /></RequireLeagueHost>} />
        <Route path="/tournaments/new" element={<RequireLeagueHost><TournamentCreate /></RequireLeagueHost>} />
        <Route path="/tournaments/:id/lobby" element={<TournamentLobby />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/teams/p/:teamId" element={<PublicTeamProfile />} />
        <Route path="/tournaments" element={<TournamentDiscovery showPublicHeader={false} />} />
        <Route path="/discover" element={<Navigate to="/tournaments" replace />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:matchId/lobby" element={<MatchLobby />} />
        <Route path="/matches/:matchId/live" element={<MatchLive />} />
        <Route path="/match/:matchId/live" element={<MatchLive />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/rankings" element={<PowerRankings />} />
        <Route path="/teams" element={<RequireLeagueHost><Teams /></RequireLeagueHost>} />
        <Route path="/games" element={<RequireLeagueHost><GameTemplates /></RequireLeagueHost>} />
        <Route path="/league/disputes" element={<RequireLeagueHost><DisputeInbox /></RequireLeagueHost>} />
        <Route path="/audit-log" element={<RequireLeagueHost><AuditLog /></RequireLeagueHost>} />
        <Route path="/settings" element={<RequireLeagueHost><Settings /></RequireLeagueHost>} />
        <Route path="/super-admin" element={<RequireTenantSuperAdmin><SuperAdmin /></RequireTenantSuperAdmin>} />
        <Route path="/public/bracket/:id" element={<PublicBracket />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/onboarding" element={<RequireLeagueHost><Onboarding /></RequireLeagueHost>} />
        <Route path="/revenue" element={<RequireLeagueHost><RevenueReport /></RequireLeagueHost>} />
        <Route path="/players/profile" element={<PlayerProfile />} />
        <Route path="/free-agents" element={<RequireLeagueHost><FreeAgents /></RequireLeagueHost>} />
        <Route path="/sponsorships" element={<RequireLeagueHost><Sponsorships /></RequireLeagueHost>} />
        <Route path="/sponsor-insights" element={<RequireLeagueHost><SponsorInsights /></RequireLeagueHost>} />
        <Route path="/team-finance" element={<RequireLeagueHost><TeamFinance /></RequireLeagueHost>} />
        <Route path="/team-dashboard" element={<RequireLeagueHost><TeamDashboard /></RequireLeagueHost>} />
        <Route path="/merch-dashboard" element={<RequireLeagueHost><MerchandiseDashboard /></RequireLeagueHost>} />
        <Route path="/team-management" element={<RequireLeagueHost><TeamManagement /></RequireLeagueHost>} />
        <Route path="/analytics" element={<RequireLeagueHost><TournamentAnalytics /></RequireLeagueHost>} />
        <Route path="/dev-todos" element={<RequireLeagueHost><DevTodos /></RequireLeagueHost>} />
        <Route path="/check-in" element={<PlayerCheckin />} />
        <Route path="/players/:username" element={<PlayerProfilePublic />} />
        <Route path="/community" element={<CommunityHub />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
}

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const adminHost = isSystemAdmin();
  const isPublic = isPublicLanding();
  const isTenantSite = isPublicTenantSite();
  const organizerEntry = isOrganizerPortalEntry();
  const tenantSlug = getTenantSlug();

  if (location.pathname === '/login') {
    return <Login />;
  }
  if (location.pathname === '/register' || location.pathname === '/register-tenant') {
    return <TenantRegister />;
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  if (isTenantSite) {
    return (
      <Routes>
        <Route path="/my-matches" element={<TenantMyMatches tenantSlug={tenantSlug} />} />
        <Route path="/" element={<TenantPublicSite tenantSlug={tenantSlug} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (adminHost && !organizerEntry) {
    if (isSimulatedSystemAdminLocalhost()) {
      return (
        <Routes>
          <Route path="/" element={<PublicLanding />} />
          <Route path="/tournaments" element={<TournamentDiscovery />} />
          <Route path="/tournaments/:id/lobby" element={<TournamentLobby />} />
          <Route path="/tournaments/:id" element={<TournamentDetail />} />
          <Route path="/teams/p/:teamId" element={<PublicTeamProfile />} />
          <Route path="/discover" element={<Navigate to="/tournaments" replace />} />
          <Route path="/rankings" element={<PublicShell><PowerRankings /></PublicShell>} />
          <Route path="/matches/:matchId/live" element={<PublicShell><MatchLive /></PublicShell>} />
          <Route path="/match/:matchId/live" element={<PublicShell><MatchLive /></PublicShell>} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<PlayerHubHome />} />
            <Route path="/dashboard/matches" element={<PlayerHubMatches />} />
            <Route path="/dashboard/teams" element={<PlayerHubTeams />} />
            <Route path="/dashboard/wallet" element={<Wallet />} />
            <Route path="/dashboard/settings" element={<PlayerHubSettings />} />
            <Route path="/community" element={<CommunityHub />} />
          </Route>
          <Route
            path="/central-station"
            element={
              <PlatformAdminGate>
                <SystemAdmin />
              </PlatformAdminGate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      );
    }
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route
          path="/central-station"
          element={
            <PlatformAdminGate>
              <SystemAdmin />
            </PlatformAdminGate>
          }
        />
        <Route path="*" element={<Navigate to="/central-station" replace />} />
      </Routes>
    );
  }

  if (isPublic) {
    return (
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route path="/tournaments" element={<TournamentDiscovery />} />
        <Route path="/tournaments/:id/lobby" element={<TournamentLobby />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/teams/p/:teamId" element={<PublicTeamProfile />} />
        <Route path="/discover" element={<Navigate to="/tournaments" replace />} />
        <Route path="/rankings" element={<PublicShell><PowerRankings /></PublicShell>} />
        <Route path="/matches/:matchId/live" element={<PublicShell><MatchLive /></PublicShell>} />
        <Route path="/match/:matchId/live" element={<PublicShell><MatchLive /></PublicShell>} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<PlayerHubHome />} />
          <Route path="/dashboard/matches" element={<PlayerHubMatches />} />
          <Route path="/dashboard/teams" element={<PlayerHubTeams />} />
          <Route path="/dashboard/wallet" element={<Wallet />} />
          <Route path="/dashboard/settings" element={<PlayerHubSettings />} />
          <Route path="/community" element={<CommunityHub />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (organizerEntry) {
    return <OrganizerAppRoutes />;
  }

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  useEffect(() => {
    applyTenantBranding();
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
