import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_client.dart';
import 'services/push_service.dart';
import 'state/auth_state.dart';
import 'theme.dart';
import 'screens/discover_screen.dart';
import 'screens/live_screen.dart';
import 'screens/my_matches_screen.dart';
import 'screens/rankings_screen.dart';
import 'screens/vault_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/create_tournament_screen.dart';
import 'screens/tournament_detail_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ArenaApp());
}

class ArenaApp extends StatelessWidget {
  const ArenaApp({super.key});

  @override
  Widget build(BuildContext context) {
    final api = ApiClient();
    final push = PushService(api);
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<PushService>.value(value: push),
        ChangeNotifierProvider(create: (_) => AuthState(api, push: push)..bootstrap()),
      ],
      child: MaterialApp(
        title: 'Arena',
        debugShowCheckedModeBanner: false,
        theme: ArenaTheme.dark(),
        onGenerateRoute: (settings) {
          final name = settings.name ?? '';
          final uri = Uri.tryParse(name);
          if (uri != null) {
            final segs = uri.pathSegments;
            if (segs.length >= 2 && (segs[0] == 'tournaments' || segs[0] == 'tournament')) {
              return MaterialPageRoute(
                builder: (_) => TournamentDetailScreen(tournamentId: segs[1]),
                settings: settings,
              );
            }
            if (segs.length >= 1 && segs[0] == 'create') {
              return MaterialPageRoute(
                builder: (_) => const CreateTournamentScreen(),
                settings: settings,
              );
            }
          }
          if (name.startsWith('arenasaas://')) {
            final u = Uri.parse(name);
            if (u.host == 'tournament' && u.pathSegments.isNotEmpty) {
              return MaterialPageRoute(
                builder: (_) => TournamentDetailScreen(tournamentId: u.pathSegments.first),
                settings: settings,
              );
            }
            if (u.pathSegments.length >= 2 && u.pathSegments[0] == 'tournament') {
              return MaterialPageRoute(
                builder: (_) => TournamentDetailScreen(tournamentId: u.pathSegments[1]),
                settings: settings,
              );
            }
          }
          return null;
        },
        home: const HomeShell(),
      ),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final pages = <Widget>[
      const DiscoverScreen(),
      const MyMatchesScreen(),
      const LiveScreen(),
      const RankingsScreen(),
      const VaultScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      floatingActionButton: auth.isOrganizer
          ? FloatingActionButton.extended(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CreateTournamentScreen()),
                );
              },
              icon: const Icon(Icons.add),
              label: const Text('Create'),
            )
          : null,
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.explore_outlined), selectedIcon: Icon(Icons.explore), label: 'Discover'),
          NavigationDestination(icon: Icon(Icons.sports_esports_outlined), selectedIcon: Icon(Icons.sports_esports), label: 'Matches'),
          NavigationDestination(icon: Icon(Icons.sensors_outlined), selectedIcon: Icon(Icons.sensors), label: 'Live'),
          NavigationDestination(icon: Icon(Icons.leaderboard_outlined), selectedIcon: Icon(Icons.leaderboard), label: 'Rank'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Vault'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'You'),
        ],
      ),
    );
  }
}
