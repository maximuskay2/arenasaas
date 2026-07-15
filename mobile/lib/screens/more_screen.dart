import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';
import '../state/hub_state.dart';
import '../widgets/arena_ui.dart';
import '../widgets/platform_admin_banner.dart';
import 'check_in_screen.dart';
import 'create_tournament_screen.dart';
import 'free_agents_screen.dart';
import 'live_screen.dart';
import 'login_screen.dart';
import 'my_teams_screen.dart';
import 'organizer/disputes_screen.dart';
import 'organizer/league_tournaments_screen.dart';
import 'organizer/ops_board_screen.dart';
import 'profile_screen.dart';
import 'rankings_screen.dart';
import 'settings_screen.dart';
import 'vault_screen.dart';
import 'watch_screen.dart';

/// Secondary destinations (web sidebar system/business/career extras).
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  void _go(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final hub = context.watch<HubState>();

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!auth.isLoggedIn)
            ElevatedButton(
              onPressed: () => _go(context, const LoginScreen()),
              child: const Text('Sign in'),
            )
          else
            ArenaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    auth.user?['full_name']?.toString() ?? auth.user?['email']?.toString() ?? 'Player',
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                  ),
                  Text(
                    'Mode: ${hub.mode == HubMode.organizer && auth.isLeagueHost ? 'Organizer' : 'Player'} · Tenant: ${auth.api.tenantId ?? '—'}',
                    style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5)),
                  ),
                  if (auth.isPlatformAdmin)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                        'Platform admin · use web Central Station',
                        style: TextStyle(fontSize: 12, color: Colors.amber, fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ),
          if (auth.isPlatformAdmin) ...[
            const SizedBox(height: 12),
            const PlatformAdminWebBanner(compact: true),
          ],
          const SizedBox(height: 16),
          const SectionHeader('Arena'),
          QuickLink(icon: Icons.tv, label: 'Watch live', subtitle: 'Streams & match center', onTap: () => _go(context, const WatchScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.sensors, label: 'Live board', subtitle: 'Live matches list', onTap: () => _go(context, const LiveScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.local_fire_department, label: 'Power ranks', subtitle: 'Team & player Elo', onTap: () => _go(context, const RankingsScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.account_balance_wallet, label: 'Vault / wallet', subtitle: 'Balances, trophies, withdraw', onTap: () => _go(context, const VaultScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.groups, label: 'My teams', subtitle: 'Squads you joined', onTap: () => _go(context, const MyTeamsScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.schedule, label: 'Check-in', subtitle: 'Ready for match', onTap: () => _go(context, const CheckInScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.person_search, label: 'Free agents', subtitle: 'LFG board', onTap: () => _go(context, const FreeAgentsScreen())),
          // League organizer only — never platform Central Station / system admin
          if (auth.isLeagueHost) ...[
            const SizedBox(height: 16),
            const SectionHeader('League ops (tenant)'),
            QuickLink(icon: Icons.dashboard_customize, label: 'Ops board', subtitle: 'Tenant pulse', onTap: () => _go(context, const OpsBoardScreen())),
            const SizedBox(height: 8),
            QuickLink(icon: Icons.emoji_events, label: 'My tournaments', subtitle: 'Hosted events', onTap: () => _go(context, const LeagueTournamentsScreen())),
            const SizedBox(height: 8),
            QuickLink(icon: Icons.add_box, label: 'Create tournament', subtitle: 'New event', onTap: () => _go(context, const CreateTournamentScreen())),
            const SizedBox(height: 8),
            QuickLink(icon: Icons.gavel, label: 'Disputes', subtitle: 'Resolve results', onTap: () => _go(context, const DisputesScreen())),
          ],
          const SizedBox(height: 16),
          const SectionHeader('Account'),
          QuickLink(icon: Icons.settings, label: 'Settings', subtitle: 'Profile, handles, FCM, hub mode', onTap: () => _go(context, const SettingsScreen())),
          const SizedBox(height: 8),
          QuickLink(icon: Icons.person, label: 'Profile & push', subtitle: 'FCM + tenants', onTap: () => _go(context, const ProfileScreen())),
        ],
      ),
    );
  }
}
