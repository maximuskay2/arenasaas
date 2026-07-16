import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'firebase_options.dart';
import 'navigation/deep_link.dart';
import 'services/api_client.dart';
import 'services/push_service.dart';
import 'services/realtime_service.dart';
import 'state/auth_state.dart';
import 'state/hub_state.dart';
import 'theme.dart';
import 'screens/home_screen.dart';
import 'screens/discover_screen.dart';
import 'screens/my_matches_screen.dart';
import 'screens/community_screen.dart';
import 'screens/more_screen.dart';
import 'screens/create_tournament_screen.dart';

final GlobalKey<NavigatorState> arenaNavigatorKey = GlobalKey<NavigatorState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ArenaApp());
}

class ArenaApp extends StatefulWidget {
  const ArenaApp({super.key});

  @override
  State<ArenaApp> createState() => _ArenaAppState();
}

class _ArenaAppState extends State<ArenaApp> {
  late final ApiClient _api;
  late final PushService _push;
  late final RealtimeService _realtime;
  late final HubState _hub;
  StreamSubscription<Uri>? _linkSub;
  final _appLinks = AppLinks();

  @override
  void initState() {
    super.initState();
    _api = ApiClient();
    _push = PushService(_api);
    _realtime = RealtimeService();
    _hub = HubState()..load();
    _bootDeepLinks();
    _bootPushNavigation();
  }

  Future<void> _bootDeepLinks() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _handleUri(initial));
      }
    } catch (e) {
      debugPrint('[deep_link] initial: $e');
    }
    _linkSub = _appLinks.uriLinkStream.listen(
      _handleUri,
      onError: (e) => debugPrint('[deep_link] stream: $e'),
    );
  }

  void _bootPushNavigation() {
    _push.onForegroundMessage = (msg) {
      final title = msg.notification?.title ?? 'Arena';
      final body = msg.notification?.body ?? '';
      final ctx = arenaNavigatorKey.currentContext;
      if (ctx == null) return;
      ScaffoldMessenger.of(ctx).showSnackBar(
        SnackBar(
          content: Text(body.isEmpty ? title : '$title — $body'),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () => _handlePayload(Map<String, dynamic>.from(msg.data)),
          ),
        ),
      );
    };

    // Only touch Firebase Messaging when a project is configured
    if (!DefaultFirebaseOptions.isConfigured) return;
    try {
      FirebaseMessaging.instance.getInitialMessage().then((msg) {
        if (msg == null) return;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _handlePayload(Map<String, dynamic>.from(msg.data));
        });
      }).catchError((Object e) {
        debugPrint('[FCM] getInitialMessage: $e');
      });

      FirebaseMessaging.onMessageOpenedApp.listen((msg) {
        _handlePayload(Map<String, dynamic>.from(msg.data));
      });
    } catch (e) {
      debugPrint('[FCM] boot navigation: $e');
    }
  }

  void _handleUri(Uri uri) {
    final nav = arenaNavigatorKey.currentState;
    final page = DeepLink.pageForUri(uri);
    if (nav == null || page == null) return;
    nav.push(MaterialPageRoute(builder: (_) => page));
  }

  void _handlePayload(Map<String, dynamic> data) {
    final nav = arenaNavigatorKey.currentState;
    final page = DeepLink.pageForPayload(data);
    if (nav == null || page == null) return;
    nav.push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    _realtime.dispose();
    _push.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: _api),
        Provider<PushService>.value(value: _push),
        Provider<RealtimeService>.value(value: _realtime),
        ChangeNotifierProvider.value(value: _hub),
        ChangeNotifierProvider(create: (_) => AuthState(_api, push: _push)..bootstrap()),
      ],
      child: MaterialApp(
        navigatorKey: arenaNavigatorKey,
        title: 'Arena',
        debugShowCheckedModeBanner: false,
        theme: ArenaTheme.dark(),
        onGenerateRoute: DeepLink.routeForSettings,
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
