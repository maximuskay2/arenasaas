import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_client.dart';
import 'services/push_service.dart';
import 'state/auth_state.dart';
import 'state/hub_state.dart';
import 'theme.dart';
import 'screens/home_screen.dart';
import 'screens/discover_screen.dart';
import 'screens/my_matches_screen.dart';
import 'screens/community_screen.dart';
import 'screens/more_screen.dart';
import 'screens/tournament_detail_screen.dart';
import 'screens/create_tournament_screen.dart';

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
    final hub = HubState();
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<PushService>.value(value: push),
        ChangeNotifierProvider(create: (_) {
          hub.load();
          return hub;
        }),
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
            if (segs.isNotEmpty && segs[0] == 'create') {
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
          }
          return null;
        },
        home: const HomeShell(),
      ),
    );
  }
}

/// Primary shell mirrors web sidebar sections: Home, Discover, Matches, Community, More.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;

  static const _pages = [
    HomeScreen(),
    DiscoverScreen(),
    MyMatchesScreen(),
    CommunityScreen(),
    MoreScreen(),
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Keep platform admin / pure players out of organizer hub if prefs were stale
    final auth = context.read<AuthState>();
    final hub = context.read<HubState>();
    if (!auth.loading) {
      hub.clampForUser(isLeagueHost: auth.isLeagueHost);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      // League organizers only — platform God-view admin stays on web
      floatingActionButton: auth.isLeagueHost
          ? FloatingActionButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CreateTournamentScreen()),
                );
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: IndexedStack(index: index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.explore_outlined), selectedIcon: Icon(Icons.explore), label: 'Discover'),
          NavigationDestination(icon: Icon(Icons.sports_esports_outlined), selectedIcon: Icon(Icons.sports_esports), label: 'Matches'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Social'),
          NavigationDestination(icon: Icon(Icons.menu), selectedIcon: Icon(Icons.menu_open), label: 'More'),
        ],
      ),
    );
  }
}
