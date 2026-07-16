import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';
import 'tournament_detail_screen.dart';

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({super.key});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> {
  bool loading = true;
  String? error;
  List<dynamic> items = [];

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
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final list = await context.read<ApiClient>().myWatchlist();
      setState(() {
        items = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _remove(String tournamentId) async {
    try {
      await context.read<ApiClient>().watchlistRemove(tournamentId);
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Watchlist'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to manage your watchlist.',
              actionLabel: 'Sign in',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
            )
          : loading
              ? const LoadingBody()
              : error != null
                  ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                  : items.isEmpty
                      ? const EmptyState(message: 'No saved tournaments. Bookmark events from tournament detail.')
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: items.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final row = Map<String, dynamic>.from(items[i] as Map);
                              final tid = '${row['tournament_id'] ?? row['id'] ?? ''}';
                              final name = row['name'] ?? row['tournament_name'] ?? 'Tournament';
                              return ArenaCard(
                                onTap: tid.isEmpty
                                    ? null
                                    : () => Navigator.of(context).push(
                                          MaterialPageRoute(builder: (_) => TournamentDetailScreen(tournamentId: tid)),
                                        ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text('$name', style: const TextStyle(fontWeight: FontWeight.w800)),
                                          if (row['status'] != null) StatusChip('${row['status']}'),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      onPressed: tid.isEmpty ? null : () => _remove(tid),
                                      icon: const Icon(Icons.bookmark_remove_outlined),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
    );
  }
}
