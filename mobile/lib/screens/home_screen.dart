import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../state/hub_state.dart';
import '../widgets/arena_ui.dart';
import '../widgets/platform_admin_banner.dart';
import 'community_screen.dart';
import 'create_tournament_screen.dart';
import 'discover_screen.dart';
import 'login_screen.dart';
import 'my_matches_screen.dart';
import 'my_teams_screen.dart';
import 'organizer/disputes_screen.dart';
import 'organizer/league_tournaments_screen.dart';
import 'organizer/ops_board_screen.dart';
import 'rankings_screen.dart';
import 'vault_screen.dart';
import 'watch_screen.dart';
import 'check_in_screen.dart';
import 'settings_screen.dart';
import 'free_agents_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? hub;
  List<dynamic> wallets = [];
  List<dynamic> accolades = [];
  Map<String, dynamic>? ops;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      setState(() => loading = false);
      return;
    }
    setState(() => loading = true);
    try {
      final api = context.read<ApiClient>();
      final hubMode = context.read<HubState>().mode;
      final h = await api.myHub();
      final w = await api.myWallet();
      final a = await api.myAccolades();
      Map<String, dynamic>? o;
      final tid = api.tenantId;
      if (tid != null && hubMode == HubMode.organizer) {
        try {
          o = await api.opsBoard(tid);
        } catch (_) {}
      }
      setState(() {
        hub = h;
        wallets = w;
        accolades = a;
        ops = o;
        loading = false;
      });
    } catch (_) {
      setState(() => loading = false);
    }
  }

  void _go(Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final hubMode = context.watch<HubState>();
    final email = auth.user?['email']?.toString() ?? '';
    final name = auth.user?['full_name']?.toString() ??
        (email.contains('@') ? email.split('@').first : email.isEmpty ? 'Competitor' : email);

    return Scaffold(
      appBar: AppBar(
        title: Text(hubMode.mode == HubMode.organizer ? 'Command center' : 'Career hub'),
        actions: [
          // League host only — never platform Central Station
          if (auth.isLeagueHost)
            TextButton(
              onPressed: () async {
                await hubMode.toggle();
                _load();
              },
              child: Text(hubMode.mode == HubMode.player ? 'Organizer' : 'Player'),
            ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to open your career hub, vault, and matches.',
              actionLabel: 'Sign in',
              onAction: () => _go(const LoginScreen()),
            )
          : loading
              ? const LoadingBody(label: 'Loading hub…')
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text('Welcome, $name',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(
                        hubMode.mode == HubMode.organizer && auth.isLeagueHost
                            ? 'League host tools & live ops'
                            : 'Your competitive home base',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                      ),
                      if (auth.isPlatformAdmin) ...[
                        const SizedBox(height: 12),
                        const PlatformAdminWebBanner(),
                      ],
                      const SizedBox(height: 16),
                      // Platform-only admin never gets organizer hub on mobile
                      if (hubMode.mode == HubMode.player || !auth.isLeagueHost) ...[
                        Row(
                          children: [
                            Expanded(
                              child: StatTile(
                                label: 'Accolades',
                                value: '${hub?['accolades_count'] ?? accolades.length}',
                                icon: Icons.emoji_events_outlined,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: StatTile(
                                label: 'XP',
                                value: '${auth.user?['profile_xp'] ?? hub?['profile_xp'] ?? 0}',
                                icon: Icons.bolt,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (wallets.isNotEmpty)
                          ArenaCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SectionHeader('Vault balances'),
                                ...wallets.map((w) {
                                  final m = Map<String, dynamic>.from(w as Map);
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text('${m['currency']}'),
                                        Text('${m['balance']}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w900, color: ArenaColors.cyan)),
                                      ],
                                    ),
                                  );
                                }),
                              ],
                            ),
                          ),
                        const SizedBox(height: 16),
                        const SectionHeader('Quick actions'),
                        QuickLink(
                          icon: Icons.explore,
                          label: 'Discover',
                          subtitle: 'Find open cups',
                          onTap: () => _go(const DiscoverScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.sports_esports,
                          label: 'My matches',
                          subtitle: 'Fixtures & report scores',
                          onTap: () => _go(const MyMatchesScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.groups,
                          label: 'My teams',
                          subtitle: 'Squads & captain seats',
                          onTap: () => _go(const MyTeamsScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.account_balance_wallet,
                          label: 'Vault',
                          subtitle: 'Winnings & trophies',
                          onTap: () => _go(const VaultScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.schedule,
                          label: 'Check-in',
                          subtitle: 'Matches needing presence',
                          onTap: () => _go(const CheckInScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.local_fire_department,
                          label: 'Power ranks',
                          subtitle: 'Team & player Elo',
                          onTap: () => _go(const RankingsScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.forum,
                          label: 'Community',
                          subtitle: 'War room feed',
                          onTap: () => _go(const CommunityScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.tv,
                          label: 'Watch live',
                          subtitle: 'Streams & match center',
                          onTap: () => _go(const WatchScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.person_search,
                          label: 'Free agents',
                          subtitle: 'Looking for team',
                          onTap: () => _go(const FreeAgentsScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.settings,
                          label: 'Hub settings',
                          subtitle: 'Region, game handles, FCM',
                          onTap: () => _go(const SettingsScreen()),
                        ),
                      ] else ...[
                        if (ops != null) ...[
                          Row(
                            children: [
                              Expanded(
                                child: StatTile(
                                  label: 'Open reg',
                                  value: '${ops!['counts']?['open_registration'] ?? ops!['open_registration'] ?? '—'}',
                                  icon: Icons.how_to_reg,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: StatTile(
                                  label: 'Live',
                                  value: '${ops!['counts']?['live'] ?? ops!['live'] ?? '—'}',
                                  icon: Icons.sensors,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: StatTile(
                                  label: 'Disputes',
                                  value: '${ops!['counts']?['disputes'] ?? '—'}',
                                  icon: Icons.gavel,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: StatTile(
                                  label: 'Check-ins',
                                  value: '${ops!['counts']?['check_ins'] ?? '—'}',
                                  icon: Icons.login,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                        ],
                        const SectionHeader('League ops'),
                        QuickLink(
                          icon: Icons.dashboard_customize,
                          label: 'Ops board',
                          subtitle: 'Live pulse for your tenant',
                          onTap: () => _go(const OpsBoardScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.emoji_events,
                          label: 'My tournaments',
                          subtitle: 'Create & manage events',
                          onTap: () => _go(const LeagueTournamentsScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.add_box,
                          label: 'Create tournament',
                          subtitle: 'Wizard (mobile)',
                          onTap: () => _go(const CreateTournamentScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.gavel,
                          label: 'Disputes',
                          subtitle: 'Resolve contested results',
                          onTap: () => _go(const DisputesScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.explore,
                          label: 'Discover',
                          subtitle: 'Marketplace',
                          onTap: () => _go(const DiscoverScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.account_balance_wallet,
                          label: 'Wallet',
                          subtitle: 'Tenant / prize rails',
                          onTap: () => _go(const VaultScreen()),
                        ),
                        const SizedBox(height: 8),
                        QuickLink(
                          icon: Icons.settings,
                          label: 'Settings',
                          subtitle: 'Tenant context & profile',
                          onTap: () => _go(const SettingsScreen()),
                        ),
                      ],
                      if (accolades.isNotEmpty && hubMode.mode == HubMode.player) ...[
                        const SizedBox(height: 20),
                        const SectionHeader('Recent trophies'),
                        ...accolades.take(5).map((a) {
                          final m = Map<String, dynamic>.from(a as Map);
                          return ListTile(
                            dense: true,
                            leading: CircleAvatar(child: Text('#${m['rank'] ?? '?'}')),
                            title: Text('${m['tournament_title'] ?? 'Tournament'}'),
                            subtitle: Text('${m['badge_id'] ?? 'placement'}'),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
    );
  }
}
